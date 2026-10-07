-- Fase 2: equipo del capitán (elegir / crear por nombre / sin equipo) + invitados sin cuenta.

alter table public.equipo_miembros
  add column if not exists es_invitado boolean not null default false,
  add column if not exists invitado_nombre text,
  add column if not exists invitado_claim_token text,
  add column if not exists invitado_telefono text;

create unique index if not exists uq_equipo_invitado_claim
  on public.equipo_miembros (invitado_claim_token)
  where invitado_claim_token is not null;

-- Crear equipo mínimo (solo nombre + formato)
create or replace function public.plc_crear_equipo_rapido(
  p_nombre text,
  p_formato text default 'f5'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_res jsonb;
  v_tipo public.match_tipo;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'nombre_requerido');
  end if;
  v_tipo := public.tipo_desde_campo(lower(btrim(coalesce(p_formato, 'f5'))));
  v_res := public.crear_equipo(btrim(p_nombre), null, v_tipo, null, null, null);
  return v_res;
end;
$$;

revoke all on function public.plc_crear_equipo_rapido(text, text) from public;
grant execute on function public.plc_crear_equipo_rapido(text, text) to authenticated;

-- Invitar por nombre (sin cuenta). Queda como invitado hasta "Soy X" al registrarse.
create or replace function public.plc_invitar_sin_cuenta(
  p_equipo_id uuid,
  p_nombre text,
  p_telefono text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_token text;
  v_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.es_capitan(p_equipo_id) then
    return jsonb_build_object('ok', false, 'error', 'no_capitan');
  end if;
  if v_nombre is null then
    return jsonb_build_object('ok', false, 'error', 'nombre_requerido');
  end if;

  v_token := encode(gen_random_bytes(16), 'hex');

  insert into public.equipo_miembros (
    equipo_id, usuario_id, rol, estado,
    es_invitado, invitado_nombre, invitado_claim_token, invitado_telefono
  ) values (
    p_equipo_id, null, 'jugador', 'activo',
    true, v_nombre, v_token, nullif(btrim(coalesce(p_telefono, '')), '')
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'miembro_id', v_id,
    'claim_token', v_token,
    'nombre', v_nombre
  );
end;
$$;

revoke all on function public.plc_invitar_sin_cuenta(uuid, text, text) from public;
grant execute on function public.plc_invitar_sin_cuenta(uuid, text, text) to authenticated;

-- Reclamar invitado: "Soy Nico"
create or replace function public.plc_reclamar_invitado(
  p_claim_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_m public.equipo_miembros%rowtype;
  v_token text := nullif(btrim(coalesce(p_claim_token, '')), '');
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if v_token is null then
    return jsonb_build_object('ok', false, 'error', 'enlace_invalido');
  end if;

  select * into v_m
  from public.equipo_miembros
  where invitado_claim_token = v_token
    and es_invitado
    and estado = 'activo'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'enlace_invalido');
  end if;

  if exists (
    select 1 from public.equipo_miembros
    where equipo_id = v_m.equipo_id and usuario_id = v_user and estado = 'activo'
  ) then
    update public.equipo_miembros set estado = 'salio', invitado_claim_token = null where id = v_m.id;
    return jsonb_build_object('ok', true, 'equipo_id', v_m.equipo_id, 'ya_miembro', true);
  end if;

  update public.equipo_miembros
  set
    usuario_id = v_user,
    es_invitado = false,
    invitado_claim_token = null,
    invitado_nombre = coalesce(invitado_nombre, null)
  where id = v_m.id;

  return jsonb_build_object(
    'ok', true,
    'equipo_id', v_m.equipo_id,
    'nombre_invitado', v_m.invitado_nombre
  );
end;
$$;

revoke all on function public.plc_reclamar_invitado(text) from public;
grant execute on function public.plc_reclamar_invitado(text) to authenticated;

-- Permitir usuario_id null en miembros invitados (si había NOT NULL)
do $$
begin
  begin
    alter table public.equipo_miembros alter column usuario_id drop not null;
  exception when others then
    null;
  end;
end $$;
