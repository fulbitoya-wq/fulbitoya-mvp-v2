-- Fase 4: enriquecer listar_mis_reservas_plc para el detalle en app.
-- Sin cambiar reglas de cobro; solo campos ya existentes en reservas/canchas.

create or replace function public.listar_mis_reservas_plc()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  return jsonb_build_object(
    'ok', true,
    'reservas', coalesce((
      select jsonb_agg(s.x order by s.x->>'fecha' desc, s.x->>'hora_inicio' desc)
      from (
        select jsonb_build_object(
          'id', r.id,
          'estado', r.estado_reserva,
          'tipo_cobro', r.tipo_cobro,
          'canal', r.canal,
          'monto_total', r.monto_total,
          'monto_sena', r.monto_sena,
          'monto_cancha', r.monto_cancha,
          'busca_gente', coalesce(r.busca_gente, false),
          'disponibilidad_id', d.id,
          'cancha_id', ca.id,
          'slug', ca.slug,
          'fecha', d.fecha,
          'hora_inicio', d.hora_inicio,
          'cancha_nombre', ca.nombre,
          'campo_nombre', c.nombre,
          'barrio', ca.barrio,
          'direccion', ca.direccion,
          'condiciones', r.condiciones
        ) as x
        from public.reservas r
        join public.disponibilidades d on d.id = r.disponibilidad_id
        join public.campos c on c.id = d.campo_id
        join public.canchas ca on ca.id = c.cancha_id
        where r.organizador_id = auth.uid()
          and r.origen = 'porlacancha'
      ) s
    ), '[]'::jsonb)
  );
end;
$$;
