-- Publicar partido: alcanza con el capitán (plantel completo recién a la hora del partido / walkover).
-- No cambia montos, tarifas ni cancelación.

create or replace function public.validar_convocados_publicacion(
  p_equipo_id uuid,
  p_convocados uuid[],
  p_tipo text,
  p_min_anios int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_conv uuid[];
  v_uid uuid;
  v_hoy date := public.ahora_argentina()::date;
  v_fn date;
  v_label text;
  v_faltan text := '';
  v_menores text := '';
  v_err text;
begin
  select array_agg(distinct x) into v_conv
  from unnest(coalesce(p_convocados, '{}'::uuid[])) as x
  where x is not null;

  if v_conv is null or cardinality(v_conv) = 0 then
    return jsonb_build_object('ok', false, 'error', 'convocados_requeridos');
  end if;

  -- Sin mínimo de plantel al publicar (a diferencia de validar_convocados_edad).
  perform p_tipo;

  v_err := case when coalesce(p_min_anios, 18) <= 13 then 'menor_13' else 'menor_18' end;

  foreach v_uid in array v_conv loop
    if not exists (
      select 1 from public.equipo_miembros
      where equipo_id = p_equipo_id and usuario_id = v_uid and estado = 'activo'
    ) then
      return jsonb_build_object('ok', false, 'error', 'convocado_no_miembro');
    end if;
    select jp.fecha_nacimiento into v_fn from public.jugador_perfiles jp where jp.usuario_id = v_uid;
    v_label := coalesce(public.etiqueta_jugador(v_uid), 'Alguien');
    if v_fn is null then
      v_faltan := v_faltan || case when v_faltan = '' then '' else ', ' end || v_label;
    elsif not public.plc_edad_cumplida(v_fn, coalesce(p_min_anios, 18)) then
      v_menores := v_menores || case when v_menores = '' then '' else ', ' end || v_label;
    end if;
  end loop;

  if v_faltan <> '' then
    return jsonb_build_object('ok', false, 'error', 'falta_nacimiento', 'quienes', v_faltan);
  end if;
  if v_menores <> '' then
    return jsonb_build_object('ok', false, 'error', v_err, 'quienes', v_menores);
  end if;

  return jsonb_build_object('ok', true, 'convocados', to_jsonb(v_conv));
end;
$$;

revoke all on function public.validar_convocados_publicacion(uuid, uuid[], text, int) from public;
grant execute on function public.validar_convocados_publicacion(uuid, uuid[], text, int) to authenticated;

-- crear_partido_deposito: misma firma; solo cambia la validación de convocados.
create or replace function public.crear_partido_deposito(
  p_precio_cancha numeric,
  p_formato text,
  p_equipo_id uuid,
  p_convocados uuid[],
  p_regla_empate text,
  p_acepta_tarifa_no_reembolsable boolean,
  p_disponibilidad_id uuid default null,
  p_cancha_id uuid default null,
  p_fecha date default null,
  p_hora_inicio time default null,
  p_jugadores_lado int default null,
  p_duracion_min int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_disp public.disponibilidades%rowtype;
  v_campo public.campos%rowtype;
  v_ca public.canchas%rowtype;
  v_tipo public.match_tipo;
  v_cot jsonb;
  v_req jsonb;
  v_val jsonb;
  v_conv uuid[];
  v_desafio uuid;
  v_insc uuid;
  v_eq_nombre text;
  v_titulo text;
  v_inicio timestamp;
  v_cierre timestamptz;
  v_precio numeric;
  v_tarifa numeric;
  v_total numeric;
  v_flag_no_adh boolean;
  v_uid uuid;
  v_fecha date;
  v_hora time;
  v_dur int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.es_capitan(p_equipo_id) then
    return jsonb_build_object('ok', false, 'error', 'no_capitan');
  end if;
  if coalesce(p_acepta_tarifa_no_reembolsable, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'tarifa_no_aceptada');
  end if;
  if p_regla_empate not in ('penales', 'mitad_cada_uno') then
    return jsonb_build_object('ok', false, 'error', 'regla_empate_invalida');
  end if;

  v_req := public.plc_check_desafio_cancha(v_user);
  if coalesce(v_req->>'ok', 'false') <> 'true' then
    return v_req;
  end if;

  if p_disponibilidad_id is not null then
    select * into v_disp from public.disponibilidades where id = p_disponibilidad_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'turno_no_existe');
    end if;
    if v_disp.estado is distinct from 'disponible' then
      return jsonb_build_object('ok', false, 'error', 'turno_no_disponible');
    end if;
    v_inicio := public.inicio_turno(v_disp.fecha, v_disp.hora_inicio);
    if v_inicio <= public.ahora_argentina() then
      return jsonb_build_object('ok', false, 'error', 'turno_pasado');
    end if;
    select * into v_campo from public.campos where id = v_disp.campo_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'campo_no_existe');
    end if;
    select * into v_ca from public.canchas where id = v_campo.cancha_id;
    v_tipo := public.tipo_desde_campo(v_campo.tipo);
    v_fecha := v_disp.fecha;
    v_hora := v_disp.hora_inicio;
    v_dur := greatest(1, round(extract(epoch from (v_disp.hora_fin - v_disp.hora_inicio)) / 60.0)::int);
  else
    if p_cancha_id is null or p_fecha is null or p_hora_inicio is null then
      return jsonb_build_object('ok', false, 'error', 'fecha_hora_requerida');
    end if;
    select * into v_ca from public.canchas where id = p_cancha_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'cancha_no_existe');
    end if;
    v_tipo := public.tipo_desde_campo(lower(btrim(coalesce(p_formato, 'f5'))));
    v_fecha := p_fecha;
    v_hora := p_hora_inicio;
    v_dur := greatest(coalesce(p_duracion_min, 60), 30);
    v_inicio := public.inicio_turno(v_fecha, v_hora);
    if v_inicio <= public.ahora_argentina() then
      return jsonb_build_object('ok', false, 'error', 'turno_pasado');
    end if;
    if v_ca.adherido is not true then
      v_flag_no_adh := public.config_bool('por_la_cancha_no_adheridos');
      if not v_flag_no_adh then
        return jsonb_build_object('ok', false, 'error', 'no_adheridos_sin_plata',
          'hint', 'Usá crear_partido_libre o activá por_la_cancha_no_adheridos');
      end if;
    end if;
  end if;

  v_cot := public.plc_cotizar_deposito(p_precio_cancha, v_tipo::text, p_jugadores_lado);
  if coalesce(v_cot->>'ok', 'false') <> 'true' then
    return v_cot;
  end if;

  v_precio := (v_cot->>'deposito')::numeric;
  v_tarifa := (v_cot->>'tarifa')::numeric;
  v_total := (v_cot->>'total_equipo')::numeric;

  v_val := public.validar_convocados_publicacion(
    p_equipo_id,
    coalesce(p_convocados, array[v_user]),
    v_tipo::text,
    18
  );
  if coalesce(v_val->>'ok', 'false') <> 'true' then
    return v_val;
  end if;
  select array_agg(x::uuid) into v_conv
  from jsonb_array_elements_text(v_val->'convocados') as x;
  if v_user <> all (v_conv) then
    v_conv := array_append(v_conv, v_user);
  end if;

  select nombre into v_eq_nombre from public.equipos where id = p_equipo_id;
  v_titulo := 'Por la cancha en ' || coalesce(v_ca.nombre, 'la cancha');
  v_cierre := (v_inicio - interval '2 hours') at time zone 'America/Argentina/Buenos_Aires';

  if p_disponibilidad_id is not null then
    update public.disponibilidades
    set estado = 'reservado_pendiente'
    where id = v_disp.id and estado = 'disponible';
    if not found then
      return jsonb_build_object('ok', false, 'error', 'turno_no_disponible');
    end if;
  end if;

  insert into public.desafios (
    owner_id, cancha_id, titulo, tipo, premio, direccion, barrio, place_id, lat, lng,
    fecha, hora_inicio, duracion_min, descripcion, estado,
    cierre_inscripcion, modalidad, disponibilidad_id, precio_cancha, tarifa_servicio, regla_empate,
    condiciones, condiciones_version, condiciones_congeladas_at, condiciones_aceptadas_por,
    requiere_aprobacion_precio, tarifa_no_reembolsable_aceptada, deposito_por_equipo
  ) values (
    v_user, v_ca.id, v_titulo, v_tipo, 0,
    coalesce(v_ca.direccion, 'A confirmar'), v_ca.barrio, v_ca.place_id,
    coalesce(v_ca.lat, 0), coalesce(v_ca.lng, 0),
    v_fecha, v_hora, v_dur, null,
    'pendiente_pago',
    v_cierre, 'por_la_cancha', p_disponibilidad_id, v_precio, v_tarifa, p_regla_empate,
    v_cot || jsonb_build_object(
      'origen', 'deposito_por_la_cancha',
      'cancha_no_adherida', (v_ca.adherido is not true),
      'tarifa_no_reembolsable', true
    ),
    1, now(), v_user,
    coalesce((v_cot->>'requiere_aprobacion')::boolean, false),
    true,
    v_precio
  )
  returning id into v_desafio;

  insert into public.desafio_inscripciones (
    desafio_id, equipo_id, capitan_id, estado, expira_at,
    monto_cancha, monto_servicio, monto_total,
    condiciones, condiciones_version, condiciones_aceptadas_at, condiciones_aceptadas_por,
    lado, tipo_inscripcion, jugadores_lado, tarifa_no_reembolsable_aceptada
  ) values (
    v_desafio, p_equipo_id, v_user, 'pendiente_pago', now() + interval '15 minutes',
    v_precio, v_tarifa, v_total,
    v_cot, 1, now(), v_user,
    'a', 'equipo', nullif(greatest(coalesce(p_jugadores_lado, 0), 0), 0), true
  )
  returning id into v_insc;

  insert into public.desafio_convocados (inscripcion_id, desafio_id, usuario_id)
  select v_insc, v_desafio, u from unnest(v_conv) as u;

  foreach v_uid in array v_conv loop
    if v_uid is distinct from v_user then
      perform public.emitir_notificacion(
        v_uid, 'convocado_partido', 'Te convocaron a un partido',
        'El capitán te convocó con ' || coalesce(v_eq_nombre, 'tu equipo') || ' a ' || v_titulo || '.',
        jsonb_build_object('desafio_id', v_desafio, 'equipo_id', p_equipo_id, 'destino', 'desafio')
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'desafio_id', v_desafio,
    'inscripcion_id', v_insc,
    'modalidad', 'por_la_cancha',
    'monto_cancha', v_precio,
    'monto_servicio', v_tarifa,
    'monto_total', v_total,
    'requiere_aprobacion_precio', coalesce((v_cot->>'requiere_aprobacion')::boolean, false),
    'cotizacion', v_cot,
    'expira_at', (now() + interval '15 minutes')
  );
end;
$$;

-- crear_partido (Plus / adherido): publicar con capitán alcanza.
create or replace function public.crear_partido(
  p_disponibilidad_id uuid,
  p_equipo_id uuid,
  p_convocados uuid[],
  p_regla_empate text,
  p_modalidad text default 'por_la_cancha',
  p_libres int default null,
  p_busca text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_disp public.disponibilidades%rowtype;
  v_campo public.campos%rowtype;
  v_cancha public.canchas%rowtype;
  v_tipo public.match_tipo;
  v_val jsonb;
  v_cond jsonb;
  v_req jsonb;
  v_conv uuid[];
  v_tarifa numeric;
  v_precio numeric;
  v_total numeric;
  v_desafio uuid;
  v_insc uuid;
  v_inicio timestamp;
  v_duracion int;
  v_eq_nombre text;
  v_titulo text;
  v_uid uuid;
  v_cierre timestamptz;
  v_mod text;
  v_libres int;
  v_busca text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.es_capitan(p_equipo_id) then
    return jsonb_build_object('ok', false, 'error', 'no_capitan');
  end if;

  v_mod := public.plc_modalidad_norm(p_modalidad);
  v_busca := lower(btrim(coalesce(p_busca, 'ambos')));
  if v_busca not in ('sueltos', 'equipo', 'rival', 'ambos') then
    v_busca := 'ambos';
  end if;

  if p_regla_empate not in ('penales', 'mitad_cada_uno') then
    return jsonb_build_object('ok', false, 'error', 'regla_empate_invalida');
  end if;

  if v_mod = 'por_la_cancha' then
    v_req := public.plc_check_desafio_cancha(v_user);
  else
    v_req := public.plc_check_edad_basica(v_user);
  end if;
  if coalesce(v_req->>'ok', 'false') <> 'true' then
    return v_req;
  end if;

  v_cond := public.calcular_condiciones(
    p_disponibilidad_id,
    case when v_mod = 'competitivo' then 'amistoso' else v_mod end,
    now()
  );
  if coalesce(v_cond->>'ok', 'false') <> 'true' then
    return v_cond;
  end if;
  if coalesce((v_cond->>'desafios_habilitados')::boolean, true) is not true then
    return jsonb_build_object('ok', false, 'error', 'desafios_no_habilitados');
  end if;
  if coalesce((v_cond->>'horario_habilitado')::boolean, true) is not true then
    return jsonb_build_object('ok', false, 'error', 'horario_no_habilitado');
  end if;
  if coalesce((v_cond->>'anticipacion_ok')::boolean, true) is not true then
    return jsonb_build_object(
      'ok', false, 'error', 'anticipacion_insuficiente',
      'minimo', (v_cond->>'anticipacion_minima_horas')::numeric
    );
  end if;

  v_precio := coalesce((v_cond->>'precio_cancha')::numeric, 0);
  v_libres := greatest(coalesce(p_libres, 0), 0);
  v_tarifa := public.plc_tarifa_plus(v_libres, v_busca, v_mod);
  if v_tarifa <= 0 then
    return jsonb_build_object('ok', false, 'error', 'tarifa_no_configurada');
  end if;
  v_total := v_precio + v_tarifa;

  select * into v_disp from public.disponibilidades where id = p_disponibilidad_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'turno_no_existe');
  end if;
  if v_disp.estado is distinct from 'disponible' then
    return jsonb_build_object('ok', false, 'error', 'turno_no_disponible');
  end if;

  v_inicio := public.inicio_turno(v_disp.fecha, v_disp.hora_inicio);
  if v_inicio <= public.ahora_argentina() then
    return jsonb_build_object('ok', false, 'error', 'turno_pasado');
  end if;

  select * into v_campo from public.campos where id = v_disp.campo_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'campo_no_existe');
  end if;
  select * into v_cancha from public.canchas where id = v_campo.cancha_id;

  v_tipo := public.tipo_desde_campo(v_campo.tipo);
  if v_mod = 'por_la_cancha' then
    v_val := public.validar_convocados_publicacion(
      p_equipo_id, coalesce(p_convocados, array[v_user]), v_tipo::text, 18
    );
  else
    v_val := public.validar_convocados_publicacion(
      p_equipo_id, coalesce(p_convocados, array[v_user]), v_tipo::text, 13
    );
  end if;
  if coalesce(v_val->>'ok', 'false') <> 'true' then
    return v_val;
  end if;
  select array_agg(x::uuid) into v_conv
  from jsonb_array_elements_text(v_val->'convocados') as x;
  if v_user <> all (v_conv) then
    v_conv := array_append(v_conv, v_user);
  end if;

  v_duracion := greatest(1, round(extract(epoch from (v_disp.hora_fin - v_disp.hora_inicio)) / 60.0)::int);
  select nombre into v_eq_nombre from public.equipos where id = p_equipo_id;
  v_titulo := case
    when v_mod = 'amistoso' then 'Amistoso en '
    when v_mod = 'competitivo' then 'Competitivo en '
    else 'Partido en '
  end || coalesce(v_cancha.nombre, 'la cancha');
  v_cierre := coalesce(
    (v_cond->>'cierre_sin_rival')::timestamptz,
    (v_inicio - interval '2 hours') at time zone 'America/Argentina/Buenos_Aires'
  );

  update public.disponibilidades
  set estado = 'reservado_pendiente'
  where id = v_disp.id and estado = 'disponible';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'turno_no_disponible');
  end if;

  insert into public.desafios (
    owner_id, cancha_id, titulo, tipo, premio, direccion, barrio, place_id, lat, lng,
    fecha, hora_inicio, duracion_min, descripcion, estado,
    cierre_inscripcion, modalidad, disponibilidad_id, precio_cancha, tarifa_servicio, regla_empate,
    condiciones, condiciones_version, condiciones_congeladas_at, condiciones_aceptadas_por
  ) values (
    v_user, v_cancha.id, v_titulo, v_tipo, 0,
    coalesce(v_cancha.direccion, 'A confirmar'), v_cancha.barrio, v_cancha.place_id,
    coalesce(v_cancha.lat, 0), coalesce(v_cancha.lng, 0),
    v_disp.fecha, v_disp.hora_inicio, v_duracion, null, 'pendiente_pago',
    v_cierre, v_mod, v_disp.id, v_precio, v_tarifa, p_regla_empate,
    v_cond || jsonb_build_object(
      'tarifa_plus', v_tarifa,
      'libres', v_libres,
      'busca', v_busca,
      'origen', 'reserva_plus'
    ),
    coalesce((v_cond->>'version')::int, 1), now(), v_user
  )
  returning id into v_desafio;

  insert into public.desafio_inscripciones (
    desafio_id, equipo_id, capitan_id, estado, expira_at,
    monto_cancha, monto_servicio, monto_total,
    condiciones, condiciones_version, condiciones_aceptadas_at, condiciones_aceptadas_por,
    lado, tipo_inscripcion
  ) values (
    v_desafio, p_equipo_id, v_user, 'pendiente_pago', now() + interval '15 minutes',
    v_precio, v_tarifa, v_total,
    v_cond, coalesce((v_cond->>'version')::int, 1), now(), v_user,
    'a', 'equipo'
  )
  returning id into v_insc;

  insert into public.desafio_convocados (inscripcion_id, desafio_id, usuario_id)
  select v_insc, v_desafio, u from unnest(v_conv) as u;

  foreach v_uid in array v_conv loop
    if v_uid is distinct from v_user then
      perform public.emitir_notificacion(
        v_uid, 'convocado_partido', 'Te convocaron a un partido',
        'El capitán te convocó con ' || coalesce(v_eq_nombre, 'tu equipo') || ' a ' || v_titulo || '.',
        jsonb_build_object('desafio_id', v_desafio, 'equipo_id', p_equipo_id, 'destino', 'desafio')
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'desafio_id', v_desafio,
    'inscripcion_id', v_insc,
    'disponibilidad_id', p_disponibilidad_id,
    'monto_total', v_total,
    'tarifa', v_tarifa,
    'precio_cancha', v_precio
  );
exception
  when others then
    update public.disponibilidades set estado = 'disponible'
    where id = p_disponibilidad_id and estado = 'reservado_pendiente';
    raise;
end;
$$;
