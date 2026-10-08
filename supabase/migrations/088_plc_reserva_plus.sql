-- Fase 3: tarifas Plus, modalidad competitivo, helper de tarifa y pasar-a-Plus.
-- Reutiliza crear_partido / checkout de reserva; no duplica cotización de cancha.
-- estado_reserva solo: reservada | jugada | cancelada | cancelada_predio.
-- reservas usa organizador_id (no usuario_id).

insert into public.config_plataforma (clave, valor_num)
values
  ('tarifa_plus_1_2', 1500),
  ('tarifa_plus_3_mas', 2000),
  ('tarifa_plus_por_la_cancha', 2000)
on conflict (clave) do update
set valor_num = excluded.valor_num;

create or replace function public.plc_tarifa_plus(
  p_libres int,
  p_busca text,
  p_modalidad text
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mod text := lower(btrim(coalesce(p_modalidad, 'amistoso')));
  v_busca text := lower(btrim(coalesce(p_busca, 'ambos')));
  v_libres int := greatest(coalesce(p_libres, 0), 0);
begin
  if v_mod = 'por_la_cancha' then
    return coalesce(public.config_num('tarifa_plus_por_la_cancha'), 2000);
  end if;
  -- busca rival (equipo) o 3+ libres → tarifa alta
  if v_busca in ('equipo', 'rival') or v_libres >= 3 then
    return coalesce(public.config_num('tarifa_plus_3_mas'), 2000);
  end if;
  -- 0–2 libres (sueltos / ambos): piso Plus
  return coalesce(public.config_num('tarifa_plus_1_2'), 1500);
end;
$$;

revoke all on function public.plc_tarifa_plus(int, text, text) from public;
grant execute on function public.plc_tarifa_plus(int, text, text) to authenticated, anon;

-- Modalidad competitivo (13+, sin DNI; economía tipo amistoso).
alter table public.desafios drop constraint if exists desafios_modalidad_chk;
alter table public.desafios
  add constraint desafios_modalidad_chk
  check (modalidad in ('premio', 'por_la_cancha', 'amistoso', 'competitivo'));

create or replace function public.plc_es_circuito(p_modalidad text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_modalidad, '') in ('por_la_cancha', 'amistoso', 'competitivo');
$$;

create or replace function public.plc_modalidad_norm(p_modalidad text)
returns text
language sql
immutable
as $$
  select case lower(btrim(coalesce(p_modalidad, 'por_la_cancha')))
    when 'amistoso' then 'amistoso'
    when 'competitivo' then 'competitivo'
    else 'por_la_cancha'
  end;
$$;

-- Cotizar Plus (montos server-side para resumen / cobro).
create or replace function public.plc_cotizar_reserva_plus(
  p_disponibilidad_id uuid,
  p_modalidad text,
  p_libres int,
  p_busca text,
  p_tipo_cobro text default 'total'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod text := public.plc_modalidad_norm(p_modalidad);
  v_tipo text := case when lower(coalesce(p_tipo_cobro, 'total')) = 'sena' then 'sena' else 'total' end;
  v_cot jsonb;
  v_tarifa numeric;
  v_cancha numeric;
  v_pagar numeric;
begin
  if v_mod = 'por_la_cancha' then
    v_tipo := 'total'; -- por la cancha: siempre cancha completa
  end if;

  v_cot := public.plc_cotizar_reserva(p_disponibilidad_id, v_tipo);
  if coalesce(v_cot->>'ok', 'false') <> 'true' then
    return v_cot;
  end if;

  v_tarifa := public.plc_tarifa_plus(p_libres, p_busca, v_mod);
  v_cancha := coalesce((v_cot->>'monto_pagar')::numeric, 0);
  v_pagar := v_cancha + v_tarifa;

  return jsonb_build_object(
    'ok', true,
    'modalidad', v_mod,
    'tipo_cobro', v_tipo,
    'precio_cancha', coalesce((v_cot->>'precio_cancha')::numeric, 0),
    'monto_cancha', v_cancha,
    'tarifa_plus', v_tarifa,
    'monto_pagar_ahora', v_pagar,
    'resta_en_predio', coalesce((v_cot->>'resta_en_predio')::numeric, 0),
    'texto_cancelacion', v_cot->>'texto_cancelacion',
    'texto_reglas', v_cot->>'texto_reglas',
    'cancha_nombre', v_cot->>'cancha_nombre',
    'campo_nombre', v_cot->>'campo_nombre',
    'fecha', v_cot->>'fecha',
    'hora_inicio', v_cot->>'hora_inicio',
    'formato', v_cot->>'formato',
    'slug', v_cot->>'slug',
    'aclaracion_tarifa', 'Si no se suma nadie por la app, te devolvemos la tarifa'
  );
end;
$$;

revoke all on function public.plc_cotizar_reserva_plus(uuid, text, int, text, text) from public;
grant execute on function public.plc_cotizar_reserva_plus(uuid, text, int, text, text) to authenticated, anon;

-- Crear partido admite competitivo; edad: por_la_cancha 18+DNI, resto ≥13.
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

  -- competitivo reutiliza condiciones de amistoso
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
    v_val := public.validar_convocados_edad(p_equipo_id, p_convocados, v_tipo::text, 18);
  else
    v_val := public.validar_convocados_edad(p_equipo_id, p_convocados, v_tipo::text, 13);
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
    'modalidad', v_mod,
    'monto_cancha', v_precio,
    'monto_servicio', v_tarifa,
    'tarifa_plus', v_tarifa,
    'monto_total', v_total,
    'expira_at', (now() + interval '15 minutes'),
    'condiciones', v_cond
  );
end;
$$;

-- Pasar a Plus: desde reserva simple ya pagada.
-- Cierra la reserva (cancelada + metadata) y crea el partido; cobra solo upgrade.
create or replace function public.plc_pasar_a_plus(
  p_reserva_id uuid,
  p_equipo_id uuid,
  p_convocados uuid[],
  p_modalidad text,
  p_regla_empate text,
  p_libres int default 0,
  p_busca text default 'ambos'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_r public.reservas%rowtype;
  v_disp public.disponibilidades%rowtype;
  v_mod text := public.plc_modalidad_norm(p_modalidad);
  v_req jsonb;
  v_res jsonb;
  v_tarifa numeric;
  v_falta_cancha numeric := 0;
  v_upgrade numeric;
  v_insc uuid;
  v_disp_estado_prev text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;

  select * into v_r from public.reservas where id = p_reserva_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if v_r.organizador_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'error', 'no_capitan');
  end if;
  if v_r.estado_reserva is distinct from 'reservada' then
    return jsonb_build_object('ok', false, 'error', 'no_activa');
  end if;
  if coalesce(v_r.condiciones->>'convertida_a_plus', 'false') = 'true' then
    return jsonb_build_object('ok', false, 'error', 'no_activa');
  end if;

  select * into v_disp from public.disponibilidades where id = v_r.disponibilidad_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'turno_no_existe');
  end if;
  v_disp_estado_prev := v_disp.estado;

  -- hasta 1 h antes del inicio
  if public.inicio_turno(v_disp.fecha, v_disp.hora_inicio) - interval '1 hour' <= public.ahora_argentina() then
    return jsonb_build_object('ok', false, 'error', 'fuera_de_plazo');
  end if;

  if v_mod = 'por_la_cancha' then
    v_req := public.plc_check_desafio_cancha(v_user);
  else
    v_req := public.plc_check_edad_basica(v_user);
  end if;
  if coalesce(v_req->>'ok', 'false') <> 'true' then
    return v_req;
  end if;

  -- liberar slot a disponible temporalmente para crear_partido
  update public.disponibilidades set estado = 'disponible' where id = v_disp.id;

  v_res := public.crear_partido(
    v_disp.id, p_equipo_id, p_convocados, p_regla_empate, v_mod, p_libres, p_busca
  );
  if coalesce(v_res->>'ok', 'false') <> 'true' then
    update public.disponibilidades set estado = v_disp_estado_prev where id = v_disp.id;
    return v_res;
  end if;

  v_tarifa := coalesce((v_res->>'tarifa_plus')::numeric, 0);
  -- seña + por_la_cancha: completar cancha; si ya pagó total, solo tarifa
  if v_mod = 'por_la_cancha' and coalesce(v_r.tipo_cobro, '') = 'sena' then
    v_falta_cancha := greatest(
      coalesce(v_r.monto_cancha, (v_res->>'monto_cancha')::numeric, 0)
        - coalesce(v_r.monto_total, 0),
      0
    );
  else
    v_falta_cancha := 0;
  end if;
  v_upgrade := v_tarifa + v_falta_cancha;
  v_insc := (v_res->>'inscripcion_id')::uuid;

  update public.desafio_inscripciones
  set monto_cancha = v_falta_cancha,
      monto_servicio = v_tarifa,
      monto_total = v_upgrade
  where id = v_insc;

  update public.desafios
  set precio_cancha = v_falta_cancha,
      tarifa_servicio = v_tarifa,
      condiciones = coalesce(condiciones, '{}'::jsonb) || jsonb_build_object(
        'upgrade_desde_reserva', p_reserva_id,
        'monto_upgrade', v_upgrade,
        'falta_cancha', v_falta_cancha
      )
  where id = (v_res->>'desafio_id')::uuid;

  update public.reservas
  set estado_reserva = 'cancelada',
      condiciones = coalesce(condiciones, '{}'::jsonb) || jsonb_build_object(
        'convertida_a_plus', true,
        'desafio_id', v_res->>'desafio_id',
        'convertida_at', now()
      )
  where id = v_r.id;

  return v_res || jsonb_build_object(
    'reserva_id', v_r.id,
    'cobra_solo_tarifa', v_falta_cancha <= 0,
    'falta_cancha', v_falta_cancha,
    'monto_upgrade', v_upgrade,
    'monto_total', v_upgrade,
    'monto_cancha', v_falta_cancha,
    'monto_servicio', v_tarifa
  );
exception when others then
  if v_disp.id is not null then
    update public.disponibilidades
    set estado = coalesce(v_disp_estado_prev, 'reservado')
    where id = v_disp.id and estado = 'disponible';
  end if;
  raise;
end;
$$;

revoke all on function public.plc_pasar_a_plus(uuid, uuid, uuid[], text, text, int, text) from public;
grant execute on function public.plc_pasar_a_plus(uuid, uuid, uuid[], text, text, int, text) to authenticated;
