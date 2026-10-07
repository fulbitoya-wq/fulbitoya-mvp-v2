-- fy_asegurar_owner (security definer) chocaba con el trigger que bloquea
-- cambio de rol mientras hay JWT. El cliente veía 400 al entrar al panel.

create or replace function public.usuarios_prevent_rol_change()
returns trigger
language plpgsql
as $$
begin
  if new.rol is distinct from old.rol
     and auth.uid() is not null
     and current_user in ('authenticated', 'anon') then
    raise exception 'El rol no se puede cambiar desde el cliente';
  end if;
  return new;
end;
$$;

create or replace function public.fy_asegurar_owner()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  update public.usuarios
  set rol = 'owner'
  where id = auth.uid()
    and rol is distinct from 'owner';
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fy_asegurar_owner() from public;
grant execute on function public.fy_asegurar_owner() to authenticated;
