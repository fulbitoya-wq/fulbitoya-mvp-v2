-- Por la cancha: anotar el equipo sin ventana de 15 minutos.
-- La inscripción queda pendiente_pago hasta el cierre de inscripción;
-- el capitán completa el plantel y paga cuando esté listo.

create or replace function public.inscribir_equipo(
  p_desafio_id uuid,
  p_equipo_id uuid,
  p_convocados uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_d public.desafios%rowtype;
  v_cierre timestamp;
  v_now timestamp;
  v_ocupados int;
  v_val jsonb;
  v_req jsonb;
  v_conv uuid[];
  v_uid uuid;
  v_estado text;
  v_insc uuid;
  v_prev public.desafio_inscripciones%rowtype;
  v_eq_nombre text;
  v_pago boolean;
  v_expira timestamptz;
  v_mc numeric;
  v_ms numeric;
  v_mt numeric;
  v_min_edad int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.es_capitan(p_equipo_id) then
    return jsonb_build_object('ok', false, 'error', 'no_capitan');
  end if;

  select * into v_d from public.desafios where id = p_desafio_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'desafio_no_existe');
  end if;
  if v_d.estado not in ('abierto', 'completo') then
    return jsonb_build_object('ok', false, 'error', 'desafio_cerrado');
  end if;

  v_pago := public.plc_es_circuito(v_d.modalidad);
  v_now := public.ahora_argentina();
  v_cierre := public.plc_limite_inscripcion(v_d);
  if v_now >= v_cierre then
    return jsonb_build_object('ok', false, 'error', 'inscripcion_cerrada');
  end if;

  if v_d.modalidad = 'amistoso' and public.plc_sueltos_activos(v_d.id) > 0 then
    return jsonb_build_object('ok', false, 'error', 'hay_sueltos');
  end if;

  if v_d.modalidad = 'por_la_cancha' then
    v_req := public.plc_check_desafio_cancha(v_user);
    if coalesce(v_req->>'ok', 'false') <> 'true' then
      return v_req;
    end if;
    v_min_edad := 18;
  elsif v_d.modalidad = 'amistoso' then
    v_req := public.plc_check_edad_basica(v_user);
    if coalesce(v_req->>'ok', 'false') <> 'true' then
      return v_req;
    end if;
    v_min_edad := 13;
  elsif v_d.premio > 0 then
    v_min_edad := 18;
  else
    v_min_edad := 13;
  end if;

  v_val := public.validar_convocados_publicacion(
    p_equipo_id,
    coalesce(p_convocados, array[v_user]),
    v_d.tipo::text,
    v_min_edad
  );
  if coalesce(v_val->>'ok', 'false') <> 'true' then
    return v_val;
  end if;

  select array_agg(x::uuid) into v_conv
  from jsonb_array_elements_text(v_val->'convocados') as x;
  if v_conv is not null and v_user <> all (v_conv) then
    v_conv := array_append(v_conv, v_user);
  end if;

  if exists (
    select 1 from public.desafio_convocados c
    join public.desafio_inscripciones i on i.id = c.inscripcion_id
    where c.desafio_id = p_desafio_id
      and c.usuario_id = any (v_conv)
      and i.estado in ('pendiente_pago', 'confirmada')
      and i.equipo_id is distinct from p_equipo_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'convocado_ocupado');
  end if;

  select * into v_prev
  from public.desafio_inscripciones
  where desafio_id = p_desafio_id and equipo_id = p_equipo_id
  for update;

  if found and v_prev.estado in ('pendiente_pago', 'confirmada') then
    return jsonb_build_object('ok', false, 'error', 'ya_inscripto');
  end if;

  select count(*) into v_ocupados
  from public.desafio_inscripciones
  where desafio_id = p_desafio_id
    and tipo_inscripcion = 'equipo'
    and estado in ('pendiente_pago', 'confirmada');

  if v_ocupados >= 2 then
    return jsonb_build_object('ok', false, 'error', 'cupo_lleno');
  end if;

  if v_pago then
    v_estado := 'pendiente_pago';
    -- Por la cancha: el cupo queda anotado hasta el cierre; el resto sigue con hold corto.
    if v_d.modalidad = 'por_la_cancha' then
      v_expira := coalesce(
        v_d.cierre_inscripcion,
        timezone('America/Argentina/Buenos_Aires', v_cierre)
      );
    else
      v_expira := now() + interval '15 minutes';
    end if;
    if v_d.modalidad = 'amistoso' then
      v_mt := public.plc_monto_snap(v_d.condiciones, 'monto_rival_equipo', 0);
      v_ms := public.plc_monto_snap(v_d.condiciones, 'tarifa_servicio_amistoso_equipo', 0);
      v_mc := greatest(v_mt - v_ms, 0);
    else
      v_mc := v_d.precio_cancha;
      v_ms := v_d.tarifa_servicio;
      v_mt := v_d.precio_cancha + v_d.tarifa_servicio;
    end if;
  else
    v_estado := 'confirmada';
    v_expira := null;
    v_mc := null; v_ms := null; v_mt := null;
  end if;

  if v_prev.id is not null then
    update public.desafio_inscripciones
    set capitan_id = v_user,
        estado = v_estado,
        confirmada_at = case when v_estado = 'confirmada' then now() else null end,
        cancelada_at = null,
        expira_at = v_expira,
        monto_cancha = case when v_pago then v_mc else monto_cancha end,
        monto_servicio = case when v_pago then v_ms else monto_servicio end,
        monto_total = case when v_pago then v_mt else monto_total end,
        lado = 'rival',
        tipo_inscripcion = 'equipo',
        updated_at = now()
    where id = v_prev.id
    returning id into v_insc;
    delete from public.desafio_convocados where inscripcion_id = v_insc;
  else
    insert into public.desafio_inscripciones (
      desafio_id, equipo_id, capitan_id, estado, confirmada_at, expira_at,
      monto_cancha, monto_servicio, monto_total, lado, tipo_inscripcion
    ) values (
      p_desafio_id, p_equipo_id, v_user, v_estado,
      case when v_estado = 'confirmada' then now() else null end,
      v_expira, v_mc, v_ms, v_mt, 'rival', 'equipo'
    )
    returning id into v_insc;
  end if;

  insert into public.desafio_convocados (inscripcion_id, desafio_id, usuario_id)
  select v_insc, p_desafio_id, u from unnest(v_conv) as u;

  select count(*) into v_ocupados
  from public.desafio_inscripciones
  where desafio_id = p_desafio_id and estado = 'confirmada' and tipo_inscripcion = 'equipo';

  if (not v_pago) and v_ocupados >= 2 then
    update public.desafios set estado = 'completo' where id = p_desafio_id and estado = 'abierto';
  end if;

  select e.nombre into v_eq_nombre from public.equipos e where e.id = p_equipo_id;
  foreach v_uid in array v_conv loop
    if v_uid is distinct from v_user then
      perform public.emitir_notificacion(
        v_uid, 'convocado_partido', 'Te convocaron a un partido',
        'El capitán te convocó con ' || coalesce(v_eq_nombre, 'tu equipo') || ' a ' || v_d.titulo || '.',
        jsonb_build_object('desafio_id', p_desafio_id, 'equipo_id', p_equipo_id, 'destino', 'desafio')
      );
    end if;
  end loop;

  if v_d.owner_id is distinct from v_user then
    perform public.emitir_notificacion(
      v_d.owner_id, 'inscripcion_desafio', 'Un equipo se inscribió',
      coalesce(v_eq_nombre, 'Un equipo') || ' se anotó a ' || v_d.titulo || '.',
      jsonb_build_object('desafio_id', p_desafio_id, 'equipo_id', p_equipo_id, 'destino', 'desafio')
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'inscripcion_id', v_insc, 'estado', v_estado, 'expira_at', v_expira,
    'monto_cancha', v_mc, 'monto_servicio', v_ms, 'monto_total', v_mt
  );
end;
$$;

-- Publicar por la cancha: misma regla (pago hasta el cierre, no 15 minutos).
create or replace function public.crear_partido_deposito(
  p_equipo_id uuid,
  p_convocados uuid[],
  p_regla_empate text,
  p_precio_cancha numeric,
  p_acepta_tarifa_no_reembolsable boolean,
  p_disponibilidad_id uuid default null,
  p_cancha_id uuid default null,
  p_fecha date default null,
  p_hora_inicio time default null,
  p_formato text default null,
  p_duracion_min int default 60,
  p_jugadores_lado int default null
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
  v_req jsonb;
  v_val jsonb;
  v_cot jsonb;
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
    v_desafio, p_equipo_id, v_user, 'pendiente_pago', v_cierre,
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
    'expira_at', v_cierre
  );
end;
$$;

-- Extender hold de inscripciones por_la_cancha ya abiertas (si aún están en 15 min).
update public.desafio_inscripciones i
set expira_at = coalesce(
  d.cierre_inscripcion,
  timezone('America/Argentina/Buenos_Aires', public.plc_limite_inscripcion(d))
),
updated_at = now()
from public.desafios d
where d.id = i.desafio_id
  and d.modalidad = 'por_la_cancha'
  and i.estado = 'pendiente_pago'
  and i.expira_at is not null
  and i.expira_at < coalesce(d.cierre_inscripcion, now() + interval '1 day');
