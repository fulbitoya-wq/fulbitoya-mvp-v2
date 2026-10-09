import {
  mensajeErrorEquipo,
  rpcCancelarInscripcion,
  rpcEditarConvocados,
  rpcInscribirEquipo,
} from "@shared/equipos";
import { supabase } from "./supabase";

export type InscripcionMia = {
  id: string;
  desafioId: string;
  equipoId: string | null;
  estado: string;
  convocados: string[];
};

export type ConvocadoPlantel = {
  usuarioId: string;
  label: string;
};

/** Nombres de convocados de una inscripción (para la cancha del detalle). */
export async function listarConvocadosPlantel(inscripcionId: string): Promise<ConvocadoPlantel[]> {
  const { data: conv, error } = await supabase
    .from("desafio_convocados")
    .select("usuario_id")
    .eq("inscripcion_id", inscripcionId);
  if (error || !conv?.length) return [];
  const ids = conv.map((c) => String((c as { usuario_id: string }).usuario_id)).filter(Boolean);
  if (ids.length === 0) return [];
  const { data: users } = await supabase.from("usuarios").select("id, nombre, username").in("id", ids);
  const byId = new Map(
    (users ?? []).map((u) => {
      const row = u as { id: string; nombre: string | null; username: string | null };
      const label =
        (row.nombre && row.nombre.trim()) ||
        (row.username ? `@${row.username}` : "Jugador");
      return [String(row.id), label] as const;
    })
  );
  return ids.map((id) => ({
    usuarioId: id,
    label: byId.get(id) ?? "Jugador",
  }));
}

export async function getInscripcionMia(
  desafioId: string,
  equipoIds: string[],
  userId?: string | null
): Promise<InscripcionMia | null> {
  let row: { id: string; desafio_id: string; equipo_id: string | null; estado: string } | null = null;
  if (equipoIds.length > 0) {
    const { data, error } = await supabase
      .from("desafio_inscripciones")
      .select("id, desafio_id, equipo_id, estado")
      .eq("desafio_id", desafioId)
      .in("equipo_id", equipoIds)
      .in("estado", ["confirmada", "pendiente_pago"])
      .limit(1);
    if (!error) row = (Array.isArray(data) ? data[0] : data) ?? null;
  }
  if (!row && userId) {
    const { data, error } = await supabase
      .from("desafio_inscripciones")
      .select("id, desafio_id, equipo_id, estado")
      .eq("desafio_id", desafioId)
      .eq("capitan_id", userId)
      .in("estado", ["confirmada", "pendiente_pago"])
      .limit(1);
    if (!error) row = (Array.isArray(data) ? data[0] : data) ?? null;
  }
  if (!row) return null;
  const { data: conv } = await supabase
    .from("desafio_convocados")
    .select("usuario_id")
    .eq("inscripcion_id", row.id);
  return {
    id: row.id,
    desafioId: row.desafio_id,
    equipoId: row.equipo_id,
    estado: row.estado,
    convocados: (conv ?? []).map((c) => String((c as { usuario_id: string }).usuario_id)),
  };
}

export function textoErrorInscripcion(res: { error: string; quienes?: string; minimo?: number }): string {
  return mensajeErrorEquipo(res.error, { quienes: res.quienes, minimo: res.minimo });
}

export async function inscribirEquipo(desafioId: string, equipoId: string, convocados: string[]) {
  const res = await rpcInscribirEquipo(supabase, desafioId, equipoId, convocados);
  if (!res.ok) return { ok: false as const, error: textoErrorInscripcion(res), code: res.error };
  return { ok: true as const, inscripcionId: res.inscripcion_id, estado: res.estado };
}

export async function guardarConvocados(inscripcionId: string, convocados: string[]) {
  const res = await rpcEditarConvocados(supabase, inscripcionId, convocados);
  if (!res.ok) return { ok: false as const, error: textoErrorInscripcion(res) };
  return { ok: true as const };
}

export async function cancelarInscripcion(inscripcionId: string) {
  const res = await rpcCancelarInscripcion(supabase, inscripcionId);
  if (!res.ok) return { ok: false as const, error: textoErrorInscripcion(res) };
  return { ok: true as const };
}
