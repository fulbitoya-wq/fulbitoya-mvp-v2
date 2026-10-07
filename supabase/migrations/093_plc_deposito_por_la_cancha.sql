-- Fase 3: por la cancha con depósito. Tarifa fija por equipo (config), no se reembolsa.
-- Reutiliza liquidar_partido / reembolsos / deuda_predio existentes.

insert into public.config_plataforma (clave, valor_num, valor_text) values
  ('plc_tarifa_modo', null, 'fijo_equipo'),
  ('plc_tarifa_fija_equipo', 2000, null),
  ('plc_tope_cancha_f5', 60000, null),
  ('plc_tope_cancha_f7', 80000, null),
  ('plc_tope_cancha_f9', 110000, null),
  ('plc_tope_cancha_f11', 150000, null),
  ('plc_ref_cancha_f5', 40000, null),
  ('plc_ref_cancha_f7', 55000, null),
  ('plc_ref_cancha_f9', 75000, null),
  ('plc_ref_cancha_f11', 100000, null),
  ('plc_factor_aprobacion_precio', 1.5, null)
on conflict (clave) do nothing;

-- Asegurar tarifa legacy alineada
insert into public.config_plataforma (clave, valor_num)
values ('tarifa_servicio_equipo', 2000)
on conflict (clave) do update
set valor_num = coalesce(public.config_plataforma.valor_num, 2000);

alter table public.desafios
  add column if not exists requiere_aprobacion_precio boolean not null default false,
  add column if not exists tarifa_no_reembolsable_aceptada boolean not null default false,
  add column if not exists deposito_por_equipo numeric(12,2);

alter table public.desafio_inscripciones
  add column if not exists jugadores_lado int,
  add column if not exists tarifa_no_reembolsable_aceptada boolean not null default false;

create or replace function public.plc_tarifa_deposito_equipo()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.config_num('plc_tarifa_fija_equipo'),
    public.config_num('tarifa_servicio_equipo'),
    2000
  );
$$;

create or replace function public.plc_tope_cancha_formato(p_formato text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case public.tipo_desde_campo(lower(btrim(coalesce(p_formato, 'f5'))))::text
    when 'f7' then coalesce(public.config_num('plc_tope_cancha_f7'), 80000)
    when 'f9' then coalesce(public.config_num('plc_tope_cancha_f9'), 110000)
    when 'f11' then coalesce(public.config_num('plc_tope_cancha_f11'), 150000)
    else coalesce(public.config_num('plc_tope_cancha_f5'), 60000)
  end;
$$;

create or replace function public.plc_ref_cancha_formato(p_formato text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case public.tipo_desde_campo(lower(btrim(coalesce(p_formato, 'f5'))))::text
    when 'f7' then coalesce(public.config_num('plc_ref_cancha_f7'), 55000)
    when 'f9' then coalesce(public.config_num('plc_ref_cancha_f9'), 75000)
    when 'f11' then coalesce(public.config_num('plc_ref_cancha_f11'), 100000)
    else coalesce(public.config_num('plc_ref_cancha_f5'), 40000)
  end;
$$;

-- Redondeo hacia arriba al peso
create or replace function public.plc_ceil_pesos(p_monto numeric)
returns numeric
language sql
immutable
as $$
  select ceil(greatest(coalesce(p_monto, 0), 0));
$$;

create or replace function public.plc_cotizar_deposito(
  p_precio_cancha numeric,
  p_formato text,
  p_jugadores_lado int default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_precio numeric := greatest(coalesce(p_precio_cancha, 0), 0);
  v_tarifa numeric := public.plc_tarifa_deposito_equipo();
  v_tope numeric := public.plc_tope_cancha_formato(p_formato);
  v_ref numeric := public.plc_ref_cancha_formato(p_formato);
  v_factor numeric := coalesce(public.config_num('plc_factor_aprobacion_precio'), 1.5);
  v_n int := greatest(coalesce(p_jugadores_lado, 0), 0);
  v_deposito numeric;
  v_total_equipo numeric;
  v_por_jugador numeric;
begin
  if v_precio <= 0 then
    return jsonb_build_object('ok', false, 'error', 'precio_cancha_invalido');
  end if;
  if v_precio > v_tope then
    return jsonb_build_object('ok', false, 'error', 'precio_sobre_tope', 'tope', v_tope);
  end if;
  if v_tarifa <= 0 then
    return jsonb_build_object('ok', false, 'error', 'tarifa_no_configurada');
  end if;

  v_deposito := v_precio; -- depósito = valor cancha (por equipo)
  v_total_equipo := v_deposito + v_tarifa;
  if v_n > 0 then
    v_por_jugador := public.plc_ceil_pesos(v_total_equipo / v_n);
  else
    v_por_jugador := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'precio_cancha', v_precio,
    'deposito', v_deposito,
    'tarifa', v_tarifa,
    'total_equipo', v_total_equipo,
    'por_jugador', v_por_jugador,
    'jugadores_lado', nullif(v_n, 0),
    'tope', v_tope,
    'referencia', v_ref,
    'requiere_aprobacion', (v_precio > v_ref * v_factor),
    'texto_tarifa',
      'La tarifa de $' || trim(to_char(v_tarifa, '999999990D00'))
      || ' cubre el procesamiento del pago y no se reembolsa en ningún caso, incluso si el partido se cancela',
    'desglose', jsonb_build_object(
      'cancha', v_deposito,
      'tarifa', v_tarifa,
      'total', v_total_equipo
    )
  );
end;
$$;

revoke all on function public.plc_cotizar_deposito(numeric, text, int) from public;
grant execute on function public.plc_cotizar_deposito(numeric, text, int) to authenticated, anon;

-- Crear partido por la cancha con depósito (adherido con turno, o no adherido sin turno).
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
    -- No adheridos con plata solo si flag (Fase 4)
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

  v_val := public.validar_convocados_edad(p_equipo_id, p_convocados, v_tipo::text, 18);
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
    case when coalesce((v_cot->>'requiere_aprobacion')::boolean, false) then 'pendiente_pago' else 'pendiente_pago' end,
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

revoke all on function public.crear_partido_deposito(numeric, text, uuid, uuid[], text, boolean, uuid, uuid, date, time, int, int) from public;
grant execute on function public.crear_partido_deposito(numeric, text, uuid, uuid[], text, boolean, uuid, uuid, date, time, int, int) to authenticated;

-- Al liquidar no adheridos: deuda_predio queda para transferencia manual (mismo tipo, detalle distinto).
-- Se apoya en liquidar_partido existente; solo anota metadata si cancha no adherida.
create or replace function public.plc_marcar_deuda_no_adherido(p_desafio_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d public.desafios%rowtype;
  v_ca public.canchas%rowtype;
begin
  select * into v_d from public.desafios where id = p_desafio_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'desafio_no_existe');
  end if;
  select * into v_ca from public.canchas where id = v_d.cancha_id;
  if not found or v_ca.adherido then
    return jsonb_build_object('ok', true, 'manual', false);
  end if;

  update public.movimientos
  set detalle = coalesce(detalle, '') || ' · Transferencia manual a predio no adherido'
  where desafio_id = p_desafio_id
    and tipo = 'deuda_predio'
    and estado = 'pendiente';

  return jsonb_build_object('ok', true, 'manual', true);
end;
$$;

revoke all on function public.plc_marcar_deuda_no_adherido(uuid) from public;
grant execute on function public.plc_marcar_deuda_no_adherido(uuid) to authenticated;
