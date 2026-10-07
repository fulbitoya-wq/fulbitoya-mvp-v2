-- FASE 2: canchas (campos), precios por franja, turnos automáticos, excepciones.
-- No toca Mercado Pago ni migraciones anteriores.

alter table public.campos
  add column if not exists techada boolean not null default false,
  add column if not exists duracion_min integer not null default 60,
  add column if not exists sena_tipo text not null default 'fija',
  add column if not exists sena_valor numeric(12,2) not null default 0,
  add column if not exists fotos jsonb not null default '[]'::jsonb;

alter table public.campos drop constraint if exists campos_duracion_chk;
alter table public.campos
  add constraint campos_duracion_chk check (duracion_min in (60, 90, 120));

alter table public.campos drop constraint if exists campos_sena_tipo_chk;
alter table public.campos
  add constraint campos_sena_tipo_chk check (sena_tipo in ('fija', 'porcentaje'));

alter table public.canchas
  add column if not exists ventana_dias integer not null default 60;

alter table public.canchas drop constraint if exists canchas_ventana_chk;
alter table public.canchas
  add constraint canchas_ventana_chk check (ventana_dias between 7 and 120);

alter table public.disponibilidades
  add column if not exists origen text not null default 'manual';

alter table public.disponibilidades drop constraint if exists disponibilidades_origen_chk;
alter table public.disponibilidades
  add constraint disponibilidades_origen_chk check (origen in ('auto', 'manual', 'excepcion'));

create table if not exists public.campo_franjas (
  id uuid primary key default gen_random_uuid(),
  campo_id uuid not null references public.campos(id) on delete cascade,
  dias text[] not null,
  hora_desde time not null,
  hora_hasta time not null,
  precio numeric(12,2) not null,
  created_at timestamptz not null default now()
);

alter table public.campo_franjas enable row level security;
drop policy if exists "Owner franjas" on public.campo_franjas;
create policy "Owner franjas"
  on public.campo_franjas for all
  using (
    exists (
      select 1
      from public.campos c
      join public.canchas ch on ch.id = c.cancha_id
      where c.id = campo_franjas.campo_id
        and (ch.owner_id = auth.uid() or public.fy_es_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.campos c
      join public.canchas ch on ch.id = c.cancha_id
      where c.id = campo_franjas.campo_id
        and (ch.owner_id = auth.uid() or public.fy_es_admin())
    )
  );

create table if not exists public.predio_excepciones (
  id uuid primary key default gen_random_uuid(),
  cancha_id uuid not null references public.canchas(id) on delete cascade,
  campo_id uuid references public.campos(id) on delete cascade,
  tipo text not null,
  fecha_desde date not null,
  fecha_hasta date not null,
  nota text,
  created_at timestamptz not null default now(),
  constraint predio_excepciones_tipo_chk check (tipo in ('feriado', 'cierre', 'mantenimiento')),
  constraint predio_excepciones_fechas_chk check (fecha_hasta >= fecha_desde)
);

alter table public.predio_excepciones enable row level security;
drop policy if exists "Owner excepciones" on public.predio_excepciones;
create policy "Owner excepciones"
  on public.predio_excepciones for all
  using (
    exists (
      select 1 from public.canchas ch
      where ch.id = predio_excepciones.cancha_id
        and (ch.owner_id = auth.uid() or public.fy_es_admin())
    )
  )
  with check (
    exists (
      select 1 from public.canchas ch
      where ch.id = predio_excepciones.cancha_id
        and (ch.owner_id = auth.uid() or public.fy_es_admin())
    )
  );

create or replace function public.fy_dow_key(p_fecha date)
returns text
language sql
immutable
as $$
  select (array['lun','mar','mie','jue','vie','sab','dom'])[extract(isodow from p_fecha)::int];
$$;

create or replace function public.fy_precio_turno(p_campo_id uuid, p_fecha date, p_hora time)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := public.fy_dow_key(p_fecha);
  v_precio numeric;
  v_base numeric;
begin
  select f.precio into v_precio
  from public.campo_franjas f
  where f.campo_id = p_campo_id
    and v_key = any (f.dias)
    and p_hora >= f.hora_desde
    and p_hora < f.hora_hasta
  order by f.hora_desde desc
  limit 1;
  if v_precio is not null then
    return v_precio;
  end if;
  select valor_hora into v_base from public.campos where id = p_campo_id;
  return coalesce(v_base, 0);
end;
$$;

create or replace function public.fy_regenerar_turnos_campo(p_campo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campo public.campos%rowtype;
  v_ca public.canchas%rowtype;
  v_hoy date := public.ahora_argentina()::date;
  v_ahora time := public.ahora_argentina()::time;
  v_hasta date;
  v_d date;
  v_key text;
  v_h jsonb;
  v_abierto boolean;
  v_desde time;
  v_hasta_h time;
  v_t time;
  v_fin time;
  v_precio numeric;
  v_dur int;
  v_n int := 0;
begin
  if auth.uid() is null and current_setting('role', true) not in ('service_role', 'postgres') then
    -- cron / definer
    null;
  end if;

  select * into v_campo from public.campos where id = p_campo_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  select * into v_ca from public.canchas where id = v_campo.cancha_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if auth.uid() is not null
     and v_ca.owner_id is distinct from auth.uid()
     and not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;

  v_dur := coalesce(nullif(v_campo.duracion_min, 0), 60);
  v_hasta := v_hoy + make_interval(days => coalesce(v_ca.ventana_dias, 60));

  delete from public.disponibilidades d
  where d.campo_id = p_campo_id
    and d.origen = 'auto'
    and d.estado = 'disponible'
    and d.fecha >= v_hoy
    and (d.fecha > v_hoy or d.hora_inicio >= v_ahora);

  v_d := v_hoy;
  while v_d <= v_hasta loop
    if exists (
      select 1
      from public.predio_excepciones e
      where e.cancha_id = v_ca.id
        and (e.campo_id is null or e.campo_id = p_campo_id)
        and v_d between e.fecha_desde and e.fecha_hasta
    ) then
      v_d := v_d + 1;
      continue;
    end if;

    v_key := public.fy_dow_key(v_d);
    v_h := coalesce(v_ca.horarios_apertura, '{}'::jsonb) -> v_key;
    v_abierto := coalesce((v_h->>'abierto')::boolean, false);
    if not v_abierto then
      v_d := v_d + 1;
      continue;
    end if;
    v_desde := coalesce(nullif(v_h->>'desde', '')::time, time '08:00');
    v_hasta_h := coalesce(nullif(v_h->>'hasta', '')::time, time '23:00');
    if v_hasta_h <= v_desde then
      v_d := v_d + 1;
      continue;
    end if;

    v_t := v_desde;
    while (v_t + make_interval(mins => v_dur)) <= v_hasta_h loop
      v_fin := (v_t + make_interval(mins => v_dur))::time;
      if v_d = v_hoy and v_t < v_ahora then
        v_t := v_fin;
        continue;
      end if;
      v_precio := public.fy_precio_turno(p_campo_id, v_d, v_t);
      if v_precio is null or v_precio <= 0 then
        v_t := v_fin;
        continue;
      end if;
      if exists (
        select 1 from public.disponibilidades x
        where x.campo_id = p_campo_id
          and x.fecha = v_d
          and x.hora_inicio = v_t
      ) then
        update public.disponibilidades
        set precio = v_precio,
            hora_fin = v_fin
        where campo_id = p_campo_id
          and fecha = v_d
          and hora_inicio = v_t
          and origen = 'auto'
          and estado = 'disponible';
      else
        insert into public.disponibilidades (
          campo_id, fecha, hora_inicio, hora_fin, precio, estado, origen
        ) values (
          p_campo_id, v_d, v_t, v_fin, v_precio, 'disponible', 'auto'
        );
        v_n := v_n + 1;
      end if;
      v_t := v_fin;
    end loop;

    v_d := v_d + 1;
  end loop;

  return jsonb_build_object('ok', true, 'creados', v_n);
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
  return jsonb_build_object('ok', true, 'creados', v_total);
end;
$$;

revoke all on function public.fy_regenerar_turnos_campo(uuid) from public;
revoke all on function public.fy_regenerar_turnos_predio(uuid) from public;
revoke all on function public.fy_generar_turnos_plataforma() from public;
grant execute on function public.fy_regenerar_turnos_campo(uuid) to authenticated, service_role;
grant execute on function public.fy_regenerar_turnos_predio(uuid) to authenticated, service_role;
grant execute on function public.fy_generar_turnos_plataforma() to authenticated, service_role;
grant execute on function public.fy_precio_turno(uuid, date, time) to authenticated, service_role;
grant execute on function public.fy_dow_key(date) to authenticated, service_role;
