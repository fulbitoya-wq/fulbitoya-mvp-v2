-- FASE 6: caja del predio. No toca Mercado Pago ni migraciones anteriores.

create table if not exists public.fy_caja_cierres (
  id uuid primary key default gen_random_uuid(),
  cancha_id uuid not null references public.canchas(id) on delete cascade,
  fecha date not null,
  cobrado_app numeric(12,2) not null default 0,
  cobrado_efectivo numeric(12,2) not null default 0,
  cobrado_transferencia numeric(12,2) not null default 0,
  cobrado_fuera numeric(12,2) not null default 0,
  pendiente numeric(12,2) not null default 0,
  app_debe_predio numeric(12,2) not null default 0,
  predio_debe_app numeric(12,2) not null default 0,
  cerrado_at timestamptz not null default now(),
  cerrado_por uuid references public.usuarios(id) on delete set null,
  unique (cancha_id, fecha)
);

alter table public.fy_caja_cierres enable row level security;
drop policy if exists "Owner caja cierres" on public.fy_caja_cierres;
create policy "Owner caja cierres" on public.fy_caja_cierres for select
  using (
    exists (
      select 1 from public.canchas ch
      where ch.id = fy_caja_cierres.cancha_id and (ch.owner_id = auth.uid() or public.fy_es_admin())
    )
  );

grant select on public.fy_caja_cierres to authenticated;

create or replace function public.fy_caja_predio(p_cancha_id uuid, p_desde date, p_hasta date)
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

create or replace function public.fy_cerrar_caja(p_cancha_id uuid, p_fecha date)
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
  if not public.plc_es_dueno_cancha(p_cancha_id) then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  if p_fecha is null or p_fecha > v_hoy then
    return jsonb_build_object('ok', false, 'error', 'fecha');
  end if;
  if exists (select 1 from public.fy_caja_cierres k where k.cancha_id = p_cancha_id and k.fecha = p_fecha) then
    return jsonb_build_object('ok', false, 'error', 'ya_cerrada');
  end if;

  v_box := public.fy_caja_predio(p_cancha_id, p_fecha, p_fecha);
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

revoke all on function public.fy_caja_predio(uuid, date, date) from public;
revoke all on function public.fy_cerrar_caja(uuid, date) from public;
grant execute on function public.fy_caja_predio(uuid, date, date) to authenticated;
grant execute on function public.fy_cerrar_caja(uuid, date) to authenticated;
