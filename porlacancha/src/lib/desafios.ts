import { supabase } from "./supabase";

export type Desafio = {
  id: string;
  titulo: string;
  tipo: string;
  premio: number;
  direccion: string;
  lat: number;
  lng: number;
  fecha: string;
  hora_inicio: string;
  duracion_min: number;
  descripcion: string | null;
  estado: string;
  cancha_id: string | null;
  barrio: string | null;
  predio_nombre?: string | null;
  modalidad?: string | null;
  precio_cancha?: number | null;
  tarifa_servicio?: number | null;
  inscritos: { id: string; nombre: string; escudo_url: string | null }[];
  cupos: number;
  inscripcionId?: string | null;
};

export function minimoConvocados(tipo: string): number {
  const t = tipo.toLowerCase();
  if (t === "f11") return 11;
  if (t === "f9") return 9;
  if (t === "f7") return 7;
  return 5;
}

export type OrigenDesafio = "predio" | "jugador";

export function origenDe(d: Pick<Desafio, "cancha_id">): OrigenDesafio {
  return d.cancha_id ? "predio" : "jugador";
}

export function etiquetaOrigen(origen: OrigenDesafio): string {
  return origen === "predio" ? "Lo publica el predio" : "Lo arman jugadores";
}

export const CUPOS_DESAFIO = 2;

export async function getDesafiosPublicos(): Promise<{
  data: Desafio[];
  error: string | null;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("desafios")
    .select(
      "id, titulo, tipo, premio, direccion, barrio, lat, lng, fecha, hora_inicio, duracion_min, descripcion, estado, cancha_id, modalidad, precio_cancha, tarifa_servicio"
    )
    .in("estado", ["abierto", "completo"])
    .gte("fecha", today)
    .order("fecha", { ascending: true });

  if (error) return { data: [], error: error.message };

  const rows = (data ?? []) as Omit<Desafio, "inscritos" | "cupos">[];
  const ids = rows.map((d) => d.id);
  const inscritosByDesafio = new Map<string, { id: string; nombre: string; escudo_url: string | null }[]>();

  if (ids.length > 0) {
    const { data: ins } = await supabase
      .from("desafio_inscripciones")
      .select("desafio_id, equipo_id, estado, equipos(id, nombre, escudo_url)")
      .in("desafio_id", ids)
      .in("estado", ["confirmada", "pendiente_pago"]);

    for (const row of ins ?? []) {
      const r = row as {
        desafio_id: string;
        estado: string;
        equipos: { id: string; nombre: string; escudo_url: string | null } | { id: string; nombre: string; escudo_url: string | null }[] | null;
      };
      const eq = Array.isArray(r.equipos) ? r.equipos[0] : r.equipos;
      if (!eq) continue;
      const list = inscritosByDesafio.get(r.desafio_id) ?? [];
      list.push({ id: eq.id, nombre: eq.nombre, escudo_url: eq.escudo_url ?? null });
      inscritosByDesafio.set(r.desafio_id, list);
    }
  }

  return {
    data: rows.map((d) => ({
      ...d,
      cupos: CUPOS_DESAFIO,
      inscritos: inscritosByDesafio.get(d.id) ?? [],
    })),
    error: null,
  };
}

export function formatPremio(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPremioArriba(value: number): string {
  return `${formatPremio(value)} arriba`;
}

export function esSoloCancha(premio: number): boolean {
  return Number(premio) <= 0;
}

export function etiquetaModalidad(premio: number, modalidad?: string | null): string {
  if (modalidad === "amistoso") return "Amistoso";
  if (modalidad === "competitivo") return "Competitivo";
  return esSoloCancha(premio) ? "Solo por la cancha" : "Por la cancha";
}

/** Normalize DB values (`5` / `f5`) to `f5`…`f11`. */
export function normalizarTipo(tipo: string | null | undefined): string {
  const raw = (tipo ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (/^f(5|7|9|11)$/.test(raw)) return raw;
  if (/^(5|7|9|11)$/.test(raw)) return `f${raw}`;
  return raw;
}

export function etiquetaTipo(tipo: string): string {
  const n = normalizarTipo(tipo);
  if (n === "f5") return "Fútbol 5";
  if (n === "f7") return "Fútbol 7";
  if (n === "f9") return "Fútbol 9";
  if (n === "f11") return "Fútbol 11";
  if (!tipo) return "";
  return tipo.replace(/^f/i, "F").toUpperCase();
}

export function etiquetaTipoCorta(tipo: string): string {
  const n = normalizarTipo(tipo);
  if (n.startsWith("f") && n.length > 1) return `F${n.slice(1).toUpperCase()}`;
  return etiquetaTipo(tipo);
}

export function etiquetaSuperficie(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (valor === "cesped_sintetico") return "Sintético";
  if (valor === "cesped_natural") return "Natural";
  if (valor === "tierra") return "Tierra";
  if (valor === "cemento") return "Cemento";
  if (valor === "salon") return "Salón";
  return valor.replace(/_/g, " ");
}

export function etiquetaEstado(estado: string): string {
  if (estado === "abierto") return "Abierto";
  if (estado === "completo") return "Completo";
  if (estado === "cancelado") return "Cancelado";
  if (estado === "finalizado") return "Finalizado";
  return estado;
}

export function chipToneEstado(estado: string): "open" | "complete" | "cancelled" | "pending" {
  if (estado === "abierto") return "open";
  if (estado === "completo") return "complete";
  if (estado === "cancelado") return "cancelled";
  return "pending";
}

export function formatFechaCorta(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isNaN(dt.getTime())) return isoDate;
  const weekday = dt.toLocaleDateString("es-AR", { weekday: "long" });
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  return `${weekday} ${day}/${month}`;
}

export function formatHora(hora: string): string {
  return hora.slice(0, 5);
}

export function esHoy(isoDate: string): boolean {
  return isoDate === localIsoDate(0);
}

export function esManana(isoDate: string): boolean {
  return isoDate === localIsoDate(1);
}

export function esFinde(isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-").map(Number);
  const day = new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
  return day === 0 || day === 6;
}

function localIsoDate(offsetDays: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDiaSemana(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("es-AR", { weekday: "long" }).replaceAll(".", "").toUpperCase();
}

export function formatPremioCorto(value: number): string {
  if (value >= 1000) return `$${Math.round(value / 1000)}K`;
  return formatPremio(value);
}

export async function getDesafioPorId(id: string): Promise<Desafio | null> {
  const { data, error } = await getDesafiosPublicos();
  if (error) return null;
  const found = data.find((d) => d.id === id);
  if (found) return found;
  const { data: row } = await supabase
    .from("desafios")
    .select(
      "id, titulo, tipo, premio, direccion, barrio, lat, lng, fecha, hora_inicio, duracion_min, descripcion, estado, cancha_id, modalidad, precio_cancha, tarifa_servicio"
    )
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;
  return { ...(row as Omit<Desafio, "inscritos" | "cupos">), inscritos: [], cupos: CUPOS_DESAFIO };
}

export function etiquetaEmpiezaEn(fecha: string, hora: string): string | null {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0).getTime();
  const diff = start - Date.now();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours >= 48) return `Empieza en ${Math.floor(hours / 24)} días`;
  if (hours >= 1) return `Empieza en ${hours} h ${mins} min`;
  return `Empieza en ${mins} min`;
}
