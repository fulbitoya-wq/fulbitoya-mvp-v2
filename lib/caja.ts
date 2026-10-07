import { supabase } from "@/lib/supabase";

export type CajaLinea = {
  reserva_id: string;
  fecha: string;
  hora: string;
  campo: string;
  titular: string;
  canal: string;
  cobro_externo: string | null;
  cobrado_app: number;
  cobrado_predio: number;
  medio_predio: string | null;
  pendiente: number;
  comision: number;
  estado_reserva: string | null;
};

export type CajaTotales = {
  cobrado_app: number;
  cobrado_efectivo: number;
  cobrado_transferencia: number;
  cobrado_fuera: number;
  pendiente: number;
  comision: number;
  app_debe_predio: number;
  predio_debe_app: number;
};

export type CajaCierre = {
  fecha: string;
  cerrado_at: string;
  cobrado_app: number;
  cobrado_efectivo: number;
  cobrado_transferencia: number;
  pendiente: number;
  app_debe_predio: number;
  predio_debe_app: number;
};

export type CajaComision = {
  id: string;
  reserva_id: string | null;
  monto: number;
  estado: string;
  detalle: string | null;
  fecha: string;
};

export type CajaData = {
  desde: string;
  hasta: string;
  totales: CajaTotales;
  lineas: CajaLinea[];
  comisiones: CajaComision[];
  cierre: CajaCierre | null;
};

function str(v: unknown) {
  return v == null ? "" : String(v);
}
function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseTotales(o: Record<string, unknown> | null | undefined): CajaTotales {
  const x = o ?? {};
  return {
    cobrado_app: num(x.cobrado_app),
    cobrado_efectivo: num(x.cobrado_efectivo),
    cobrado_transferencia: num(x.cobrado_transferencia),
    cobrado_fuera: num(x.cobrado_fuera),
    pendiente: num(x.pendiente),
    comision: num(x.comision),
    app_debe_predio: num(x.app_debe_predio),
    predio_debe_app: num(x.predio_debe_app),
  };
}

export async function cargarCajaPredio(
  canchaId: string,
  desde: string,
  hasta: string,
): Promise<{ ok: boolean; data: CajaData | null; error: string | null }> {
  const { data, error } = await supabase.rpc("fy_caja_predio", {
    p_cancha_id: canchaId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) return { ok: false, data: null, error: error.message };
  const row = data as ({ ok?: boolean; error?: string } & Record<string, unknown>) | null;
  if (!row?.ok) return { ok: false, data: null, error: "No se pudo cargar la caja." };
  const tot = (row.totales ?? {}) as Record<string, unknown>;
  const cierreRaw = row.cierre as Record<string, unknown> | null;
  return {
    ok: true,
    error: null,
    data: {
      desde: str(row.desde).slice(0, 10),
      hasta: str(row.hasta).slice(0, 10),
      totales: parseTotales(tot),
      lineas: (Array.isArray(row.lineas) ? row.lineas : []).map((l) => {
        const o = l as Record<string, unknown>;
        return {
          reserva_id: str(o.reserva_id),
          fecha: str(o.fecha).slice(0, 10),
          hora: str(o.hora).slice(0, 5),
          campo: str(o.campo),
          titular: str(o.titular),
          canal: str(o.canal),
          cobro_externo: o.cobro_externo ? str(o.cobro_externo) : null,
          cobrado_app: num(o.cobrado_app),
          cobrado_predio: num(o.cobrado_predio),
          medio_predio: o.medio_predio ? str(o.medio_predio) : null,
          pendiente: num(o.pendiente),
          comision: num(o.comision),
          estado_reserva: o.estado_reserva ? str(o.estado_reserva) : null,
        };
      }),
      comisiones: (Array.isArray(row.comisiones) ? row.comisiones : []).map((c) => {
        const o = c as Record<string, unknown>;
        return {
          id: str(o.id),
          reserva_id: o.reserva_id ? str(o.reserva_id) : null,
          monto: num(o.monto),
          estado: str(o.estado),
          detalle: o.detalle ? str(o.detalle) : null,
          fecha: str(o.fecha).slice(0, 10),
        };
      }),
      cierre: cierreRaw
        ? {
            fecha: str(cierreRaw.fecha).slice(0, 10),
            cerrado_at: str(cierreRaw.cerrado_at),
            cobrado_app: num(cierreRaw.cobrado_app),
            cobrado_efectivo: num(cierreRaw.cobrado_efectivo),
            cobrado_transferencia: num(cierreRaw.cobrado_transferencia),
            pendiente: num(cierreRaw.pendiente),
            app_debe_predio: num(cierreRaw.app_debe_predio),
            predio_debe_app: num(cierreRaw.predio_debe_app),
          }
        : null,
    },
  };
}

export async function fyCerrarCaja(canchaId: string, fecha: string) {
  const { data, error } = await supabase.rpc("fy_cerrar_caja", { p_cancha_id: canchaId, p_fecha: fecha });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) {
    if (row?.error === "ya_cerrada") return { ok: false, error: "Ese día ya tiene cierre de caja." };
    return { ok: false, error: "No se pudo cerrar la caja." };
  }
  return { ok: true, error: null };
}

export function cajaToCsv(data: CajaData): string {
  const head = [
    "fecha",
    "hora",
    "campo",
    "cliente",
    "canal",
    "cobrado_app",
    "cobrado_predio",
    "medio",
    "pendiente",
    "comision",
  ];
  const rows = data.lineas.map((l) =>
    [l.fecha, l.hora, l.campo, l.titular, l.canal, l.cobrado_app, l.cobrado_predio, l.medio_predio ?? "", l.pendiente, l.comision]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [head.join(","), ...rows].join("\n");
}
