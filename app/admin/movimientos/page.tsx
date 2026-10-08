"use client";

import { useEffect, useMemo, useState } from "react";
import { pesos, plcAdminLibro, toCsv } from "@/lib/admin-plc";

const TIPOS = [
  "",
  "pago_reserva",
  "pago_desafio",
  "reembolso_cancha",
  "reembolso_mitad",
  "reembolso_total",
  "reembolso_reserva",
  "tarifa_servicio_retenida",
  "deuda_predio",
  "comision_app_reserva",
];

const ESTADOS = ["", "pendiente", "procesado", "error", "reservada", "confirmada", "cancelada"];

export default function AdminMovimientosPage() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setError(null);
    const res = await plcAdminLibro({ desde: desde || null, hasta: hasta || null, tipo, estado });
    setBusy(false);
    if (!res.ok) setError(res.error);
    setRows(res.movimientos);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const csv = useMemo(
    () =>
      toCsv(rows, [
        "fecha",
        "tipo",
        "estado",
        "monto",
        "usuario_nombre",
        "usuario_email",
        "partido_titulo",
        "predio_nombre",
        "mp_payment_id",
        "mp_refund_id",
        "detalle",
        "origen_fila",
      ]),
    [rows]
  );

  const download = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `libro-movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-[#1A2E4A]">Libro de movimientos</h2>
      <p className="mt-1 text-sm text-[#1A2E4A]/70">
        Pagos, reembolsos, tarifas y transferencias, con referencia de Mercado Pago.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded border px-2 py-1.5 text-sm" />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded border px-2 py-1.5 text-sm" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded border px-2 py-1.5 text-sm">
          {TIPOS.map((t) => (
            <option key={t || "all"} value={t}>
              {t || "Todos los tipos"}
            </option>
          ))}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="rounded border px-2 py-1.5 text-sm">
          {ESTADOS.map((t) => (
            <option key={t || "all"} value={t}>
              {t || "Todos los estados"}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="rounded-lg bg-[var(--fulbito-green)] px-3 py-1.5 text-sm text-white"
        >
          Filtrar
        </button>
        <button type="button" onClick={download} className="rounded-lg border px-3 py-1.5 text-sm text-[#1A2E4A]">
          Exportar CSV
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-[#E0E0E0] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#F5F5F5] text-[#1A2E4A]/70">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Monto</th>
              <th className="px-3 py-2">Usuario</th>
              <th className="px-3 py-2">Partido / predio</th>
              <th className="px-3 py-2">MP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-[#1A2E4A]/60">
                  No hay movimientos con esos filtros.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={`${String(r.origen_fila)}-${String(r.id)}`} className="border-t border-[#E0E0E0]/80">
                <td className="px-3 py-2 whitespace-nowrap">{String(r.fecha ?? "")}</td>
                <td className="px-3 py-2">{String(r.tipo ?? "")}</td>
                <td className="px-3 py-2">{String(r.estado ?? "")}</td>
                <td className="px-3 py-2 whitespace-nowrap">{pesos(r.monto)}</td>
                <td className="px-3 py-2">
                  {String(r.usuario_nombre ?? "—")}
                  <div className="text-xs text-[#1A2E4A]/50">{String(r.usuario_email ?? "")}</div>
                </td>
                <td className="px-3 py-2">
                  {String(r.partido_titulo ?? "—")}
                  <div className="text-xs text-[#1A2E4A]/50">{String(r.predio_nombre ?? "")}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {String(r.mp_payment_id ?? r.mp_refund_id ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
