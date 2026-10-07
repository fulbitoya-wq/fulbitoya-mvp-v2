-- Fase 0: admin enciende/apaga checkout de prueba; cancelación expone payment id para reembolso MP.

create or replace function public.plc_set_checkout_prueba(p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.es_admin_plataforma() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;
  insert into public.config_plataforma (clave, valor_bool)
  values ('plc_checkout_prueba', coalesce(p_activo, true))
  on conflict (clave) do update
  set valor_bool = excluded.valor_bool;
  return jsonb_build_object(
    'ok', true,
    'checkout_prueba', public.config_bool('plc_checkout_prueba')
  );
end;
$$;

revoke all on function public.plc_set_checkout_prueba(boolean) from public;
grant execute on function public.plc_set_checkout_prueba(boolean) to authenticated;

-- Misma lógica que 068 + mercadopago_payment_id para reembolso real en API.
create or replace function public.plc_cancelar_reserva(p_reserva_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_r public.reservas%rowtype;
  v_inicio timestamp;
  v_horas numeric;
  v_sena numeric;
  v_reemb numeric;
  v_now timestamp := public.ahora_argentina();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  select * into v_r from public.reservas where id = p_reserva_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if v_r.organizador_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'error', 'no_capitan');
  end if;
  if v_r.origen is distinct from 'porlacancha' or v_r.estado_reserva is distinct from 'reservada' then
    return jsonb_build_object('ok', false, 'error', 'no_activa');
  end if;

  v_inicio := coalesce((v_r.condiciones->>'inicio')::timestamp, public.ahora_argentina());
  v_horas := coalesce((v_r.condiciones->>'cancel_horas_total')::numeric, 24);
  v_sena := coalesce(v_r.monto_sena, (v_r.condiciones->>'sena')::numeric, 0);

  if v_r.canal = 'whatsapp' or v_r.estado_pago is distinct from 'pagado' then
    v_reemb := 0;
  elsif v_inicio - v_now > make_interval(hours => trunc(v_horas)::int) then
    v_reemb := coalesce(v_r.monto_total, 0);
  else
    v_reemb := greatest(coalesce(v_r.monto_total, 0) - v_sena, 0);
  end if;

  update public.reservas
  set estado_reserva = 'cancelada', estado_pago = 'cancelado'
  where id = v_r.id;

  update public.disponibilidades set estado = 'disponible' where id = v_r.disponibilidad_id;
  perform public.plc_reembolsar_reserva(v_r.id, v_reemb, 'Cancelación de reserva');
  return jsonb_build_object(
    'ok', true,
    'reembolso', v_reemb,
    'mercadopago_payment_id', v_r.mercadopago_payment_id
  );
end;
$$;
