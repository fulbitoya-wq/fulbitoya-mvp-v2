-- Cotizar/reservar must read venue policy without requiring the player to be the owner.
-- Trigger fy_solo_owner_politica blocked plc_asegurar_politica_predio when the row was missing.

create or replace function public.fy_solo_owner_politica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancha uuid;
begin
  if tg_table_name = 'politica_predio' then
    v_cancha := coalesce(new.cancha_id, old.cancha_id);
  else
    select c.cancha_id into v_cancha
    from public.campos c
    where c.id = coalesce(new.campo_id, old.campo_id);
  end if;

  -- Allow security-definer bootstrap of the default policy row.
  if tg_op = 'INSERT'
     and coalesce(current_setting('plc.bootstrap_politica', true), '') = '1'
  then
    return new;
  end if;

  if not public.fy_es_owner_predio(v_cancha) and not public.fy_es_admin() then
    raise exception 'no_dueno_predio';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.plc_asegurar_politica_predio(p_cancha_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cancha_id is null then
    return;
  end if;
  if exists (select 1 from public.politica_predio where cancha_id = p_cancha_id) then
    return;
  end if;
  perform set_config('plc.bootstrap_politica', '1', true);
  insert into public.politica_predio (cancha_id)
  values (p_cancha_id)
  on conflict (cancha_id) do nothing;
  perform set_config('plc.bootstrap_politica', '', true);
end;
$$;

-- Read path: never fail for players; ensure defaults exist via bootstrap flag.
create or replace function public.plc_politica_efectiva(p_campo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campo public.campos%rowtype;
  v_p public.politica_predio%rowtype;
  v_c public.politica_campo%rowtype;
  v_def jsonb;
  v_sena numeric;
begin
  select * into v_campo from public.campos where id = p_campo_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'campo_no_existe');
  end if;

  perform public.plc_asegurar_politica_predio(v_campo.cancha_id);
  select * into v_p from public.politica_predio where cancha_id = v_campo.cancha_id;
  select * into v_c from public.politica_campo where campo_id = p_campo_id;

  v_sena := coalesce(v_campo.valor_reserva, 0);
  v_def := public.plc_matriz_sena_default(v_sena);

  return jsonb_build_object(
    'ok', true,
    'cancha_id', v_campo.cancha_id,
    'campo_id', v_campo.id,
    'sena_base', v_sena,
    'reserva_sena_nunca_devuelve', coalesce(v_c.reserva_sena_nunca_devuelve, v_p.reserva_sena_nunca_devuelve, false),
    'reserva_devolucion_total_horas', coalesce(v_c.reserva_devolucion_total_horas, v_p.reserva_devolucion_total_horas, 24),
    'reserva_cobro_total_horas', coalesce(v_c.reserva_cobro_total_horas, v_p.reserva_cobro_total_horas, 2),
    'reserva_descuento_total_pct', coalesce(v_c.reserva_descuento_total_pct, v_p.reserva_descuento_total_pct, 5),
    'reserva_descuento_total_activo', coalesce(v_c.reserva_descuento_total_activo, v_p.reserva_descuento_total_activo, true),
    'desafios_habilitados', coalesce(v_c.desafios_habilitados, v_p.desafios_habilitados, true),
    'horarios', coalesce(v_c.horarios, v_p.horarios),
    'anticipacion_min_f5_horas', coalesce(v_c.anticipacion_min_f5_horas, v_p.anticipacion_min_f5_horas, 3),
    'anticipacion_min_f7_horas', coalesce(v_c.anticipacion_min_f7_horas, v_p.anticipacion_min_f7_horas, 3),
    'anticipacion_min_f9_horas', coalesce(v_c.anticipacion_min_f9_horas, v_p.anticipacion_min_f9_horas, 24),
    'anticipacion_min_f11_horas', coalesce(v_c.anticipacion_min_f11_horas, v_p.anticipacion_min_f11_horas, 24),
    'cierre_sin_rival_mas_24h_horas', coalesce(v_c.cierre_sin_rival_mas_24h_horas, v_p.cierre_sin_rival_mas_24h_horas, 12),
    'cierre_sin_rival_menos_24h_horas', coalesce(v_c.cierre_sin_rival_menos_24h_horas, v_p.cierre_sin_rival_menos_24h_horas, 3),
    'permitir_seguir_hasta_inicio', coalesce(v_c.permitir_seguir_hasta_inicio, v_p.permitir_seguir_hasta_inicio, true),
    'tolerancia_walkover_min', coalesce(v_c.tolerancia_walkover_min, v_p.tolerancia_walkover_min, 15),
    'predio_cancela', coalesce(v_c.predio_cancela, v_p.predio_cancela, 'devolver_todo'),
    'sena_amistoso_mas_48', coalesce(v_c.sena_amistoso_mas_48, v_p.sena_amistoso_mas_48, (v_def->>'amistoso_mas_48')::numeric),
    'sena_amistoso_48_24', coalesce(v_c.sena_amistoso_48_24, v_p.sena_amistoso_48_24, (v_def->>'amistoso_48_24')::numeric),
    'sena_amistoso_menos_24', coalesce(v_c.sena_amistoso_menos_24, v_p.sena_amistoso_menos_24, (v_def->>'amistoso_menos_24')::numeric),
    'sena_cancha_mas_48', coalesce(v_c.sena_cancha_mas_48, v_p.sena_cancha_mas_48, (v_def->>'cancha_mas_48')::numeric),
    'sena_cancha_48_24', coalesce(v_c.sena_cancha_48_24, v_p.sena_cancha_48_24, (v_def->>'cancha_48_24')::numeric),
    'sena_cancha_menos_24', coalesce(v_c.sena_cancha_menos_24, v_p.sena_cancha_menos_24, (v_def->>'cancha_menos_24')::numeric)
  );
end;
$$;

-- Backfill missing default policies for approved venues.
do $$
declare
  r record;
begin
  perform set_config('plc.bootstrap_politica', '1', true);
  for r in
    select c.id
    from public.canchas c
    where not exists (
      select 1 from public.politica_predio p where p.cancha_id = c.id
    )
  loop
    insert into public.politica_predio (cancha_id) values (r.id)
    on conflict (cancha_id) do nothing;
  end loop;
  perform set_config('plc.bootstrap_politica', '', true);
end $$;
