import {
  mensajeErrorEquipo,
  rpcCalcularCondiciones,
  rpcCondicionesDeDesafio,
  rpcConfirmarPagoPrueba,
  rpcCorrerTareaPeriodicaPlc,
  rpcCotizarDeposito,
  rpcCotizarReservaPlus,
  rpcCrearEquipoRapido,
  rpcCrearPartido,
  rpcCrearPartidoDeposito,
  rpcCrearPartidoLibre,
  rpcDecidirSinRival,
  rpcGetRelojPlc,
  rpcInscribirJugadorAmistoso,
  rpcListarTurnosPublicos,
  rpcMontoAPagarInscripcion,
  rpcOpcionesSinRival,
  rpcPasarAPlus,
  rpcRegistrarAporteCancha,
  rpcSetRelojSimulacion,
  rpcUpsertPredioPlaces,
} from "@shared/equipos";
import { formatPremio } from "./desafios";
import type { ReservaBusca } from "./reserva-draft";
import { supabase } from "./supabase";

export type PlcModalidad = "por_la_cancha" | "amistoso" | "competitivo";
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
  if (modalidad === "amistoso") return "Amistoso";
  if (modalidad === "competitivo") return "Competitivo";
  return "Por la cancha";
}

export type CotizacionPlus = {
  modalidad: string;
  tipo_cobro: string;
  precio_cancha: number;
  monto_cancha: number;
  tarifa_plus: number;
  monto_pagar_ahora: number;
  resta_en_predio: number;
  texto_cancelacion: string;
  texto_reglas: string;
  cancha_nombre: string;
  campo_nombre: string;
  fecha: string;
  hora_inicio: string;
  formato: string;
  slug: string | null;
  aclaracion_tarifa: string;
};

function mapCotPlus(res: Record<string, unknown>): CotizacionPlus {
  return {
    modalidad: str(res.modalidad),
    tipo_cobro: str(res.tipo_cobro),
    precio_cancha: num(res.precio_cancha) ?? 0,
    monto_cancha: num(res.monto_cancha) ?? 0,
    tarifa_plus: num(res.tarifa_plus) ?? 0,
    monto_pagar_ahora: num(res.monto_pagar_ahora) ?? 0,
    resta_en_predio: num(res.resta_en_predio) ?? 0,
    texto_cancelacion: str(res.texto_cancelacion),
    texto_reglas: str(res.texto_reglas),
    cancha_nombre: str(res.cancha_nombre),
    campo_nombre: str(res.campo_nombre),
    fecha: str(res.fecha),
    hora_inicio: str(res.hora_inicio),
    formato: str(res.formato),
    slug: res.slug == null || str(res.slug) === "" ? null : str(res.slug),
    aclaracion_tarifa: str(res.aclaracion_tarifa) || "Si no se suma nadie por la app, te devolvemos la tarifa",
  };
}

export async function cotizarReservaPlus(input: {
  disponibilidadId: string;
  modalidad: PlcModalidad;
  libres: number;
  busca: ReservaBusca;
  tipoCobro?: "sena" | "total";
}) {
  const res = await rpcCotizarReservaPlus(supabase, {
    disponibilidadId: input.disponibilidadId,
    modalidad: input.modalidad,
    libres: input.libres,
    busca: input.busca,
    tipoCobro: input.tipoCobro ?? "total",
  });
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const, cot: mapCotPlus(res) };
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
  const mod = modalidad === "competitivo" ? "amistoso" : modalidad;
  const res = await rpcCalcularCondiciones(supabase, turnoId, mod);
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
  libres?: number;
  busca?: ReservaBusca;
}) {
  const res = await rpcCrearPartido(supabase, input);
  if (!res.ok) {
    return {
      ok: false as const,
      error: mensajeErrorEquipo(res.error, { minimo: res.minimo, quienes: res.quienes }),
      code: res.error,
    };
  }
  return {
    ok: true as const,
    desafioId: res.desafio_id,
    inscripcionId: res.inscripcion_id,
    montoTotal: res.monto_total ?? 0,
    tarifaPlus: res.tarifa_plus ?? 0,
  };
}

export async function upsertPredioPlaces(input: {
  placeId: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
  barrio?: string | null;
  telefono?: string | null;
}) {
  const res = await rpcUpsertPredioPlaces(supabase, input);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return {
    ok: true as const,
    canchaId: str(res.cancha_id),
    adherido: bool(res.adherido),
    nombre: str(res.nombre),
    aporte_superficie: res.aporte_superficie == null ? null : str(res.aporte_superficie),
    aporte_techada: res.aporte_techada == null ? null : bool(res.aporte_techada),
    aporte_iluminacion: res.aporte_iluminacion == null ? null : bool(res.aporte_iluminacion),
  };
}

export async function crearPartidoLibrePlc(input: {
  canchaId: string;
  fecha: string;
  horaInicio: string;
  formato: string;
  precioCancha: number;
  modalidad: "amistoso" | "competitivo";
  equipoId?: string | null;
  convocados?: string[];
  reglaEmpate: PlcReglaEmpate;
  superficie?: string | null;
  techada?: boolean | null;
  iluminacion?: boolean | null;
}) {
  const res = await rpcCrearPartidoLibre(supabase, input);
  if (!res.ok) {
    return {
      ok: false as const,
      error: mensajeErrorEquipo(res.error, { minimo: res.minimo, quienes: res.quienes }),
      code: res.error,
    };
  }
  return {
    ok: true as const,
    desafioId: res.desafio_id,
    inscripcionId: res.inscripcion_id,
    montoTotal: 0,
  };
}

export async function cotizarDepositoPlc(precioCancha: number, formato: string, jugadoresLado?: number) {
  const res = await rpcCotizarDeposito(supabase, precioCancha, formato, jugadoresLado);
  if (!res.ok) return { ok: false as const, error: err(res.error), code: res.error };
  return { ok: true as const, cot: res as Record<string, unknown> };
}

export async function crearPartidoDepositoPlc(input: {
  precioCancha: number;
  formato: string;
  equipoId: string;
  convocados: string[];
  reglaEmpate: PlcReglaEmpate;
  aceptaTarifaNoReembolsable: boolean;
  disponibilidadId?: string | null;
  canchaId?: string | null;
  fecha?: string | null;
  horaInicio?: string | null;
  jugadoresLado?: number | null;
}) {
  const res = await rpcCrearPartidoDeposito(supabase, input);
  if (!res.ok) {
    return {
      ok: false as const,
      error: mensajeErrorEquipo(res.error, { minimo: res.minimo, quienes: res.quienes }),
      code: res.error,
    };
  }
  return {
    ok: true as const,
    desafioId: res.desafio_id,
    inscripcionId: res.inscripcion_id,
    montoTotal: res.monto_total ?? 0,
  };
}

export async function crearEquipoRapidoPlc(nombre: string, formato: string) {
  const res = await rpcCrearEquipoRapido(supabase, nombre, formato);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const, equipoId: res.equipo_id };
}

export async function registrarAporteCanchaPlc(input: {
  canchaId: string;
  superficie?: string | null;
  techada?: boolean | null;
  iluminacion?: boolean | null;
}) {
  const res = await rpcRegistrarAporteCancha(supabase, input);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const };
}

export async function pasarAPlusPlc(input: {
  reservaId: string;
  equipoId: string;
  convocados: string[];
  modalidad: PlcModalidad;
  reglaEmpate: PlcReglaEmpate;
  libres?: number;
  busca?: ReservaBusca;
}) {
  const res = await rpcPasarAPlus(supabase, {
    reservaId: input.reservaId,
    equipoId: input.equipoId,
    convocados: input.convocados,
    modalidad: input.modalidad,
    reglaEmpate: input.reglaEmpate,
    libres: input.libres,
    busca: input.busca,
  });
  if (!res.ok) {
    return {
      ok: false as const,
      error: mensajeErrorEquipo(res.error, { minimo: res.minimo, quienes: res.quienes }),
      code: res.error,
    };
  }
  return {
    ok: true as const,
    desafioId: str(res.desafio_id),
    inscripcionId: str(res.inscripcion_id),
    montoTotal: num(res.monto_total) ?? num(res.monto_upgrade) ?? 0,
    tarifaPlus: num(res.tarifa_plus) ?? num(res.monto_servicio) ?? 0,
    faltaCancha: num(res.falta_cancha) ?? 0,
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
  if (!res.ok) return { ok: false as const, error: err(res.error), code: res.error };
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
