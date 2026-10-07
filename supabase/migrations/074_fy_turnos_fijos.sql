-- FASE 4: turnos fijos semanales. No toca Mercado Pago ni migraciones anteriores.

alter table public.disponibilidades drop constraint if exists disponibilidades_origen_chk;
alter table public.disponibilidades
  add constraint disponibilidades_origen_chk check (origen in ('auto', 'manual', 'excepcion', 'fijo'));

create table if not exists public.turno_fijos (
  id uuid primary key default gen_random_uuid(),
  cancha_id uuid not null references public.canchas(id) on delete cascade,
  campo_id uuid not null references public.campos(id) on delete cascade,
  cliente_nombre text not null,
  cliente_telefono text,
  dia_semana text not null,
  hora_inicio time not null,
  hora_fin time not null,
  fecha_desde date not null,
  fecha_hasta date,
  precio numeric(12,2) not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint turno_fijos_dia_chk check (dia_semana in ('lun','mar','mie','jue','vie','sab','dom')),
  constraint turno_fijos_fechas_chk check (fecha_hasta is null or fecha_hasta >= fecha_desde)
);

create table if not exists public.turno_fijo_skip (
  turno_fijo_id uuid not null references public.turno_fijos(id) on delete cascade,
  fecha date not null,
  primary key (turno_fijo_id, fecha)
);

alter table public.disponibilidades
  add column if not exists turno_fijo_id uuid references public.turno_fijos(id) on delete set null;

alter table public.turno_fijos enable row level security;
alter table public.turno_fijo_skip enable row level security;

drop policy if exists "Owner turno fijos" on public.turno_fijos;
create policy "Owner turno fijos" on public.turno_fijos for all
  using (
    exists (
      select 1 from public.canchas ch
      where ch.id = turno_fijos.cancha_id and (ch.owner_id = auth.uid() or public.fy_es_admin())
    )
  )
  with check (
    exists (
      select 1 from public.canchas ch
      where ch.id = turno_fijos.cancha_id and (ch.owner_id = auth.uid() or public.fy_es_admin())
    )
  );

drop policy if exists "Owner turno fijo skip" on public.turno_fijo_skip;
create policy "Owner turno fijo skip" on public.turno_fijo_skip for all
  using (
    exists (
      select 1 from public.turno_fijos tf
      join public.canchas ch on ch.id = tf.cancha_id
      where tf.id = turno_fijo_skip.turno_fijo_id and (ch.owner_id = auth.uid() or public.fy_es_admin())
    )
  )
  with check (
    exists (
      select 1 from public.turno_fijos tf
      join public.canchas ch on ch.id = tf.cancha_id
      where tf.id = turno_fijo_skip.turno_fijo_id and (ch.owner_id = auth.uid() or public.fy_es_admin())
    )
  );

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

create or replace function public.fy_regenerar_fijos_predio(p_cancha_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := public.ahora_argentina()::date;
  v_ca public.canchas%rowtype;
  v_tf public.turno_fijos%rowtype;
  v_d date;
  v_hasta date;
  v_n int := 0;
begin
  if auth.uid() is not null
     and not public.plc_es_dueno_cancha(p_cancha_id)
     and not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  select * into v_ca from public.canchas where id = p_cancha_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  v_hasta := v_hoy + make_interval(days => coalesce(v_ca.ventana_dias, 60));

  for v_tf in select * from public.turno_fijos where cancha_id = p_cancha_id and activo loop
    v_d := greatest(v_hoy, v_tf.fecha_desde);
    while v_d <= v_hasta and (v_tf.fecha_hasta is null or v_d <= v_tf.fecha_hasta) loop
      if public.fy_dow_key(v_d) = v_tf.dia_semana then
        perform public.fy_materializar_fecha_fijo(v_tf.id, v_d);
        v_n := v_n + 1;
      end if;
      v_d := v_d + 1;
    end loop;
  end loop;
  return jsonb_build_object('ok', true, 'fechas', v_n);
end;
$$;

create or replace function public.fy_regenerar_turnos_predio(p_cancha_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total int := 0;
  v_one jsonb;
begin
  if auth.uid() is not null
     and not public.plc_es_dueno_cancha(p_cancha_id)
     and not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  for r in select id from public.campos where cancha_id = p_cancha_id loop
    v_one := public.fy_regenerar_turnos_campo(r.id);
    if coalesce((v_one->>'ok')::boolean, false) then
      v_total := v_total + coalesce((v_one->>'creados')::int, 0);
    end if;
  end loop;
  perform public.fy_regenerar_fijos_predio(p_cancha_id);
  return jsonb_build_object('ok', true, 'creados', v_total);
end;
$$;

create or replace function public.fy_generar_turnos_plataforma()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total int := 0;
  v_one jsonb;
  p record;
begin
  if auth.uid() is not null and not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;
  for r in select id from public.campos loop
    v_one := public.fy_regenerar_turnos_campo(r.id);
    if coalesce((v_one->>'ok')::boolean, false) then
      v_total := v_total + coalesce((v_one->>'creados')::int, 0);
    end if;
  end loop;
  for p in select id from public.canchas loop
    perform public.fy_regenerar_fijos_predio(p.id);
  end loop;
  return jsonb_build_object('ok', true, 'creados', v_total);
end;
$$;

create or replace function public.fy_liberar_fecha_fijo(p_disponibilidad_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d public.disponibilidades%rowtype;
  v_r public.reservas%rowtype;
  v_cancha uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  select * into v_d from public.disponibilidades where id = p_disponibilidad_id for update;
  if not found or v_d.origen is distinct from 'fijo' or v_d.turno_fijo_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_fijo');
  end if;
  select cancha_id into v_cancha from public.campos where id = v_d.campo_id;
  if not public.plc_es_dueno_cancha(v_cancha) then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  insert into public.turno_fijo_skip (turno_fijo_id, fecha)
  values (v_d.turno_fijo_id, v_d.fecha)
  on conflict do nothing;

  select * into v_r from public.reservas
  where disponibilidad_id = v_d.id and estado_reserva = 'reservada'
  limit 1;
  if found and v_r.cobrado_predio_at is null then
    update public.reservas
    set estado_reserva = 'cancelada_predio', estado_pago = 'cancelado'
    where id = v_r.id;
  end if;
  delete from public.disponibilidades where id = v_d.id and origen = 'fijo';
  perform public.fy_regenerar_turnos_campo(v_d.campo_id);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fy_baja_turno_fijo(p_turno_fijo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tf public.turno_fijos%rowtype;
  v_hoy date := public.ahora_argentina()::date;
  r record;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  select * into v_tf from public.turno_fijos where id = p_turno_fijo_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if not public.plc_es_dueno_cancha(v_tf.cancha_id) then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  update public.turno_fijos set activo = false, fecha_hasta = v_hoy - 1 where id = p_turno_fijo_id;

  for r in
    select d.id as did, res.id as rid, res.cobrado_predio_at
    from public.disponibilidades d
    left join public.reservas res on res.disponibilidad_id = d.id and res.estado_reserva = 'reservada'
    where d.turno_fijo_id = p_turno_fijo_id and d.fecha >= v_hoy and d.origen = 'fijo'
  loop
    if r.rid is not null and r.cobrado_predio_at is null then
      update public.reservas
      set estado_reserva = 'cancelada_predio', estado_pago = 'cancelado'
      where id = r.rid;
    end if;
    if r.cobrado_predio_at is null then
      delete from public.disponibilidades where id = r.did;
    end if;
  end loop;
  perform public.fy_regenerar_turnos_predio(v_tf.cancha_id);
  return jsonb_build_object('ok', true);
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
          'turno_fijo_id', d.turno_fijo_id,
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

revoke all on function public.fy_regenerar_fijos_predio(uuid) from public;
revoke all on function public.fy_liberar_fecha_fijo(uuid) from public;
revoke all on function public.fy_baja_turno_fijo(uuid) from public;
grant execute on function public.fy_regenerar_fijos_predio(uuid) to authenticated, service_role;
grant execute on function public.fy_liberar_fecha_fijo(uuid) to authenticated;
grant execute on function public.fy_baja_turno_fijo(uuid) to authenticated;
grant execute on function public.fy_materializar_fecha_fijo(uuid, date) to authenticated, service_role;
grant execute on function public.fy_regenerar_turnos_predio(uuid) to authenticated, service_role;
grant execute on function public.fy_generar_turnos_plataforma() to authenticated, service_role;
grant execute on function public.fy_agenda_predio(uuid, date, date) to authenticated;

grant select, insert, update, delete on public.turno_fijos to authenticated, service_role;
grant select, insert, update, delete on public.turno_fijo_skip to authenticated, service_role;
