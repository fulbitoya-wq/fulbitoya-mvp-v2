-- Verificación remota fases 1–4 (migraciones 086–089).
-- Corré en SQL Editor del proyecto (rol postgres). Pegá el resultado (estado OK|FALTA).

with expected(migracion, tipo, objeto) as (
  values
    -- 086 edad
    ('086', 'function', 'public.plc_check_edad_basica'),
    ('086', 'function', 'public.plc_check_desafio_cancha'),
    ('086', 'function', 'public.plc_mi_estado_edad'),
    ('086', 'function', 'public.plc_guardar_fecha_nacimiento'),
    ('086', 'function', 'public.plc_guardar_identidad_desafio'),
    ('086', 'function', 'public.crear_partido'),
    -- 087 dni
    ('087', 'column', 'public.jugador_perfiles.dni'),
    ('087', 'function', 'public.plc_guardar_identidad_desafio'),
    -- 088 plus
    ('088', 'function', 'public.plc_tarifa_plus'),
    ('088', 'function', 'public.plc_cotizar_reserva_plus'),
    ('088', 'function', 'public.plc_pasar_a_plus'),
    ('088', 'function', 'public.plc_modalidad_norm'),
    ('088', 'function', 'public.plc_es_circuito'),
    ('088', 'config', 'tarifa_plus_1_2'),
    ('088', 'config', 'tarifa_plus_3_mas'),
    ('088', 'config', 'tarifa_plus_por_la_cancha'),
    -- 089 mis reservas
    ('089', 'function', 'public.listar_mis_reservas_plc')
),
checks as (
  select
    e.migracion,
    e.tipo,
    e.objeto,
    case e.tipo
      when 'function' then exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname || '.' || p.proname = e.objeto
      )
      when 'column' then exists (
        select 1 from information_schema.columns c
        where (c.table_schema || '.' || c.table_name || '.' || c.column_name) = e.objeto
      )
      when 'config' then exists (
        select 1 from public.config_plataforma cp where cp.clave = e.objeto
      )
      else false
    end as ok
  from expected e
)
select
  migracion,
  tipo,
  objeto,
  case when ok then 'OK' else 'FALTA' end as estado
from checks
order by migracion, tipo, objeto;

-- Tarifas Plus (solo si 088 está aplicada)
select clave, valor_num
from public.config_plataforma
where clave like 'tarifa_plus_%'
order by clave;

-- Modalidad competitivo permitida
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conname = 'desafios_modalidad_chk';
