import { supabase } from "./supabase";
import { CUPOS_DESAFIO, type Desafio } from "./desafios";

export type MiPartido = Desafio & {
  inscripcionEstado: string;
  miEquipoId: string | null;
  miEquipoNombre: string | null;
  miEquipoEscudo: string | null;
  miRol: "capitan" | "convocado" | "plantel";
  rivalNombre: string | null;
  rivalEscudo: string | null;
};

type RpcItem = {
  id: string;
  titulo: string;
  tipo: string;
  premio: number;
  direccion: string;
  barrio: string | null;
  lat: number;
  lng: number;
  fecha: string;
  hora_inicio: string;
  duracion_min: number;
  descripcion: string | null;
  estado: string;
  cancha_id: string | null;
  inscripcion_id: string;
  inscripcion_estado: string;
  mi_equipo_id: string;
  mi_equipo_nombre: string;
  mi_rol: string;
};

function inicioMs(fecha: string, hora: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = String(hora).slice(0, 5).split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0).getTime();
}

export function esPartidoProximo(p: MiPartido): boolean {
  if (p.inscripcionEstado === "cancelada" || p.inscripcionEstado === "expirada") return false;
  if (p.estado === "cancelado" || p.estado === "finalizado") return false;
  return inicioMs(p.fecha, p.hora_inicio) >= Date.now();
}

export function puedeEditarConvocados(p: MiPartido): boolean {
  if (p.miRol !== "capitan") return false;
  if (p.inscripcionEstado !== "confirmada" && p.inscripcionEstado !== "pendiente_pago") return false;
  if (p.estado === "cancelado" || p.estado === "finalizado") return false;
  return Date.now() < inicioMs(p.fecha, p.hora_inicio) - 2 * 3_600_000;
}

export function puedeCancelarInscripcion(p: MiPartido): boolean {
  if (p.miRol !== "capitan") return false;
  if (!p.inscripcionId) return false;
  if (p.inscripcionEstado !== "confirmada" && p.inscripcionEstado !== "pendiente_pago") return false;
  if (p.estado === "cancelado" || p.estado === "finalizado") return false;
  // UI: cancelar hasta el inicio. El RPC aplica plazos / reglas de reembolso.
  return Date.now() < inicioMs(p.fecha, p.hora_inicio);
}

export async function listMisPartidos(): Promise<{ ok: true; items: MiPartido[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("listar_mis_partidos");
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string; items?: RpcItem[] } | null;
  if (!row || row.ok === false) return { ok: false, error: row?.error || "No se pudieron cargar tus partidos." };

  const raw = row.items ?? [];
  const ids = raw.map((x) => x.id);
  const inscritosByDesafio = new Map<string, { id: string; nombre: string; escudo_url: string | null }[]>();

  if (ids.length > 0) {
    const { data: ins } = await supabase
      .from("desafio_inscripciones")
      .select("desafio_id, equipo_id, estado, equipos(id, nombre, escudo_url)")
      .in("desafio_id", ids)
      .in("estado", ["confirmada", "pendiente_pago"]);

    for (const r of ins ?? []) {
      const rec = r as {
        desafio_id: string;
        equipos:
          | { id: string; nombre: string; escudo_url: string | null }
          | { id: string; nombre: string; escudo_url: string | null }[]
          | null;
      };
      const eq = Array.isArray(rec.equipos) ? rec.equipos[0] : rec.equipos;
      if (!eq) continue;
      const list = inscritosByDesafio.get(rec.desafio_id) ?? [];
      list.push({ id: eq.id, nombre: eq.nombre, escudo_url: eq.escudo_url ?? null });
      inscritosByDesafio.set(rec.desafio_id, list);
    }
  }

  const items: MiPartido[] = raw.map((x) => {
    const inscritos = inscritosByDesafio.get(x.id) ?? [];
    const mio = inscritos.find((e) => e.id === x.mi_equipo_id) ?? null;
    const rival = inscritos.find((e) => e.id !== x.mi_equipo_id) ?? null;
    return {
      id: x.id,
      titulo: x.titulo,
      tipo: String(x.tipo),
      premio: Number(x.premio),
      direccion: x.direccion,
      barrio: x.barrio,
      lat: Number(x.lat),
      lng: Number(x.lng),
      fecha: String(x.fecha).slice(0, 10),
      hora_inicio: String(x.hora_inicio).slice(0, 8),
      duracion_min: Number(x.duracion_min),
      descripcion: x.descripcion,
      estado: x.estado,
      cancha_id: x.cancha_id,
      inscritos,
      cupos: CUPOS_DESAFIO,
      inscripcionId: x.inscripcion_id,
      inscripcionEstado: x.inscripcion_estado,
      miEquipoId: x.mi_equipo_id,
      miEquipoNombre: x.mi_equipo_nombre,
      miEquipoEscudo: mio?.escudo_url ?? null,
      miRol: x.mi_rol === "capitan" ? "capitan" : x.mi_rol === "plantel" ? "plantel" : "convocado",
      rivalNombre: rival?.nombre ?? null,
      rivalEscudo: rival?.escudo_url ?? null,
    };
  });

  return { ok: true, items };
}
