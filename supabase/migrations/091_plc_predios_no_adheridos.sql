-- Fase 1: predios no adheridos (Google Places) + partidos libres amistoso/competitivo.
-- Reutiliza desafios / inscripciones / edad. Sin reserva ni pago de cancha en la app.

-- ---------------------------------------------------------------------------
-- Predio no adherido
-- ---------------------------------------------------------------------------
alter table public.canchas
  add column if not exists adherido boolean not null default true,
  add column if not exists google_telefono text,
  add column if not exists verificacion_estado text;

alter table public.canchas drop constraint if exists canchas_verificacion_estado_chk;
alter table public.canchas
  add constraint canchas_verificacion_estado_chk
  check (
    verificacion_estado is null
    or verificacion_estado in ('sin_validar', 'validado_usuario', 'verificado', 'en_revision')
  );

update public.canchas
set adherido = true
where adherido is distinct from true;

create unique index if not exists uq_canchas_place_id_no_adherido
  on public.canchas (place_id)
  where place_id is not null and adherido = false;

comment on column public.canchas.adherido is
  'false = predio de Places sin dueño FulbitoYa. true = predio del panel.';

-- ---------------------------------------------------------------------------
-- Aportes de jugadores (superficie / techada / iluminación)
-- ---------------------------------------------------------------------------
create table if not exists public.cancha_aportes (
  id uuid primary key default gen_random_uuid(),
  cancha_id uuid not null references public.canchas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  superficie text,
  techada boolean,
  iluminacion boolean,
  created_at timestamptz not null default now(),
  constraint cancha_aportes_superficie_chk check (
    superficie is null
    or superficie in ('cesped_natural', 'cesped_sintetico', 'tierra', 'cemento')
  )
);

create unique index if not exists uq_cancha_aportes_usuario
  on public.cancha_aportes (cancha_id, usuario_id);

create index if not exists idx_cancha_aportes_cancha
  on public.cancha_aportes (cancha_id);

alter table public.cancha_aportes enable row level security;

drop policy if exists "Leer aportes cancha" on public.cancha_aportes;
create policy "Leer aportes cancha"
  on public.cancha_aportes for select
  to authenticated, anon
  using (true);

revoke insert, update, delete on table public.cancha_aportes from public, anon, authenticated;
grant select on table public.cancha_aportes to authenticated, anon;

alter table public.canchas
  add column if not exists aporte_superficie text,
  add column if not exists aporte_techada boolean,
  add column if not exists aporte_iluminacion boolean,
  add column if not exists aporte_superficie_confirmada boolean not null default false,
  add column if not exists aporte_techada_confirmada boolean not null default false,
  add column if not exists aporte_iluminacion_confirmada boolean not null default false;

alter table public.canchas drop constraint if exists canchas_aporte_superficie_chk;
alter table public.canchas
  add constraint canchas_aporte_superficie_chk check (
    aporte_superficie is null
    or aporte_superficie in ('cesped_natural', 'cesped_sintetico', 'tierra', 'cemento')
  );

-- Lectura pública de predios no adheridos (Places)
drop policy if exists "Ver canchas aprobadas o propias" on public.canchas;
create policy "Ver canchas aprobadas o propias"
  on public.canchas for select
  using (
    estado = 'aprobado'
    or adherido is not true
    or owner_id = auth.uid()
    or public.fy_es_admin()
  );

-- ---------------------------------------------------------------------------
-- Upsert predio Places (sin duplicar por place_id)
-- ---------------------------------------------------------------------------
create or replace function public.plc_upsert_predio_places(
  p_place_id text,
  p_nombre text,
  p_direccion text,
  p_lat double precision,
  p_lng double precision,
  p_barrio text default null,
  p_telefono text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_row public.canchas%rowtype;
  v_place text := nullif(btrim(coalesce(p_place_id, '')), '');
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if v_place is null then
    return jsonb_build_object('ok', false, 'error', 'place_id_requerido');
  end if;
  if v_nombre is null then
    return jsonb_build_object('ok', false, 'error', 'nombre_requerido');
  end if;
  if p_lat is null or p_lng is null then
    return jsonb_build_object('ok', false, 'error', 'coords_requeridas');
  end if;

  -- Preferir adherido si ya existe el place_id
  select * into v_row
  from public.canchas
  where place_id = v_place
  order by case when adherido then 0 else 1 end, created_at
  limit 1;

  if found then
    if v_row.adherido is not true then
      update public.canchas
      set
        nombre = coalesce(nullif(btrim(nombre), ''), v_nombre),
        direccion = coalesce(nullif(btrim(direccion), ''), nullif(btrim(coalesce(p_direccion, '')), '')),
        barrio = coalesce(barrio, nullif(btrim(coalesce(p_barrio, '')), '')),
        lat = coalesce(lat, p_lat::real),
        lng = coalesce(lng, p_lng::real),
        google_telefono = coalesce(google_telefono, nullif(btrim(coalesce(p_telefono, '')), ''))
      where id = v_row.id
      returning * into v_row;
    end if;
    return jsonb_build_object(
      'ok', true,
      'cancha_id', v_row.id,
      'adherido', v_row.adherido,
      'nombre', v_row.nombre,
      'direccion', v_row.direccion,
      'barrio', v_row.barrio,
      'place_id', v_row.place_id,
      'lat', v_row.lat,
      'lng', v_row.lng,
      'google_telefono', v_row.google_telefono,
      'aporte_superficie', v_row.aporte_superficie,
      'aporte_techada', v_row.aporte_techada,
      'aporte_iluminacion', v_row.aporte_iluminacion,
      'aporte_superficie_confirmada', v_row.aporte_superficie_confirmada,
      'aporte_techada_confirmada', v_row.aporte_techada_confirmada,
      'aporte_iluminacion_confirmada', v_row.aporte_iluminacion_confirmada
    );
  end if;

  insert into public.canchas (
    owner_id, nombre, direccion, barrio, lat, lng, place_id,
    adherido, activa, estado, google_telefono, verificacion_estado
  ) values (
    null, v_nombre,
    nullif(btrim(coalesce(p_direccion, '')), ''),
    nullif(btrim(coalesce(p_barrio, '')), ''),
    p_lat::real, p_lng::real, v_place,
    false, true, 'borrador',
    nullif(btrim(coalesce(p_telefono, '')), ''),
    'sin_validar'
  )
  returning id into v_id;

  select * into v_row from public.canchas where id = v_id;

  return jsonb_build_object(
    'ok', true,
    'cancha_id', v_row.id,
    'adherido', false,
    'nombre', v_row.nombre,
    'direccion', v_row.direccion,
    'barrio', v_row.barrio,
    'place_id', v_row.place_id,
    'lat', v_row.lat,
    'lng', v_row.lng,
    'google_telefono', v_row.google_telefono,
    'aporte_superficie', null,
    'aporte_techada', null,
    'aporte_iluminacion', null,
    'aporte_superficie_confirmada', false,
    'aporte_techada_confirmada', false,
    'aporte_iluminacion_confirmada', false
  );
end;
$$;

revoke all on function public.plc_upsert_predio_places(text, text, text, double precision, double precision, text, text) from public;
grant execute on function public.plc_upsert_predio_places(text, text, text, double precision, double precision, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Registrar aporte y confirmar con 3 coincidentes
-- ---------------------------------------------------------------------------
create or replace function public.plc_registrar_aporte_cancha(
  p_cancha_id uuid,
  p_superficie text default null,
  p_techada boolean default null,
  p_iluminacion boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ca public.canchas%rowtype;
  v_sup text;
  v_tech boolean;
  v_luz boolean;
  v_n int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;

  select * into v_ca from public.canchas where id = p_cancha_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cancha_no_existe');
  end if;

  v_sup := nullif(btrim(coalesce(p_superficie, '')), '');
  if v_sup is not null and v_sup not in ('cesped_natural', 'cesped_sintetico', 'tierra', 'cemento') then
    return jsonb_build_object('ok', false, 'error', 'superficie_invalida');
  end if;
  v_tech := p_techada;
  v_luz := p_iluminacion;

  insert into public.cancha_aportes (cancha_id, usuario_id, superficie, techada, iluminacion)
  values (p_cancha_id, v_user, v_sup, v_tech, v_luz)
  on conflict (cancha_id, usuario_id) do update
  set
    superficie = coalesce(excluded.superficie, cancha_aportes.superficie),
    techada = coalesce(excluded.techada, cancha_aportes.techada),
    iluminacion = coalesce(excluded.iluminacion, cancha_aportes.iluminacion),
    created_at = now();

  if v_sup is not null and not coalesce(v_ca.aporte_superficie_confirmada, false) then
    select count(*)::int into v_n
    from public.cancha_aportes
    where cancha_id = p_cancha_id and superficie = v_sup;
    update public.canchas
    set
      aporte_superficie = v_sup,
      aporte_superficie_confirmada = (v_n >= 3)
    where id = p_cancha_id;
  end if;

  if v_tech is not null and not coalesce(v_ca.aporte_techada_confirmada, false) then
    select count(*)::int into v_n
    from public.cancha_aportes
    where cancha_id = p_cancha_id and techada is not distinct from v_tech;
    update public.canchas
    set
      aporte_techada = v_tech,
      aporte_techada_confirmada = (v_n >= 3)
    where id = p_cancha_id;
  end if;

  if v_luz is not null and not coalesce(v_ca.aporte_iluminacion_confirmada, false) then
    select count(*)::int into v_n
    from public.cancha_aportes
    where cancha_id = p_cancha_id and iluminacion is not distinct from v_luz;
    update public.canchas
    set
      aporte_iluminacion = v_luz,
      aporte_iluminacion_confirmada = (v_n >= 3)
    where id = p_cancha_id;
  end if;

  select * into v_ca from public.canchas where id = p_cancha_id;
  return jsonb_build_object(
    'ok', true,
    'cancha_id', v_ca.id,
    'aporte_superficie', v_ca.aporte_superficie,
    'aporte_techada', v_ca.aporte_techada,
    'aporte_iluminacion', v_ca.aporte_iluminacion,
    'aporte_superficie_confirmada', v_ca.aporte_superficie_confirmada,
    'aporte_techada_confirmada', v_ca.aporte_techada_confirmada,
    'aporte_iluminacion_confirmada', v_ca.aporte_iluminacion_confirmada
  );
end;
$$;

revoke all on function public.plc_registrar_aporte_cancha(uuid, text, boolean, boolean) from public;
grant execute on function public.plc_registrar_aporte_cancha(uuid, text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Crear partido libre (amistoso/competitivo) en predio no adherido o Places
-- ---------------------------------------------------------------------------
create or replace function public.crear_partido_libre(
  p_cancha_id uuid,
  p_fecha date,
  p_hora_inicio time,
  p_formato text,
  p_precio_cancha numeric,
  p_modalidad text,
  p_equipo_id uuid default null,
  p_convocados uuid[] default null,
  p_regla_empate text default 'penales',
  p_superficie text default null,
  p_techada boolean default null,
  p_iluminacion boolean default null,
  p_duracion_min int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ca public.canchas%rowtype;
  v_mod text;
  v_tipo public.match_tipo;
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
  v_sup text;
  v_uid uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;

  v_mod := public.plc_modalidad_norm(p_modalidad);
  if v_mod not in ('amistoso', 'competitivo') then
    return jsonb_build_object('ok', false, 'error', 'modalidad_libre_invalida');
  end if;

  if p_regla_empate not in ('penales', 'mitad_cada_uno') then
    return jsonb_build_object('ok', false, 'error', 'regla_empate_invalida');
  end if;

  select * into v_ca from public.canchas where id = p_cancha_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cancha_no_existe');
  end if;

  v_tipo := public.tipo_desde_campo(lower(btrim(coalesce(p_formato, 'f5'))));
  v_precio := greatest(coalesce(p_precio_cancha, 0), 0);

  v_req := public.plc_check_edad_basica(v_user);
  if coalesce(v_req->>'ok', 'false') <> 'true' then
    return v_req;
  end if;

  if p_fecha is null or p_hora_inicio is null then
    return jsonb_build_object('ok', false, 'error', 'fecha_hora_requerida');
  end if;

  v_inicio := public.inicio_turno(p_fecha, p_hora_inicio);
  if v_inicio <= public.ahora_argentina() then
    return jsonb_build_object('ok', false, 'error', 'turno_pasado');
  end if;

  if p_equipo_id is not null then
    if not public.es_capitan(p_equipo_id) then
      return jsonb_build_object('ok', false, 'error', 'no_capitan');
    end if;
    -- Partido libre: alcanza con el capitán; el plantel se completa después.
    select array_agg(distinct x) into v_conv
    from unnest(coalesce(p_convocados, array[v_user])) as x
    where x is not null;
    if v_conv is null or cardinality(v_conv) = 0 then
      v_conv := array[v_user];
    end if;
    foreach v_uid in array v_conv loop
      if not exists (
        select 1 from public.equipo_miembros
        where equipo_id = p_equipo_id and usuario_id = v_uid and estado = 'activo'
      ) then
        return jsonb_build_object('ok', false, 'error', 'convocado_no_miembro');
      end if;
      v_val := public.plc_check_edad_basica(v_uid);
      if coalesce(v_val->>'ok', 'false') <> 'true' then
        return v_val;
      end if;
    end loop;
    select nombre into v_eq_nombre from public.equipos where id = p_equipo_id;
  else
    v_conv := array[v_user];
    v_eq_nombre := null;
  end if;

  if v_user <> all (v_conv) then
    v_conv := array_append(v_conv, v_user);
  end if;

  v_sup := nullif(btrim(coalesce(p_superficie, '')), '');
  if v_sup is not null or p_techada is not null or p_iluminacion is not null then
    perform public.plc_registrar_aporte_cancha(p_cancha_id, v_sup, p_techada, p_iluminacion);
    select * into v_ca from public.canchas where id = p_cancha_id;
  end if;

  v_titulo := case
    when v_mod = 'competitivo' then 'Competitivo en '
    else 'Amistoso en '
  end || coalesce(v_ca.nombre, 'la cancha');

  v_cierre := (v_inicio - interval '2 hours') at time zone 'America/Argentina/Buenos_Aires';

  insert into public.desafios (
    owner_id, cancha_id, titulo, tipo, premio, direccion, barrio, place_id, lat, lng,
    fecha, hora_inicio, duracion_min, descripcion, estado,
    cierre_inscripcion, modalidad, disponibilidad_id, precio_cancha, tarifa_servicio, regla_empate,
    condiciones, condiciones_version, condiciones_congeladas_at, condiciones_aceptadas_por
  ) values (
    v_user, v_ca.id, v_titulo, v_tipo, 0,
    coalesce(v_ca.direccion, 'A confirmar'), v_ca.barrio, v_ca.place_id,
    coalesce(v_ca.lat, 0), coalesce(v_ca.lng, 0),
    p_fecha, p_hora_inicio, greatest(coalesce(p_duracion_min, 60), 30), null, 'abierto',
    v_cierre, v_mod, null, v_precio, 0, p_regla_empate,
    jsonb_build_object(
      'origen', 'partido_libre',
      'cancha_no_adherida', (v_ca.adherido is not true),
      'etiqueta', case when v_ca.adherido is not true then 'Cancha no adherida' else null end,
      'paga_en_el_lugar', true,
      'precio_referencia_cancha', v_precio,
      'aporte_superficie', v_ca.aporte_superficie,
      'aporte_techada', v_ca.aporte_techada,
      'aporte_iluminacion', v_ca.aporte_iluminacion
    ),
    1, now(), v_user
  )
  returning id into v_desafio;

  insert into public.desafio_inscripciones (
    desafio_id, equipo_id, capitan_id, estado, expira_at,
    monto_cancha, monto_servicio, monto_total,
    condiciones, condiciones_version, condiciones_aceptadas_at, condiciones_aceptadas_por,
    lado, tipo_inscripcion, confirmada_at
  ) values (
    v_desafio, p_equipo_id, v_user, 'confirmada', null,
    0, 0, 0,
    jsonb_build_object('origen', 'partido_libre'), 1, now(), v_user,
    'a', case when p_equipo_id is null then 'jugador' else 'equipo' end, now()
  )
  returning id into v_insc;

  insert into public.desafio_convocados (inscripcion_id, desafio_id, usuario_id)
  select v_insc, v_desafio, u from unnest(v_conv) as u;

  if p_equipo_id is not null then
    foreach v_uid in array v_conv loop
      if v_uid is distinct from v_user then
        perform public.emitir_notificacion(
          v_uid, 'convocado_partido', 'Te convocaron a un partido',
          'El capitán te convocó con ' || coalesce(v_eq_nombre, 'tu equipo') || ' a ' || v_titulo || '.',
          jsonb_build_object('desafio_id', v_desafio, 'equipo_id', p_equipo_id, 'destino', 'desafio')
        );
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'desafio_id', v_desafio,
    'inscripcion_id', v_insc,
    'modalidad', v_mod,
    'monto_total', 0,
    'cancha_no_adherida', (v_ca.adherido is not true),
    'etiqueta', case when v_ca.adherido is not true then 'Cancha no adherida' else null end
  );
end;
$$;

revoke all on function public.crear_partido_libre(uuid, date, time, text, numeric, text, uuid, uuid[], text, text, boolean, boolean, int) from public;
grant execute on function public.crear_partido_libre(uuid, date, time, text, numeric, text, uuid, uuid[], text, text, boolean, boolean, int) to authenticated;

-- Listar predios adheridos + no adheridos cercanos (búsqueda simple por nombre)
create or replace function public.plc_buscar_predios(
  p_q text default null,
  p_solo_adheridos boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  return jsonb_build_object(
    'ok', true,
    'predios', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.adherido desc, t.nombre)
      from (
        select
          c.id,
          c.nombre,
          c.direccion,
          c.barrio,
          c.place_id,
          c.lat,
          c.lng,
          c.adherido,
          c.slug,
          c.aporte_superficie,
          c.aporte_techada,
          c.aporte_iluminacion,
          case when c.adherido then null else 'Cancha no adherida' end as etiqueta
        from public.canchas c
        where c.activa is not false
          and (
            (c.adherido and c.estado = 'aprobado')
            or (c.adherido is not true)
          )
          and (not p_solo_adheridos or c.adherido)
          and (
            v_q is null
            or c.nombre ilike '%' || v_q || '%'
            or coalesce(c.direccion, '') ilike '%' || v_q || '%'
            or coalesce(c.barrio, '') ilike '%' || v_q || '%'
          )
        order by c.adherido desc, c.nombre
        limit 40
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.plc_buscar_predios(text, boolean) from public;
grant execute on function public.plc_buscar_predios(text, boolean) to authenticated, anon;
