-- FASE 7: clientes del predio desde reservas. No toca Mercado Pago.

alter table public.reservas
  add column if not exists asistencia_predio text;

alter table public.reservas drop constraint if exists reservas_asistencia_predio_chk;
alter table public.reservas
  add constraint reservas_asistencia_predio_chk check (
    asistencia_predio is null or asistencia_predio in ('asistio', 'no_vino')
  );

create table if not exists public.predio_clientes (
  cancha_id uuid not null references public.canchas(id) on delete cascade,
  clave text not null,
  notas text,
  updated_at timestamptz not null default now(),
  primary key (cancha_id, clave)
);

alter table public.predio_clientes enable row level security;
drop policy if exists "Owner predio clientes" on public.predio_clientes;
create policy "Owner predio clientes" on public.predio_clientes for all
  using (
    exists (
      select 1 from public.canchas ch
      where ch.id = predio_clientes.cancha_id and (ch.owner_id = auth.uid() or public.fy_es_admin())
    )
  )
  with check (
    exists (
      select 1 from public.canchas ch
      where ch.id = predio_clientes.cancha_id and (ch.owner_id = auth.uid() or public.fy_es_admin())
    )
  );

grant select, insert, update, delete on public.predio_clientes to authenticated;

create or replace function public.fy_cliente_clave(p_usuario uuid, p_tel text, p_nombre text)
returns text
language sql
immutable
as $$
  select case
    when p_usuario is not null then 'u:' || p_usuario::text
    when length(regexp_replace(coalesce(p_tel, ''), '\D', '', 'g')) >= 8
      then 't:' || regexp_replace(p_tel, '\D', '', 'g')
    when length(trim(coalesce(p_nombre, ''))) > 0
      then 'n:' || lower(trim(p_nombre))
    else null
  end;
$$;

create or replace function public.fy_clientes_predio(p_cancha_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.plc_es_dueno_cancha(p_cancha_id) and not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;

  return jsonb_build_object(
    'ok', true,
    'clientes', coalesce((
      select jsonb_agg(s.x order by s.x->>'nombre')
      from (
        select jsonb_build_object(
          'clave', g.clave,
          'nombre', g.nombre,
          'telefono', g.telefono,
          'origen', g.origen,
          'reservas', g.n_res,
          'ultima_fecha', g.ultima,
          'asistio', g.asistio,
          'no_vino', g.no_vino,
          'notas', pc.notas
        ) as x
        from (
          select
            b.clave,
            max(b.nombre) as nombre,
            max(b.telefono) as telefono,
            case when bool_or(b.es_app) then 'app' else 'manual' end as origen,
            count(*) filter (where b.reserva_id is not null)::int as n_res,
            max(b.fecha) as ultima,
            count(*) filter (where b.asistencia = 'asistio')::int as asistio,
            count(*) filter (where b.asistencia = 'no_vino')::int as no_vino
          from (
            select
              public.fy_cliente_clave(r.organizador_id, r.titular_telefono, r.titular_nombre) as clave,
              coalesce(nullif(trim(r.titular_nombre), ''), nullif(trim(u.nombre), ''), 'Sin nombre') as nombre,
              coalesce(nullif(trim(r.titular_telefono), ''), nullif(trim(u.telefono), '')) as telefono,
              (r.canal = 'app' or r.organizador_id is not null) as es_app,
              r.id as reserva_id,
              d.fecha,
              r.asistencia_predio as asistencia
            from public.reservas r
            join public.disponibilidades d on d.id = r.disponibilidad_id
            join public.campos c on c.id = d.campo_id
            left join public.usuarios u on u.id = r.organizador_id
            where c.cancha_id = p_cancha_id
              and r.origen = 'porlacancha'
              and public.fy_cliente_clave(r.organizador_id, r.titular_telefono, r.titular_nombre) is not null

            union all

            select
              public.fy_cliente_clave(null, tf.cliente_telefono, tf.cliente_nombre),
              coalesce(nullif(trim(tf.cliente_nombre), ''), 'Sin nombre'),
              nullif(trim(tf.cliente_telefono), ''),
              false,
              null,
              tf.fecha_desde,
              null
            from public.turno_fijos tf
            where tf.cancha_id = p_cancha_id
              and public.fy_cliente_clave(null, tf.cliente_telefono, tf.cliente_nombre) is not null
          ) b
          where b.clave is not null
          group by b.clave
        ) g
        left join public.predio_clientes pc on pc.cancha_id = p_cancha_id and pc.clave = g.clave
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.fy_cliente_detalle(p_cancha_id uuid, p_clave text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.plc_es_dueno_cancha(p_cancha_id) and not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  if p_clave is null or length(trim(p_clave)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'clave');
  end if;

  return jsonb_build_object(
    'ok', true,
    'clave', p_clave,
    'notas', (select notas from public.predio_clientes where cancha_id = p_cancha_id and clave = p_clave),
    'historial', coalesce((
      select jsonb_agg(h.x order by h.x->>'fecha' desc, h.x->>'hora' desc)
      from (
        select jsonb_build_object(
          'reserva_id', r.id,
          'fecha', d.fecha,
          'hora', to_char(d.hora_inicio, 'HH24:MI'),
          'campo', c.nombre,
          'canal', r.canal,
          'estado', r.estado_reserva,
          'asistencia', r.asistencia_predio,
          'titular', coalesce(r.titular_nombre, 'Sin nombre'),
          'telefono', r.titular_telefono
        ) as x
        from public.reservas r
        join public.disponibilidades d on d.id = r.disponibilidad_id
        join public.campos c on c.id = d.campo_id
        where c.cancha_id = p_cancha_id
          and r.origen = 'porlacancha'
          and public.fy_cliente_clave(r.organizador_id, r.titular_telefono, r.titular_nombre) = p_clave
      ) h
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.fy_guardar_nota_cliente(p_cancha_id uuid, p_clave text, p_notas text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.plc_es_dueno_cancha(p_cancha_id) then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  if p_clave is null or length(trim(p_clave)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'clave');
  end if;
  insert into public.predio_clientes (cancha_id, clave, notas, updated_at)
  values (p_cancha_id, p_clave, p_notas, now())
  on conflict (cancha_id, clave) do update set notas = excluded.notas, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fy_marcar_asistencia(p_reserva_id uuid, p_valor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.reservas%rowtype;
  v_cancha uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if p_valor is not null and p_valor not in ('asistio', 'no_vino') then
    return jsonb_build_object('ok', false, 'error', 'valor');
  end if;
  select * into v_r from public.reservas where id = p_reserva_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  v_cancha := null;
  if coalesce(v_r.condiciones->>'cancha_id', '') ~* '^[0-9a-f-]{36}$' then
    v_cancha := (v_r.condiciones->>'cancha_id')::uuid;
  end if;
  if v_cancha is null then
    select ca.id into v_cancha
    from public.disponibilidades d
    join public.campos c on c.id = d.campo_id
    join public.canchas ca on ca.id = c.cancha_id
    where d.id = v_r.disponibilidad_id;
  end if;
  if v_cancha is null or not public.plc_es_dueno_cancha(v_cancha) then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  update public.reservas set asistencia_predio = p_valor where id = v_r.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fy_clientes_predio(uuid) from public;
revoke all on function public.fy_cliente_detalle(uuid, text) from public;
revoke all on function public.fy_guardar_nota_cliente(uuid, text, text) from public;
revoke all on function public.fy_marcar_asistencia(uuid, text) from public;
grant execute on function public.fy_cliente_clave(uuid, text, text) to authenticated;
grant execute on function public.fy_clientes_predio(uuid) to authenticated;
grant execute on function public.fy_cliente_detalle(uuid, text) to authenticated;
grant execute on function public.fy_guardar_nota_cliente(uuid, text, text) to authenticated;
grant execute on function public.fy_marcar_asistencia(uuid, text) to authenticated;
