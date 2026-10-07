-- FASE 4 follow-up: materializar fijo solo dueño/admin/service.

create or replace function public.fy_materializar_fecha_fijo(p_fijo uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tf public.turno_fijos%rowtype;
  v_ca public.canchas%rowtype;
  v_campo public.campos%rowtype;
  v_d public.disponibilidades%rowtype;
  v_did uuid;
  v_rid uuid;
begin
  select * into v_tf from public.turno_fijos where id = p_fijo and activo;
  if not found then return; end if;
  if auth.uid() is not null
     and not public.plc_es_dueno_cancha(v_tf.cancha_id)
     and not public.fy_es_admin() then
    return;
  end if;
  if p_fecha < v_tf.fecha_desde then return; end if;
  if v_tf.fecha_hasta is not null and p_fecha > v_tf.fecha_hasta then return; end if;
  if public.fy_dow_key(p_fecha) is distinct from v_tf.dia_semana then return; end if;
  if exists (select 1 from public.turno_fijo_skip s where s.turno_fijo_id = p_fijo and s.fecha = p_fecha) then
    return;
  end if;
  if exists (
    select 1 from public.predio_excepciones e
    where e.cancha_id = v_tf.cancha_id
      and (e.campo_id is null or e.campo_id = v_tf.campo_id)
      and p_fecha between e.fecha_desde and e.fecha_hasta
  ) then
    return;
  end if;

  select * into v_campo from public.campos where id = v_tf.campo_id;
  select * into v_ca from public.canchas where id = v_tf.cancha_id;

  select * into v_d
  from public.disponibilidades
  where campo_id = v_tf.campo_id and fecha = p_fecha and hora_inicio = v_tf.hora_inicio
  limit 1;

  if found then
    if v_d.origen = 'fijo' and v_d.turno_fijo_id = p_fijo then
      v_did := v_d.id;
      update public.disponibilidades
      set hora_fin = v_tf.hora_fin, precio = v_tf.precio, estado = 'reservado'
      where id = v_did;
    elsif v_d.estado = 'disponible' then
      delete from public.disponibilidades where id = v_d.id;
      v_did := null;
    else
      return;
    end if;
  end if;

  if v_did is null then
    insert into public.disponibilidades (
      campo_id, fecha, hora_inicio, hora_fin, precio, estado, origen, turno_fijo_id
    ) values (
      v_tf.campo_id, p_fecha, v_tf.hora_inicio, v_tf.hora_fin, v_tf.precio, 'reservado', 'fijo', p_fijo
    ) returning id into v_did;
  end if;

  select id into v_rid from public.reservas
  where disponibilidad_id = v_did and estado_reserva = 'reservada'
  limit 1;
  if v_rid is null then
    insert into public.reservas (
      disponibilidad_id, organizador_id, monto_total, estado_pago,
      origen, tipo_cobro, estado_reserva, condiciones,
      monto_sena, monto_cancha, monto_descuento,
      canal, cobro_externo, titular_nombre, titular_telefono
    ) values (
      v_did,
      null,
      v_tf.precio,
      'pendiente',
      'porlacancha',
      'total',
      'reservada',
      jsonb_build_object(
        'cancha_id', v_tf.cancha_id,
        'campo_id', v_tf.campo_id,
        'cancha_nombre', v_ca.nombre,
        'campo_nombre', v_campo.nombre,
        'fecha', p_fecha,
        'hora_inicio', v_tf.hora_inicio,
        'precio_cancha', v_tf.precio,
        'turno_fijo_id', p_fijo
      ),
      0,
      v_tf.precio,
      0,
      'manual',
      'a_cobrar_predio',
      v_tf.cliente_nombre,
      v_tf.cliente_telefono
    );
  end if;
end;
$$;

revoke all on function public.fy_materializar_fecha_fijo(uuid, date) from public, authenticated;
grant execute on function public.fy_materializar_fecha_fijo(uuid, date) to service_role;
