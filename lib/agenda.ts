import { supabase } from "@/lib/supabase";

export type AgendaVisual = "libre" | "app" | "manual" | "pago" | "bloqueado" | "abierto" | "fijo";

export type AgendaReserva = {
  id: string;
  titular_nombre: string | null;
  titular_telefono: string | null;
  canal: string | null;
  cobro_externo: string | null;
  estado_pago: string | null;
  tipo_cobro: string | null;
  monto_total: number | null;
  monto_sena: number | null;
  busca_gente: boolean;
  cobrado_predio_at: string | null;
  cobrado_predio_medio: string | null;
};

export type AgendaEnlace = {
  token: string;
  titular_nombre: string;
  titular_telefono: string;
  monto_sena: number;
  mensaje: string;
};

export type AgendaTurno = {
  id: string;
  campo_id: string;
  campo_nombre: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  precio: number;
  estado: string;
  origen: string;
  turno_fijo_id: string | null;
  visual: AgendaVisual;
  hold_expira: string | null;
  reserva: AgendaReserva | null;
  enlaces: AgendaEnlace[];
  lista: { nombre: string; usuario_id: string | null }[];
  pagos_lista: { usuario_id: string | null; monto: number; estado_pago: string }[];
};

export type AgendaCampo = { id: string; nombre: string; duracion_min: number | null };

function str(v: unknown) {
  return v == null ? "" : String(v);
}
function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function cargarAgendaPredio(
  canchaId: string,
  desde: string,
  hasta: string,
): Promise<{ ok: boolean; campos: AgendaCampo[]; turnos: AgendaTurno[]; error: string | null }> {
  const { data, error } = await supabase.rpc("fy_agenda_predio", {
    p_cancha_id: canchaId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) return { ok: false, campos: [], turnos: [], error: error.message };
  const row = data as { ok?: boolean; error?: string; campos?: unknown[]; turnos?: unknown[] } | null;
  if (!row?.ok) return { ok: false, campos: [], turnos: [], error: "No se pudo cargar la agenda." };

  const campos: AgendaCampo[] = (row.campos ?? []).map((c) => {
    const o = c as Record<string, unknown>;
    return { id: str(o.id), nombre: str(o.nombre), duracion_min: o.duracion_min == null ? null : num(o.duracion_min) };
  });

  const turnos: AgendaTurno[] = (row.turnos ?? []).map((t) => {
    const o = t as Record<string, unknown>;
    const r = o.reserva as Record<string, unknown> | null;
    const enlaces = Array.isArray(o.enlaces) ? o.enlaces : [];
    const lista = Array.isArray(o.lista) ? o.lista : [];
    const pagos = Array.isArray(o.pagos_lista) ? o.pagos_lista : [];
    return {
      id: str(o.id),
      campo_id: str(o.campo_id),
      campo_nombre: str(o.campo_nombre),
      fecha: str(o.fecha).slice(0, 10),
      hora_inicio: str(o.hora_inicio).slice(0, 5),
      hora_fin: str(o.hora_fin).slice(0, 5),
      precio: num(o.precio),
      estado: str(o.estado),
      origen: str(o.origen),
      turno_fijo_id: o.turno_fijo_id ? str(o.turno_fijo_id) : null,
      visual: (str(o.visual) || "libre") as AgendaVisual,
      hold_expira: o.hold_expira ? str(o.hold_expira) : null,
      reserva: r
        ? {
            id: str(r.id),
            titular_nombre: r.titular_nombre ? str(r.titular_nombre) : null,
            titular_telefono: r.titular_telefono ? str(r.titular_telefono) : null,
            canal: r.canal ? str(r.canal) : null,
            cobro_externo: r.cobro_externo ? str(r.cobro_externo) : null,
            estado_pago: r.estado_pago ? str(r.estado_pago) : null,
            tipo_cobro: r.tipo_cobro ? str(r.tipo_cobro) : null,
            monto_total: r.monto_total == null ? null : num(r.monto_total),
            monto_sena: r.monto_sena == null ? null : num(r.monto_sena),
            busca_gente: Boolean(r.busca_gente),
            cobrado_predio_at: r.cobrado_predio_at ? str(r.cobrado_predio_at) : null,
            cobrado_predio_medio: r.cobrado_predio_medio ? str(r.cobrado_predio_medio) : null,
          }
        : null,
      enlaces: enlaces.map((e) => {
        const x = e as Record<string, unknown>;
        return {
          token: str(x.token),
          titular_nombre: str(x.titular_nombre),
          titular_telefono: str(x.titular_telefono),
          monto_sena: num(x.monto_sena),
          mensaje: str(x.mensaje),
        };
      }),
      lista: lista.map((l) => {
        const x = l as Record<string, unknown>;
        return { nombre: str(x.nombre), usuario_id: x.usuario_id ? str(x.usuario_id) : null };
      }),
      pagos_lista: pagos.map((p) => {
        const x = p as Record<string, unknown>;
        return { usuario_id: x.usuario_id ? str(x.usuario_id) : null, monto: num(x.monto), estado_pago: str(x.estado_pago) };
      }),
    };
  });

  return { ok: true, campos, turnos, error: null };
}

export async function fyMarcarCobrado(reservaId: string, medio: "efectivo" | "transferencia") {
  const { data, error } = await supabase.rpc("fy_marcar_cobrado", { p_reserva_id: reservaId, p_medio: medio });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) return { ok: false, error: "No se pudo marcar el cobro." };
  return { ok: true, error: null };
}

export function hoyArgentina(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysISO(iso, diff);
}

export function etiquetaVisual(v: AgendaVisual): string {
  if (v === "app") return "App";
  if (v === "manual") return "A mano";
  if (v === "pago") return "Pago";
  if (v === "bloqueado") return "Bloqueado";
  if (v === "abierto") return "Abierto";
  if (v === "fijo") return "Fijo";
  return "Libre";
}

export function claseVisual(v: AgendaVisual): string {
  if (v === "app") return "bg-[#1A2E4A] text-white border-[#1A2E4A]";
  if (v === "manual") return "bg-[#2C4A72] text-white border-[#2C4A72]";
  if (v === "pago") return "bg-[#FFC107] text-[#1A2E4A] border-[#FFC107]";
  if (v === "bloqueado") return "bg-[#ECEFF1] text-[#607D8B] border-[#CFD8DC]";
  if (v === "abierto") return "bg-[#E8F5E9] text-[#1B5E20] border-[#4CAF50]";
  if (v === "fijo") return "bg-[#90A4AE] text-white border-[#90A4AE]";
  return "bg-white text-[#1A2E4A] border-[#C8E6C9]";
}
