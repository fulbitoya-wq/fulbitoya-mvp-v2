"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCanchasDelOwner, type Cancha } from "@/lib/canchas";
import { hoyArgentina } from "@/lib/agenda";
import { cajaToCsv, cargarCajaPredio, fyCerrarCaja, type CajaData } from "@/lib/caja";

function pesos(n: number) {
  return `$${Number(n).toLocaleString("es-AR")}`;
}

function primerDiaMes(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function ultimoDiaMes(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m, 0));
  return dt.toISOString().slice(0, 10);
}

export default function CajaPage() {
  const [canchas, setCanchas] = useState<Cancha[]>([]);
  const [canchaId, setCanchaId] = useState("");
  const [vista, setVista] = useState<"dia" | "mes">("dia");
  const [fecha, setFecha] = useState(hoyArgentina());
  const [data, setData] = useState<CajaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const rango = useMemo(() => {
    if (vista === "mes") return { desde: primerDiaMes(fecha), hasta: ultimoDiaMes(fecha) };
    return { desde: fecha, hasta: fecha };
  }, [vista, fecha]);

  const load = useCallback(async (id: string, desde: string, hasta: string) => {
    if (!id) return;
    setError(null);
    const res = await cargarCajaPredio(id, desde, hasta);
    if (!res.ok) {
      setError(res.error);
      setData(null);
      return;
    }
    setData(res.data);
  }, []);

  useEffect(() => {
    const boot = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Debés estar logueado.");
        setLoading(false);
        return;
      }
      const rows = await getCanchasDelOwner(user.id);
      setCanchas(rows);
      if (rows[0]) setCanchaId(rows[0].id);
      setLoading(false);
    };
    void boot();
  }, []);

  useEffect(() => {
    if (canchaId) void load(canchaId, rango.desde, rango.hasta);
  }, [canchaId, rango.desde, rango.hasta, load]);

  const t = data?.totales;
  const esDia = vista === "dia";

  const exportar = () => {
    if (!data) return;
    const blob = new Blob([cajaToCsv(data)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `caja-${rango.desde}-${rango.hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-subheading text-2xl font-semibold text-[#1A2E4A]">Caja</h1>
      <p className="mt-1 text-sm text-[#1A2E4A]/70">Cobros del predio, de la app y lo que queda pendiente.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-sm"
          value={canchaId}
          onChange={(e) => setCanchaId(e.target.value)}
        >
          {canchas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`rounded-lg px-3 py-2 text-sm ${vista === "dia" ? "bg-[#1A2E4A] text-white" : "border border-[#E0E0E0] bg-white"}`}
          onClick={() => setVista("dia")}
        >
          Día
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-2 text-sm ${vista === "mes" ? "bg-[#1A2E4A] text-white" : "border border-[#E0E0E0] bg-white"}`}
          onClick={() => setVista("mes")}
        >
          Mes
        </button>
        <input
          type="date"
          className="rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
        <button type="button" className="rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-sm" onClick={exportar} disabled={!data}>
          Exportar CSV
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="mt-6 text-sm text-[#1A2E4A]/70">Cargando caja…</p> : null}

      {t ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#E0E0E0] bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-[#1A2E4A]/50">Cobrado en la app</p>
            <p className="mt-1 text-xl font-semibold text-[#1A2E4A]">{pesos(t.cobrado_app)}</p>
          </div>
          <div className="rounded-xl border border-[#E0E0E0] bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-[#1A2E4A]/50">Cobrado en el predio</p>
            <p className="mt-1 text-xl font-semibold text-[var(--fulbito-green)]">
              {pesos(t.cobrado_efectivo + t.cobrado_transferencia + t.cobrado_fuera)}
            </p>
            <p className="text-xs text-[#1A2E4A]/60">
              Efectivo {pesos(t.cobrado_efectivo)} · Transferencia {pesos(t.cobrado_transferencia)}
              {t.cobrado_fuera ? ` · Por fuera ${pesos(t.cobrado_fuera)}` : ""}
            </p>
          </div>
          <div className="rounded-xl border border-[#E0E0E0] bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-[#1A2E4A]/50">Pendiente</p>
            <p className="mt-1 text-xl font-semibold text-[#1A2E4A]">{pesos(t.pendiente)}</p>
          </div>
          <div className="rounded-xl border border-[#E0E0E0] bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-[#1A2E4A]/50">Cuentas entre app y predio</p>
            <p className="mt-1 text-sm text-[#1A2E4A]">La app le debe al predio {pesos(t.app_debe_predio)}</p>
            <p className="text-sm text-[#1A2E4A]">El predio le debe a la app {pesos(t.predio_debe_app)}</p>
          </div>
        </div>
      ) : null}

      {esDia ? (
        <div className="mt-4 rounded-xl border border-[#E0E0E0] bg-white p-4">
          {data?.cierre ? (
            <p className="text-sm text-[#2E7D32]">
              Caja cerrada el {new Date(data.cierre.cerrado_at).toLocaleString("es-AR")}. Snapshot: app {pesos(data.cierre.cobrado_app)} ·
              efectivo {pesos(data.cierre.cobrado_efectivo)} · transferencia {pesos(data.cierre.cobrado_transferencia)}.
            </p>
          ) : (
            <button
              type="button"
              disabled={busy || !canchaId}
              className="rounded-lg bg-[#1A2E4A] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              onClick={async () => {
                if (!confirm("¿Cerrar la caja de este día? Queda un snapshot; no se puede volver a cerrar.")) return;
                setBusy(true);
                const res = await fyCerrarCaja(canchaId, fecha);
                setBusy(false);
                if (!res.ok) setError(res.error);
                else await load(canchaId, rango.desde, rango.hasta);
              }}
            >
              {busy ? "Cerrando…" : "Cerrar caja del día"}
            </button>
          )}
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-xl border border-[#E0E0E0] bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-[#1A2E4A] text-white">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Turno</th>
              <th className="px-3 py-2 text-left font-medium">Cliente</th>
              <th className="px-3 py-2 text-right font-medium">App</th>
              <th className="px-3 py-2 text-right font-medium">Predio</th>
              <th className="px-3 py-2 text-right font-medium">Pendiente</th>
              <th className="px-3 py-2 text-right font-medium">Comisión</th>
            </tr>
          </thead>
          <tbody>
            {!data?.lineas.length ? (
              <tr>
                <td className="px-3 py-6 text-[#1A2E4A]/60" colSpan={6}>
                  No hay movimientos en este período.
                </td>
              </tr>
            ) : (
              data.lineas.map((l) => (
                <tr key={l.reserva_id} className="border-t border-[#EEE]">
                  <td className="px-3 py-2">
                    {l.fecha} {l.hora}
                    <span className="block text-xs text-[#1A2E4A]/60">{l.campo}</span>
                  </td>
                  <td className="px-3 py-2">
                    {l.titular}
                    <span className="block text-xs text-[#1A2E4A]/60">{l.canal || "—"}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{pesos(l.cobrado_app)}</td>
                  <td className="px-3 py-2 text-right">
                    {pesos(l.cobrado_predio)}
                    {l.medio_predio ? <span className="block text-xs text-[#1A2E4A]/60">{l.medio_predio}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right">{pesos(l.pendiente)}</td>
                  <td className="px-3 py-2 text-right">{pesos(l.comision)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data?.comisiones.length ? (
        <section className="mt-6">
          <h2 className="font-medium text-[#1A2E4A]">Comisiones (el predio le debe a la app)</h2>
          <ul className="mt-2 space-y-2">
            {data.comisiones.map((c) => (
              <li key={c.id} className="rounded-xl border border-[#E0E0E0] bg-white px-4 py-3 text-sm">
                {c.fecha} · {pesos(c.monto)} · {c.estado}
                {c.detalle ? <span className="block text-[#1A2E4A]/60">{c.detalle}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
