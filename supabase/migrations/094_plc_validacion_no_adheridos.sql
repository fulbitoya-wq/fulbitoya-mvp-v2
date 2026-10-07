-- Fase 4: validación de predio no adherido (flag por_la_cancha_no_adheridos, off por defecto).

insert into public.config_plataforma (clave, valor_bool)
values ('por_la_cancha_no_adheridos', false)
on conflict (clave) do nothing;

alter table public.canchas
  add column if not exists alias_cbu text,
  add column if not exists alias_titular text,
  add column if not exists alias_validado_at timestamptz,
  add column if not exists telefono_validacion text;

create table if not exists public.plc_validaciones_predio (
  id uuid primary key default gen_random_uuid(),
  desafio_id uuid not null references public.desafios(id) on delete cascade,
  cancha_id uuid not null references public.canchas(id) on delete cascade,
  token text not null unique,
  alias_cbu text not null,
  telefono_predio text not null,
  monto_pendiente numeric(12,2) not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmada', 'rechazada', 'vencida', 'en_revision')),
  verificacion text
    check (verificacion is null or verificacion in ('verificado', 'validado_usuario')),
  cargado_por uuid references public.usuarios(id) on delete set null,
  respondido_at timestamptz,
  created_at timestamptz not null default now(),
  vence_at timestamptz
);

create index if not exists idx_plc_validaciones_desafio on public.plc_validaciones_predio (desafio_id);
create index if not exists idx_plc_validaciones_estado on public.plc_validaciones_predio (estado);

alter table public.plc_validaciones_predio enable row level security;

drop policy if exists "Admin lee validaciones" on public.plc_validaciones_predio;
create policy "Admin lee validaciones"
  on public.plc_validaciones_predio for select to authenticated
  using (public.fy_es_admin() or public.es_admin_plataforma() or cargado_por = auth.uid());

revoke insert, update, delete on table public.plc_validaciones_predio from public, anon, authenticated;
grant select on table public.plc_validaciones_predio to authenticated;

create table if not exists public.plc_alias_revision (
  id uuid primary key default gen_random_uuid(),
  cancha_id uuid not null references public.canchas(id) on delete cascade,
  alias_anterior text,
  alias_nuevo text not null,
  reportado_por uuid references public.usuarios(id) on delete set null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobado', 'rechazado')),
  created_at timestamptz not null default now()
);

alter table public.plc_alias_revision enable row level security;
drop policy if exists "Admin lee alias revision" on public.plc_alias_revision;
create policy "Admin lee alias revision"
  on public.plc_alias_revision for select to authenticated
  using (public.fy_es_admin() or public.es_admin_plataforma());
revoke insert, update, delete on table public.plc_alias_revision from public, anon, authenticated;
grant select on table public.plc_alias_revision to authenticated;

create table if not exists public.plc_alias_primer_pago (
  alias_normalizado text primary key,
  aprobado boolean not null default false,
  aprobado_por uuid references public.usuarios(id) on delete set null,
  aprobado_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.plc_alias_primer_pago enable row level security;
drop policy if exists "Admin lee primer pago alias" on public.plc_alias_primer_pago;
create policy "Admin lee primer pago alias"
  on public.plc_alias_primer_pago for select to authenticated
  using (public.fy_es_admin() or public.es_admin_plataforma());
revoke insert, update, delete on table public.plc_alias_primer_pago from public, anon, authenticated;
grant select on table public.plc_alias_primer_pago to authenticated;

create or replace function public.plc_norm_telefono(p text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '');
$$;

create or replace function public.plc_norm_alias(p text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(coalesce(p, ''))), '');
$$;

-- Capitán carga alias/teléfono/monto. El token NO se le muestra: solo admin.
create or replace function public.plc_cargar_validacion_predio(
  p_desafio_id uuid,
  p_alias_cbu text,
  p_telefono_predio text,
  p_monto numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_d public.desafios%rowtype;
  v_ca public.canchas%rowtype;
  v_alias text := public.plc_norm_alias(p_alias_cbu);
  v_tel text := public.plc_norm_telefono(p_telefono_predio);
  v_tel_g text;
  v_token text;
  v_verif text;
  v_id uuid;
  v_jug_tel text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.config_bool('por_la_cancha_no_adheridos') then
    return jsonb_build_object('ok', false, 'error', 'flag_apagado');
  end if;

  select * into v_d from public.desafios where id = p_desafio_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'desafio_no_existe');
  end if;
  if v_d.owner_id is distinct from v_user and not public.es_admin_plataforma() then
    return jsonb_build_object('ok', false, 'error', 'no_capitan');
  end if;

  select * into v_ca from public.canchas where id = v_d.cancha_id for update;
  if not found or v_ca.adherido then
    return jsonb_build_object('ok', false, 'error', 'solo_no_adherido');
  end if;

  if v_alias is null or v_tel is null or coalesce(p_monto, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'datos_validacion_incompletos');
  end if;

  -- Teléfono no puede coincidir con jugador del desafío
  for v_jug_tel in
    select public.plc_norm_telefono(u.telefono)
    from public.desafio_convocados dc
    join public.usuarios u on u.id = dc.usuario_id
    where dc.desafio_id = p_desafio_id
  loop
    if v_jug_tel is not null and v_jug_tel = v_tel then
      return jsonb_build_object('ok', false, 'error', 'telefono_coincide_jugador');
    end if;
  end loop;

  -- Bloquear si titular alias ~ nombre/DNI de jugador (heurística simple)
  if exists (
    select 1
    from public.desafio_convocados dc
    join public.usuarios u on u.id = dc.usuario_id
    left join public.jugador_perfiles jp on jp.usuario_id = u.id
    where dc.desafio_id = p_desafio_id
      and (
        lower(coalesce(u.nombre, '')) <> '' and strpos(v_alias, lower(u.nombre)) > 0
        or (
          public.plc_dni_normalizado(jp.dni) is not null
          and strpos(v_alias, public.plc_dni_normalizado(jp.dni)) > 0
        )
      )
  ) then
    return jsonb_build_object('ok', false, 'error', 'alias_coincide_jugador');
  end if;

  v_tel_g := public.plc_norm_telefono(v_ca.google_telefono);
  if v_tel_g is not null and v_tel_g = v_tel then
    v_verif := 'verificado';
  else
    v_verif := 'validado_usuario';
  end if;

  -- Alias distinto al guardado → revisión
  if v_ca.alias_cbu is not null and public.plc_norm_alias(v_ca.alias_cbu) is distinct from v_alias then
    insert into public.plc_alias_revision (cancha_id, alias_anterior, alias_nuevo, reportado_por)
    values (v_ca.id, v_ca.alias_cbu, v_alias, v_user);
    update public.canchas set verificacion_estado = 'en_revision' where id = v_ca.id;
  end if;

  -- Primer pago a alias nuevo requiere aprobación
  insert into public.plc_alias_primer_pago (alias_normalizado, aprobado)
  values (v_alias, false)
  on conflict (alias_normalizado) do nothing;

  if exists (
    select 1 from public.plc_alias_primer_pago
    where alias_normalizado = v_alias and not aprobado
  ) then
    -- se permite cargar validación; el pago queda marcado en condiciones
    update public.desafios
    set condiciones = coalesce(condiciones, '{}'::jsonb) || jsonb_build_object('alias_primer_pago_pendiente', true)
    where id = p_desafio_id;
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.plc_validaciones_predio (
    desafio_id, cancha_id, token, alias_cbu, telefono_predio, monto_pendiente,
    estado, verificacion, cargado_por, vence_at
  ) values (
    p_desafio_id, v_ca.id, v_token, v_alias, v_tel, p_monto,
    'pendiente', v_verif, v_user,
    (public.inicio_turno(v_d.fecha, v_d.hora_inicio) - interval '24 hours')
      at time zone 'America/Argentina/Buenos_Aires'
  )
  returning id into v_id;

  update public.canchas
  set
    telefono_validacion = v_tel,
    verificacion_estado = case
      when verificacion_estado = 'en_revision' then 'en_revision'
      when v_verif = 'verificado' then 'verificado'
      else 'validado_usuario'
    end
  where id = v_ca.id;

  -- Al capitán NO se le devuelve el token
  return jsonb_build_object(
    'ok', true,
    'validacion_id', v_id,
    'verificacion', v_verif,
    'estado', 'pendiente'
  );
end;
$$;

revoke all on function public.plc_cargar_validacion_predio(uuid, text, text, numeric) from public;
grant execute on function public.plc_cargar_validacion_predio(uuid, text, text, numeric) to authenticated;

-- Página pública /v/[token]
create or replace function public.plc_ver_validacion_predio(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_v public.plc_validaciones_predio%rowtype;
  v_d public.desafios%rowtype;
  v_u public.usuarios%rowtype;
begin
  select * into v_v from public.plc_validaciones_predio where token = nullif(btrim(coalesce(p_token, '')), '');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'enlace_invalido');
  end if;
  select * into v_d from public.desafios where id = v_v.desafio_id;
  select * into v_u from public.usuarios where id = v_d.owner_id;

  return jsonb_build_object(
    'ok', true,
    'estado', v_v.estado,
    'quien_reservo', coalesce(v_u.nombre, 'Un jugador'),
    'fecha', v_d.fecha,
    'hora_inicio', v_d.hora_inicio,
    'monto', v_v.monto_pendiente,
    'alias', v_v.alias_cbu,
    'cancha', (select nombre from public.canchas where id = v_v.cancha_id)
  );
end;
$$;

revoke all on function public.plc_ver_validacion_predio(text) from public;
grant execute on function public.plc_ver_validacion_predio(text) to anon, authenticated;

create or replace function public.plc_responder_validacion_predio(
  p_token text,
  p_confirma boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_v public.plc_validaciones_predio%rowtype;
begin
  select * into v_v
  from public.plc_validaciones_predio
  where token = nullif(btrim(coalesce(p_token, '')), '')
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'enlace_invalido');
  end if;
  if v_v.estado is distinct from 'pendiente' then
    return jsonb_build_object('ok', false, 'error', 'no_pendiente');
  end if;

  if p_confirma then
    update public.plc_validaciones_predio
    set estado = 'confirmada', respondido_at = now()
    where id = v_v.id;
    update public.canchas
    set
      alias_cbu = v_v.alias_cbu,
      alias_validado_at = now(),
      telefono_validacion = v_v.telefono_predio,
      verificacion_estado = coalesce(v_v.verificacion, 'validado_usuario')
    where id = v_v.cancha_id;
  else
    update public.plc_validaciones_predio
    set estado = 'rechazada', respondido_at = now()
    where id = v_v.id;
  end if;

  return jsonb_build_object('ok', true, 'estado', case when p_confirma then 'confirmada' else 'rechazada' end);
end;
$$;

revoke all on function public.plc_responder_validacion_predio(text, boolean) from public;
grant execute on function public.plc_responder_validacion_predio(text, boolean) to anon, authenticated;

-- Admin: obtener token + wa link (no expuesto al capitán)
create or replace function public.plc_admin_enlace_validacion(p_validacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_v public.plc_validaciones_predio%rowtype;
begin
  if not public.fy_es_admin() and not public.es_admin_plataforma() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;
  select * into v_v from public.plc_validaciones_predio where id = p_validacion_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  return jsonb_build_object(
    'ok', true,
    'token', v_v.token,
    'telefono', v_v.telefono_predio,
    'path', '/v/' || v_v.token
  );
end;
$$;

revoke all on function public.plc_admin_enlace_validacion(uuid) from public;
grant execute on function public.plc_admin_enlace_validacion(uuid) to authenticated;

-- Sin validación 24h antes: pasar a sin plata y devolver depósitos (no tarifa)
create or replace function public.plc_vencer_validaciones_predio()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n int := 0;
  v_i record;
begin
  for r in
    select v.*, d.id as did
    from public.plc_validaciones_predio v
    join public.desafios d on d.id = v.desafio_id
    where v.estado = 'pendiente'
      and v.vence_at is not null
      and public.ahora_argentina() >= v.vence_at
  loop
    update public.plc_validaciones_predio set estado = 'vencida' where id = r.id;
    update public.desafios
    set
      condiciones = coalesce(condiciones, '{}'::jsonb) || jsonb_build_object(
        'sin_plata', true,
        'motivo_sin_plata', 'validacion_predio_vencida'
      ),
      tarifa_servicio = coalesce(tarifa_servicio, 0)
    where id = r.desafio_id;

    -- Reembolsar solo depósito (monto_cancha) de inscripciones confirmadas/pagas
    for v_i in
      select * from public.desafio_inscripciones
      where desafio_id = r.desafio_id
        and estado = 'confirmada'
        and coalesce(monto_cancha, 0) > 0
    loop
      insert into public.movimientos (
        desafio_id, inscripcion_id, usuario_id, predio_id, tipo, monto, estado, detalle
      ) values (
        r.desafio_id, v_i.id, v_i.capitan_id, r.cancha_id,
        'reembolso_cancha', v_i.monto_cancha, 'pendiente',
        'Validación de predio no confirmada 24h antes: se devuelve el depósito (no la tarifa)'
      )
      on conflict do nothing;
    end loop;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'vencidas', v_n);
end;
$$;

revoke all on function public.plc_vencer_validaciones_predio() from public;
grant execute on function public.plc_vencer_validaciones_predio() to authenticated;

-- Check usuarios.telefono exists
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'usuarios' and column_name = 'telefono'
  ) then
    alter table public.usuarios add column if not exists telefono text;
  end if;
end $$;
