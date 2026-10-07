-- Tests Fase 3/4: tarifas Plus + normalización modalidad.
-- Requiere migraciones 088+ aplicadas. Transacción + rollback.

begin;

do $$
declare
  v numeric;
  m text;
begin
  -- por la cancha: tarifa fija
  v := public.plc_tarifa_plus(0, 'sueltos', 'por_la_cancha');
  if v is distinct from coalesce(public.config_num('tarifa_plus_por_la_cancha'), 2000) then
    raise exception 'tarifa por_la_cancha inválida: %', v;
  end if;

  -- 1–2 libres: piso
  v := public.plc_tarifa_plus(2, 'sueltos', 'amistoso');
  if v is distinct from coalesce(public.config_num('tarifa_plus_1_2'), 1500) then
    raise exception 'tarifa 1-2 inválida: %', v;
  end if;

  -- 3+ libres o rival equipo: alta
  v := public.plc_tarifa_plus(3, 'sueltos', 'amistoso');
  if v is distinct from coalesce(public.config_num('tarifa_plus_3_mas'), 2000) then
    raise exception 'tarifa 3+ inválida: %', v;
  end if;

  v := public.plc_tarifa_plus(0, 'equipo', 'competitivo');
  if v is distinct from coalesce(public.config_num('tarifa_plus_3_mas'), 2000) then
    raise exception 'tarifa rival equipo inválida: %', v;
  end if;

  m := public.plc_modalidad_norm('COMPETITIVO');
  if m is distinct from 'competitivo' then
    raise exception 'modalidad_norm competitivo: %', m;
  end if;

  if not public.plc_es_circuito('competitivo') then
    raise exception 'plc_es_circuito debería aceptar competitivo';
  end if;

  -- cotizar turno inexistente
  if coalesce((public.plc_cotizar_reserva_plus(
    '00000000-0000-0000-0000-000000000000', 'amistoso', 2, 'sueltos', 'total'
  )->>'ok'), 'true') = 'true' then
    raise exception 'cotizar plus turno inexistente no falló';
  end if;
end $$;

rollback;
