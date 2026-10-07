-- Fase 5: página de predio no adherido (place_id) + partidos abiertos + unificar al adherirse.

create or replace function public.plc_predio_por_place_id(p_place_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_place text := nullif(btrim(coalesce(p_place_id, '')), '');
  v_ca public.canchas%rowtype;
  v_partidos jsonb;
  v_aportes jsonb;
begin
  if v_place is null then
    return jsonb_build_object('ok', false, 'error', 'place_id_requerido');
  end if;

  select * into v_ca
  from public.canchas
  where place_id = v_place
  order by case when adherido then 0 else 1 end, created_at
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'cancha_no_existe');
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.fecha, t.hora_inicio), '[]'::jsonb)
  into v_partidos
  from (
    select
      d.id,
      d.titulo,
      d.fecha,
      d.hora_inicio,
      d.modalidad,
      d.tipo,
      d.precio_cancha,
      d.estado,
      case when v_ca.adherido is not true then 'Cancha no adherida' else null end as etiqueta
    from public.desafios d
    where d.cancha_id = v_ca.id
      and d.estado in ('abierto', 'completo')
      and d.fecha >= (public.ahora_argentina())::date
    order by d.fecha, d.hora_inicio
    limit 40
  ) t;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into v_aportes
  from (
    select superficie, techada, iluminacion, created_at
    from public.cancha_aportes
    where cancha_id = v_ca.id
    order by created_at desc
    limit 30
  ) a;

  return jsonb_build_object(
    'ok', true,
    'cancha_id', v_ca.id,
    'place_id', v_ca.place_id,
    'nombre', v_ca.nombre,
    'direccion', v_ca.direccion,
    'barrio', v_ca.barrio,
    'lat', v_ca.lat,
    'lng', v_ca.lng,
    'adherido', v_ca.adherido,
    'slug', v_ca.slug,
    'verificacion_estado', v_ca.verificacion_estado,
    'etiqueta', case when v_ca.adherido is not true then 'Cancha no adherida' else null end,
    'segun_jugadores', jsonb_build_object(
      'superficie', v_ca.aporte_superficie,
      'techada', v_ca.aporte_techada,
      'iluminacion', v_ca.aporte_iluminacion,
      'superficie_confirmada', v_ca.aporte_superficie_confirmada,
      'techada_confirmada', v_ca.aporte_techada_confirmada,
      'iluminacion_confirmada', v_ca.aporte_iluminacion_confirmada,
      'aportes', v_aportes
    ),
    'partidos_abiertos', v_partidos,
    'alta_predio_path', '/dashboard/canchas?place_id=' || v_ca.place_id
  );
end;
$$;

revoke all on function public.plc_predio_por_place_id(text) from public;
grant execute on function public.plc_predio_por_place_id(text) to anon, authenticated;

-- Al adherirse: unificar por place_id conservando historial (desafíos apuntan al adherido).
create or replace function public.plc_unificar_predio_places(p_cancha_adherida_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adh public.canchas%rowtype;
  v_na public.canchas%rowtype;
  v_n int := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;

  select * into v_adh from public.canchas where id = p_cancha_adherida_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cancha_no_existe');
  end if;
  if v_adh.owner_id is distinct from auth.uid() and not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  if v_adh.place_id is null then
    return jsonb_build_object('ok', false, 'error', 'place_id_requerido');
  end if;

  update public.canchas set adherido = true where id = v_adh.id;

  for v_na in
    select * from public.canchas
    where place_id = v_adh.place_id
      and id is distinct from v_adh.id
      and adherido is not true
    for update
  loop
    update public.desafios set cancha_id = v_adh.id where cancha_id = v_na.id;
    update public.cancha_aportes ca
    set cancha_id = v_adh.id
    where ca.cancha_id = v_na.id
      and not exists (
        select 1 from public.cancha_aportes x
        where x.cancha_id = v_adh.id and x.usuario_id = ca.usuario_id
      );
    delete from public.cancha_aportes where cancha_id = v_na.id;
    update public.plc_validaciones_predio set cancha_id = v_adh.id where cancha_id = v_na.id;
    -- fusionar aportes confirmados
    update public.canchas a
    set
      aporte_superficie = coalesce(a.aporte_superficie, v_na.aporte_superficie),
      aporte_techada = coalesce(a.aporte_techada, v_na.aporte_techada),
      aporte_iluminacion = coalesce(a.aporte_iluminacion, v_na.aporte_iluminacion),
      aporte_superficie_confirmada = a.aporte_superficie_confirmada or v_na.aporte_superficie_confirmada,
      aporte_techada_confirmada = a.aporte_techada_confirmada or v_na.aporte_techada_confirmada,
      aporte_iluminacion_confirmada = a.aporte_iluminacion_confirmada or v_na.aporte_iluminacion_confirmada,
      google_telefono = coalesce(a.google_telefono, v_na.google_telefono),
      alias_cbu = coalesce(a.alias_cbu, v_na.alias_cbu)
    where a.id = v_adh.id;

    update public.canchas set activa = false, nombre = nombre || ' (unificado)' where id = v_na.id;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'unificados', v_n, 'cancha_id', v_adh.id);
end;
$$;

revoke all on function public.plc_unificar_predio_places(uuid) from public;
grant execute on function public.plc_unificar_predio_places(uuid) to authenticated;
