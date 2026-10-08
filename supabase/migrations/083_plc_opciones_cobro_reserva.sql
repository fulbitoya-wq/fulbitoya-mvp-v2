-- Opciones de cobro (seña / total) + texto de cancelación con fecha concreta
-- para el detalle de cancha en PorLaCancha. Montos y fechas solo desde el servidor.

create or replace function public.plc_fmt_fecha_hora_ar(p_ts timestamp)
returns text
language plpgsql
immutable
as $$
declare
  v_local timestamp;
  v_dia text;
  v_hora text;
begin
  v_local := p_ts;
  v_dia := case extract(dow from v_local)::int
    when 0 then 'domingo'
    when 1 then 'lunes'
    when 2 then 'martes'
    when 3 then 'miércoles'
    when 4 then 'jueves'
    when 5 then 'viernes'
    else 'sábado'
  end;
  v_hora := to_char(v_local, 'HH24:MI');
  return v_dia || ' a las ' || v_hora;
end;
$$;

create or replace function public.plc_cotizar_reserva(p_disponibilidad_id uuid, p_tipo_cobro text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disp public.disponibilidades%rowtype;
  v_campo public.campos%rowtype;
  v_cancha public.canchas%rowtype;
  v_pol jsonb;
  v_precio numeric;
  v_sena numeric;
  v_pct numeric;
  v_activo boolean;
  v_desc numeric := 0;
  v_pagar numeric;
  v_resta numeric;
  v_horas numeric;
  v_tipo text;
  v_inicio timestamp;
  v_limite timestamp;
  v_acepta_sena boolean;
  v_acepta_total boolean;
  v_slug text;
  v_texto_cancel text;
begin
  v_tipo := lower(btrim(coalesce(p_tipo_cobro, 'sena')));
  if v_tipo not in ('sena', 'total') then
    return jsonb_build_object('ok', false, 'error', 'tipo_cobro_invalido');
  end if;

  select * into v_disp from public.disponibilidades where id = p_disponibilidad_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'turno_no_existe');
  end if;
  select * into v_campo from public.campos where id = v_disp.campo_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'campo_no_existe');
  end if;
  select * into v_cancha from public.canchas where id = v_campo.cancha_id;

  v_pol := public.plc_politica_efectiva(v_campo.id);
  if coalesce(v_pol->>'ok', 'false') <> 'true' then
    return v_pol;
  end if;

  v_precio := public.plc_centena(coalesce(v_disp.precio, v_campo.valor_hora, 0));
  v_sena := public.plc_centena(coalesce(v_campo.valor_reserva, v_cancha.valor_reserva, 0));
  if v_precio <= 0 then
    return jsonb_build_object('ok', false, 'error', 'precio_cancha_invalido');
  end if;

  v_acepta_sena := v_sena > 0;
  v_acepta_total := true;

  if v_tipo = 'sena' and not v_acepta_sena then
    return jsonb_build_object('ok', false, 'error', 'senia_no_configurada');
  end if;

  v_pct := coalesce((v_pol->>'reserva_descuento_total_pct')::numeric, 5);
  v_activo := coalesce((v_pol->>'reserva_descuento_total_activo')::boolean, true);
  if v_tipo = 'total' and v_activo and v_pct > 0 then
    v_desc := public.plc_centena(v_precio * v_pct / 100.0);
    v_pagar := greatest(v_precio - v_desc, 0);
  elsif v_tipo = 'total' then
    v_pagar := v_precio;
  else
    v_pagar := v_sena;
  end if;

  v_resta := case when v_tipo = 'sena' then greatest(v_precio - v_sena, 0) else 0 end;

  v_inicio := public.inicio_turno(v_disp.fecha, v_disp.hora_inicio);
  v_horas := coalesce((v_pol->>'reserva_devolucion_total_horas')::numeric, 24);
  v_limite := v_inicio - (greatest(v_horas, 0)::text || ' hours')::interval;

  v_texto_cancel :=
    'Cancelá gratis hasta el ' || public.plc_fmt_fecha_hora_ar(v_limite) ||
    '. Después perdés $' || trim(to_char(v_sena, 'FM999G999G999'));

  v_slug := nullif(btrim(coalesce(v_cancha.slug, '')), '');

  return jsonb_build_object(
    'ok', true,
    'tipo_cobro', v_tipo,
    'precio_cancha', v_precio,
    'sena', v_sena,
    'descuento', v_desc,
    'descuento_pct', case when v_tipo = 'total' and v_activo and v_pct > 0 then v_pct else 0 end,
    'monto_pagar', v_pagar,
    'resta_en_predio', v_resta,
    'cancel_horas_total', v_horas,
    'cancel_gratis_hasta', v_limite,
    'texto_cancelacion', v_texto_cancel,
    'comision_pct', coalesce(public.config_num('comision_app_reserva_pct'), 3),
    'cancha_id', v_campo.cancha_id,
    'campo_id', v_campo.id,
    'cancha_nombre', v_cancha.nombre,
    'campo_nombre', v_campo.nombre,
    'formato', v_campo.tipo,
    'fecha', v_disp.fecha,
    'hora_inicio', v_disp.hora_inicio,
    'barrio', v_cancha.barrio,
    'direccion', v_cancha.direccion,
    'slug', v_slug,
    'acepta_sena', v_acepta_sena,
    'acepta_total', v_acepta_total,
    'inicio', v_inicio,
    'texto_reglas',
      v_texto_cancel ||
      '. Lo máximo que se retiene es la seña. Si pagaste el total, te devolvemos lo que supere la seña.'
  );
end;
$$;

create or replace function public.plc_opciones_cobro_reserva(p_disponibilidad_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sena jsonb;
  v_total jsonb;
  v_acepta_sena boolean;
  v_acepta_total boolean;
  v_precio numeric;
  v_monto_sena numeric;
  v_desc numeric;
  v_pct numeric;
  v_pagar_total numeric;
begin
  v_total := public.plc_cotizar_reserva(p_disponibilidad_id, 'total');
  if coalesce(v_total->>'ok', 'false') <> 'true' then
    return v_total;
  end if;

  v_acepta_sena := coalesce((v_total->>'acepta_sena')::boolean, false);
  v_acepta_total := coalesce((v_total->>'acepta_total')::boolean, true);
  v_precio := coalesce((v_total->>'precio_cancha')::numeric, 0);
  v_monto_sena := coalesce((v_total->>'sena')::numeric, 0);
  v_desc := coalesce((v_total->>'descuento')::numeric, 0);
  v_pct := coalesce((v_total->>'descuento_pct')::numeric, 0);
  v_pagar_total := coalesce((v_total->>'monto_pagar')::numeric, v_precio);

  if v_acepta_sena then
    v_sena := public.plc_cotizar_reserva(p_disponibilidad_id, 'sena');
    if coalesce(v_sena->>'ok', 'false') <> 'true' then
      v_acepta_sena := false;
      v_sena := null;
    end if;
  else
    v_sena := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'cancha_id', v_total->'cancha_id',
    'campo_id', v_total->'campo_id',
    'cancha_nombre', v_total->'cancha_nombre',
    'campo_nombre', v_total->'campo_nombre',
    'formato', v_total->'formato',
    'fecha', v_total->'fecha',
    'hora_inicio', v_total->'hora_inicio',
    'barrio', v_total->'barrio',
    'direccion', v_total->'direccion',
    'slug', v_total->'slug',
    'precio_cancha', v_precio,
    'sena', v_monto_sena,
    'acepta_sena', v_acepta_sena,
    'acepta_total', v_acepta_total,
    'texto_cancelacion', v_total->'texto_cancelacion',
    'texto_reglas', v_total->'texto_reglas',
    'cancel_gratis_hasta', v_total->'cancel_gratis_hasta',
    'cancel_horas_total', v_total->'cancel_horas_total',
    'opcion_sena', case when v_acepta_sena and v_sena is not null then jsonb_build_object(
      'disponible', true,
      'monto_pagar', (v_sena->>'monto_pagar')::numeric,
      'resta_en_predio', (v_sena->>'resta_en_predio')::numeric,
      'aclaracion', null
    ) else jsonb_build_object(
      'disponible', false,
      'monto_pagar', null,
      'resta_en_predio', null,
      'aclaracion', 'Este predio no ofrece reserva con seña.'
    ) end,
    'opcion_total', case when v_acepta_total then jsonb_build_object(
      'disponible', true,
      'monto_pagar', v_pagar_total,
      'resta_en_predio', 0,
      'descuento', v_desc,
      'descuento_pct', v_pct,
      'precio_sin_descuento', v_precio,
      'aclaracion', null
    ) else jsonb_build_object(
      'disponible', false,
      'monto_pagar', null,
      'resta_en_predio', null,
      'descuento', 0,
      'descuento_pct', 0,
      'precio_sin_descuento', v_precio,
      'aclaracion', 'Este predio no ofrece pago total por adelantado.'
    ) end
  );
end;
$$;

revoke all on function public.plc_fmt_fecha_hora_ar(timestamp) from public;
revoke all on function public.plc_cotizar_reserva(uuid, text) from public;
revoke all on function public.plc_opciones_cobro_reserva(uuid) from public;

grant execute on function public.plc_cotizar_reserva(uuid, text) to authenticated, anon;
grant execute on function public.plc_opciones_cobro_reserva(uuid) to authenticated, anon;
