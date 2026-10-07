-- FASE 5: resumen de Hoy (ocupación, a cobrar, alertas). No toca Mercado Pago.

create or replace function public.fy_hoy_predio(p_cancha_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := public.ahora_argentina()::date;
  v_desde timestamptz := (v_hoy::timestamp) at time zone 'America/Argentina/Buenos_Aires';
  v_total int := 0;
  v_ocupados int := 0;
  v_a_cobrar numeric := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.plc_es_dueno_cancha(p_cancha_id) and not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  perform public.plc_liberar_holds_vencidos();

  select
    count(*)::int,
    count(*) filter (where d.estado in ('reservado', 'reservado_pendiente'))::int
  into v_total, v_ocupados
  from public.disponibilidades d
  join public.campos c on c.id = d.campo_id
  where c.cancha_id = p_cancha_id and d.fecha = v_hoy and d.estado is distinct from 'bloqueado';

  select coalesce(sum(
    case
      when r.cobrado_predio_at is not null then 0
      else greatest(
        0,
        coalesce(r.monto_total, 0) - case
          when r.estado_pago = 'pagado' then coalesce(
            case when r.tipo_cobro = 'total' then r.monto_total else r.monto_sena end,
            0
          )
          else 0
        end
      )
    end
  ), 0)
  into v_a_cobrar
  from public.reservas r
  join public.disponibilidades d on d.id = r.disponibilidad_id
  join public.campos c on c.id = d.campo_id
  where c.cancha_id = p_cancha_id
    and d.fecha = v_hoy
    and r.estado_reserva = 'reservada';

  return jsonb_build_object(
    'ok', true,
    'fecha', v_hoy,
    'total_turnos', v_total,
    'ocupados', v_ocupados,
    'ocupacion_pct', case when v_total = 0 then 0 else round((v_ocupados::numeric * 100) / v_total) end,
    'a_cobrar', v_a_cobrar,
    'alertas', coalesce((
      select jsonb_agg(a.x order by a.ord, a.hora)
      from (
        select 1 as ord, to_char(d.hora_inicio, 'HH24:MI') as hora, jsonb_build_object(
          'tipo', 'app',
          'titulo', 'Reserva nueva desde la app',
          'detalle', coalesce(r.titular_nombre, 'Sin nombre') || ' · ' || c.nombre || ' · ' || to_char(d.hora_inicio, 'HH24:MI'),
          'hora', to_char(d.hora_inicio, 'HH24:MI'),
          'disponibilidad_id', d.id
        ) as x
        from public.reservas r
        join public.disponibilidades d on d.id = r.disponibilidad_id
        join public.campos c on c.id = d.campo_id
        where c.cancha_id = p_cancha_id
          and r.canal = 'app'
          and r.estado_reserva = 'reservada'
          and r.created_at >= v_desde

        union all

        select 2, coalesce(to_char(d.hora_inicio, 'HH24:MI'), left(coalesce(r.condiciones->>'hora_inicio', ''), 5)), jsonb_build_object(
          'tipo', 'cancelacion',
          'titulo', case when r.estado_reserva = 'cancelada_predio' then 'Canceló el predio' else 'Cancelación' end,
          'detalle', coalesce(r.titular_nombre, 'Sin nombre') || ' · ' || coalesce(r.condiciones->>'campo_nombre', '') ||
            ' · ' || coalesce(r.condiciones->>'fecha', '') || ' ' || left(coalesce(r.condiciones->>'hora_inicio', ''), 5),
          'hora', coalesce(to_char(d.hora_inicio, 'HH24:MI'), left(coalesce(r.condiciones->>'hora_inicio', ''), 5)),
          'disponibilidad_id', d.id
        )
        from public.reservas r
        left join public.disponibilidades d on d.id = r.disponibilidad_id
        where r.condiciones->>'cancha_id' = p_cancha_id::text
          and r.estado_reserva in ('cancelada', 'cancelada_predio')
          and (
            (d.fecha is not null and d.fecha = v_hoy)
            or coalesce((r.condiciones->>'fecha')::date, v_hoy) = v_hoy
            or r.created_at >= v_desde
          )

        union all

        select 3, to_char(d.hora_inicio, 'HH24:MI'), jsonb_build_object(
          'tipo', 'abierto',
          'titulo', 'Partido abierto buscando jugadores',
          'detalle', coalesce(r.titular_nombre, 'Sin nombre') || ' · ' || c.nombre || ' · ' || to_char(d.hora_inicio, 'HH24:MI'),
          'hora', to_char(d.hora_inicio, 'HH24:MI'),
          'disponibilidad_id', d.id
        )
        from public.reservas r
        join public.disponibilidades d on d.id = r.disponibilidad_id
        join public.campos c on c.id = d.campo_id
        where c.cancha_id = p_cancha_id
          and d.fecha = v_hoy
          and r.estado_reserva = 'reservada'
          and coalesce(r.busca_gente, false)

        union all

        select 4, to_char(dz.hora_inicio, 'HH24:MI'), jsonb_build_object(
          'tipo', 'disputa',
          'titulo', 'Disputa',
          'detalle', coalesce(dz.titulo, 'Partido') || ' · ' || to_char(dz.fecha, 'YYYY-MM-DD') || ' ' || to_char(dz.hora_inicio, 'HH24:MI'),
          'hora', to_char(dz.hora_inicio, 'HH24:MI'),
          'disponibilidad_id', dz.disponibilidad_id
        )
        from public.desafios dz
        where dz.cancha_id = p_cancha_id
          and dz.estado = 'en_disputa'
      ) a
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.fy_hoy_predio(uuid) from public;
grant execute on function public.fy_hoy_predio(uuid) to authenticated;
