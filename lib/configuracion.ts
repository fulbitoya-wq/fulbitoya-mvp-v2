import { supabase } from "@/lib/supabase";

export type PanelRol = { owner: boolean; encargado: boolean };

export async function fyPanelRol(): Promise<PanelRol> {
  const { data } = await supabase.rpc("fy_panel_rol");
  const row = data as { ok?: boolean; owner?: boolean; encargado?: boolean } | null;
  return { owner: Boolean(row?.owner), encargado: Boolean(row?.encargado) };
}

export type EncargadoRow = {
  id: string;
  email: string;
  estado: string;
  token: string;
  usuario_id: string | null;
};

export async function listarEncargados(canchaId: string): Promise<EncargadoRow[]> {
  const { data, error } = await supabase.rpc("fy_listar_encargados", { p_cancha_id: canchaId });
  if (error) return [];
  const row = data as { ok?: boolean; encargados?: EncargadoRow[] } | null;
  return row?.ok ? (row.encargados ?? []) : [];
}

export async function invitarEncargado(canchaId: string, email: string) {
  const { data, error } = await supabase.rpc("fy_invitar_encargado", { p_cancha_id: canchaId, p_email: email });
  if (error) return { ok: false as const, token: null as string | null, error: error.message };
  const row = data as { ok?: boolean; token?: string; error?: string } | null;
  if (!row?.ok) return { ok: false as const, token: null, error: "No se pudo invitar." };
  return { ok: true as const, token: row.token ?? null, error: null };
}

export async function revocarEncargado(id: string) {
  const { data, error } = await supabase.rpc("fy_revocar_encargado", { p_id: id });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean } | null;
  return row?.ok ? { ok: true, error: null } : { ok: false, error: "No se pudo revocar." };
}

export async function slugDeCancha(canchaId: string) {
  const { data, error } = await supabase.rpc("plc_slug_de_cancha", { p_cancha_id: canchaId });
  if (error) return { ok: false as const, slug: null as string | null, error: error.message };
  const row = data as { ok?: boolean; slug?: string } | null;
  if (!row?.ok || !row.slug) return { ok: false as const, slug: null, error: "No se pudo armar el enlace." };
  return { ok: true as const, slug: row.slug, error: null };
}
