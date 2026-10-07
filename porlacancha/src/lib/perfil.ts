import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { USERNAME_EN_USO } from "@shared/equipos";
import { usernameSchema } from "@shared/validation/equipos";

export const PUESTOS = ["Arquero", "Defensor", "Mediocampista", "Delantero"] as const;
export const PIERNAS = ["Derecha", "Izquierda", "Ambas"] as const;
export const FORMATOS = ["f5", "f7", "f9", "f11"] as const;
export const DISPONIBILIDADES = ["Entre semana", "Finde", "Ambos"] as const;

export type Puesto = (typeof PUESTOS)[number];
export type Pierna = (typeof PIERNAS)[number];
export type FormatoPref = (typeof FORMATOS)[number];
export type Disponibilidad = (typeof DISPONIBILIDADES)[number];

export type ModoJuego = "sin_cobrar" | "cobro_por_partido";

export const TARIFA_MIN = 1000;
export const TARIFA_MAX = 500000;

export type FootballProfile = {
  apellido: string;
  zona: string;
  bio: string;
  puestoPrincipal: string;
  puestoSecundario: string;
  pierna: string;
  formatos: string[];
  disponibilidad: string;
  fechaNacimiento: string | null;
  buscaEquipo: boolean;
  modoJuego: ModoJuego;
  tarifaPartido: number | null;
};

export const emptyFootball = (): FootballProfile => ({
  apellido: "",
  zona: "",
  bio: "",
  puestoPrincipal: "",
  puestoSecundario: "",
  pierna: "",
  formatos: [],
  disponibilidad: "",
  fechaNacimiento: null,
  buscaEquipo: false,
  modoJuego: "sin_cobrar",
  tarifaPartido: null,
});

const localKey = (userId: string) => `plc-football-profile:${userId}`;

function rowToFootball(row: Record<string, unknown> | null, local: FootballProfile): FootballProfile {
  if (!row) return local;
  const formatos = Array.isArray(row.formatos) ? row.formatos.map(String) : local.formatos;
  const nacimiento =
    row.fecha_nacimiento != null && String(row.fecha_nacimiento).trim()
      ? String(row.fecha_nacimiento).slice(0, 10)
      : local.fechaNacimiento;
  return {
    apellido: String(row.apellido ?? local.apellido),
    zona: String(row.zona ?? local.zona),
    bio: String(row.bio ?? local.bio),
    puestoPrincipal: String(row.puesto_principal ?? local.puestoPrincipal),
    puestoSecundario: String(row.puesto_secundario ?? local.puestoSecundario),
    pierna: String(row.pierna ?? local.pierna),
    formatos,
    disponibilidad: String(row.disponibilidad ?? local.disponibilidad),
    fechaNacimiento: nacimiento,
    buscaEquipo: Boolean(row.busca_equipo ?? local.buscaEquipo),
    modoJuego: row.modo_juego === "cobro_por_partido" ? "cobro_por_partido" : "sin_cobrar",
    tarifaPartido:
      row.tarifa_partido != null && Number.isFinite(Number(row.tarifa_partido))
        ? Number(row.tarifa_partido)
        : local.tarifaPartido,
  };
}

export async function loadFootballProfile(userId: string): Promise<FootballProfile> {
  let local = emptyFootball();
  try {
    const raw = await AsyncStorage.getItem(localKey(userId));
    if (raw) local = { ...emptyFootball(), ...(JSON.parse(raw) as FootballProfile) };
  } catch {
    /* ignore */
  }
  // Sin dni: el DNI nunca viaja a perfiles ni búsquedas (tampoco al perfil futbolero de UI).
  const { data, error } = await supabase
    .from("jugador_perfiles")
    .select(
      "apellido, zona, bio, puesto_principal, puesto_secundario, pierna, formatos, disponibilidad, fecha_nacimiento, busca_equipo, modo_juego, tarifa_partido"
    )
    .eq("usuario_id", userId)
    .maybeSingle();
  if (error || !data) return local;
  return rowToFootball(data as Record<string, unknown>, local);
}

function tableMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST202" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the function") ||
    msg.includes("could not find the table")
  );
}

export type PerfilSaveInput = {
  userId: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  username: string;
  previousUsername: string | null;
  avatarUrl: string | null;
  football: FootballProfile;
};

export async function savePlayerProfile(
  input: PerfilSaveInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fp = input.football;
  try {
    await AsyncStorage.setItem(localKey(input.userId), JSON.stringify(fp));
  } catch {
    /* ignore */
  }

  const nextUser = input.username.trim().toLowerCase();
  if (nextUser) {
    const parsed = usernameSchema.safeParse(nextUser);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Username inválido" };
    }
  }

  const fullName = `${input.nombre.trim()} ${input.apellido.trim()}`.trim();
  const nacimiento = fp.fechaNacimiento?.trim() || null;

  const rpc = await supabase.rpc("guardar_mi_perfil", {
    p_nombre: fullName || null,
    p_telefono: input.telefono,
    p_avatar_url: input.avatarUrl,
    p_username: nextUser || null,
    p_apellido: fp.apellido.trim() || null,
    p_zona: fp.zona.trim() || null,
    p_bio: fp.bio.trim().slice(0, 160) || null,
    p_puesto_principal: fp.puestoPrincipal || null,
    p_puesto_secundario: fp.puestoSecundario || null,
    p_pierna: fp.pierna || null,
    p_formatos: fp.formatos,
    p_disponibilidad: fp.disponibilidad || null,
    p_fecha_nacimiento: nacimiento,
    p_busca_equipo: fp.buscaEquipo,
    p_modo_juego: fp.modoJuego,
    p_tarifa_partido: fp.modoJuego === "cobro_por_partido" ? fp.tarifaPartido : null,
  });

  if (!rpc.error) {
    const payload = rpc.data as { ok?: boolean; error?: string } | null;
    if (payload && payload.ok === false) {
      if (payload.error === "tarifa_invalida") {
        return { ok: false, error: "La tarifa tiene que estar entre $1.000 y $500.000." };
      }
      return { ok: false, error: payload.error || "No pudimos guardar tu perfil." };
    }
    return { ok: true };
  }
  if (!tableMissing(rpc.error)) {
    if ((rpc.error.message ?? "").includes("usuarios_username_format") || rpc.error.code === "23514") {
      return { ok: false, error: "Username inválido. Usá 3 a 20 caracteres: letras, números y guion bajo." };
    }
    if (rpc.error.code === "23505") return { ok: false, error: USERNAME_EN_USO };
    if ((rpc.error.message ?? "").includes("not_authenticated")) {
      return { ok: false, error: "Cerrá sesión e ingresá de nuevo para guardar." };
    }
  }

  const patch: Record<string, unknown> = {
    nombre: fullName || null,
    telefono: input.telefono,
    avatar_url: input.avatarUrl,
  };
  if (nextUser && nextUser !== (input.previousUsername ?? "")) {
    patch.username = nextUser;
  }

  const { data, error } = await supabase
    .from("usuarios")
    .update(patch)
    .eq("id", input.userId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { ok: false, error: USERNAME_EN_USO };
    if (error.code === "23514") {
      return { ok: false, error: "Username inválido. Usá 3 a 20 caracteres: letras, números y guion bajo." };
    }
    return { ok: false, error: error.message || "No pudimos guardar tu cuenta." };
  }
  if (!data?.id) {
    return { ok: false, error: "No se pudo guardar. Cerrá sesión e ingresá de nuevo." };
  }

  const { error: fpErr } = await supabase.from("jugador_perfiles").upsert(
    {
      usuario_id: input.userId,
      apellido: fp.apellido.trim() || null,
      zona: fp.zona.trim() || null,
      bio: fp.bio.trim().slice(0, 160) || null,
      puesto_principal: fp.puestoPrincipal || null,
      puesto_secundario: fp.puestoSecundario || null,
      pierna: fp.pierna || null,
      formatos: fp.formatos,
      disponibilidad: fp.disponibilidad || null,
      fecha_nacimiento: nacimiento,
      busca_equipo: fp.buscaEquipo,
      modo_juego: fp.modoJuego,
      tarifa_partido: fp.modoJuego === "cobro_por_partido" ? fp.tarifaPartido : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "usuario_id" }
  );

  if (fpErr && !tableMissing(fpErr)) {
    return { ok: false, error: fpErr.message || "Guardamos la cuenta, pero no el perfil futbolero." };
  }
  return { ok: true };
}

export async function setBuscaEquipo(activo: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("set_busca_equipo", { p_activo: activo });
  if (error) return { ok: false, error: error.message };
  if (data && typeof data === "object" && (data as { ok?: boolean }).ok === false) {
    return { ok: false, error: String((data as { error?: string }).error ?? "No se pudo guardar") };
  }
  return { ok: true };
}

export function parseTarifaInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export function formatTarifa(n: number): string {
  return `$${n.toLocaleString("es-AR")}`;
}

export function labelModoJuego(modo: ModoJuego): string {
  return modo === "cobro_por_partido" ? "Cobro por partido" : "Juego sin cobrar";
}

export function splitNombre(full: string | null): { nombre: string; apellido: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nombre: "", apellido: "" };
  if (parts.length === 1) return { nombre: parts[0], apellido: "" };
  return { nombre: parts[0], apellido: parts.slice(1).join(" ") };
}

export function displayName(nombre: string | null, apellido: string): string {
  return `${nombre ?? ""} ${apellido}`.trim() || "Jugador";
}

export function iniciales(nombre: string | null, apellido: string): string {
  const a = (nombre ?? "").trim().charAt(0);
  const b = apellido.trim().charAt(0);
  const s = `${a}${b}`.toUpperCase();
  return s || "?";
}

export function edadDesde(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export function miembroDesde(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const y = new Date(iso).getFullYear();
  if (!Number.isFinite(y)) return null;
  return `Miembro desde ${y}`;
}

export function formatosLabel(formatos: string[]): string {
  if (!formatos.length) return "—";
  return formatos.map((f) => f.replace(/^f/i, "F").toUpperCase()).join(" · ");
}

export async function usernameDisponible(
  userId: string,
  username: string
): Promise<{ ok: true; disponible: boolean } | { ok: false; error: string }> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Username inválido" };
  const { data, error } = await supabase
    .from("usuarios")
    .select("id")
    .eq("username", parsed.data)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data?.id && data.id !== userId) return { ok: true, disponible: false };
  return { ok: true, disponible: true };
}

export { USERNAME_EN_USO };
