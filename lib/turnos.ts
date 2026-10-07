import { supabase } from "@/lib/supabase";
import { DIAS_APERTURA } from "@/lib/horarios-apertura";

export type CampoFranja = {
  id?: string;
  dias: string[];
  hora_desde: string;
  hora_hasta: string;
  precio: number;
};

export type PredioExcepcion = {
  id: string;
  cancha_id: string;
  campo_id: string | null;
  tipo: "feriado" | "cierre" | "mantenimiento";
  fecha_desde: string;
  fecha_hasta: string;
  nota: string | null;
};

export const DIAS_FRANJA = DIAS_APERTURA;

export async function listarFranjas(campoId: string): Promise<CampoFranja[]> {
  const { data, error } = await supabase
    .from("campo_franjas")
    .select("id, dias, hora_desde, hora_hasta, precio")
    .eq("campo_id", campoId)
    .order("hora_desde");
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    dias: (r.dias as string[]) ?? [],
    hora_desde: String(r.hora_desde).slice(0, 5),
    hora_hasta: String(r.hora_hasta).slice(0, 5),
    precio: Number(r.precio),
  }));
}

export async function reemplazarFranjas(
  campoId: string,
  franjas: CampoFranja[],
): Promise<{ ok: boolean; error: string | null }> {
  const { error: delErr } = await supabase.from("campo_franjas").delete().eq("campo_id", campoId);
  if (delErr) return { ok: false, error: delErr.message };
  if (franjas.length === 0) return { ok: true, error: null };
  const { error } = await supabase.from("campo_franjas").insert(
    franjas.map((f) => ({
      campo_id: campoId,
      dias: f.dias,
      hora_desde: f.hora_desde,
      hora_hasta: f.hora_hasta,
      precio: f.precio,
    })),
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function regenerarTurnosCampo(campoId: string) {
  const { data, error } = await supabase.rpc("fy_regenerar_turnos_campo", { p_campo_id: campoId });
  if (error) return { ok: false as const, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) return { ok: false as const, error: row?.error ?? "No se pudieron armar los turnos." };
  return { ok: true as const, error: null };
}

export async function regenerarTurnosPredio(canchaId: string) {
  const { data, error } = await supabase.rpc("fy_regenerar_turnos_predio", { p_cancha_id: canchaId });
  if (error) return { ok: false as const, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) return { ok: false as const, error: row?.error ?? "No se pudieron armar los turnos." };
  return { ok: true as const, error: null };
}

export async function listarExcepciones(canchaId: string): Promise<PredioExcepcion[]> {
  const { data, error } = await supabase
    .from("predio_excepciones")
    .select("*")
    .eq("cancha_id", canchaId)
    .order("fecha_desde", { ascending: false });
  if (error) return [];
  return (data ?? []) as PredioExcepcion[];
}

export async function crearExcepcion(input: Omit<PredioExcepcion, "id">) {
  const { error } = await supabase.from("predio_excepciones").insert(input);
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function borrarExcepcion(id: string) {
  const { error } = await supabase.from("predio_excepciones").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}
