import { supabase } from "@/lib/supabase";
import { regenerarTurnosPredio } from "@/lib/turnos";
import { DIAS_APERTURA } from "@/lib/horarios-apertura";

export type TurnoFijo = {
  id: string;
  cancha_id: string;
  campo_id: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  dia_semana: string;
  hora_inicio: string;
  hora_fin: string;
  fecha_desde: string;
  fecha_hasta: string | null;
  precio: number;
  activo: boolean;
};

export const DIAS_FIJO = DIAS_APERTURA;

export async function listarTurnosFijos(canchaId: string): Promise<TurnoFijo[]> {
  const { data, error } = await supabase
    .from("turno_fijos")
    .select("*")
    .eq("cancha_id", canchaId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    cancha_id: r.cancha_id as string,
    campo_id: r.campo_id as string,
    cliente_nombre: r.cliente_nombre as string,
    cliente_telefono: (r.cliente_telefono as string) ?? null,
    dia_semana: r.dia_semana as string,
    hora_inicio: String(r.hora_inicio).slice(0, 5),
    hora_fin: String(r.hora_fin).slice(0, 5),
    fecha_desde: String(r.fecha_desde).slice(0, 10),
    fecha_hasta: r.fecha_hasta ? String(r.fecha_hasta).slice(0, 10) : null,
    precio: Number(r.precio),
    activo: Boolean(r.activo),
  }));
}

export async function crearTurnoFijo(input: {
  cancha_id: string;
  campo_id: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  dia_semana: string;
  hora_inicio: string;
  hora_fin: string;
  fecha_desde: string;
  fecha_hasta: string | null;
  precio: number;
}) {
  const { error } = await supabase.from("turno_fijos").insert({ ...input, activo: true });
  if (error) return { ok: false, error: error.message };
  const gen = await regenerarTurnosPredio(input.cancha_id);
  if (!gen.ok) return { ok: false, error: gen.error };
  return { ok: true, error: null };
}

export async function fyLiberarFechaFijo(disponibilidadId: string) {
  const { data, error } = await supabase.rpc("fy_liberar_fecha_fijo", { p_disponibilidad_id: disponibilidadId });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean } | null;
  if (!row?.ok) return { ok: false, error: "No se pudo liberar esa fecha." };
  return { ok: true, error: null };
}

export async function fyBajaTurnoFijo(id: string) {
  const { data, error } = await supabase.rpc("fy_baja_turno_fijo", { p_turno_fijo_id: id });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean } | null;
  if (!row?.ok) return { ok: false, error: "No se pudo dar de baja." };
  return { ok: true, error: null };
}

export type CobroFijo = {
  fecha: string;
  hora: string;
  cobrado: boolean;
  medio: string | null;
  reserva_id: string | null;
};

export async function cobrosDeFijo(turnoFijoId: string): Promise<CobroFijo[]> {
  const { data, error } = await supabase
    .from("reservas")
    .select("id, cobrado_predio_at, cobrado_predio_medio, estado_reserva, condiciones")
    .contains("condiciones", { turno_fijo_id: turnoFijoId })
    .eq("estado_reserva", "reservada")
    .order("created_at");
  if (error) return [];
  return (data ?? []).map((row) => {
    const c = (row.condiciones ?? {}) as Record<string, unknown>;
    return {
      fecha: String(c.fecha ?? "").slice(0, 10),
      hora: String(c.hora_inicio ?? "").slice(0, 5),
      cobrado: Boolean(row.cobrado_predio_at),
      medio: (row.cobrado_predio_medio as string) ?? null,
      reserva_id: row.id as string,
    };
  });
}
