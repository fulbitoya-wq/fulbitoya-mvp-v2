import { supabase } from "@/lib/supabase";

export type ClienteLista = {
  clave: string;
  nombre: string;
  telefono: string | null;
  origen: "app" | "manual" | string;
  reservas: number;
  ultima_fecha: string | null;
  asistio: number;
  no_vino: number;
  notas: string | null;
};

export type ClienteTurno = {
  reserva_id: string;
  fecha: string;
  hora: string;
  campo: string;
  canal: string | null;
  estado: string | null;
  asistencia: string | null;
  titular: string;
  telefono: string | null;
};

function str(v: unknown) {
  return v == null ? "" : String(v);
}
function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function listarClientesPredio(canchaId: string): Promise<{ ok: boolean; clientes: ClienteLista[]; error: string | null }> {
  const { data, error } = await supabase.rpc("fy_clientes_predio", { p_cancha_id: canchaId });
  if (error) return { ok: false, clientes: [], error: error.message };
  const row = data as { ok?: boolean; clientes?: unknown[] } | null;
  if (!row?.ok) return { ok: false, clientes: [], error: "No se pudieron cargar los clientes." };
  return {
    ok: true,
    error: null,
    clientes: (row.clientes ?? []).map((c) => {
      const o = c as Record<string, unknown>;
      return {
        clave: str(o.clave),
        nombre: str(o.nombre) || "Sin nombre",
        telefono: o.telefono ? str(o.telefono) : null,
        origen: str(o.origen) || "manual",
        reservas: num(o.reservas),
        ultima_fecha: o.ultima_fecha ? str(o.ultima_fecha).slice(0, 10) : null,
        asistio: num(o.asistio),
        no_vino: num(o.no_vino),
        notas: o.notas ? str(o.notas) : null,
      };
    }),
  };
}

export async function detalleClientePredio(canchaId: string, clave: string) {
  const { data, error } = await supabase.rpc("fy_cliente_detalle", { p_cancha_id: canchaId, p_clave: clave });
  if (error) return { ok: false as const, historial: [] as ClienteTurno[], notas: "", error: error.message };
  const row = data as { ok?: boolean; historial?: unknown[]; notas?: string | null } | null;
  if (!row?.ok) return { ok: false as const, historial: [] as ClienteTurno[], notas: "", error: "No se pudo cargar el cliente." };
  const historial: ClienteTurno[] = (row.historial ?? []).map((h) => {
    const o = h as Record<string, unknown>;
    return {
      reserva_id: str(o.reserva_id),
      fecha: str(o.fecha).slice(0, 10),
      hora: str(o.hora).slice(0, 5),
      campo: str(o.campo),
      canal: o.canal ? str(o.canal) : null,
      estado: o.estado ? str(o.estado) : null,
      asistencia: o.asistencia ? str(o.asistencia) : null,
      titular: str(o.titular),
      telefono: o.telefono ? str(o.telefono) : null,
    };
  });
  return { ok: true as const, historial, notas: row.notas ?? "", error: null };
}

export async function guardarNotaCliente(canchaId: string, clave: string, notas: string) {
  const { data, error } = await supabase.rpc("fy_guardar_nota_cliente", {
    p_cancha_id: canchaId,
    p_clave: clave,
    p_notas: notas,
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean } | null;
  if (!row?.ok) return { ok: false, error: "No se pudo guardar la nota." };
  return { ok: true, error: null };
}

export async function marcarAsistencia(reservaId: string, valor: "asistio" | "no_vino" | null) {
  const { data, error } = await supabase.rpc("fy_marcar_asistencia", {
    p_reserva_id: reservaId,
    p_valor: valor,
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean } | null;
  if (!row?.ok) return { ok: false, error: "No se pudo marcar la asistencia." };
  return { ok: true, error: null };
}
