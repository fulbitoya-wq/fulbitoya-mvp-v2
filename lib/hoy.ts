import { supabase } from "@/lib/supabase";
import type { AgendaReserva } from "@/lib/agenda";

export type HoyAlerta = {
  tipo: "app" | "cancelacion" | "abierto" | "disputa" | string;
  titulo: string;
  detalle: string;
  hora: string | null;
  disponibilidad_id: string | null;
};

export type HoyResumen = {
  fecha: string;
  total_turnos: number;
  ocupados: number;
  ocupacion_pct: number;
  a_cobrar: number;
  alertas: HoyAlerta[];
};

function str(v: unknown) {
  return v == null ? "" : String(v);
}
function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function cargarHoyPredio(canchaId: string): Promise<{ ok: boolean; data: HoyResumen | null; error: string | null }> {
  const { data, error } = await supabase.rpc("fy_hoy_predio", { p_cancha_id: canchaId });
  if (error) return { ok: false, data: null, error: error.message };
  const row = data as ({ ok?: boolean; error?: string } & Record<string, unknown>) | null;
  if (!row?.ok) return { ok: false, data: null, error: "No se pudo cargar el día." };
  const raw = Array.isArray(row.alertas) ? row.alertas : [];
  return {
    ok: true,
    error: null,
    data: {
      fecha: str(row.fecha).slice(0, 10),
      total_turnos: num(row.total_turnos),
      ocupados: num(row.ocupados),
      ocupacion_pct: num(row.ocupacion_pct),
      a_cobrar: num(row.a_cobrar),
      alertas: raw.map((a) => {
        const o = a as Record<string, unknown>;
        return {
          tipo: str(o.tipo),
          titulo: str(o.titulo),
          detalle: str(o.detalle),
          hora: o.hora ? str(o.hora) : null,
          disponibilidad_id: o.disponibilidad_id ? str(o.disponibilidad_id) : null,
        };
      }),
    },
  };
}

export function faltaCobroPredio(r: AgendaReserva | null, precio: number): number {
  if (!r) return 0;
  const pagadoApp = r.estado_pago === "pagado" ? Number(r.tipo_cobro === "total" ? r.monto_total : r.monto_sena) : 0;
  const total = Number(r.monto_total ?? precio);
  if (r.cobrado_predio_at) return 0;
  return Math.max(0, total - pagadoApp);
}
