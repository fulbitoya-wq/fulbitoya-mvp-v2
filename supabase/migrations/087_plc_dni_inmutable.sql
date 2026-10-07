-- DNI inmutable una vez cargado (solo soporte / service_role puede corregirlo).
-- Extiende 086: plc_guardar_identidad_desafio no sobrescribe un DNI ya válido.

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
  v_prev text;
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

  select dni into v_prev from public.jugador_perfiles where usuario_id = v_user;
  if public.plc_dni_valido(v_prev) then
    if public.plc_dni_normalizado(v_prev) is distinct from v_dni then
      return jsonb_build_object('ok', false, 'error', 'dni_no_editable');
    end if;
    -- Mismo DNI: solo refresca fecha.
    update public.jugador_perfiles
    set fecha_nacimiento = p_fecha_nacimiento, updated_at = now()
    where usuario_id = v_user;
  else
    insert into public.jugador_perfiles (usuario_id, fecha_nacimiento, dni, updated_at)
    values (v_user, p_fecha_nacimiento, v_dni, now())
    on conflict (usuario_id) do update set
      fecha_nacimiento = excluded.fecha_nacimiento,
      dni = excluded.dni,
      updated_at = now();
  end if;

  return jsonb_build_object('ok', true, 'puede_desafio_cancha', true);
end;
$$;

revoke all on function public.plc_guardar_identidad_desafio(text, date) from public;
grant execute on function public.plc_guardar_identidad_desafio(text, date) to authenticated;

-- Bloqueo a nivel fila: no se puede cambiar dni si ya había uno válido (salvo service_role).
create or replace function public.plc_trg_dni_inmutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and public.plc_dni_valido(old.dni)
     and public.plc_dni_normalizado(new.dni) is distinct from public.plc_dni_normalizado(old.dni)
     and coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'dni_no_editable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_plc_dni_inmutable on public.jugador_perfiles;
create trigger trg_plc_dni_inmutable
before update on public.jugador_perfiles
for each row execute function public.plc_trg_dni_inmutable();
