-- Enrich public slot listing with venue address, coords, and court surface/format
-- so the player home can show F5/F7, sintético, and sort by distance.

create or replace function public.listar_turnos_publicos()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_hoy date := public.ahora_argentina()::date;
begin
  perform public.plc_liberar_holds_vencidos();
  return jsonb_build_object(
    'ok', true,
    'turnos', coalesce((
      select jsonb_agg(s.x order by s.x->>'fecha', s.x->>'hora_inicio')
      from (
        select jsonb_build_object(
          'id', d.id,
          'fecha', d.fecha,
          'hora_inicio', d.hora_inicio,
          'hora_fin', d.hora_fin,
          'precio', d.precio,
          'campo_id', c.id,
          'campo_nombre', c.nombre,
          'campo_tipo', c.tipo,
          'campo_superficie', c.superficie,
          'campo_techada', coalesce(c.techada, false),
          'cancha_id', ca.id,
          'cancha_nombre', ca.nombre,
          'barrio', ca.barrio,
          'direccion', ca.direccion,
          'lat', ca.lat,
          'lng', ca.lng
        ) as x
        from public.disponibilidades d
        join public.campos c on c.id = d.campo_id
        join public.canchas ca on ca.id = c.cancha_id
        where d.estado = 'disponible'
          and d.fecha >= v_hoy
          and ca.estado = 'aprobado'
          and coalesce(ca.activa, true)
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.listar_turnos_publicos() from public;
grant execute on function public.listar_turnos_publicos() to authenticated, anon;
