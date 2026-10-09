-- pgcrypto vive en schema extensions; las funciones con search_path=public
-- no ven gen_random_bytes y fallaba "Agregar invitado".

create extension if not exists pgcrypto with schema extensions;

create or replace function public.plc_invitar_sin_cuenta(
  p_equipo_id uuid,
  p_nombre text,
  p_telefono text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
