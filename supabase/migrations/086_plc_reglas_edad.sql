-- Reglas de edad PorLaCancha:
-- - Cuenta: fecha de nacimiento obligatoria; sin menores de 13.
-- - Reserva / amistoso / sumarse: desde 13, sin DNI.
-- - Desafío por la cancha (crear / aceptar / pagar): 18+ con DNI y fecha verificados (servidor).
-- Reemplaza cualquier flag menores_pueden_pagar_en_app (si existía).

alter table public.jugador_perfiles
  add column if not exists dni text;

comment on column public.jugador_perfiles.dni is
  'DNI del jugador. Privado: solo el dueño vía RLS. Nunca en vistas públicas.';

alter table public.politica_predio drop column if exists menores_pueden_pagar_en_app;
alter table public.politica_campo drop column if exists menores_pueden_pagar_en_app;

create or replace function public.plc_edad_cumplida(p_fn date, p_anios int)
returns boolean
language sql
stable
as $$
  select p_fn is not null
    and p_anios is not null
    and p_anios > 0
    and (p_fn + make_interval(years => p_anios)) <= (public.ahora_argentina())::date;
$$;

create or replace function public.plc_es_mayor_13(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fn date;
begin
  select fecha_nacimiento into v_fn from public.jugador_perfiles where usuario_id = p_user;
  return public.plc_edad_cumplida(v_fn, 13);
end;
$$;

create or replace function public.plc_es_mayor_18(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fn date;
begin
  select fecha_nacimiento into v_fn from public.jugador_perfiles where usuario_id = p_user;
  return public.plc_edad_cumplida(v_fn, 18);
end;
$$;

create or replace function public.plc_dni_normalizado(p_dni text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_dni, ''), '[^0-9]', '', 'g'), '');
$$;

create or replace function public.plc_dni_valido(p_dni text)
returns boolean
language sql
immutable
as $$
  select public.plc_dni_normalizado(p_dni) ~ '^[0-9]{7,8}$';
$$;

-- Edad básica: reserva, amistoso, sumarse (≥13 + fecha).
create or replace function public.plc_check_edad_basica(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fn date;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  select fecha_nacimiento into v_fn from public.jugador_perfiles where usuario_id = p_user;
  if v_fn is null then
    return jsonb_build_object('ok', false, 'error', 'falta_nacimiento');
  end if;
  if not public.plc_edad_cumplida(v_fn, 13) then
    return jsonb_build_object('ok', false, 'error', 'menor_13');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Desafío por la cancha: ≥18 + fecha + DNI cargados.
create or replace function public.plc_check_desafio_cancha(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fn date;
  v_dni text;
begin
  if p_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  select fecha_nacimiento, dni into v_fn, v_dni
  from public.jugador_perfiles
  where usuario_id = p_user;
  if v_fn is null then
    return jsonb_build_object('ok', false, 'error', 'falta_nacimiento');
  end if;
  if not public.plc_edad_cumplida(v_fn, 18) then
    return jsonb_build_object('ok', false, 'error', 'menor_18');
  end if;
  if not public.plc_dni_valido(v_dni) then
    return jsonb_build_object('ok', false, 'error', 'falta_dni');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.plc_mi_estado_edad()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_fn date;
  v_dni text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  select fecha_nacimiento, dni into v_fn, v_dni
  from public.jugador_perfiles
  where usuario_id = v_user;
  return jsonb_build_object(
    'ok', true,
    'fecha_nacimiento', v_fn,
    'tiene_dni', public.plc_dni_valido(v_dni),
    'mayor_13', public.plc_edad_cumplida(v_fn, 13),
    'mayor_18', public.plc_edad_cumplida(v_fn, 18),
    'puede_desafio_cancha', coalesce((public.plc_check_desafio_cancha(v_user)->>'ok')::boolean, false)
  );
end;
$$;

revoke all on function public.plc_mi_estado_edad() from public;
grant execute on function public.plc_mi_estado_edad() to authenticated;

-- Guardar fecha (registro / complete birthdate). Rechaza <13.
create or replace function public.plc_guardar_fecha_nacimiento(p_fecha_nacimiento date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if p_fecha_nacimiento is null then
    return jsonb_build_object('ok', false, 'error', 'falta_nacimiento');
  end if;
  if p_fecha_nacimiento > (public.ahora_argentina())::date then
    return jsonb_build_object('ok', false, 'error', 'fecha_nacimiento_invalida');
  end if;
  if not public.plc_edad_cumplida(p_fecha_nacimiento, 13) then
    return jsonb_build_object('ok', false, 'error', 'menor_13');
  end if;

  insert into public.jugador_perfiles (usuario_id, fecha_nacimiento, updated_at)
  values (v_user, p_fecha_nacimiento, now())
  on conflict (usuario_id) do update set
    fecha_nacimiento = excluded.fecha_nacimiento,
    updated_at = now();

  return jsonb_build_object('ok', true, 'fecha_nacimiento', p_fecha_nacimiento);
end;
$$;

revoke all on function public.plc_guardar_fecha_nacimiento(date) from public;
grant execute on function public.plc_guardar_fecha_nacimiento(date) to authenticated;

-- Mid-flow: DNI + fecha para desafío por la cancha.
create or replace function public.plc_guardar_identidad_desafio(
  p_dni text,
  p_fecha_nacimiento date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_dni text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if p_fecha_nacimiento is null then
    return jsonb_build_object('ok', false, 'error', 'falta_nacimiento');
  end if;
  if p_fecha_nacimiento > (public.ahora_argentina())::date then
    return jsonb_build_object('ok', false, 'error', 'fecha_nacimiento_invalida');
  end if;
  if not public.plc_edad_cumplida(p_fecha_nacimiento, 13) then
    return jsonb_build_object('ok', false, 'error', 'menor_13');
  end if;
  if not public.plc_edad_cumplida(p_fecha_nacimiento, 18) then
    return jsonb_build_object('ok', false, 'error', 'menor_18');
  end if;

  v_dni := public.plc_dni_normalizado(p_dni);
  if not public.plc_dni_valido(v_dni) then
    return jsonb_build_object('ok', false, 'error', 'dni_invalido');
  end if;

  insert into public.jugador_perfiles (usuario_id, fecha_nacimiento, dni, updated_at)
  values (v_user, p_fecha_nacimiento, v_dni, now())
  on conflict (usuario_id) do update set
    fecha_nacimiento = excluded.fecha_nacimiento,
    dni = excluded.dni,
    updated_at = now();

  return jsonb_build_object('ok', true, 'puede_desafio_cancha', true);
end;
$$;

revoke all on function public.plc_guardar_identidad_desafio(text, date) from public;
grant execute on function public.plc_guardar_identidad_desafio(text, date) to authenticated;

create or replace function public.validar_convocados_edad(
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
  v_min int;
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

  v_min := public.minimo_convocados(p_tipo);
  if cardinality(v_conv) < v_min then
    return jsonb_build_object('ok', false, 'error', 'minimo_convocados', 'minimo', v_min);
  end if;

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

create or replace function public.validar_convocados_mayores(
  p_equipo_id uuid,
  p_convocados uuid[],
  p_tipo text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.validar_convocados_edad(p_equipo_id, p_convocados, p_tipo, 18);
end;
$$;

-- Signup: persistir DOB; rechazar <13 si viene en metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_avatar text;
  v_origen text;
  v_rol text;
  v_fn_txt text;
  v_fn date;
begin
  v_nombre := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'nombre'), ''),
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data->>'name'), '')
  );
  v_avatar := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'avatar_url'), ''),
    nullif(btrim(new.raw_user_meta_data->>'picture'), '')
  );
  v_origen := new.raw_user_meta_data->>'origen_registro';
  if v_origen = 'jugatela' then
    v_origen := 'porlacancha';
  end if;
  if v_origen is null or v_origen not in ('fulbitoya', 'porlacancha') then
    v_origen := null;
  end if;

  v_rol := case when v_origen = 'fulbitoya' then 'owner' else 'jugador' end;

  v_fn_txt := nullif(btrim(coalesce(new.raw_user_meta_data->>'fecha_nacimiento', '')), '');
  if v_fn_txt is not null then
    begin
      v_fn := v_fn_txt::date;
    exception when others then
      raise exception 'fecha_nacimiento_invalida';
    end;
    if v_fn > (timezone('America/Argentina/Buenos_Aires', now()))::date then
      raise exception 'fecha_nacimiento_invalida';
    end if;
    if (v_fn + interval '13 years') > (timezone('America/Argentina/Buenos_Aires', now()))::date then
      raise exception 'menor_13';
    end if;
  end if;

  insert into public.usuarios (
    id, email, nombre, telefono, rol, origen_registro, avatar_url
  )
  values (
    new.id,
    new.email,
    v_nombre,
    new.raw_user_meta_data->>'telefono',
    v_rol,
    v_origen,
    v_avatar
  )
  on conflict (id) do nothing;

  if v_fn is not null then
    insert into public.jugador_perfiles (usuario_id, fecha_nacimiento, updated_at)
    values (new.id, v_fn, now())
    on conflict (usuario_id) do update set
      fecha_nacimiento = coalesce(public.jugador_perfiles.fecha_nacimiento, excluded.fecha_nacimiento),
      updated_at = now();
  end if;

  return new;
end;
$$;

-- Perfil: no bajar de 13; no tocar dni acá.
create or replace function public.guardar_mi_perfil(
  p_nombre text,
  p_telefono text,
  p_avatar_url text,
  p_username text,
  p_apellido text,
  p_zona text,
  p_bio text,
  p_puesto_principal text,
  p_puesto_secundario text,
  p_pierna text,
  p_formatos text[],
  p_disponibilidad text,
  p_fecha_nacimiento date,
  p_busca_equipo boolean default false,
  p_modo_juego text default 'sin_cobrar',
  p_tarifa_partido integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_username text;
  v_modo text;
  v_tarifa integer;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_fecha_nacimiento is not null then
    if p_fecha_nacimiento > (public.ahora_argentina())::date then
      return jsonb_build_object('ok', false, 'error', 'fecha_nacimiento_invalida');
    end if;
    if not public.plc_edad_cumplida(p_fecha_nacimiento, 13) then
      return jsonb_build_object('ok', false, 'error', 'menor_13');
    end if;
  end if;

  v_modo := case
    when p_modo_juego in ('sin_cobrar', 'cobro_por_partido') then p_modo_juego
    else 'sin_cobrar'
  end;
  v_tarifa := case
    when v_modo = 'cobro_por_partido' then p_tarifa_partido
    else null
  end;

  if v_modo = 'cobro_por_partido' and (v_tarifa is null or v_tarifa < 1000 or v_tarifa > 500000) then
    return jsonb_build_object('ok', false, 'error', 'tarifa_invalida');
  end if;

  v_username := nullif(lower(btrim(coalesce(p_username, ''))), '');

  update public.usuarios
  set
    nombre = nullif(btrim(coalesce(p_nombre, '')), ''),
    telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
    avatar_url = p_avatar_url,
    username = coalesce(v_username, username)
  where id = uid;

  if not found then
    raise exception 'usuario_no_encontrado';
  end if;

  insert into public.jugador_perfiles (
    usuario_id, apellido, zona, bio, puesto_principal, puesto_secundario, pierna,
    formatos, disponibilidad, fecha_nacimiento, busca_equipo, modo_juego, tarifa_partido, updated_at
  )
  values (
    uid,
    nullif(btrim(coalesce(p_apellido, '')), ''),
    nullif(btrim(coalesce(p_zona, '')), ''),
    nullif(left(btrim(coalesce(p_bio, '')), 160), ''),
    nullif(btrim(coalesce(p_puesto_principal, '')), ''),
    nullif(btrim(coalesce(p_puesto_secundario, '')), ''),
    nullif(btrim(coalesce(p_pierna, '')), ''),
    coalesce(p_formatos, '{}'),
    nullif(btrim(coalesce(p_disponibilidad, '')), ''),
    p_fecha_nacimiento,
    coalesce(p_busca_equipo, false),
    v_modo,
    v_tarifa,
    now()
  )
  on conflict (usuario_id) do update set
    apellido = excluded.apellido,
    zona = excluded.zona,
    bio = excluded.bio,
    puesto_principal = excluded.puesto_principal,
    puesto_secundario = excluded.puesto_secundario,
    pierna = excluded.pierna,
    formatos = excluded.formatos,
    disponibilidad = excluded.disponibilidad,
    fecha_nacimiento = excluded.fecha_nacimiento,
    busca_equipo = excluded.busca_equipo,
    modo_juego = excluded.modo_juego,
    tarifa_partido = excluded.tarifa_partido,
    updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.guardar_mi_perfil(
  text, text, text, text, text, text, text, text, text, text, text[], text, date, boolean, text, integer
) from public;
grant execute on function public.guardar_mi_perfil(
  text, text, text, text, text, text, text, text, text, text, text[], text, date, boolean, text, integer
) to authenticated;

-- Reserva checkout: ≥13
create or replace function public.plc_iniciar_checkout_reserva(
  p_disponibilidad_id uuid,
  p_tipo_cobro text,
  p_acepta_reglas boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_disp public.disponibilidades%rowtype;
  v_cot jsonb;
  v_hold uuid;
  v_mins int;
  v_exp timestamptz;
  v_hold_row public.plc_checkout_hold%rowtype;
  v_edad jsonb;
begin
  perform public.plc_liberar_holds_vencidos();
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if coalesce(p_acepta_reglas, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'reglas_no_aceptadas');
  end if;
  v_edad := public.plc_check_edad_basica(v_user);
  if coalesce(v_edad->>'ok', 'false') <> 'true' then
    return v_edad;
  end if;

  v_cot := public.plc_cotizar_reserva(p_disponibilidad_id, p_tipo_cobro);
  if coalesce(v_cot->>'ok', 'false') <> 'true' then
    return v_cot;
  end if;

  select * into v_disp from public.disponibilidades where id = p_disponibilidad_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'turno_no_existe');
  end if;

  select * into v_hold_row from public.plc_checkout_hold where disponibilidad_id = p_disponibilidad_id;
  if v_disp.estado = 'disponible' then
    null;
  elsif v_disp.estado = 'reservado_pendiente' and v_hold_row.usuario_id is not distinct from v_user then
    null;
  else
    return jsonb_build_object('ok', false, 'error', 'turno_no_disponible');
  end if;

  v_mins := coalesce(public.config_num('plc_hold_reserva_minutos'), 10)::int;
  v_exp := now() + make_interval(mins => v_mins);

  delete from public.plc_checkout_hold where disponibilidad_id = p_disponibilidad_id;
  insert into public.plc_checkout_hold (
    disponibilidad_id, usuario_id, tipo_cobro, monto, condiciones, expira_at
  ) values (
    p_disponibilidad_id,
    v_user,
    v_cot->>'tipo_cobro',
    (v_cot->>'monto_pagar')::numeric,
    v_cot || jsonb_build_object('acepto_reglas', true, 'acepto_at', now()),
    v_exp
  ) returning id into v_hold;

  update public.disponibilidades
  set estado = 'reservado_pendiente'
  where id = p_disponibilidad_id;

  return jsonb_build_object(
    'ok', true,
    'hold_id', v_hold,
    'expira_at', v_exp,
    'checkout_prueba', public.config_bool('plc_checkout_prueba'),
    'cotizacion', v_cot
  );
end;
$$;

create or replace function public.plc_iniciar_checkout_enlace(
  p_token text,
  p_tipo_cobro text,
  p_acepta_reglas boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.plc_enlace_pago%rowtype;
  v_disp public.disponibilidades%rowtype;
  v_user uuid := auth.uid();
  v_cot jsonb;
  v_hold uuid;
  v_mins int;
  v_exp timestamptz;
  v_hold_row public.plc_checkout_hold%rowtype;
  v_edad jsonb;
begin
  perform public.plc_liberar_holds_vencidos();
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if coalesce(p_acepta_reglas, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'reglas_no_aceptadas');
  end if;
  v_edad := public.plc_check_edad_basica(v_user);
  if coalesce(v_edad->>'ok', 'false') <> 'true' then
    return v_edad;
  end if;

  select * into v_e from public.plc_enlace_pago where token = trim(p_token);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'enlace_invalido');
  end if;
  v_cot := public.plc_cotizar_enlace(v_e.token, p_tipo_cobro);
  if coalesce(v_cot->>'ok', 'false') <> 'true' then
    return v_cot;
  end if;

  select * into v_disp from public.disponibilidades where id = v_e.disponibilidad_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'turno_no_existe');
  end if;
  select * into v_hold_row from public.plc_checkout_hold where disponibilidad_id = v_e.disponibilidad_id;
  if v_disp.estado = 'disponible' then
    null;
  elsif v_disp.estado = 'reservado_pendiente' and v_hold_row.usuario_id is not distinct from v_user then
    null;
  else
    return jsonb_build_object(
      'ok', false,
      'error', 'horario_ya_reservado',
      'alternativas', public.plc_alternativas_turno(v_e.disponibilidad_id)
    );
  end if;

  v_mins := coalesce(public.config_num('plc_hold_reserva_minutos'), 10)::int;
  v_exp := now() + make_interval(mins => v_mins);
  delete from public.plc_checkout_hold where disponibilidad_id = v_e.disponibilidad_id;
  insert into public.plc_checkout_hold (
    disponibilidad_id, usuario_id, tipo_cobro, monto, condiciones, expira_at
  ) values (
    v_e.disponibilidad_id,
    v_user,
    v_cot->>'tipo_cobro',
    (v_cot->>'monto_pagar')::numeric,
    v_cot || jsonb_build_object(
      'acepto_reglas', true,
      'acepto_at', now(),
      'enlace_id', v_e.id,
      'titular_nombre', v_e.titular_nombre,
      'titular_telefono', v_e.titular_telefono,
      'canal', 'whatsapp'
    ),
    v_exp
  ) returning id into v_hold;

  update public.disponibilidades set estado = 'reservado_pendiente' where id = v_e.disponibilidad_id;
  return jsonb_build_object(
    'ok', true,
    'hold_id', v_hold,
    'expira_at', v_exp,
    'checkout_prueba', public.config_bool('plc_checkout_prueba'),
    'cotizacion', v_cot,
    'enlace_id', v_e.id
  );
end;
$$;

-- Crear partido: amistoso ≥13; por_la_cancha actor 18+DNI, convocados ≥18.
create or replace function public.crear_partido(
  p_disponibilidad_id uuid,
  p_equipo_id uuid,
  p_convocados uuid[],
  p_regla_empate text,
  p_modalidad text default 'por_la_cancha'
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
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.es_capitan(p_equipo_id) then
    return jsonb_build_object('ok', false, 'error', 'no_capitan');
  end if;

  v_mod := case lower(btrim(coalesce(p_modalidad, 'por_la_cancha')))
    when 'amistoso' then 'amistoso'
    else 'por_la_cancha'
  end;

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

  v_cond := public.calcular_condiciones(p_disponibilidad_id, v_mod, now());
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
  if v_mod = 'amistoso' then
    v_tarifa := coalesce((v_cond->>'tarifa_servicio_amistoso_equipo')::numeric, 0);
  else
    v_tarifa := coalesce((v_cond->>'tarifa_servicio_equipo')::numeric, 0);
  end if;
  v_total := coalesce((v_cond->>'monto_equipo_a')::numeric, v_precio + v_tarifa);
  if v_tarifa <= 0 then
    return jsonb_build_object('ok', false, 'error', 'tarifa_no_configurada');
  end if;

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
  v_titulo := case when v_mod = 'amistoso' then 'Amistoso en ' else 'Partido en ' end
    || coalesce(v_cancha.nombre, 'la cancha');
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
    v_cond, coalesce((v_cond->>'version')::int, 1), now(), v_user
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
    'monto_total', v_total,
    'expira_at', (now() + interval '15 minutes'),
    'condiciones', v_cond
  );
end;
$$;

create or replace function public.inscribir_jugador_amistoso(p_desafio_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_d public.desafios%rowtype;
  v_req jsonb;
  v_insc uuid;
  v_prev public.desafio_inscripciones%rowtype;
  v_monto numeric;
  v_cancha numeric;
  v_serv numeric;
  v_n int;
  v_cierre timestamp;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;

  select * into v_d from public.desafios where id = p_desafio_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'desafio_no_existe');
  end if;
  if v_d.modalidad is distinct from 'amistoso' then
    return jsonb_build_object('ok', false, 'error', 'no_es_amistoso');
  end if;
  if v_d.estado is distinct from 'abierto' then
    return jsonb_build_object('ok', false, 'error', 'desafio_cerrado');
  end if;

  v_cierre := public.plc_limite_inscripcion(v_d);
  if public.ahora_argentina() >= v_cierre then
    return jsonb_build_object('ok', false, 'error', 'inscripcion_cerrada');
  end if;

  if exists (
    select 1 from public.desafio_inscripciones
    where desafio_id = v_d.id and tipo_inscripcion = 'equipo' and lado = 'rival'
      and estado in ('pendiente_pago', 'confirmada')
  ) then
    return jsonb_build_object('ok', false, 'error', 'hay_equipo_rival');
  end if;

  if exists (
    select 1 from public.desafio_convocados c
    join public.desafio_inscripciones i on i.id = c.inscripcion_id
    where c.desafio_id = v_d.id and c.usuario_id = v_user
      and i.estado in ('pendiente_pago', 'confirmada')
  ) then
    return jsonb_build_object('ok', false, 'error', 'ya_inscripto');
  end if;

  v_n := public.plc_cupo_sueltos(v_d.condiciones);
  if public.plc_sueltos_activos(v_d.id) >= v_n then
    return jsonb_build_object('ok', false, 'error', 'cupo_lleno');
  end if;

  v_req := public.plc_check_edad_basica(v_user);
  if coalesce(v_req->>'ok', 'false') <> 'true' then
    return v_req;
  end if;

  v_monto := public.plc_monto_snap(v_d.condiciones, 'monto_rival_jugador', 0);
  v_serv := public.plc_monto_snap(v_d.condiciones, 'tarifa_servicio_jugador', 0);
  v_cancha := greatest(v_monto - v_serv, 0);
  if v_monto <= 0 then
    return jsonb_build_object('ok', false, 'error', 'tarifa_no_configurada');
  end if;

  select * into v_prev
  from public.desafio_inscripciones
  where desafio_id = v_d.id and tipo_inscripcion = 'jugador' and capitan_id = v_user
  for update;

  if found and v_prev.estado in ('pendiente_pago', 'confirmada') then
    return jsonb_build_object('ok', false, 'error', 'ya_inscripto');
  end if;

  if v_prev.id is not null then
    update public.desafio_inscripciones
    set estado = 'pendiente_pago',
        expira_at = now() + interval '15 minutes',
        cancelada_at = null,
        monto_cancha = v_cancha,
        monto_servicio = v_serv,
        monto_total = v_monto,
        lado = 'rival',
        updated_at = now()
    where id = v_prev.id
    returning id into v_insc;
    delete from public.desafio_convocados where inscripcion_id = v_insc;
  else
    insert into public.desafio_inscripciones (
      desafio_id, equipo_id, capitan_id, estado, expira_at,
      monto_cancha, monto_servicio, monto_total, lado, tipo_inscripcion
    ) values (
      v_d.id, null, v_user, 'pendiente_pago', now() + interval '15 minutes',
      v_cancha, v_serv, v_monto, 'rival', 'jugador'
    )
    returning id into v_insc;
  end if;

  insert into public.desafio_convocados (inscripcion_id, desafio_id, usuario_id)
  values (v_insc, v_d.id, v_user);

  perform public.emitir_notificacion(
    v_d.owner_id, 'inscripcion_desafio', 'Se sumó un jugador',
    'Alguien se anotó suelto a ' || v_d.titulo || '.',
    jsonb_build_object('desafio_id', v_d.id, 'inscripcion_id', v_insc, 'destino', 'desafio')
  );

  return jsonb_build_object(
    'ok', true,
    'inscripcion_id', v_insc,
    'estado', 'pendiente_pago',
    'monto_cancha', v_cancha,
    'monto_servicio', v_serv,
    'monto_total', v_monto,
    'cupo', v_n,
    'ocupados', public.plc_sueltos_activos(v_d.id),
    'expira_at', now() + interval '15 minutes'
  );
end;
$$;

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
    v_min_edad := null;
  end if;

  if v_min_edad is not null then
    v_val := public.validar_convocados_edad(p_equipo_id, p_convocados, v_d.tipo::text, v_min_edad);
    if coalesce(v_val->>'ok', 'false') <> 'true' then
      return v_val;
    end if;
  else
    v_val := public.validar_convocados_edad(p_equipo_id, p_convocados, v_d.tipo::text, 18);
    if v_val->>'error' in ('convocados_requeridos', 'minimo_convocados', 'convocado_no_miembro') then
      return v_val;
    end if;
    if coalesce(v_val->>'ok', 'false') <> 'true' and v_val->>'error' not in ('falta_nacimiento', 'menor_18', 'menor_13') then
      return v_val;
    end if;
    if v_val->>'error' in ('falta_nacimiento', 'menor_18', 'menor_13') then
      select array_agg(distinct x) into v_conv
      from unnest(coalesce(p_convocados, '{}'::uuid[])) as x
      where x is not null;
    end if;
  end if;

  if v_conv is null then
    select array_agg(x::uuid) into v_conv
    from jsonb_array_elements_text(v_val->'convocados') as x;
  end if;
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

-- Pago de prueba: revalidar identidad en por_la_cancha.
create or replace function public.confirmar_pago_prueba(p_inscripcion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_i public.desafio_inscripciones%rowtype;
  v_d public.desafios%rowtype;
  v_req jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.config_bool('plc_checkout_prueba') then
    return jsonb_build_object('ok', false, 'error', 'checkout_prueba_off');
  end if;

  select * into v_i from public.desafio_inscripciones where id = p_inscripcion_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if v_i.capitan_id is distinct from v_user
     and (v_i.equipo_id is null or not public.es_capitan(v_i.equipo_id)) then
    return jsonb_build_object('ok', false, 'error', 'no_capitan');
  end if;

  select * into v_d from public.desafios where id = v_i.desafio_id;
  if v_d.modalidad = 'por_la_cancha' then
    v_req := public.plc_check_desafio_cancha(v_user);
    if coalesce(v_req->>'ok', 'false') <> 'true' then
      return v_req;
    end if;
  elsif v_d.modalidad = 'amistoso' then
    v_req := public.plc_check_edad_basica(v_user);
    if coalesce(v_req->>'ok', 'false') <> 'true' then
      return v_req;
    end if;
  end if;

  return public.confirmar_pago_inscripcion(p_inscripcion_id, 'prueba-' || p_inscripcion_id::text);
end;
$$;

-- Editar convocados: edad según modalidad.
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
  v_inicio timestamp;
  v_cierre timestamp;
  v_now timestamp;
  v_min int;
  v_conv uuid[];
  v_uid uuid;
  v_val jsonb;
  v_eq_nombre text;
  v_antes uuid[];
  v_min_edad int;
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

  select array_agg(distinct x) into v_conv
  from unnest(coalesce(p_convocados, '{}'::uuid[])) as x
  where x is not null;

  if v_conv is null or cardinality(v_conv) = 0 then
    return jsonb_build_object('ok', false, 'error', 'convocados_requeridos');
  end if;

  v_min := public.minimo_convocados(v_d.tipo::text);
  if cardinality(v_conv) < v_min then
    return jsonb_build_object('ok', false, 'error', 'minimo_convocados', 'minimo', v_min);
  end if;

  foreach v_uid in array v_conv loop
    if not exists (
      select 1 from public.equipo_miembros
      where equipo_id = v_i.equipo_id and usuario_id = v_uid and estado = 'activo'
    ) then
      return jsonb_build_object('ok', false, 'error', 'convocado_no_miembro');
    end if;
  end loop;

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

  v_min_edad := case
    when v_d.modalidad = 'por_la_cancha' or v_d.premio > 0 then 18
    when v_d.modalidad = 'amistoso' then 13
    else null
  end;

  if v_min_edad is not null then
    v_val := public.validar_convocados_edad(v_i.equipo_id, v_conv, v_d.tipo::text, v_min_edad);
    if coalesce(v_val->>'ok', 'false') <> 'true' then
      return v_val;
    end if;
    select array_agg(x::uuid) into v_conv
    from jsonb_array_elements_text(v_val->'convocados') as x;
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

-- Asegurar que las vistas públicas nunca expongan dni ni fecha_nacimiento.
drop view if exists public.jugador_busqueda_contratacion;
drop view if exists public.jugador_busqueda_publica;

create view public.jugador_busqueda_publica as
select
  u.id,
  u.nombre,
  u.username,
  u.avatar_url,
  jp.zona,
  jp.puesto_principal,
  jp.puesto_secundario,
  jp.pierna,
  jp.formatos,
  jp.modo_juego,
  jp.tarifa_partido
from public.usuarios u
join public.jugador_perfiles jp on jp.usuario_id = u.id
where jp.busca_equipo = true
  and (auth.uid() is null or u.id <> auth.uid());

alter view public.jugador_busqueda_publica set (security_invoker = false);
grant select on public.jugador_busqueda_publica to anon, authenticated;

create view public.jugador_busqueda_contratacion as
select
  u.id,
  u.nombre,
  u.username,
  u.avatar_url,
  jp.zona,
  jp.puesto_principal,
  jp.puesto_secundario,
  jp.pierna,
  jp.formatos,
  jp.modo_juego,
  jp.tarifa_partido
from public.usuarios u
join public.jugador_perfiles jp on jp.usuario_id = u.id
where jp.busca_equipo = true
  and (auth.uid() is null or u.id <> auth.uid());

alter view public.jugador_busqueda_contratacion set (security_invoker = false);
grant select on public.jugador_busqueda_contratacion to authenticated;

comment on column public.jugador_perfiles.dni is
  'DNI privado del jugador. No incluir en vistas ni búsquedas públicas.';

-- Webhook / confirmación de pago: servidor valida identidad del pagador en por_la_cancha.
create or replace function public.confirmar_pago_inscripcion(
  p_inscripcion_id uuid,
  p_payment_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i public.desafio_inscripciones%rowtype;
  v_d public.desafios%rowtype;
  v_pagadas int;
  v_owner uuid;
  v_tarde boolean := false;
  v_cierre timestamp;
  v_completo boolean := false;
  v_req jsonb;
begin
  select * into v_i from public.desafio_inscripciones where id = p_inscripcion_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if v_i.estado = 'confirmada' then
    return jsonb_build_object('ok', true, 'idempotente', true, 'desafio_id', v_i.desafio_id);
  end if;

  select * into v_d from public.desafios where id = v_i.desafio_id for update;

  if v_d.modalidad = 'por_la_cancha' then
    v_req := public.plc_check_desafio_cancha(v_i.capitan_id);
    if coalesce(v_req->>'ok', 'false') <> 'true' then
      return v_req;
    end if;
  end if;

  if exists (
    select 1 from public.movimientos
    where inscripcion_id = v_i.id and tipo in ('reembolso_total', 'reembolso_parcial')
  ) then
    return jsonb_build_object('ok', false, 'error', 'pago_fuera_de_tiempo', 'reembolso_total', true, 'idempotente', true);
  end if;

  v_cierre := public.plc_limite_inscripcion(v_d);
  select count(*) into v_pagadas
  from public.desafio_inscripciones
  where desafio_id = v_d.id and estado = 'confirmada' and tipo_inscripcion = 'equipo';

  v_tarde :=
    v_i.estado is distinct from 'pendiente_pago'
    or v_d.estado not in ('pendiente_pago', 'abierto')
    or (v_i.expira_at is not null and v_i.expira_at < now())
    or (v_i.tipo_inscripcion = 'equipo' and v_pagadas >= 2)
    or (v_d.estado = 'abierto' and public.ahora_argentina() >= v_cierre);

  if v_tarde then
    if v_i.estado = 'pendiente_pago' then
      update public.desafio_inscripciones set estado = 'expirada', updated_at = now() where id = v_i.id;
    end if;
    if v_d.estado = 'pendiente_pago' then
      update public.desafios set estado = 'cancelado' where id = v_d.id;
      perform public.liberar_turno_partido(v_d.disponibilidad_id);
    end if;
    perform public.registrar_movimiento(
      v_d.id, v_i.id, v_i.capitan_id, v_d.cancha_id,
      'reembolso_total', coalesce(v_i.monto_total, 0),
      'Pago fuera de tiempo o cupo no disponible'
    );
    return jsonb_build_object('ok', false, 'error', 'pago_fuera_de_tiempo', 'reembolso_total', true);
  end if;

  update public.desafio_inscripciones
  set estado = 'confirmada',
      confirmada_at = now(),
      mp_payment_id = coalesce(p_payment_id, mp_payment_id),
      updated_at = now()
  where id = v_i.id;

  perform public.emitir_notificacion(
    v_i.capitan_id, 'pago_confirmado', 'Pago confirmado',
    'El pago de ' || v_d.titulo || ' está confirmado.',
    jsonb_build_object('desafio_id', v_d.id, 'inscripcion_id', v_i.id, 'destino', 'desafio')
  );

  if v_d.estado = 'pendiente_pago' then
    update public.desafios set estado = 'abierto' where id = v_d.id;
    update public.disponibilidades
    set estado = 'reservado'
    where id = v_d.disponibilidad_id and estado = 'reservado_pendiente';
  end if;

  if v_d.modalidad = 'amistoso' then
    v_completo := public.plc_rival_completo(v_d.id);
  else
    select count(*) into v_pagadas
    from public.desafio_inscripciones
    where desafio_id = v_d.id and estado = 'confirmada' and tipo_inscripcion = 'equipo';
    v_completo := v_pagadas >= 2;
  end if;

  if v_completo then
    update public.desafios set estado = 'completo' where id = v_d.id and estado = 'abierto';
    if v_d.modalidad = 'amistoso' then
      perform public.plc_reembolsar_mitad_organizador(v_d.id);
    end if;
    v_owner := (public.plc_inscripcion_a(v_d.id)).capitan_id;
    if v_owner is not null and v_owner is distinct from v_i.capitan_id then
      perform public.emitir_notificacion(
        v_owner, 'rival_sumado', 'Se completó el partido',
        'Ya está el otro lado en ' || v_d.titulo || '.',
        jsonb_build_object('desafio_id', v_d.id, 'destino', 'desafio')
      );
    end if;
  end if;

  return jsonb_build_object('ok', true, 'desafio_id', v_d.id, 'completo', v_completo);
end;
$$;

revoke all on function public.plc_check_edad_basica(uuid) from public;
revoke all on function public.plc_check_desafio_cancha(uuid) from public;
revoke all on function public.validar_convocados_edad(uuid, uuid[], text, int) from public;
grant execute on function public.plc_check_edad_basica(uuid) to authenticated;
grant execute on function public.plc_check_desafio_cancha(uuid) to authenticated;
grant execute on function public.validar_convocados_edad(uuid, uuid[], text, int) to authenticated;
