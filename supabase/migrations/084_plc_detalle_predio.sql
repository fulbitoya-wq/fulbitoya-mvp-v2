-- Rich public venue detail for PorLaCancha (photos, services, hours, slots).

create or replace function public.plc_detalle_predio(p_cancha_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ca public.canchas%rowtype;
  v_hoy date := public.ahora_argentina()::date;
  v_hasta date := v_hoy + 14;
  v_fotos jsonb;
  v_campos jsonb;
begin
  perform public.plc_liberar_holds_vencidos();

  select * into v_ca
  from public.canchas
  where id = p_cancha_id
    and estado = 'aprobado'
    and coalesce(activa, true);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;

  v_fotos := coalesce(v_ca.fotos, '[]'::jsonb);
  if jsonb_typeof(v_fotos) <> 'array' then
    v_fotos := '[]'::jsonb;
  end if;
  if jsonb_array_length(v_fotos) = 0 then
    if nullif(btrim(coalesce(v_ca.fondo_url, '')), '') is not null then
      v_fotos := jsonb_build_array(v_ca.fondo_url);
    elsif nullif(btrim(coalesce(v_ca.foto_url, '')), '') is not null then
      v_fotos := jsonb_build_array(v_ca.foto_url);
    end if;
  end if;

  select coalesce(jsonb_agg(x.obj order by x.nombre), '[]'::jsonb)
  into v_campos
  from (
    select
      c.nombre,
      jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'tipo', c.tipo,
        'superficie', c.superficie,
        'techada', coalesce(c.techada, false),
        'luz', coalesce(c.luz, false),
        'precio_desde', (
          select min(d.precio)
          from public.disponibilidades d
          where d.campo_id = c.id
            and d.estado = 'disponible'
            and d.fecha between v_hoy and v_hasta
            and d.precio is not null
        ),
        'foto_url', c.foto_url
      ) as obj
    from public.campos c
    where c.cancha_id = v_ca.id
  ) x;

  return jsonb_build_object(
    'ok', true,
    'id', v_ca.id,
    'nombre', v_ca.nombre,
    'slug', v_ca.slug,
    'barrio', v_ca.barrio,
    'direccion', v_ca.direccion,
    'lat', v_ca.lat,
    'lng', v_ca.lng,
    'logo_url', v_ca.logo_url,
    'fotos', v_fotos,
    'whatsapp', v_ca.whatsapp,
    'estacionamiento', coalesce(v_ca.estacionamiento, false),
    'buffet', coalesce(v_ca.buffet, false),
    'vestuarios', coalesce(v_ca.vestuarios, false),
    'parrilla', coalesce(v_ca.parrilla, false),
    'horarios_apertura', coalesce(v_ca.horarios_apertura, '{}'::jsonb),
    'campos', v_campos,
    'turnos', coalesce((
      select jsonb_agg(s.x order by s.x->>'fecha', s.x->>'hora_inicio')
      from (
        select jsonb_build_object(
          'id', d.id,
          'fecha', d.fecha,
          'hora_inicio', d.hora_inicio,
          'hora_fin', d.hora_fin,
          'precio', d.precio,
          'estado', d.estado,
          'campo_id', c.id,
          'campo_nombre', c.nombre,
          'campo_tipo', c.tipo,
          'campo_superficie', c.superficie,
          'campo_techada', coalesce(c.techada, false),
          'campo_luz', coalesce(c.luz, false)
        ) as x
        from public.disponibilidades d
        join public.campos c on c.id = d.campo_id
        where c.cancha_id = v_ca.id
          and d.fecha between v_hoy and v_hasta
          and d.estado in ('disponible', 'reservado', 'reservado_pendiente', 'bloqueado')
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.plc_predio_publico(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_det jsonb;
begin
  select id into v_id
  from public.canchas
  where slug = lower(trim(p_slug))
    and estado = 'aprobado'
    and coalesce(activa, true);
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  v_det := public.plc_detalle_predio(v_id);
  return v_det;
end;
$$;

revoke all on function public.plc_detalle_predio(uuid) from public;
grant execute on function public.plc_detalle_predio(uuid) to authenticated, anon;
revoke all on function public.plc_predio_publico(text) from public;
grant execute on function public.plc_predio_publico(text) to authenticated, anon;
