-- Beta: reserva simple sin seña = gratis en la app (se paga en el predio).
-- Si el predio tiene seña (valor_reserva > 0), se sigue usando el checkout de seña.

create or replace function public.plc_reservar_turno_gratis(
  p_disponibilidad_id uuid,
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
  v_campo public.campos%rowtype;
  v_cancha public.canchas%rowtype;
  v_cot jsonb;
  v_sena numeric;
  v_rid uuid;
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

  v_cot := public.plc_cotizar_reserva(p_disponibilidad_id, 'total');
  if coalesce(v_cot->>'ok', 'false') <> 'true' then
    return v_cot;
  end if;

  v_sena := coalesce((v_cot->>'sena')::numeric, 0);
  if v_sena > 0 then
    return jsonb_build_object('ok', false, 'error', 'requiere_sena');
  end if;

  select * into v_disp from public.disponibilidades where id = p_disponibilidad_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'turno_no_existe');
  end if;
  if v_disp.estado is distinct from 'disponible' then
    return jsonb_build_object('ok', false, 'error', 'turno_no_disponible');
  end if;

  select * into v_campo from public.campos where id = v_disp.campo_id;
  select * into v_cancha from public.canchas where id = v_campo.cancha_id;

  insert into public.reservas (
    disponibilidad_id, organizador_id, monto_total, estado_pago,
    mercadopago_payment_id, origen, tipo_cobro, estado_reserva, condiciones,
    monto_sena, monto_cancha, monto_descuento, acepto_reglas_at
  ) values (
    p_disponibilidad_id,
    v_user,
    0,
    'pagado',
    null,
    'porlacancha',
    'total',
    'reservada',
    v_cot || jsonb_build_object(
      'acepto_reglas', true,
      'acepto_at', now(),
      'beta_gratis_sin_sena', true,
      'paga_en_el_predio', true
    ),
    0,
    coalesce((v_cot->>'precio_cancha')::numeric, v_disp.precio, 0),
    0,
    now()
  ) returning id into v_rid;

  insert into public.reserva_jugadores (reserva_id, jugador_id, monto, estado_pago)
  values (v_rid, v_user, 0, 'pagado');

  update public.disponibilidades
  set estado = 'reservado'
  where id = p_disponibilidad_id and estado = 'disponible';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'turno_no_disponible');
  end if;

  return jsonb_build_object(
    'ok', true,
    'reserva_id', v_rid,
    'gratis', true,
    'cancha_nombre', coalesce(v_cancha.nombre, '')
  );
end;
$$;

revoke all on function public.plc_reservar_turno_gratis(uuid, boolean) from public;
grant execute on function public.plc_reservar_turno_gratis(uuid, boolean) to authenticated;
