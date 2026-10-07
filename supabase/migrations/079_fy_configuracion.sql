-- FASE 8: configuración, encargados, enlaces. No toca Mercado Pago.

create or replace function public.fy_es_owner_predio(p_cancha_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.canchas ch
    where ch.id = p_cancha_id and ch.owner_id = auth.uid()
  ) or public.fy_es_admin();
$$;

create table if not exists public.predio_encargados (
  id uuid primary key default gen_random_uuid(),
  cancha_id uuid not null references public.canchas(id) on delete cascade,
  email text not null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  token text not null unique,
  estado text not null default 'pendiente',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint predio_encargados_estado_chk check (estado in ('pendiente', 'activo', 'revocado'))
);

create unique index if not exists uq_predio_encargado_activo
  on public.predio_encargados (cancha_id, usuario_id)
  where usuario_id is not null and estado = 'activo';

alter table public.predio_encargados enable row level security;
drop policy if exists "Owner encargados" on public.predio_encargados;
create policy "Owner encargados" on public.predio_encargados for all
  using (
    public.fy_es_owner_predio(cancha_id) or usuario_id = auth.uid()
  )
  with check (public.fy_es_owner_predio(cancha_id));

grant select, insert, update, delete on public.predio_encargados to authenticated;

create or replace function public.fy_es_encargado_predio(p_cancha_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.predio_encargados e
    where e.cancha_id = p_cancha_id
      and e.usuario_id = auth.uid()
      and e.estado = 'activo'
  );
$$;

create or replace function public.plc_es_dueno_cancha(p_cancha_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fy_es_owner_predio(p_cancha_id)
    or public.fy_es_encargado_predio(p_cancha_id);
$$;

create or replace function public.fy_caja_predio_inner(p_cancha_id uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    return jsonb_build_object('ok', false, 'error', 'fechas');
  end if;

  return jsonb_build_object(
    'ok', true,
    'desde', p_desde,
    'hasta', p_hasta,
    'totales', (
      select jsonb_build_object(
        'cobrado_app', coalesce(sum(x.cobrado_app), 0),
        'cobrado_efectivo', coalesce(sum(x.cobrado_efectivo), 0),
        'cobrado_transferencia', coalesce(sum(x.cobrado_transferencia), 0),
        'cobrado_fuera', coalesce(sum(x.cobrado_fuera), 0),
        'pendiente', coalesce(sum(x.pendiente), 0),
        'comision', coalesce(sum(x.comision), 0),
        'app_debe_predio', coalesce(sum(x.cobrado_app), 0) + coalesce((
          select sum(m.monto) from public.movimientos m
          where m.predio_id = p_cancha_id
            and m.tipo = 'deuda_predio'
            and m.estado = 'pendiente'
            and (m.created_at at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
        ), 0),
        'predio_debe_app', coalesce(sum(x.comision), 0)
      )
      from (
        select
          case
            when r.mercadopago_payment_id is not null then coalesce(
              case when r.tipo_cobro = 'total' then r.monto_total else r.monto_sena end, 0
            )
            else 0
          end as cobrado_app,
          case when r.cobrado_predio_at is not null and r.cobrado_predio_medio = 'efectivo'
            then greatest(0, coalesce(r.monto_total, 0) - case
              when r.mercadopago_payment_id is not null then coalesce(case when r.tipo_cobro = 'total' then r.monto_total else r.monto_sena end, 0) else 0 end
            )
            else 0
          end as cobrado_efectivo,
          case when r.cobrado_predio_at is not null and r.cobrado_predio_medio = 'transferencia'
            then greatest(0, coalesce(r.monto_total, 0) - case
              when r.mercadopago_payment_id is not null then coalesce(case when r.tipo_cobro = 'total' then r.monto_total else r.monto_sena end, 0) else 0 end
            )
            else 0
          end as cobrado_transferencia,
          case
            when r.cobro_externo = 'sena_fuera' then coalesce(r.monto_sena, 0)
            else 0
          end as cobrado_fuera,
          case
            when r.estado_reserva is distinct from 'reservada' then 0
            when r.cobrado_predio_at is not null then 0
            else greatest(
              0,
              coalesce(r.monto_total, 0)
                - case when r.mercadopago_payment_id is not null then coalesce(case when r.tipo_cobro = 'total' then r.monto_total else r.monto_sena end, 0) else 0 end
                - case when r.cobro_externo = 'sena_fuera' then coalesce(r.monto_sena, 0) else 0 end
            )
          end as pendiente,
          coalesce((
            select sum(m.monto) from public.movimientos m
            where m.reserva_id = r.id and m.tipo = 'comision_app_reserva'
          ), 0) as comision
        from public.reservas r
        join public.disponibilidades d on d.id = r.disponibilidad_id
        join public.campos c on c.id = d.campo_id
        where c.cancha_id = p_cancha_id
          and d.fecha between p_desde and p_hasta
          and r.origen = 'porlacancha'
      ) x
    ),
    'lineas', coalesce((
      select jsonb_agg(s.x order by s.x->>'fecha', s.x->>'hora', s.x->>'titular')
      from (
        select jsonb_build_object(
          'reserva_id', r.id,
          'fecha', d.fecha,
          'hora', to_char(d.hora_inicio, 'HH24:MI'),
          'campo', c.nombre,
          'titular', coalesce(r.titular_nombre, 'Sin nombre'),
          'canal', coalesce(r.canal, ''),
          'cobro_externo', r.cobro_externo,
          'cobrado_app', case
            when r.mercadopago_payment_id is not null then coalesce(
              case when r.tipo_cobro = 'total' then r.monto_total else r.monto_sena end, 0
            )
            else 0
          end,
          'cobrado_predio', case
            when r.cobrado_predio_at is not null then greatest(0, coalesce(r.monto_total, 0) - case
              when r.mercadopago_payment_id is not null then coalesce(case when r.tipo_cobro = 'total' then r.monto_total else r.monto_sena end, 0) else 0 end
            )
            when r.cobro_externo = 'sena_fuera' then coalesce(r.monto_sena, 0)
            else 0
          end,
          'medio_predio', case
            when r.cobrado_predio_at is not null then r.cobrado_predio_medio
            when r.cobro_externo = 'sena_fuera' then 'fuera'
            else null
          end,
          'pendiente', case
            when r.estado_reserva is distinct from 'reservada' then 0
            when r.cobrado_predio_at is not null then 0
            else greatest(
              0,
              coalesce(r.monto_total, 0)
                - case when r.mercadopago_payment_id is not null then coalesce(case when r.tipo_cobro = 'total' then r.monto_total else r.monto_sena end, 0) else 0 end
                - case when r.cobro_externo = 'sena_fuera' then coalesce(r.monto_sena, 0) else 0 end
            )
          end,
          'comision', coalesce((
            select sum(m.monto) from public.movimientos m
            where m.reserva_id = r.id and m.tipo = 'comision_app_reserva'
          ), 0),
          'estado_reserva', r.estado_reserva
        ) as x
        from public.reservas r
        join public.disponibilidades d on d.id = r.disponibilidad_id
        join public.campos c on c.id = d.campo_id
        where c.cancha_id = p_cancha_id
          and d.fecha between p_desde and p_hasta
          and r.origen = 'porlacancha'
      ) s
    ), '[]'::jsonb),
    'comisiones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'reserva_id', m.reserva_id,
        'monto', m.monto,
        'estado', m.estado,
        'detalle', m.detalle,
        'fecha', (m.created_at at time zone 'America/Argentina/Buenos_Aires')::date
      ) order by m.created_at)
      from public.movimientos m
      where m.predio_id = p_cancha_id
        and m.tipo = 'comision_app_reserva'
        and (m.created_at at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
    ), '[]'::jsonb),
    'cierre', (
      select jsonb_build_object(
        'fecha', k.fecha,
        'cerrado_at', k.cerrado_at,
        'cobrado_app', k.cobrado_app,
        'cobrado_efectivo', k.cobrado_efectivo,
        'cobrado_transferencia', k.cobrado_transferencia,
        'pendiente', k.pendiente,
        'app_debe_predio', k.app_debe_predio,
        'predio_debe_app', k.predio_debe_app
      )
      from public.fy_caja_cierres k
      where k.cancha_id = p_cancha_id and k.fecha = p_desde and p_desde = p_hasta
      limit 1
    )
  );
end;
$$;

create or replace function public.fy_cerrar_caja_inner(p_cancha_id uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box jsonb;
  v_t jsonb;
  v_hoy date := public.ahora_argentina()::date;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if p_fecha is null or p_fecha > v_hoy then
    return jsonb_build_object('ok', false, 'error', 'fecha');
  end if;
  if exists (select 1 from public.fy_caja_cierres k where k.cancha_id = p_cancha_id and k.fecha = p_fecha) then
    return jsonb_build_object('ok', false, 'error', 'ya_cerrada');
  end if;

  v_box := public.fy_caja_predio_inner(p_cancha_id, p_fecha, p_fecha);
  if coalesce((v_box->>'ok')::boolean, false) is not true then
    return v_box;
  end if;
  v_t := v_box->'totales';

  insert into public.fy_caja_cierres (
    cancha_id, fecha,
    cobrado_app, cobrado_efectivo, cobrado_transferencia, cobrado_fuera, pendiente,
    app_debe_predio, predio_debe_app, cerrado_por
  ) values (
    p_cancha_id, p_fecha,
    coalesce((v_t->>'cobrado_app')::numeric, 0),
    coalesce((v_t->>'cobrado_efectivo')::numeric, 0),
    coalesce((v_t->>'cobrado_transferencia')::numeric, 0),
    coalesce((v_t->>'cobrado_fuera')::numeric, 0),
    coalesce((v_t->>'pendiente')::numeric, 0),
    coalesce((v_t->>'app_debe_predio')::numeric, 0),
    coalesce((v_t->>'predio_debe_app')::numeric, 0),
    auth.uid()
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fy_caja_predio(p_cancha_id uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fy_es_owner_predio(p_cancha_id) then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  return public.fy_caja_predio_inner(p_cancha_id, p_desde, p_hasta);
end;
$$;

create or replace function public.fy_cerrar_caja(p_cancha_id uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fy_es_owner_predio(p_cancha_id) then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  return public.fy_cerrar_caja_inner(p_cancha_id, p_fecha);
end;
$$;

do $$
begin
  execute 'revoke all on function public.fy_caja_predio_inner(uuid, date, date) from public, anon, authenticated';
  execute 'revoke all on function public.fy_cerrar_caja_inner(uuid, date) from public, anon, authenticated';
exception when undefined_function then
  null;
end $$;
grant execute on function public.fy_caja_predio(uuid, date, date) to authenticated;
grant execute on function public.fy_cerrar_caja(uuid, date) to authenticated;

create or replace function public.fy_solo_owner_politica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancha uuid;
begin
  if tg_table_name = 'politica_predio' then
    v_cancha := coalesce(new.cancha_id, old.cancha_id);
  else
    select c.cancha_id into v_cancha
    from public.campos c
    where c.id = coalesce(new.campo_id, old.campo_id);
  end if;
  if not public.fy_es_owner_predio(v_cancha) then
    raise exception 'no_dueno_predio';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_fy_politica_predio_owner on public.politica_predio;
create trigger trg_fy_politica_predio_owner
before insert or update or delete on public.politica_predio
for each row execute function public.fy_solo_owner_politica();

drop trigger if exists trg_fy_politica_campo_owner on public.politica_campo;
create trigger trg_fy_politica_campo_owner
before insert or update or delete on public.politica_campo
for each row execute function public.fy_solo_owner_politica();

drop policy if exists "Encargado ve predio" on public.canchas;
create policy "Encargado ve predio"
  on public.canchas for select
  using (public.fy_es_encargado_predio(id));

create or replace function public.fy_panel_rol()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'owner', exists (select 1 from public.canchas where owner_id = auth.uid()) or public.fy_es_admin(),
    'encargado', exists (
      select 1 from public.predio_encargados e
      where e.usuario_id = auth.uid() and e.estado = 'activo'
    )
  );
$$;

create or replace function public.fy_invitar_encargado(p_cancha_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text;
  v_token text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.fy_es_owner_predio(p_cancha_id) then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    return jsonb_build_object('ok', false, 'error', 'email');
  end if;
  v_token := encode(gen_random_bytes(18), 'hex');
  insert into public.predio_encargados (cancha_id, email, token, estado)
  values (p_cancha_id, v_email, v_token, 'pendiente');
  return jsonb_build_object('ok', true, 'token', v_token, 'email', v_email);
end;
$$;

create or replace function public.fy_listar_encargados(p_cancha_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fy_es_owner_predio(p_cancha_id) then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  return jsonb_build_object(
    'ok', true,
    'encargados', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'email', e.email,
        'estado', e.estado,
        'token', e.token,
        'usuario_id', e.usuario_id
      ) order by e.created_at desc)
      from public.predio_encargados e
      where e.cancha_id = p_cancha_id and e.estado is distinct from 'revocado'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.fy_revocar_encargado(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.predio_encargados%rowtype;
begin
  select * into v_e from public.predio_encargados where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if not public.fy_es_owner_predio(v_e.cancha_id) then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  update public.predio_encargados set estado = 'revocado' where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fy_aceptar_encargado(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.predio_encargados%rowtype;
  v_mail text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  select * into v_e from public.predio_encargados where token = p_token for update;
  if not found or v_e.estado = 'revocado' then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  select lower(email) into v_mail from public.usuarios where id = auth.uid();
  if v_mail is distinct from lower(v_e.email) then
    return jsonb_build_object('ok', false, 'error', 'email');
  end if;
  update public.predio_encargados
  set usuario_id = auth.uid(), estado = 'activo', accepted_at = now()
  where id = v_e.id;
  return jsonb_build_object('ok', true, 'cancha_id', v_e.cancha_id);
end;
$$;

revoke all on function public.fy_panel_rol() from public;
revoke all on function public.fy_invitar_encargado(uuid, text) from public;
revoke all on function public.fy_listar_encargados(uuid) from public;
revoke all on function public.fy_revocar_encargado(uuid) from public;
revoke all on function public.fy_aceptar_encargado(text) from public;
grant execute on function public.fy_es_owner_predio(uuid) to authenticated;
grant execute on function public.fy_es_encargado_predio(uuid) to authenticated;
grant execute on function public.fy_panel_rol() to authenticated;
grant execute on function public.fy_invitar_encargado(uuid, text) to authenticated;
grant execute on function public.fy_listar_encargados(uuid) to authenticated;
grant execute on function public.fy_revocar_encargado(uuid) to authenticated;
grant execute on function public.fy_aceptar_encargado(text) to authenticated;
grant execute on function public.plc_es_dueno_cancha(uuid) to authenticated;

drop policy if exists "Encargado ve reservas" on public.reservas;
create policy "Encargado ve reservas"
  on public.reservas for select
  using (
    exists (
      select 1
      from public.disponibilidades d
      join public.campos c on c.id = d.campo_id
      where d.id = reservas.disponibilidad_id
        and public.fy_es_encargado_predio(c.cancha_id)
    )
  );

