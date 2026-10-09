-- Mis partidos: incluir inscripciones sin equipo (jugador suelto / sin_equipo)
-- y partidos donde sos owner aunque falle el join a equipos.

create or replace function public.listar_mis_partidos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;

  return jsonb_build_object(
    'ok', true,
    'items', coalesce((
      select jsonb_agg(x.row order by x.fecha asc, x.hora_inicio asc)
      from (
        select distinct on (d.id)
          d.fecha,
          d.hora_inicio,
          jsonb_build_object(
            'id', d.id,
            'titulo', d.titulo,
            'tipo', d.tipo,
            'premio', d.premio,
            'direccion', d.direccion,
            'barrio', d.barrio,
            'lat', d.lat,
            'lng', d.lng,
            'fecha', d.fecha,
            'hora_inicio', d.hora_inicio,
            'duracion_min', d.duracion_min,
            'descripcion', d.descripcion,
            'estado', d.estado,
            'cancha_id', d.cancha_id,
            'modalidad', d.modalidad,
            'inscripcion_id', i.id,
            'inscripcion_estado', i.estado,
            'mi_equipo_id', e.id,
            'mi_equipo_nombre', e.nombre,
            'mi_rol', case
              when d.owner_id is not distinct from uid then 'capitan'
              when i.equipo_id is not null and public.es_capitan(i.equipo_id) then 'capitan'
              when i.capitan_id is not distinct from uid then 'capitan'
              when exists (
                select 1 from public.desafio_convocados c
                where c.inscripcion_id = i.id and c.usuario_id = uid
              ) then 'convocado'
              else 'plantel'
            end
          ) as row
        from public.desafio_inscripciones i
        join public.desafios d on d.id = i.desafio_id
        left join public.equipos e on e.id = i.equipo_id
        where i.estado in ('confirmada', 'pendiente_pago')
          and (
            d.owner_id is not distinct from uid
            or i.capitan_id is not distinct from uid
            or (i.equipo_id is not null and public.es_miembro(i.equipo_id))
            or exists (
              select 1 from public.desafio_convocados c
              where c.inscripcion_id = i.id and c.usuario_id = uid
            )
          )
        order by d.id, case
          when d.owner_id is not distinct from uid then 0
          when i.equipo_id is not null and public.es_capitan(i.equipo_id) then 1
          when i.capitan_id is not distinct from uid then 2
          else 3
        end, i.created_at desc
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.listar_mis_partidos() from public;
grant execute on function public.listar_mis_partidos() to authenticated;
