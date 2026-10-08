import { supabase } from "@/lib/supabase";

export async function plcAdminSoy(): Promise<boolean> {
  const { data } = await supabase.rpc("plc_admin_soy");
  const row = data as { ok?: boolean; admin?: boolean } | null;
  return Boolean(row?.admin);
}

export async function plcAdminLibro(input: {
  desde?: string | null;
  hasta?: string | null;
  tipo?: string | null;
  estado?: string | null;
}) {
  const { data, error } = await supabase.rpc("plc_admin_libro_movimientos", {
    p_desde: input.desde || null,
    p_hasta: input.hasta || null,
    p_tipo: input.tipo || null,
    p_estado: input.estado || null,
    p_limit: 500,
  });
  if (error) return { ok: false as const, error: error.message, movimientos: [] as Record<string, unknown>[] };
  const row = data as { ok?: boolean; error?: string; movimientos?: unknown } | null;
  if (!row?.ok) return { ok: false as const, error: row?.error ?? "no_admin", movimientos: [] as Record<string, unknown>[] };
  return {
    ok: true as const,
    movimientos: Array.isArray(row.movimientos) ? (row.movimientos as Record<string, unknown>[]) : [],
  };
}

export async function plcAdminResumen() {
  const { data, error } = await supabase.rpc("plc_admin_resumen_finanzas");
  if (error) return { ok: false as const, error: error.message };
  const row = data as Record<string, unknown> | null;
  if (!row?.ok) return { ok: false as const, error: String(row?.error ?? "no_admin") };
  return { ok: true as const, ...row };
}

export async function plcAdminTransferencias(estado?: string | null) {
  const { data, error } = await supabase.rpc("plc_admin_listar_transferencias", {
    p_estado: estado || null,
  });
  if (error) return { ok: false as const, error: error.message, transferencias: [] as Record<string, unknown>[] };
  const row = data as { ok?: boolean; error?: string; transferencias?: unknown } | null;
  if (!row?.ok) {
    return { ok: false as const, error: row?.error ?? "no_admin", transferencias: [] as Record<string, unknown>[] };
  }
  return {
    ok: true as const,
    transferencias: Array.isArray(row.transferencias) ? (row.transferencias as Record<string, unknown>[]) : [],
  };
}

export async function plcAdminAprobarTransferencia(id: string) {
  const { data, error } = await supabase.rpc("plc_admin_aprobar_transferencia", { p_movimiento_id: id });
  if (error) return { ok: false as const, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) return { ok: false as const, error: row?.error ?? "error" };
  return { ok: true as const };
}

export async function plcAdminMarcarTransferida(id: string, comprobanteUrl: string) {
  const { data, error } = await supabase.rpc("plc_admin_marcar_transferida", {
    p_movimiento_id: id,
    p_comprobante_url: comprobanteUrl,
  });
  if (error) return { ok: false as const, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) return { ok: false as const, error: row?.error ?? "error" };
  return { ok: true as const };
}

export async function plcAdminRevisiones() {
  const { data, error } = await supabase.rpc("plc_admin_revisiones_pendientes");
  if (error) return { ok: false as const, error: error.message };
  const row = data as Record<string, unknown> | null;
  if (!row?.ok) return { ok: false as const, error: String(row?.error ?? "no_admin") };
  return { ok: true as const, ...row };
}

export function pesos(n: unknown): string {
  const v = typeof n === "number" ? n : Number(n ?? 0);
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(
    Number.isFinite(v) ? v : 0
  );
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [columns.join(",")];
  for (const r of rows) {
    lines.push(columns.map((c) => esc(r[c])).join(","));
  }
  return lines.join("\n");
}
