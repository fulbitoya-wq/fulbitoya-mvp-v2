import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PlcModalidad, PlcReglaEmpate } from "./plc";

const KEY = "plc_reserva_draft_v1";

export type ReservaBusca = "sueltos" | "equipo" | "ambos";

export type ReservaDraft = {
  kind: "simple" | "plus";
  canchaId?: string;
  turnoId?: string;
  tipoCobro?: "sena" | "total";
  acepto?: boolean;
  /** Si viene de una reserva simple ya pagada (Pasar a Plus). */
  fromReservaId?: string;
  modalidad?: PlcModalidad;
  equipoId?: string;
  convocados?: string[];
  libres?: number;
  busca?: ReservaBusca;
  reglaEmpate?: PlcReglaEmpate;
  updatedAt?: string;
};

export async function saveReservaDraft(draft: ReservaDraft): Promise<void> {
  const next: ReservaDraft = { ...draft, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function peekReservaDraft(): Promise<ReservaDraft | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReservaDraft;
  } catch {
    return null;
  }
}

export async function clearReservaDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export async function patchReservaDraft(patch: Partial<ReservaDraft>): Promise<ReservaDraft> {
  const prev = (await peekReservaDraft()) ?? { kind: "plus" as const };
  const next: ReservaDraft = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
