import {
  mensajeErrorEquipo,
  rpcCalcularCondiciones,
  rpcCondicionesDeDesafio,
  rpcConfirmarPagoPrueba,
  rpcCorrerTareaPeriodicaPlc,
  rpcCrearPartido,
  rpcDecidirSinRival,
  rpcGetRelojPlc,
  rpcInscribirJugadorAmistoso,
  rpcListarTurnosPublicos,
  rpcMontoAPagarInscripcion,
  rpcOpcionesSinRival,
  rpcSetRelojSimulacion,
} from "@shared/equipos";
import { formatPremio } from "./desafios";
import { supabase } from "./supabase";

export type PlcModalidad = "por_la_cancha" | "amistoso";
export type PlcReglaEmpate = "penales" | "mitad_cada_uno";

export type TurnoPublico = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  precio: number | null;
  campo_id: string;
  campo_nombre: string;
  campo_tipo: string;
  campo_superficie: string | null;
  campo_techada: boolean;
  cancha_id: string;
  cancha_nombre: string;
  barrio: string | null;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
};

export type RelojPlc = {
  ahora: string | null;
  simulando: boolean;
  reloj_iso: string | null;
  checkout_prueba: boolean;
  soy_admin: boolean;
};

function err(code: string) {
  return mensajeErrorEquipo(code);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

export function pesos(v: unknown): string {
  return formatPremio(num(v) ?? 0);
}

export function etiquetaModalidadPlc(modalidad: string | null | undefined): string {
  return modalidad === "amistoso" ? "Amistoso" : "Por la cancha";
}

export async function listarTurnosPublicos(): Promise<{ data: TurnoPublico[]; error: string | null }> {
  const res = await rpcListarTurnosPublicos(supabase);
  if (!res.ok) return { data: [], error: err(res.error) };
  const data: TurnoPublico[] = res.turnos.map((t) => ({
    id: str(t.id),
    fecha: str(t.fecha),
    hora_inicio: str(t.hora_inicio),
    hora_fin: t.hora_fin == null ? null : str(t.hora_fin),
    precio: num(t.precio),
    campo_id: str(t.campo_id),
    campo_nombre: str(t.campo_nombre),
    campo_tipo: str(t.campo_tipo),
    campo_superficie: t.campo_superficie == null || str(t.campo_superficie) === "" ? null : str(t.campo_superficie),
    campo_techada: bool(t.campo_techada),
    cancha_id: str(t.cancha_id),
    cancha_nombre: str(t.cancha_nombre),
    barrio: t.barrio == null || str(t.barrio) === "" ? null : str(t.barrio),
    direccion: t.direccion == null || str(t.direccion) === "" ? null : str(t.direccion),
    lat: num(t.lat),
    lng: num(t.lng),
  }));
  return { data, error: null };
}

export async function calcularCondiciones(turnoId: string, modalidad: PlcModalidad) {
  const res = await rpcCalcularCondiciones(supabase, turnoId, modalidad);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const, cond: res as Record<string, unknown> };
}

export async function condicionesDeDesafio(desafioId: string) {
  const res = await rpcCondicionesDeDesafio(supabase, desafioId);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const, cond: res as Record<string, unknown> };
}

export async function opcionesSinRival(desafioId: string) {
  const res = await rpcOpcionesSinRival(supabase, desafioId);
  if (!res.ok) {
    if (res.error === "no_es_equipo_a" || res.error === "no_es_por_la_cancha") {
      return { ok: true as const, opc: null };
    }
    return { ok: false as const, error: err(res.error), opc: null };
  }
  return { ok: true as const, opc: res as Record<string, unknown> };
}

export async function decidirSinRival(desafioId: string, opcion: string, aceptaRiesgo = false) {
  const res = await rpcDecidirSinRival(supabase, desafioId, opcion, aceptaRiesgo);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const };
}

export async function crearPartidoPlc(input: {
  disponibilidadId: string;
  equipoId: string;
  convocados: string[];
  reglaEmpate: PlcReglaEmpate;
  modalidad: PlcModalidad;
}) {
  const res = await rpcCrearPartido(supabase, input);
  if (!res.ok) return { ok: false as const, error: mensajeErrorEquipo(res.error, { minimo: res.minimo }) };
  return {
    ok: true as const,
    desafioId: res.desafio_id,
    inscripcionId: res.inscripcion_id,
    montoTotal: res.monto_total ?? 0,
  };
}

export async function inscribirJugadorAmistoso(desafioId: string) {
  const res = await rpcInscribirJugadorAmistoso(supabase, desafioId);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const, inscripcionId: res.inscripcion_id, estado: res.estado };
}

export async function montoAPagar(inscripcionId: string) {
  const res = await rpcMontoAPagarInscripcion(supabase, inscripcionId);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return {
    ok: true as const,
    montoTotal: res.monto_total,
    montoCancha: res.monto_cancha,
    montoServicio: res.monto_servicio,
  };
}

export async function confirmarPagoPrueba(inscripcionId: string) {
  const res = await rpcConfirmarPagoPrueba(supabase, inscripcionId);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const };
}

export async function getRelojPlc(): Promise<RelojPlc | null> {
  const res = await rpcGetRelojPlc(supabase);
  if (!res.ok) return null;
  return {
    ahora: res.ahora == null ? null : str(res.ahora),
    simulando: bool(res.simulando),
    reloj_iso: res.reloj_iso == null ? null : str(res.reloj_iso),
    checkout_prueba: bool(res.checkout_prueba),
    soy_admin: bool(res.soy_admin),
  };
}

export async function setRelojSimulacion(iso: string | null) {
  const res = await rpcSetRelojSimulacion(supabase, iso);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const, reloj: res };
}

export async function correrTareaPeriodicaPlc() {
  const res = await rpcCorrerTareaPeriodicaPlc(supabase);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const, res };
}

export function boolFlag(row: Record<string, unknown> | null | undefined, key: string): boolean {
  return bool(row?.[key]);
}

export { str, num, bool };
