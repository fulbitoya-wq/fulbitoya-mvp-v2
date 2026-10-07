-- Regenerar turnos en bloque: el loop fila a fila superaba el timeout de Postgres.

create index if not exists idx_disponibilidades_campo_fecha_hora
  on public.disponibilidades (campo_id, fecha, hora_inicio);

create or replace function public.fy_regenerar_turnos_campo(p_campo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
  v_campo public.campos%rowtype;
  v_ca public.canchas%rowtype;
  v_hoy date := public.ahora_argentina()::date;
  v_ahora time := public.ahora_argentina()::time;
  v_hasta date;
  v_dur int;
  v_n int := 0;
begin
  perform set_config('statement_timeout', '120s', true);

  select * into v_campo from public.campos where id = p_campo_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  select * into v_ca from public.canchas where id = v_campo.cancha_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if auth.uid() is not null
     and not public.plc_es_dueno_cancha(v_ca.id)
     and not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;

  v_dur := coalesce(nullif(v_campo.duracion_min, 0), 60);
  v_hasta := v_hoy + (coalesce(v_ca.ventana_dias, 60) || ' days')::interval;

  delete from public.disponibilidades d
  where d.campo_id = p_campo_id
    and d.origen = 'auto'
    and d.estado = 'disponible'
    and d.fecha >= v_hoy
    and (d.fecha > v_hoy or d.hora_inicio >= v_ahora);

  with fechas as (
    select generate_series(v_hoy, v_hasta, interval '1 day')::date as d
  ),
  dias as (
    select
      f.d,
      public.fy_dow_key(f.d) as k,
      coalesce(v_ca.horarios_apertura, '{}'::jsonb) -> public.fy_dow_key(f.d) as h
    from fechas f
    where not exists (
      select 1 from public.predio_excepciones e
      where e.cancha_id = v_ca.id
        and (e.campo_id is null or e.campo_id = p_campo_id)
        and f.d between e.fecha_desde and e.fecha_hasta
    )
  ),
  abiertas as (
    select
      d.d,
      d.k,
      coalesce((d.h->>'abierto')::boolean, false) as abierto,
      coalesce(nullif(d.h->>'desde', '')::time, time '08:00') as desde,
      coalesce(nullif(d.h->>'hasta', '')::time, time '23:00') as hasta_h
    from dias d
  ),
  slots as (
    select
      a.d as fecha,
      gs::time as hora_inicio,
      (gs + make_interval(mins => v_dur))::time as hora_fin,
      coalesce((
        select fr.precio
        from public.campo_franjas fr
        where fr.campo_id = p_campo_id
          and a.k = any (fr.dias)
          and gs::time >= fr.hora_desde
          and gs::time < fr.hora_hasta
        order by fr.hora_desde desc
        limit 1
      ), v_campo.valor_hora, 0) as precio
    from abiertas a
    cross join lateral generate_series(
      a.d::timestamp + a.desde,
      a.d::timestamp + a.hasta_h - make_interval(mins => v_dur),
      make_interval(mins => v_dur)
    ) as gs
    where a.abierto
      and a.hasta_h > a.desde
      and (a.d > v_hoy or gs::time >= v_ahora)
  )
  insert into public.disponibilidades (
    campo_id, fecha, hora_inicio, hora_fin, precio, estado, origen
  )
  select
    p_campo_id, s.fecha, s.hora_inicio, s.hora_fin, s.precio, 'disponible', 'auto'
  from slots s
  where s.precio > 0
    and not exists (
      select 1
      from public.disponibilidades x
      where x.campo_id = p_campo_id
        and x.fecha = s.fecha
        and x.hora_inicio = s.hora_inicio
    );

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'creados', v_n);
end;
$$;

alter function public.fy_regenerar_turnos_predio(uuid) set statement_timeout = '120s';

revoke all on function public.fy_regenerar_turnos_campo(uuid) from public;
grant execute on function public.fy_regenerar_turnos_campo(uuid) to authenticated, service_role;
