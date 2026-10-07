import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";
import { mensajeErrorEquipo, rpcDetallePredio, rpcPredioPublico } from "@shared/equipos";
import { normalizarTipo } from "./desafios";
import { supabase } from "./supabase";

const FAV_KEY = "plc_predio_favs";

export type PredioHorarioDia = {
  abierto: boolean;
  desde: string;
  hasta: string;
};

export type PredioCampo = {
  id: string;
  nombre: string;
  tipo: string;
  superficie: string | null;
  techada: boolean;
  luz: boolean;
  precio_desde: number | null;
  foto_url: string | null;
};

export type PredioTurno = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  precio: number | null;
  estado: string;
  campo_id: string;
  campo_nombre: string;
  campo_tipo: string;
  campo_superficie: string | null;
  campo_techada: boolean;
  campo_luz: boolean;
};

export type PredioDetalle = {
  id: string;
  nombre: string;
  slug: string | null;
  barrio: string | null;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  logo_url: string | null;
  fotos: string[];
  whatsapp: string | null;
  estacionamiento: boolean;
  buffet: boolean;
  vestuarios: boolean;
  parrilla: boolean;
  horarios_apertura: Record<string, PredioHorarioDia>;
  campos: PredioCampo[];
  turnos: PredioTurno[];
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown) {
  return v === true || v === "true";
}

function fotosFrom(raw: unknown, logo: string | null): string[] {
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const u = str(x).trim();
      if (u) out.push(u);
    }
  }
  if (out.length === 0 && logo) out.push(logo);
  return out;
}

function mapDetalle(res: Record<string, unknown>): PredioDetalle {
  const logo = res.logo_url == null || str(res.logo_url) === "" ? null : str(res.logo_url);
  const horariosRaw =
    res.horarios_apertura && typeof res.horarios_apertura === "object"
      ? (res.horarios_apertura as Record<string, unknown>)
      : {};
  const horarios: Record<string, PredioHorarioDia> = {};
  for (const [k, v] of Object.entries(horariosRaw)) {
    if (!v || typeof v !== "object") continue;
    const d = v as Record<string, unknown>;
    horarios[k] = {
      abierto: bool(d.abierto),
      desde: str(d.desde).slice(0, 5) || "08:00",
      hasta: str(d.hasta).slice(0, 5) || "23:00",
    };
  }

  const camposRaw = Array.isArray(res.campos) ? res.campos : [];
  const turnosRaw = Array.isArray(res.turnos) ? res.turnos : [];

  return {
    id: str(res.id),
    nombre: str(res.nombre),
    slug: res.slug == null || str(res.slug) === "" ? null : str(res.slug),
    barrio: res.barrio == null || str(res.barrio) === "" ? null : str(res.barrio),
    direccion: res.direccion == null || str(res.direccion) === "" ? null : str(res.direccion),
    lat: num(res.lat),
    lng: num(res.lng),
    logo_url: logo,
    fotos: fotosFrom(res.fotos, logo),
    whatsapp: res.whatsapp == null || str(res.whatsapp) === "" ? null : str(res.whatsapp),
    estacionamiento: bool(res.estacionamiento),
    buffet: bool(res.buffet),
    vestuarios: bool(res.vestuarios),
    parrilla: bool(res.parrilla),
    horarios_apertura: horarios,
    campos: camposRaw.map((c) => {
      const row = c as Record<string, unknown>;
      return {
        id: str(row.id),
        nombre: str(row.nombre),
        tipo: str(row.tipo),
        superficie: row.superficie == null ? null : str(row.superficie),
        techada: bool(row.techada),
        luz: bool(row.luz),
        precio_desde: num(row.precio_desde),
        foto_url: row.foto_url == null ? null : str(row.foto_url),
      };
    }),
    turnos: turnosRaw.map((t) => {
      const row = t as Record<string, unknown>;
      return {
        id: str(row.id),
        fecha: str(row.fecha),
        hora_inicio: str(row.hora_inicio),
        hora_fin: row.hora_fin == null ? null : str(row.hora_fin),
        precio: num(row.precio),
        estado: str(row.estado || "disponible"),
        campo_id: str(row.campo_id),
        campo_nombre: str(row.campo_nombre),
        campo_tipo: str(row.campo_tipo),
        campo_superficie: row.campo_superficie == null ? null : str(row.campo_superficie),
        campo_techada: bool(row.campo_techada),
        campo_luz: bool(row.campo_luz),
      };
    }),
  };
}

export async function loadPredioDetalle(canchaId: string) {
  const res = await rpcDetallePredio(supabase, canchaId);
  if (!res.ok) return { ok: false as const, error: mensajeErrorEquipo(res.error) };
  return { ok: true as const, data: mapDetalle(res) };
}

export async function loadPredioDetalleBySlug(slug: string) {
  const res = await rpcPredioPublico(supabase, slug);
  if (!res.ok) return { ok: false as const, error: mensajeErrorEquipo(res.error) };
  return { ok: true as const, data: mapDetalle(res) };
}

const DOW_KEYS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;

export function estadoAperturaAhora(horarios: Record<string, PredioHorarioDia>): string {
  const now = new Date();
  // Argentina approximation: use local if already AR, else format with offset -3 via toLocale
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value?.toLowerCase() ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const hhmm = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;

  const keyMap: Record<string, string> = {
    sun: "dom",
    mon: "lun",
    tue: "mar",
    wed: "mie",
    thu: "jue",
    fri: "vie",
    sat: "sab",
  };
  const key = keyMap[wd.slice(0, 3)] ?? DOW_KEYS[now.getDay()];
  const dia = horarios[key];
  if (!dia || !dia.abierto) return "Cerrado ahora";
  if (hhmm >= dia.desde && hhmm < dia.hasta) {
    return `Abierto ahora · cierra a las ${dia.hasta}`;
  }
  if (hhmm < dia.desde) return `Abre a las ${dia.desde}`;
  return "Cerrado ahora";
}

export function etiquetaDiaCorto(fecha: string, hoy: string, manana: string): string {
  if (fecha === hoy) return "Hoy";
  if (fecha === manana) return "Mañana";
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${dias[dt.getUTCDay()]} ${d}`;
}

export function fechasProximos(dias = 14): string[] {
  const out: string[] = [];
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const base = new Date();
  for (let i = 0; i < dias; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    out.push(fmt.format(d));
  }
  return out;
}

export function chipFormato(campo: PredioCampo): string {
  const n = normalizarTipo(campo.tipo);
  if (n === "f5") return "F5";
  if (n === "f7") return "F7";
  if (n === "f9") return "F9";
  if (n === "f11") return "F11";
  return campo.nombre || "Cancha";
}

export async function abrirComoLlegar(lat: number | null, lng: number | null, direccion: string | null) {
  if (lat != null && lng != null) {
    const q = `${lat},${lng}`;
    const url =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?daddr=${q}`
        : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    await Linking.openURL(url);
    return;
  }
  if (direccion) {
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`);
  }
}

export async function abrirWhatsappPredio(whatsapp: string) {
  const digits = whatsapp.replace(/\D/g, "");
  if (!digits) return;
  await Linking.openURL(`https://wa.me/${digits}`);
}

export async function listFavoritosPredio(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export async function toggleFavoritoPredio(canchaId: string): Promise<boolean> {
  const cur = await listFavoritosPredio();
  const on = cur.includes(canchaId);
  const next = on ? cur.filter((x) => x !== canchaId) : [...cur, canchaId];
  await AsyncStorage.setItem(FAV_KEY, JSON.stringify(next));
  return !on;
}
