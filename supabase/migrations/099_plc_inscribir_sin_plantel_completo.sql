-- Inscribir / editar convocados: alcanza con el capitán (mismo criterio que publicar).
-- El plantel completo se exige a la hora del partido (walkover), no al anotarse ni al pagar.

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
    v_expira := now() + interval '15 minutes';
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

create or replace function public.editar_convocados(p_inscripcion_id uuid, p_convocados uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_i public.desafio_inscripciones%rowtype;
  v_d public.desafios%rowtype;
  v_conv uuid[];
  v_uid uuid;
  v_antes uuid[];
  v_eq_nombre text;
  v_now timestamp;
  v_inicio timestamp;
  v_cierre timestamp;
  v_min_edad int;
  v_val jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;

  select * into v_i from public.desafio_inscripciones where id = p_inscripcion_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if not public.es_capitan(v_i.equipo_id) then
    return jsonb_build_object('ok', false, 'error', 'no_capitan');
  end if;
  if v_i.estado not in ('pendiente_pago', 'confirmada') then
    return jsonb_build_object('ok', false, 'error', 'no_activa');
  end if;

  select * into v_d from public.desafios where id = v_i.desafio_id for update;
  v_now := public.ahora_argentina();
  v_inicio := v_d.fecha::timestamp + v_d.hora_inicio;
  v_cierre := case
    when v_d.cierre_inscripcion is not null then timezone('America/Argentina/Buenos_Aires', v_d.cierre_inscripcion)
    else v_inicio - interval '2 hours'
  end;
  if v_now >= v_cierre then
    return jsonb_build_object('ok', false, 'error', 'inscripcion_cerrada');
  end if;

  v_min_edad := case
    when v_d.modalidad = 'por_la_cancha' or v_d.premio > 0 then 18
    when v_d.modalidad = 'amistoso' then 13
    else 13
  end;

  v_val := public.validar_convocados_publicacion(
    v_i.equipo_id,
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
    select 1
    from public.desafio_convocados c
    join public.desafio_inscripciones i on i.id = c.inscripcion_id
    where c.desafio_id = v_i.desafio_id
      and c.usuario_id = any (v_conv)
      and i.estado in ('pendiente_pago', 'confirmada')
      and i.id is distinct from v_i.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'convocado_ocupado');
  end if;

  select array_agg(c.usuario_id) into v_antes
  from public.desafio_convocados c
  where c.inscripcion_id = v_i.id;

  delete from public.desafio_convocados where inscripcion_id = v_i.id;
  insert into public.desafio_convocados (inscripcion_id, desafio_id, usuario_id)
  select v_i.id, v_i.desafio_id, u from unnest(v_conv) as u;

  select e.nombre into v_eq_nombre from public.equipos e where e.id = v_i.equipo_id;

  foreach v_uid in array v_conv loop
    if v_uid is distinct from v_user
       and (v_antes is null or not v_uid = any (v_antes)) then
      perform public.emitir_notificacion(
        v_uid,
        'convocado_partido',
        'Te convocaron a un partido',
        'El capitán te convocó con ' || coalesce(v_eq_nombre, 'tu equipo') || ' a ' || v_d.titulo || '.',
        jsonb_build_object('desafio_id', v_i.desafio_id, 'equipo_id', v_i.equipo_id, 'destino', 'desafio')
      );
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'convocados', to_jsonb(v_conv));
end;
$$;
