import { supabase } from "./supabase";

export type EquipoListItem = {
  id: string;
  nombre: string;
  escudo_url: string | null;
  formato_habitual: string | null;
  rol: "capitan" | "jugador";
};

export type MiembroPlantel = {
  miembro_id: string;
  usuario_id: string | null;
  rol: "capitan" | "jugador";
  estado: string;
  nombre: string | null;
  username: string | null;
  es_invitado: boolean;
  invitado_nombre: string | null;
};

export type SolicitudItem = {
  id: string;
  tipo: "solicitud" | "invitacion";
  estado: string;
  usuario_id: string;
  equipo_id: string;
  created_at: string;
  username: string | null;
  nombre: string | null;
  equipo_nombre: string | null;
};

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function equiposDondeEsCapitan(items: EquipoListItem[]): EquipoListItem[] {
  return items.filter((e) => e.rol === "capitan");
}

export async function listMisEquipos(userId: string): Promise<EquipoListItem[]> {
  const { data, error } = await supabase
    .from("equipo_miembros")
    .select("rol, estado, equipos(id, nombre, escudo_url, formato_habitual, activo)")
    .eq("usuario_id", userId)
    .eq("estado", "activo");

  if (error || !data) return [];

  return data
    .map((row: any) => {
      const eq = unwrap(row.equipos);
      if (!eq || eq.activo === false) return null;
      return {
        id: eq.id as string,
        nombre: eq.nombre as string,
        escudo_url: (eq.escudo_url as string | null) ?? null,
        formato_habitual: (eq.formato_habitual as string | null) ?? null,
        rol: row.rol as "capitan" | "jugador",
      };
    })
    .filter(Boolean) as EquipoListItem[];
}

export async function getEquipoDetalle(equipoId: string): Promise<{
  equipo: {
    id: string;
    nombre: string;
    escudo_url: string | null;
    formato_habitual: string | null;
  } | null;
  miembros: MiembroPlantel[];
  enlaceToken: string | null;
}> {
  const { data: equipo } = await supabase
    .from("equipos")
    .select("id, nombre, escudo_url, formato_habitual")
    .eq("id", equipoId)
    .maybeSingle();

  const { data: miembrosRows } = await supabase
    .from("equipo_miembros")
    .select("id, usuario_id, rol, estado, es_invitado, invitado_nombre, usuarios(nombre, username)")
    .eq("equipo_id", equipoId)
    .eq("estado", "activo");

  const miembros: MiembroPlantel[] = (miembrosRows ?? []).map((row: any) => {
    const u = unwrap(row.usuarios) as { nombre?: string | null; username?: string | null } | null;
    const esInv = Boolean(row.es_invitado) || row.usuario_id == null;
    return {
      miembro_id: String(row.id),
      usuario_id: row.usuario_id ? String(row.usuario_id) : null,
      rol: row.rol,
      estado: row.estado,
      nombre: esInv ? (row.invitado_nombre ?? u?.nombre ?? null) : (u?.nombre ?? null),
      username: esInv ? null : (u?.username ?? null),
      es_invitado: esInv,
      invitado_nombre: row.invitado_nombre ?? null,
    };
  });

  const { data: enlace } = await supabase
    .from("equipo_enlaces")
    .select("token")
    .eq("equipo_id", equipoId)
    .eq("activo", true)
    .maybeSingle();

  return {
    equipo: equipo as any,
    miembros,
    enlaceToken: enlace?.token ?? null,
  };
}

export async function listSolicitudesEntrada(equipoId: string): Promise<SolicitudItem[]> {
  const { data } = await supabase
    .from("equipo_solicitudes")
    .select("id, tipo, estado, usuario_id, equipo_id, created_at, usuarios(nombre, username)")
    .eq("equipo_id", equipoId)
    .eq("tipo", "solicitud")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row: any) => {
    const u = unwrap(row.usuarios) as { nombre?: string | null; username?: string | null } | null;
    return {
      id: row.id,
      tipo: row.tipo,
      estado: row.estado,
      usuario_id: row.usuario_id,
      equipo_id: row.equipo_id,
      created_at: row.created_at,
      nombre: u?.nombre ?? null,
      username: u?.username ?? null,
      equipo_nombre: null,
    };
  });
}

export async function listInvitacionesRecibidas(_userId: string): Promise<SolicitudItem[]> {
  const { data, error } = await supabase.rpc("listar_invitaciones_recibidas");
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    tipo: "invitacion" as const,
    estado: String(row.estado ?? "pendiente"),
    usuario_id: String(row.usuario_id),
    equipo_id: String(row.equipo_id),
    created_at: String(row.created_at),
    nombre: null,
    username: null,
    equipo_nombre: typeof row.equipo_nombre === "string" ? row.equipo_nombre : null,
  }));
}

export async function listProvincias() {
  const { data } = await supabase.from("provincias").select("id, nombre").order("nombre");
  return (data ?? []) as { id: string; nombre: string }[];
}

export async function listPartidos(provinciaId: string) {
  const { data } = await supabase
    .from("partidos")
    .select("id, nombre")
    .eq("provincia_id", provinciaId)
    .order("nombre");
  return (data ?? []) as { id: string; nombre: string }[];
}

export async function listLocalidades(partidoId: string) {
  const { data } = await supabase
    .from("localidades")
    .select("id, nombre")
    .eq("partido_id", partidoId)
    .order("nombre");
  return (data ?? []) as { id: string; nombre: string }[];
}
