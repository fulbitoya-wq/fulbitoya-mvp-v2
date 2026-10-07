import { Linking, Platform } from "react-native";
import { pagoEnComputadora } from "./pago-canal";
import {
  mensajeErrorEquipo,
  rpcAbrirBuscaGente,
  rpcCancelarReservaPlc,
  rpcConfirmarPagoReservaPrueba,
  rpcCotizarEnlacePago,
  rpcCotizarReserva,
  rpcGuardarListaReserva,
  rpcIniciarCheckoutEnlace,
  rpcIniciarCheckoutReserva,
  rpcListarListaReserva,
  rpcListarMisReservasPlc,
  rpcListarPrediosPublicos,
  rpcListarTurnosPublicos,
  rpcVerEnlacePago,
} from "@shared/equipos";
import { formatPremio } from "./desafios";
import { supabase } from "./supabase";
import { webBaseUrl } from "./web-url";
import type { TurnoPublico } from "./plc";

export type PredioPublico = {
  id: string;
  nombre: string;
  barrio: string | null;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
};

export type CotizacionReserva = {
  tipo_cobro: string;
  precio_cancha: number;
  sena: number;
  descuento: number;
  descuento_pct: number;
  monto_pagar: number;
  texto_reglas: string;
  cancha_nombre: string;
  campo_nombre: string;
  fecha: string;
  hora_inicio: string;
};

export type AlternativaTurno = {
  id: string;
  fecha: string;
  hora_inicio: string;
};

export type EnlacePagoVista = {
  titular_nombre: string;
  cancha_nombre: string;
  campo_nombre: string;
  fecha: string;
  hora_inicio: string;
  sena: number;
};

export type ReservaMia = {
  id: string;
  estado: string;
  tipo_cobro: string | null;
  canal: string | null;
  monto_total: number;
  fecha: string;
  hora_inicio: string;
  cancha_nombre: string;
  campo_nombre: string;
  barrio: string | null;
};

function err(code: string) {
  return mensajeErrorEquipo(code);
}

function str(v: unknown) {
  return v == null ? "" : String(v);
}

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(v: unknown) {
  return v === true || v === "true";
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function pesosReserva(v: unknown) {
  return formatPremio(num(v));
}

export function etiquetaEstadoReserva(estado: string): string {
  if (estado === "reservada") return "Reservada";
  if (estado === "jugada") return "Jugada";
  if (estado === "cancelada") return "Cancelada";
  if (estado === "cancelada_predio") return "Cancelada por el predio";
  return estado;
}

export async function listarPrediosPublicos(): Promise<{ data: PredioPublico[]; error: string | null }> {
  const res = await rpcListarPrediosPublicos(supabase);
  if (!res.ok) return { data: [], error: err(res.error) };
  return {
    data: res.predios.map((p) => ({
      id: str(p.id),
      nombre: str(p.nombre),
      barrio: p.barrio == null ? null : str(p.barrio),
      direccion: p.direccion == null ? null : str(p.direccion),
      lat: p.lat == null ? null : num(p.lat),
      lng: p.lng == null ? null : num(p.lng),
    })),
    error: null,
  };
}

export async function listarTurnosDePredio(canchaId: string): Promise<TurnoPublico[]> {
  const res = await rpcListarTurnosPublicos(supabase);
  if (!res.ok) return [];
  return res.turnos
    .filter((t) => str(t.cancha_id) === canchaId)
    .map((t) => ({
      id: str(t.id),
      fecha: str(t.fecha),
      hora_inicio: str(t.hora_inicio),
      hora_fin: t.hora_fin == null ? null : str(t.hora_fin),
      precio: t.precio == null ? null : num(t.precio),
      campo_id: str(t.campo_id),
      campo_nombre: str(t.campo_nombre),
      campo_tipo: str(t.campo_tipo),
      campo_superficie:
        t.campo_superficie == null || str(t.campo_superficie) === "" ? null : str(t.campo_superficie),
      campo_techada: bool(t.campo_techada),
      cancha_id: str(t.cancha_id),
      cancha_nombre: str(t.cancha_nombre),
      barrio: t.barrio == null || str(t.barrio) === "" ? null : str(t.barrio),
      direccion: t.direccion == null || str(t.direccion) === "" ? null : str(t.direccion),
      lat: numOrNull(t.lat),
      lng: numOrNull(t.lng),
    }));
}

export async function cotizarReserva(turnoId: string, tipo: "sena" | "total") {
  const res = await rpcCotizarReserva(supabase, turnoId, tipo);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return {
    ok: true as const,
    cot: {
      tipo_cobro: str(res.tipo_cobro),
      precio_cancha: num(res.precio_cancha),
      sena: num(res.sena),
      descuento: num(res.descuento),
      descuento_pct: num(res.descuento_pct),
      monto_pagar: num(res.monto_pagar),
      texto_reglas: str(res.texto_reglas),
      cancha_nombre: str(res.cancha_nombre),
      campo_nombre: str(res.campo_nombre),
      fecha: str(res.fecha),
      hora_inicio: str(res.hora_inicio),
    } satisfies CotizacionReserva,
  };
}

export type PagoIniciado =
  | { ok: true; reservaId: string }
  | { ok: true; canal: "app" }
  | { ok: true; canal: "qr"; initPoint: string; holdId: string }
  | { ok: false; error: string };

async function seguirAMercadoPago(holdId: string, initPoint: string): Promise<PagoIniciado> {
  if (pagoEnComputadora()) {
    return { ok: true, canal: "qr", initPoint, holdId };
  }
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.assign(initPoint);
  } else {
    await Linking.openURL(initPoint);
  }
  return { ok: true, canal: "app" };
}

export async function pagarReserva(
  turnoId: string,
  tipo: "sena" | "total",
  accessToken: string
): Promise<PagoIniciado> {
  const start = await rpcIniciarCheckoutReserva(supabase, turnoId, tipo, true);
  if (!start.ok) return { ok: false, error: err(start.error) };
  const holdId = str(start.hold_id);
  const prueba = start.checkout_prueba === true || start.checkout_prueba === "true";

  if (prueba) {
    const pay = await rpcConfirmarPagoReservaPrueba(supabase, holdId);
    if (!pay.ok) return { ok: false, error: err(pay.error) };
    return { ok: true, reservaId: pay.reserva_id };
  }

  const web = webBaseUrl();
  if (!web) return { ok: false, error: "Falta configurar el sitio para el pago." };
  const r = await fetch(`${web}/api/pagos/reservas/preferencia`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ holdId }),
  });
  const body = (await r.json().catch(() => null)) as { init_point?: string; error?: string } | null;
  if (!r.ok || !body?.init_point) {
    return { ok: false, error: body?.error ?? "No se pudo abrir Mercado Pago." };
  }
  return seguirAMercadoPago(holdId, body.init_point);
}

export async function listarMisReservas(): Promise<{ data: ReservaMia[]; error: string | null }> {
  const res = await rpcListarMisReservasPlc(supabase);
  if (!res.ok) return { data: [], error: err(res.error) };
  return {
    data: res.reservas.map((r) => ({
      id: str(r.id),
      estado: str(r.estado),
      tipo_cobro: r.tipo_cobro == null ? null : str(r.tipo_cobro),
      canal: r.canal == null ? null : str(r.canal),
      monto_total: num(r.monto_total),
      fecha: str(r.fecha),
      hora_inicio: str(r.hora_inicio),
      cancha_nombre: str(r.cancha_nombre),
      campo_nombre: str(r.campo_nombre),
      barrio: r.barrio == null ? null : str(r.barrio),
    })),
    error: null,
  };
}

export async function cancelarReservaMia(id: string) {
  const res = await rpcCancelarReservaPlc(supabase, id);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const, reembolso: res.reembolso ?? 0 };
}

function altsFrom(raw: unknown): AlternativaTurno[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
    const row = a as Record<string, unknown>;
    return { id: str(row.id), fecha: str(row.fecha), hora_inicio: str(row.hora_inicio) };
  });
}

export async function verEnlacePago(token: string) {
  const res = await rpcVerEnlacePago(supabase, token);
  if (!res.ok) {
    return { ok: false as const, error: err(res.error), alternativas: altsFrom(res.alternativas) };
  }
  return {
    ok: true as const,
    data: {
      titular_nombre: str(res.titular_nombre),
      cancha_nombre: str(res.cancha_nombre),
      campo_nombre: str(res.campo_nombre),
      fecha: str(res.fecha),
      hora_inicio: str(res.hora_inicio).slice(0, 5),
      sena: num(res.sena),
    } satisfies EnlacePagoVista,
  };
}

export async function cotizarEnlacePago(token: string, tipo: "sena" | "total") {
  const res = await rpcCotizarEnlacePago(supabase, token, tipo);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return {
    ok: true as const,
    cot: {
      tipo_cobro: str(res.tipo_cobro),
      precio_cancha: num(res.precio_cancha),
      sena: num(res.sena),
      descuento: num(res.descuento),
      descuento_pct: num(res.descuento_pct),
      monto_pagar: num(res.monto_pagar),
      texto_reglas: str(res.texto_reglas),
      cancha_nombre: str(res.cancha_nombre),
      campo_nombre: str(res.campo_nombre),
      fecha: str(res.fecha),
      hora_inicio: str(res.hora_inicio),
    } satisfies CotizacionReserva,
  };
}

export async function pagarEnlacePago(
  token: string,
  tipo: "sena" | "total",
  accessToken: string
): Promise<PagoIniciado> {
  const start = await rpcIniciarCheckoutEnlace(supabase, token, tipo, true);
  if (!start.ok) return { ok: false, error: err(start.error) };
  const holdId = str(start.hold_id);
  const prueba = start.checkout_prueba === true || start.checkout_prueba === "true";
  if (prueba) {
    const pay = await rpcConfirmarPagoReservaPrueba(supabase, holdId);
    if (!pay.ok) return { ok: false, error: err(pay.error) };
    return { ok: true, reservaId: pay.reserva_id };
  }
  const web = webBaseUrl();
  if (!web) return { ok: false, error: "Falta configurar el sitio para el pago." };
  const r = await fetch(`${web}/api/pagos/reservas/preferencia`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ holdId }),
  });
  const body = (await r.json().catch(() => null)) as { init_point?: string; error?: string } | null;
  if (!r.ok || !body?.init_point) {
    return { ok: false, error: body?.error ?? "No se pudo abrir Mercado Pago." };
  }
  return seguirAMercadoPago(holdId, body.init_point);
}

export async function guardarListaReserva(reservaId: string, nombres: string[]) {
  const res = await rpcGuardarListaReserva(supabase, reservaId, nombres);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const };
}

export async function listarListaReserva(reservaId: string) {
  const res = await rpcListarListaReserva(supabase, reservaId);
  if (!res.ok) return { ok: false as const, error: err(res.error), nombres: [] as string[] };
  return { ok: true as const, nombres: res.nombres };
}

export async function abrirBuscaGente(reservaId: string, abrir: boolean) {
  const res = await rpcAbrirBuscaGente(supabase, reservaId, abrir);
  if (!res.ok) return { ok: false as const, error: err(res.error) };
  return { ok: true as const };
}
