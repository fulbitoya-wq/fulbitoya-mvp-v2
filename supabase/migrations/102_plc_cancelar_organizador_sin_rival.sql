-- Organizador por la cancha sin rival: puede cancelar (reembolsa cancha, retiene tarifa).
-- Antes: "usar_decidir_sin_rival" bloqueaba cancelar_inscripcion.

create or replace function public.cancelar_inscripcion(p_inscripcion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_i public.desafio_inscripciones%rowtype;
  v_d public.desafios%rowtype;
  v_inicio timestamp;
  v_plazo timestamp;
  v_now timestamp;
  v_eq_nombre text;
  v_uid uuid;
  v_confirmadas int;
  v_cancha numeric;
  v_serv numeric;
  v_total numeric;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;

  select * into v_i from public.desafio_inscripciones where id = p_inscripcion_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if coalesce(v_i.tipo_inscripcion, 'equipo') = 'jugador' then
    if v_i.capitan_id is distinct from v_user then
      return jsonb_build_object('ok', false, 'error', 'no_capitan');
    end if;
  elsif not public.es_capitan(v_i.equipo_id) then
    return jsonb_build_object('ok', false, 'error', 'no_capitan');
  end if;
  if v_i.estado not in ('pendiente_pago', 'confirmada') then
    return jsonb_build_object('ok', false, 'error', 'no_activa');
  end if;

  select * into v_d from public.desafios where id = v_i.desafio_id for update;

  if public.plc_es_circuito(v_d.modalidad) then
    if v_d.estado = 'completo' and v_i.estado = 'confirmada' then
      return public.cancelar_partido_confirmado(v_d.id);
    end if;

    -- Organizador sin rival (o aún pendiente de pago): cancelar partido.
    if coalesce(v_i.lado, 'a') = 'a'
       and v_d.estado in ('abierto', 'pendiente_pago')
       and public.plc_equipos_confirmados(v_d.id) <= 1 then
      v_cancha := coalesce(v_i.monto_cancha, 0);
      v_serv := coalesce(v_i.monto_servicio, 0);
      v_total := coalesce(v_i.monto_total, v_cancha + v_serv);

      if v_i.estado = 'confirmada' then
        perform public.plc_aplicar_cargo_equipo(
          v_d.id,
          v_i,
          v_d.cancha_id,
          jsonb_build_object('cargo', v_serv, 'retiene_app', v_serv, 'para_predio', 0),
          'Cancelación del organizador sin rival: se retiene la tarifa de la app'
        );
      end if;

      update public.desafios
      set estado = 'cancelado',
          decision_cierre = coalesce(decision_cierre, 'liberar')
      where id = v_d.id;

      update public.desafio_inscripciones
      set estado = 'cancelada', cancelada_at = now(), updated_at = now()
      where id = v_i.id;

      update public.desafio_inscripciones
      set estado = 'expirada', updated_at = now()
      where desafio_id = v_d.id and estado = 'pendiente_pago' and id is distinct from v_i.id;

      perform public.liberar_turno_partido(v_d.disponibilidad_id);

      select e.nombre into v_eq_nombre from public.equipos e where e.id = v_i.equipo_id;
      for v_uid in
        select c.usuario_id from public.desafio_convocados c where c.inscripcion_id = v_i.id
      loop
        if v_uid is distinct from v_user then
          perform public.emitir_notificacion(
            v_uid,
            'inscripcion_cancelada',
            'Se canceló el partido',
            coalesce(v_eq_nombre, 'Tu equipo') || ' canceló ' || v_d.titulo || '.',
            jsonb_build_object('desafio_id', v_d.id, 'destino', 'desafio')
          );
        end if;
      end loop;

      return jsonb_build_object(
        'ok', true,
        'accion', 'cancelar_organizador_sin_rival',
        'monto_pagado', v_total,
        'monto_cancha', v_cancha,
        'monto_servicio', v_serv,
        'reembolso', case when v_i.estado = 'confirmada' then v_cancha else 0 end,
        'retiene_tarifa', case when v_i.estado = 'confirmada' then v_serv else 0 end
      );
    end if;

    if v_d.estado = 'abierto' and coalesce(v_i.tipo_inscripcion, 'equipo') = 'jugador' and v_i.estado = 'confirmada' then
      perform public.plc_reembolsar_restante(v_d.id, v_i, v_d.cancha_id, 'Baja de jugador suelto');
      update public.desafio_inscripciones
      set estado = 'cancelada', cancelada_at = now(), updated_at = now()
      where id = v_i.id;
      return jsonb_build_object('ok', true, 'accion', 'baja_suelto');
    end if;
  end if;

  v_now := public.ahora_argentina();
  v_inicio := v_d.fecha::timestamp + v_d.hora_inicio;
  v_plazo := case
    when v_d.plazo_cancelacion is not null then timezone('America/Argentina/Buenos_Aires', v_d.plazo_cancelacion)
    else v_inicio - interval '24 hours'
  end;
  if v_now >= v_plazo then
    return jsonb_build_object('ok', false, 'error', 'fuera_de_plazo');
  end if;

  select e.nombre into v_eq_nombre from public.equipos e where e.id = v_i.equipo_id;

  for v_uid in
    select c.usuario_id from public.desafio_convocados c where c.inscripcion_id = v_i.id
  loop
    if v_uid is distinct from v_user then
      perform public.emitir_notificacion(
        v_uid,
        'inscripcion_cancelada',
        'Se canceló la inscripción',
        coalesce(v_eq_nombre, 'Tu equipo') || ' ya no juega ' || v_d.titulo || '.',
        jsonb_build_object('desafio_id', v_d.id, 'destino', 'desafio')
      );
    end if;
  end loop;

  if v_d.owner_id is distinct from v_user then
    perform public.emitir_notificacion(
      v_d.owner_id,
      'inscripcion_cancelada',
      'Se bajó un equipo',
      coalesce(v_eq_nombre, 'Un equipo') || ' canceló la inscripción a ' || v_d.titulo || '.',
      jsonb_build_object('desafio_id', v_d.id, 'destino', 'desafio')
    );
  end if;

  delete from public.desafio_convocados where inscripcion_id = v_i.id;

  update public.desafio_inscripciones
  set estado = 'cancelada',
      cancelada_at = now(),
      updated_at = now()
  where id = v_i.id;

  select count(*) into v_confirmadas
  from public.desafio_inscripciones
  where desafio_id = v_d.id and estado = 'confirmada';

  if v_d.estado = 'completo' and v_confirmadas < 2 then
    update public.desafios set estado = 'abierto' where id = v_d.id and estado = 'completo';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
