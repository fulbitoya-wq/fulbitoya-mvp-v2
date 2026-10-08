-- Fase 6: panel admin — predios no adheridos, validaciones, conflictos, transferencias.

create or replace function public.plc_admin_listar_no_adheridos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.fy_es_admin() and not public.es_admin_plataforma() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'predios', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.partidos desc, t.nombre)
      from (
        select
          c.id,
          c.nombre,
          c.direccion,
          c.barrio,
          c.place_id,
          c.verificacion_estado,
          c.alias_cbu,
          c.google_telefono,
          c.telefono_validacion,
          c.created_at,
          (
            select count(*)::int from public.desafios d where d.cancha_id = c.id
          ) as partidos
        from public.canchas c
        where c.adherido is not true
        order by partidos desc, c.nombre
        limit 200
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.plc_admin_listar_no_adheridos() from public;
grant execute on function public.plc_admin_listar_no_adheridos() to authenticated;

create or replace function public.plc_admin_listar_validaciones_pendientes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.fy_es_admin() and not public.es_admin_plataforma() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'validaciones', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at desc)
      from (
        select
          v.id,
          v.desafio_id,
          v.cancha_id,
          v.alias_cbu,
          v.telefono_predio,
          v.monto_pendiente,
          v.estado,
          v.verificacion,
          v.created_at,
          v.vence_at,
          c.nombre as cancha_nombre,
          d.fecha,
          d.hora_inicio
        from public.plc_validaciones_predio v
        join public.canchas c on c.id = v.cancha_id
        join public.desafios d on d.id = v.desafio_id
        where v.estado = 'pendiente'
        order by v.created_at desc
        limit 100
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.plc_admin_listar_validaciones_pendientes() from public;
grant execute on function public.plc_admin_listar_validaciones_pendientes() to authenticated;

create or replace function public.plc_admin_listar_alias_conflicto()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.fy_es_admin() and not public.es_admin_plataforma() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'conflictos', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from public.plc_alias_revision r
      where r.estado = 'pendiente'
    ), '[]'::jsonb),
    'primer_pago_pendiente', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from public.plc_alias_primer_pago a
      where not a.aprobado
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.plc_admin_listar_alias_conflicto() from public;
grant execute on function public.plc_admin_listar_alias_conflicto() to authenticated;

create or replace function public.plc_admin_listar_transferencias_pendientes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.fy_es_admin() and not public.es_admin_plataforma() then
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
          m.detalle,
          m.created_at,
          c.nombre as cancha_nombre,
          c.alias_cbu,
          c.adherido,
          c.place_id
        from public.movimientos m
        left join public.canchas c on c.id = m.predio_id
        where m.tipo = 'deuda_predio'
          and m.estado = 'pendiente'
          and (c.adherido is not true or m.detalle ilike '%manual%')
        order by m.created_at desc
        limit 100
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.plc_admin_listar_transferencias_pendientes() from public;
grant execute on function public.plc_admin_listar_transferencias_pendientes() to authenticated;

create or replace function public.plc_admin_listar_desafios_marcados()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.fy_es_admin() and not public.es_admin_plataforma() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'desafios', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.fecha desc)
      from (
        select
          d.id,
          d.titulo,
          d.fecha,
          d.hora_inicio,
          d.estado,
          d.precio_cancha,
          d.requiere_aprobacion_precio,
          d.condiciones,
          c.nombre as cancha_nombre,
          c.adherido,
          c.place_id
        from public.desafios d
        left join public.canchas c on c.id = d.cancha_id
        where d.requiere_aprobacion_precio
           or coalesce((d.condiciones->>'alias_primer_pago_pendiente')::boolean, false)
           or coalesce((d.condiciones->>'sin_plata')::boolean, false)
           or c.verificacion_estado = 'en_revision'
        order by d.fecha desc nulls last
        limit 100
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.plc_admin_listar_desafios_marcados() from public;
grant execute on function public.plc_admin_listar_desafios_marcados() to authenticated;

create or replace function public.plc_admin_aprobar_alias_primer_pago(p_alias text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alias text := public.plc_norm_alias(p_alias);
begin
  if not public.fy_es_admin() and not public.es_admin_plataforma() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;
  if v_alias is null then
    return jsonb_build_object('ok', false, 'error', 'datos_validacion_incompletos');
  end if;
  update public.plc_alias_primer_pago
  set aprobado = true, aprobado_por = auth.uid(), aprobado_at = now()
  where alias_normalizado = v_alias;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.plc_admin_aprobar_alias_primer_pago(text) from public;
grant execute on function public.plc_admin_aprobar_alias_primer_pago(text) to authenticated;
