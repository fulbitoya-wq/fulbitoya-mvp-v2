import AsyncStorage from "@react-native-async-storage/async-storage";
import type { JugateLaProfile } from "../auth/AuthProvider";

const KEY = "plc_pending_action";
const LEGACY_JOIN = "porlacancha_pending_join_token";

export type PendingAction =
  | { kind: "join_token"; token: string }
  | { kind: "claim_reserva"; token: string }
  | { kind: "create_team" }
  | { kind: "open_inbox" }
  | { kind: "accept_invite"; solicitudId: string }
  | { kind: "inscribir"; desafioId: string }
  | { kind: "favorite"; jugadorId: string }
  | {
      kind: "reservar";
      canchaId?: string;
      turnoId?: string;
      tipoCobro?: "sena" | "total";
      acepto?: boolean;
    }
  | { kind: "crear_partido" }
  | {
      kind: "reserva_plus";
      canchaId?: string;
      turnoId?: string;
      fromReservaId?: string;
    }
  | { kind: "lista_reserva"; reservaId: string }
  | { kind: "open_desafio"; desafioId: string }
  | { kind: "open_predio"; slug: string };

export function profileNeedsUsername(_profile: JugateLaProfile | null): boolean {
  return false;
}

export function profileNeedsPhone(profile: JugateLaProfile | null): boolean {
  return !profile?.telefono?.trim();
}

export function profileNeedsBirthdate(profile: JugateLaProfile | null): boolean {
  return !profile?.fecha_nacimiento?.trim();
}

export function profileNeedsIdentidadDesafio(profile: JugateLaProfile | null): boolean {
  return profileNeedsBirthdate(profile) || !profile?.tiene_dni;
}

export function profileReadyForActions(profile: JugateLaProfile | null): boolean {
  return (
    !profileNeedsUsername(profile) &&
    !profileNeedsPhone(profile) &&
    !profileNeedsBirthdate(profile)
  );
}

export async function setPendingAction(action: PendingAction): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(action));
  if (action.kind === "join_token") {
    await AsyncStorage.setItem(LEGACY_JOIN, action.token);
  }
}

export async function peekPendingAction(): Promise<PendingAction | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as PendingAction;
    } catch {
      /* ignore */
    }
  }
  const token = await AsyncStorage.getItem(LEGACY_JOIN);
  if (token) return { kind: "join_token", token };
  return null;
}

export async function clearPendingAction(): Promise<void> {
  await AsyncStorage.multiRemove([KEY, LEGACY_JOIN]);
}
