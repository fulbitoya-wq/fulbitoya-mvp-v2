import { supabase } from "@/lib/supabase";
import type { PredioEstado } from "@/lib/canchas";

export function etiquetaEstadoPredio(estado: PredioEstado | string | null | undefined): string {
  if (estado === "borrador") return "Borrador";
  if (estado === "en_revision") return "En revisión";
  if (estado === "aprobado") return "Aprobado";
  if (estado === "suspendido") return "Suspendido";
  return "Borrador";
}

export function claseEstadoPredio(estado: PredioEstado | string | null | undefined): string {
  if (estado === "aprobado") return "bg-[#E8F5E9] text-[#2E7D32]";
  if (estado === "en_revision") return "bg-[#FFF8E1] text-[#F9A825]";
  if (estado === "suspendido") return "bg-[#FFEBEE] text-[#C62828]";
  return "bg-[#ECEFF1] text-[#546E7A]";
}

export async function fySoyAdmin(): Promise<boolean> {
  const { data } = await supabase.rpc("fy_soy_admin");
  const row = data as { ok?: boolean; admin?: boolean } | null;
  return Boolean(row?.admin);
}

export async function fyEnviarRevision(canchaId: string): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc("fy_enviar_revision", { p_cancha_id: canchaId });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) {
    if (row?.error === "faltan_datos") return { ok: false, error: "Faltan datos del responsable o del predio (dirección con pin)." };
    if (row?.error === "estado_invalido") return { ok: false, error: "Este predio ya no se puede mandar a revisión." };
    return { ok: false, error: "No se pudo enviar a revisión." };
  }
  return { ok: true, error: null };
}

export type AdminPredioRow = {
  id: string;
  nombre: string;
  estado: PredioEstado;
  barrio: string | null;
  direccion: string | null;
  responsable_nombre: string | null;
  responsable_email: string | null;
  responsable_telefono: string | null;
  owner_email: string | null;
  enviado_revision_at: string | null;
  revision_nota: string | null;
};

export async function fyAdminListarPredios(): Promise<{ ok: boolean; predios: AdminPredioRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("fy_admin_listar_predios");
  if (error) return { ok: false, predios: [], error: error.message };
  const row = data as { ok?: boolean; error?: string; predios?: AdminPredioRow[] } | null;
  if (!row?.ok) return { ok: false, predios: [], error: row?.error === "no_admin" ? "No tenés acceso de administrador." : "No se pudo cargar." };
  return { ok: true, predios: row.predios ?? [], error: null };
}

export async function fyAdminSetEstado(
  canchaId: string,
  estado: PredioEstado,
  nota?: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc("fy_admin_set_estado", {
    p_cancha_id: canchaId,
    p_estado: estado,
    p_nota: nota ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) return { ok: false, error: "No se pudo cambiar el estado." };
  return { ok: true, error: null };
}

export async function fyAdminInvitarPredio(
  nombre: string,
  email: string,
): Promise<{ ok: boolean; token: string | null; canchaId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("fy_admin_invitar_predio", {
    p_nombre: nombre,
    p_email: email,
  });
  if (error) return { ok: false, token: null, canchaId: null, error: error.message };
  const row = data as { ok?: boolean; error?: string; token?: string; cancha_id?: string } | null;
  if (!row?.ok || !row.token) {
    return { ok: false, token: null, canchaId: null, error: "No se pudo crear la invitación." };
  }
  return { ok: true, token: row.token, canchaId: row.cancha_id ?? null, error: null };
}
