"use client";

import { useEffect, useState } from "react";
import {
  pesos,
  plcAdminAprobarTransferencia,
  plcAdminMarcarTransferida,
  plcAdminTransferencias,
} from "@/lib/admin-plc";

export default function AdminTransferenciasPage() {
  const [filtro, setFiltro] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [comprobantes, setComprobantes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const res = await plcAdminTransferencias(filtro || null);
    if (!res.ok) setError(res.error);
    setRows(res.transferencias);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  const aprobar = async (id: string) => {
    setBusy(id);
    const res = await plcAdminAprobarTransferencia(id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else await load();
  };

  const marcar = async (id: string) => {
    const url = (comprobantes[id] ?? "").trim();
    if (!url) {
      setError("Pegá el link del comprobante.");
      return;
    }
    setBusy(id);
    const res = await plcAdminMarcarTransferida(id, url);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else await load();
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-[#1A2E4A]">Transferencias a predios</h2>
      <p className="mt-1 text-sm text-[#1A2E4A]/70">
        Pendientes, aprobadas y hechas. Alias, titular y verificación del predio.
      </p>

      <div className="mt-4 flex gap-2">
        {["", "pendiente", "aprobada", "hecha"].map((f) => (
          <button
            key={f || "todas"}
            type="button"
            onClick={() => setFiltro(f)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filtro === f ? "bg-[var(--fulbito-green)] text-white" : "border text-[#1A2E4A]"
            }`}
          >
            {f || "Todas"}
          </button>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <ul className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <li className="rounded-xl border bg-white p-4 text-sm text-[#1A2E4A]/60">No hay transferencias.</li>
        ) : null}
        {rows.map((t) => {
          const id = String(t.id);
          const estado = String(t.transferencia_estado ?? "pendiente");
          return (
            <li key={id} className="rounded-xl border border-[#E0E0E0] bg-white p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[#1A2E4A]">
                    {String(t.predio_nombre ?? "Predio")} · {pesos(t.monto)}
                  </p>
                  <p className="text-[#1A2E4A]/70">
                    {String(t.partido_titulo ?? "")} · {String(t.partido_fecha ?? "")}
                  </p>
                  <p className="mt-1 text-[#1A2E4A]/80">
                    Alias: {String(t.alias_snapshot ?? t.alias_cbu ?? "—")} · Titular:{" "}
                    {String(t.titular_snapshot ?? t.alias_titular ?? "—")}
                  </p>
                  <p className="text-xs text-[#1A2E4A]/50">
                    Verificación: {String(t.verificacion_estado ?? "sin_validar")} ·{" "}
                    {t.adherido ? "Adherido" : "No adherido"} · Estado: {estado}
                  </p>
                  {t.comprobante_url ? (
                    <a
                      href={String(t.comprobante_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--fulbito-green)] underline"
                    >
                      Ver comprobante
                    </a>
                  ) : null}
                </div>
                <div className="flex min-w-[240px] flex-col gap-2">
                  {estado === "pendiente" ? (
                    <button
                      type="button"
                      disabled={busy === id}
                      onClick={() => void aprobar(id)}
                      className="rounded-lg border px-3 py-1.5"
                    >
                      Aprobar
                    </button>
                  ) : null}
                  {estado !== "hecha" ? (
                    <>
                      <input
                        className="rounded border px-2 py-1.5 text-xs"
                        placeholder="URL del comprobante"
                        value={comprobantes[id] ?? ""}
                        onChange={(e) => setComprobantes((prev) => ({ ...prev, [id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        disabled={busy === id}
                        onClick={() => void marcar(id)}
                        className="rounded-lg bg-[var(--fulbito-green)] px-3 py-1.5 text-white"
                      >
                        Marcar transferida
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
