-- Cancelar partido completo fallaba: emitir_notificacion('partido_cancelado_cargo')
-- no estaba en notificaciones_tipo_chk (se había perdido al ampliar tipos en 069).

alter table public.notificaciones drop constraint if exists notificaciones_tipo_chk;
alter table public.notificaciones
  add constraint notificaciones_tipo_chk check (tipo in (
    'invitacion_equipo',
    'solicitud_equipo',
    'respuesta_solicitud',
    'respuesta_invitacion',
    'capitan_transferido',
    'expulsado_equipo',
    'convocado_partido',
    'baja_convocatoria',
    'inscripcion_desafio',
    'inscripcion_cancelada',
    'pago_confirmado',
    'rival_sumado',
    'partido_sin_rival_cancelado',
    'partido_cancelado_cargo',
    'rival_confirmo_resultado',
    'resultado_en_disputa',
    'reembolso_procesado',
    'aviso_26h_sin_rival',
    'decision_24h_sin_rival',
    'decision_cierre_sin_rival',
    'turno_liberado_cargo',
    'cancha_conservada',
    'reserva_nueva_predio',
    'turno_enlace_ocupado'
  ));

alter table public.preferencias_notificacion drop constraint if exists preferencias_notificacion_tipo_chk;
alter table public.preferencias_notificacion
  add constraint preferencias_notificacion_tipo_chk check (tipo in (
    'invitacion_equipo',
    'solicitud_equipo',
    'respuesta_solicitud',
    'respuesta_invitacion',
    'capitan_transferido',
    'expulsado_equipo',
    'convocado_partido',
    'baja_convocatoria',
    'inscripcion_desafio',
    'inscripcion_cancelada',
    'pago_confirmado',
    'rival_sumado',
    'partido_sin_rival_cancelado',
    'partido_cancelado_cargo',
    'rival_confirmo_resultado',
    'resultado_en_disputa',
    'reembolso_procesado',
    'aviso_26h_sin_rival',
    'decision_24h_sin_rival',
    'decision_cierre_sin_rival',
    'turno_liberado_cargo',
    'cancha_conservada',
    'reserva_nueva_predio',
    'turno_enlace_ocupado'
  ));

-- Si un tipo no entra en el check, no abortar la cancelación del partido.
create or replace function public.emitir_notificacion(
  p_usuario_id uuid,
  p_tipo text,
  p_titulo text,
  p_cuerpo text,
  p_datos jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_usuario_id is null then
    return;
  end if;
  if exists (
    select 1
    from public.preferencias_notificacion
    where usuario_id = p_usuario_id
      and tipo = p_tipo
      and activa = false
  ) then
    return;
  end if;

  begin
    insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, datos)
    values (
      p_usuario_id,
      p_tipo,
      p_titulo,
      p_cuerpo,
      coalesce(p_datos, '{}'::jsonb)
    );
  exception
    when check_violation then
      raise warning 'emitir_notificacion: tipo % no permitido, se omite', p_tipo;
  end;
end;
$$;
