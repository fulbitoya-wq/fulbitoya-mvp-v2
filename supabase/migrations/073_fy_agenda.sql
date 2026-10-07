-- FASE 3: agenda en grilla, marcar cobrado en el predio, detalle de turno.
-- No toca Mercado Pago ni migraciones anteriores.

alter table public.reservas
  add column if not exists cobrado_predio_at timestamptz,
  add column if not exists cobrado_predio_medio text;

alter table public.reservas drop constraint if exists reservas_cobrado_medio_chk;
alter table public.reservas
  add constraint reservas_cobrado_medio_chk check (
    cobrado_predio_medio is null or cobrado_predio_medio in ('efectivo', 'transferencia')
  );

create or replace function public.fy_visual_turno(
  p_estado text,
  p_canal text,
  p_busca boolean,
  p_origen text
)
returns text
language sql
immutable
as $$
  select case
    when p_origen = 'fijo' then 'fijo'
    when p_estado = 'bloqueado' then 'bloqueado'
    when p_estado = 'reservado_pendiente' then 'pago'
    when p_estado = 'reservado' and coalesce(p_busca, false) then 'abierto'
    when p_estado = 'reservado' and p_canal = 'app' then 'app'
    when p_estado = 'reservado' then 'manual'
    else 'libre'
  end;
$$;

create or replace function public.fy_agenda_predio(p_cancha_id uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if not public.plc_es_dueno_cancha(p_cancha_id) and not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  perform public.plc_liberar_holds_vencidos();

  return jsonb_build_object(
    'ok', true,
    'campos', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'duracion_min', c.duracion_min) order by c.nombre)
      from public.campos c where c.cancha_id = p_cancha_id
    ), '[]'::jsonb),
    'turnos', coalesce((
      select jsonb_agg(s.x order by s.x->>'fecha', s.x->>'hora_inicio', s.x->>'campo_nombre')
      from (
        select jsonb_build_object(
          'id', d.id,
          'campo_id', d.campo_id,
          'campo_nombre', c.nombre,
          'fecha', d.fecha,
          'hora_inicio', d.hora_inicio,
          'hora_fin', d.hora_fin,
          'precio', d.precio,
          'estado', d.estado,
          'origen', d.origen,
          'visual', public.fy_visual_turno(d.estado, r.canal, r.busca_gente, d.origen),
          'hold_expira', h.expira_at,
          'reserva', case when r.id is null then null else jsonb_build_object(
            'id', r.id,
            'titular_nombre', r.titular_nombre,
            'titular_telefono', r.titular_telefono,
            'canal', r.canal,
            'cobro_externo', r.cobro_externo,
            'estado_pago', r.estado_pago,
            'tipo_cobro', r.tipo_cobro,
            'monto_total', r.monto_total,
            'monto_sena', r.monto_sena,
            'busca_gente', r.busca_gente,
            'cobrado_predio_at', r.cobrado_predio_at,
            'cobrado_predio_medio', r.cobrado_predio_medio
          ) end,
          'enlaces', coalesce((
            select jsonb_agg(jsonb_build_object(
              'token', e.token,
              'titular_nombre', e.titular_nombre,
              'titular_telefono', e.titular_telefono,
              'monto_sena', e.monto_sena,
              'mensaje', e.mensaje_whatsapp
            ))
            from public.plc_enlace_pago e
            where e.disponibilidad_id = d.id and e.reserva_id is null
          ), '[]'::jsonb),
          'lista', coalesce((
            select jsonb_agg(jsonb_build_object(
              'nombre', l.nombre,
              'usuario_id', l.usuario_id
            ) order by l.created_at)
            from public.reserva_lista l
            where r.id is not null and l.reserva_id = r.id
          ), '[]'::jsonb),
          'pagos_lista', coalesce((
            select jsonb_agg(jsonb_build_object(
              'usuario_id', j.jugador_id,
              'monto', j.monto,
              'estado_pago', j.estado_pago
            ))
            from public.reserva_jugadores j
            where r.id is not null and j.reserva_id = r.id
          ), '[]'::jsonb)
        ) as x
        from public.disponibilidades d
        join public.campos c on c.id = d.campo_id
        left join public.reservas r
          on r.disponibilidad_id = d.id
         and r.estado_reserva = 'reservada'
        left join public.plc_checkout_hold h on h.disponibilidad_id = d.id
        where c.cancha_id = p_cancha_id
          and d.fecha between p_desde and p_hasta
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.fy_marcar_cobrado(p_reserva_id uuid, p_medio text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.reservas%rowtype;
  v_cancha uuid;
  v_medio text := lower(btrim(coalesce(p_medio, '')));
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  if v_medio not in ('efectivo', 'transferencia') then
    return jsonb_build_object('ok', false, 'error', 'medio_invalido');
  end if;
  select * into v_r from public.reservas where id = p_reserva_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  v_cancha := (v_r.condiciones->>'cancha_id')::uuid;
  if v_cancha is null or not public.plc_es_dueno_cancha(v_cancha) then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  if v_r.estado_reserva is distinct from 'reservada' then
    return jsonb_build_object('ok', false, 'error', 'no_activa');
  end if;
  update public.reservas
  set cobrado_predio_at = now(),
      cobrado_predio_medio = v_medio,
      estado_pago = 'pagado'
  where id = v_r.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fy_agenda_predio(uuid, date, date) from public;
revoke all on function public.fy_marcar_cobrado(uuid, text) from public;
grant execute on function public.fy_agenda_predio(uuid, date, date) to authenticated;
grant execute on function public.fy_marcar_cobrado(uuid, text) to authenticated;
grant execute on function public.fy_visual_turno(text, text, boolean, text) to authenticated;
