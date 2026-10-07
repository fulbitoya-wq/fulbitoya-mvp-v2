-- Panel /admin FulbitoYa: rol admin (manual en DB, distinto de owner) + libro/resumen/transferencias.

-- ---------------------------------------------------------------------------
-- Rol admin en usuarios (nunca asignable desde el cliente: trigger existente)
-- ---------------------------------------------------------------------------
alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios drop constraint if exists usuarios_rol_chk;

do $$
begin
  alter table public.usuarios
    add constraint usuarios_rol_chk check (rol in ('owner', 'jugador', 'admin'));
exception when duplicate_object then
  null;
end $$;

comment on column public.usuarios.rol is
  'jugador | owner | admin. admin solo se asigna a mano en la base (service_role), nunca desde el cliente.';

create or replace function public.plc_es_admin_rol()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios
    where id = auth.uid() and rol = 'admin'
  );
$$;

revoke all on function public.plc_es_admin_rol() from public;
grant execute on function public.plc_es_admin_rol() to authenticated;

-- fy_es_admin también reconoce rol admin (además de email / plataforma_admins)
create or replace function public.fy_es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.plc_es_admin_rol()
    or public.es_admin_plataforma()
    or exists (
      select 1
      from public.config_plataforma c
      where c.clave = 'fy_admin_email'
        and c.valor_text is not null
        and length(btrim(c.valor_text)) > 0
        and lower(btrim(c.valor_text)) = lower(coalesce(auth.jwt()->>'email', ''))
    );
$$;

create or replace function public.plc_admin_soy()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('ok', true, 'admin', public.plc_es_admin_rol());
$$;

revoke all on function public.plc_admin_soy() from public;
grant execute on function public.plc_admin_soy() to authenticated;

-- ---------------------------------------------------------------------------
-- Extensión movimientos (transferencias + ref MP)
-- ---------------------------------------------------------------------------
alter table public.movimientos
  add column if not exists mp_payment_id text,
  add column if not exists comprobante_url text,
  add column if not exists aprobado_at timestamptz,
  add column if not exists transferido_por uuid references public.usuarios(id) on delete set null,
  add column if not exists alias_snapshot text,
  add column if not exists titular_snapshot text,
  add column if not exists transferencia_estado text;

alter table public.movimientos drop constraint if exists movimientos_transferencia_estado_chk;
alter table public.movimientos
  add constraint movimientos_transferencia_estado_chk check (
    transferencia_estado is null
    or transferencia_estado in ('pendiente', 'aprobada', 'hecha')
  );

update public.movimientos
set transferencia_estado = case
  when tipo = 'deuda_predio' and estado = 'procesado' then 'hecha'
  when tipo = 'deuda_predio' and aprobado_at is not null then 'aprobada'
  when tipo = 'deuda_predio' then 'pendiente'
  else transferencia_estado
end
where tipo = 'deuda_predio' and transferencia_estado is null;

-- Permitir leer todos los movimientos a rol admin
drop policy if exists "Leer movimientos propios o admin" on public.movimientos;
create policy "Leer movimientos propios o admin"
  on public.movimientos for select to authenticated
  using (
    usuario_id = auth.uid()
    or public.es_admin_plataforma()
    or public.plc_es_admin_rol()
    or public.fy_es_admin()
    or exists (
      select 1 from public.desafio_inscripciones i
      where i.id = movimientos.inscripcion_id
        and public.es_capitan(i.equipo_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Libro de movimientos (pagos + movimientos)
-- ---------------------------------------------------------------------------
create or replace function public.plc_admin_libro_movimientos(
  p_desde date default null,
  p_hasta date default null,
  p_tipo text default null,
  p_estado text default null,
  p_limit int default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lim int := least(greatest(coalesce(p_limit, 200), 1), 1000);
begin
  if not public.plc_es_admin_rol() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'movimientos', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.fecha desc, t.created_at desc)
      from (
        select * from (
          -- Movimientos contables
          select
            m.id,
            m.created_at,
            (m.created_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
            m.tipo,
            m.estado,
            m.monto,
            m.detalle,
            m.mp_payment_id,
            m.mp_refund_id,
            m.desafio_id,
            m.reserva_id,
            m.inscripcion_id,
            m.predio_id,
            m.usuario_id,
            m.transferencia_estado,
            m.comprobante_url,
            m.alias_snapshot,
            m.titular_snapshot,
            u.nombre as usuario_nombre,
            u.email as usuario_email,
            c.nombre as predio_nombre,
            d.titulo as partido_titulo,
            'movimiento'::text as origen_fila
          from public.movimientos m
          left join public.usuarios u on u.id = m.usuario_id
          left join public.canchas c on c.id = m.predio_id
          left join public.desafios d on d.id = m.desafio_id

          union all

          -- Pagos de reserva
          select
            r.id,
            coalesce(r.created_at, now()),
            (coalesce(r.created_at, now()) at time zone 'America/Argentina/Buenos_Aires')::date,
            'pago_reserva'::text,
            case when r.estado_reserva in ('reservada', 'completada') then 'procesado' else coalesce(r.estado_reserva, 'pendiente') end,
            coalesce(r.monto_total, 0),
            'Pago de reserva (' || coalesce(r.tipo_cobro, 'sena') || ')',
            r.mercadopago_payment_id,
            null::text,
            null::uuid,
            r.id,
            null::uuid,
            nullif(r.condiciones->>'cancha_id', '')::uuid,
            r.organizador_id,
            null::text,
            null::text,
            null::text,
            null::text,
            u2.nombre,
            u2.email,
            c2.nombre,
            null::text,
            'reserva'::text
          from public.reservas r
          left join public.usuarios u2 on u2.id = r.organizador_id
          left join public.canchas c2 on c2.id = nullif(r.condiciones->>'cancha_id', '')::uuid
          where r.mercadopago_payment_id is not null
             or r.estado_reserva in ('reservada', 'pendiente_pago', 'cancelada')

          union all

          -- Pagos de desafío / inscripción
          select
            i.id,
            coalesce(i.confirmada_at, i.created_at, now()),
            (coalesce(i.confirmada_at, i.created_at, now()) at time zone 'America/Argentina/Buenos_Aires')::date,
            'pago_desafio'::text,
            case when i.estado = 'confirmada' then 'procesado' else i.estado end,
            coalesce(i.monto_total, 0),
            'Pago de inscripción desafío',
            i.mp_payment_id,
            null::text,
            i.desafio_id,
            null::uuid,
            i.id,
            d2.cancha_id,
            i.capitan_id,
            null::text,
            null::text,
            null::text,
            null::text,
            u3.nombre,
            u3.email,
            c3.nombre,
            d2.titulo,
            'inscripcion'::text
          from public.desafio_inscripciones i
          join public.desafios d2 on d2.id = i.desafio_id
          left join public.usuarios u3 on u3.id = i.capitan_id
          left join public.canchas c3 on c3.id = d2.cancha_id
          where i.mp_payment_id is not null
             or i.estado in ('confirmada', 'pendiente_pago')
        ) x
        where (p_desde is null or x.fecha >= p_desde)
          and (p_hasta is null or x.fecha <= p_hasta)
          and (p_tipo is null or p_tipo = '' or x.tipo = p_tipo)
          and (p_estado is null or p_estado = '' or x.estado = p_estado)
        order by x.fecha desc, x.created_at desc
        limit v_lim
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.plc_admin_libro_movimientos(date, date, text, text, int) from public;
grant execute on function public.plc_admin_libro_movimientos(date, date, text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Resumen finanzas
-- ---------------------------------------------------------------------------
create or replace function public.plc_admin_resumen_finanzas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy date := (public.ahora_argentina())::date;
  v_semana date := v_hoy - 6;
  v_mes date := date_trunc('month', v_hoy)::date;
begin
  if not public.plc_es_admin_rol() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'tarifas_dia', coalesce((
      select sum(monto) from public.movimientos
      where tipo = 'tarifa_servicio_retenida'
        and (created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_hoy
    ), 0),
    'tarifas_semana', coalesce((
      select sum(monto) from public.movimientos
      where tipo = 'tarifa_servicio_retenida'
        and (created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_semana and v_hoy
    ), 0),
    'tarifas_mes', coalesce((
      select sum(monto) from public.movimientos
      where tipo = 'tarifa_servicio_retenida'
        and (created_at at time zone 'America/Argentina/Buenos_Aires')::date >= v_mes
    ), 0),
    'retenido_esperando_resultado', coalesce((
      select sum(i.monto_cancha)
      from public.desafio_inscripciones i
      join public.desafios d on d.id = i.desafio_id
      where i.estado = 'confirmada'
        and d.modalidad = 'por_la_cancha'
        and d.estado in ('abierto', 'completo', 'en_disputa')
        and d.liquidado_at is null
    ), 0),
    'adeudado_predios', coalesce((
      select sum(monto) from public.movimientos
      where tipo = 'deuda_predio'
        and coalesce(transferencia_estado, 'pendiente') in ('pendiente', 'aprobada')
        and estado = 'pendiente'
    ), 0),
    'hoy', v_hoy
  );
end;
$$;

revoke all on function public.plc_admin_resumen_finanzas() from public;
grant execute on function public.plc_admin_resumen_finanzas() to authenticated;

-- ---------------------------------------------------------------------------
-- Transferencias a predios
-- ---------------------------------------------------------------------------
create or replace function public.plc_admin_listar_transferencias(
  p_estado text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.plc_es_admin_rol() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'transferencias', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at desc)
      from (
        select
          m.id,
          m.desafio_id,
          m.predio_id,
          m.monto,
          m.estado,
          coalesce(m.transferencia_estado, 'pendiente') as transferencia_estado,
          m.detalle,
          m.comprobante_url,
          m.alias_snapshot,
          m.titular_snapshot,
          m.aprobado_at,
          m.processed_at,
          m.created_at,
          c.nombre as predio_nombre,
          c.alias_cbu,
          c.alias_titular,
          c.verificacion_estado,
          c.adherido,
          c.place_id,
          d.titulo as partido_titulo,
          d.fecha as partido_fecha
        from public.movimientos m
        left join public.canchas c on c.id = m.predio_id
        left join public.desafios d on d.id = m.desafio_id
        where m.tipo = 'deuda_predio'
          and (
            p_estado is null or p_estado = ''
            or coalesce(m.transferencia_estado, 'pendiente') = p_estado
          )
        order by m.created_at desc
        limit 200
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.plc_admin_listar_transferencias(text) from public;
grant execute on function public.plc_admin_listar_transferencias(text) to authenticated;

create or replace function public.plc_admin_aprobar_transferencia(p_movimiento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.movimientos%rowtype;
  v_c public.canchas%rowtype;
begin
  if not public.plc_es_admin_rol() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;
  select * into v_m from public.movimientos where id = p_movimiento_id for update;
  if not found or v_m.tipo is distinct from 'deuda_predio' then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if coalesce(v_m.transferencia_estado, 'pendiente') = 'hecha' then
    return jsonb_build_object('ok', false, 'error', 'ya_cerrado');
  end if;
  select * into v_c from public.canchas where id = v_m.predio_id;
  update public.movimientos
  set
    transferencia_estado = 'aprobada',
    aprobado_at = now(),
    alias_snapshot = coalesce(alias_snapshot, v_c.alias_cbu),
    titular_snapshot = coalesce(titular_snapshot, v_c.alias_titular)
  where id = p_movimiento_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.plc_admin_aprobar_transferencia(uuid) from public;
grant execute on function public.plc_admin_aprobar_transferencia(uuid) to authenticated;

create or replace function public.plc_admin_marcar_transferida(
  p_movimiento_id uuid,
  p_comprobante_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.movimientos%rowtype;
  v_url text := nullif(btrim(coalesce(p_comprobante_url, '')), '');
begin
  if not public.plc_es_admin_rol() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;
  if v_url is null then
    return jsonb_build_object('ok', false, 'error', 'comprobante_requerido');
  end if;
  select * into v_m from public.movimientos where id = p_movimiento_id for update;
  if not found or v_m.tipo is distinct from 'deuda_predio' then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  update public.movimientos
  set
    transferencia_estado = 'hecha',
    estado = 'procesado',
    processed_at = now(),
    comprobante_url = v_url,
    transferido_por = auth.uid(),
    aprobado_at = coalesce(aprobado_at, now())
  where id = p_movimiento_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.plc_admin_marcar_transferida(uuid, text) from public;
grant execute on function public.plc_admin_marcar_transferida(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Revisiones pendientes (agregado)
-- ---------------------------------------------------------------------------
create or replace function public.plc_admin_revisiones_pendientes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.plc_es_admin_rol() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'validaciones', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.created_at desc)
      from (
        select
          x.id, x.desafio_id, x.cancha_id, x.alias_cbu, x.telefono_predio,
          x.monto_pendiente, x.estado, x.verificacion, x.created_at, x.vence_at,
          c.nombre as cancha_nombre, d.fecha, d.hora_inicio
        from public.plc_validaciones_predio x
        join public.canchas c on c.id = x.cancha_id
        join public.desafios d on d.id = x.desafio_id
        where x.estado = 'pendiente'
        order by x.created_at desc
        limit 100
      ) v
    ), '[]'::jsonb),
    'primer_pago_alias', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from public.plc_alias_primer_pago a
      where not a.aprobado
    ), '[]'::jsonb),
    'alias_conflicto', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from public.plc_alias_revision r
      where r.estado = 'pendiente'
    ), '[]'::jsonb),
    'montos_fuera_referencia', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.fecha desc nulls last)
      from (
        select id, titulo, fecha, hora_inicio, estado, precio_cancha, requiere_aprobacion_precio, cancha_id
        from public.desafios
        where requiere_aprobacion_precio
          and estado in ('pendiente_pago', 'abierto', 'completo')
        order by fecha desc nulls last
        limit 100
      ) d
    ), '[]'::jsonb),
    'disputas', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.fecha desc nulls last)
      from (
        select id, titulo, fecha, hora_inicio, estado, precio_cancha, cancha_id
        from public.desafios
        where estado = 'en_disputa'
        order by fecha desc nulls last
        limit 100
      ) d
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.plc_admin_revisiones_pendientes() from public;
grant execute on function public.plc_admin_revisiones_pendientes() to authenticated;

-- IDs de pagos MP conocidos (para conciliación desde API)
create or replace function public.plc_admin_mp_payment_ids(
  p_desde timestamptz default null,
  p_hasta timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.plc_es_admin_rol() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'pagos', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select mercadopago_payment_id as mp_payment_id, id as reserva_id, null::uuid as inscripcion_id,
               coalesce(monto_total, 0) as monto, created_at, 'reserva'::text as origen
        from public.reservas
        where mercadopago_payment_id is not null
          and (p_desde is null or created_at >= p_desde)
          and (p_hasta is null or created_at <= p_hasta)
        union all
        select mp_payment_id, null, id, coalesce(monto_total, 0), coalesce(confirmada_at, created_at), 'desafio'
        from public.desafio_inscripciones
        where mp_payment_id is not null
          and (p_desde is null or coalesce(confirmada_at, created_at) >= p_desde)
          and (p_hasta is null or coalesce(confirmada_at, created_at) <= p_hasta)
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.plc_admin_mp_payment_ids(timestamptz, timestamptz) from public;
grant execute on function public.plc_admin_mp_payment_ids(timestamptz, timestamptz) to authenticated;
