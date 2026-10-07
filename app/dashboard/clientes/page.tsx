"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCanchasDelOwner, type Cancha } from "@/lib/canchas";
import {
  detalleClientePredio,
  guardarNotaCliente,
  listarClientesPredio,
  marcarAsistencia,
  type ClienteLista,
  type ClienteTurno,
} from "@/lib/clientes";

export default function ClientesPage() {
  const [canchas, setCanchas] = useState<Cancha[]>([]);
  const [canchaId, setCanchaId] = useState("");
  const [rows, setRows] = useState<ClienteLista[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<ClienteLista | null>(null);
  const [hist, setHist] = useState<ClienteTurno[]>([]);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setError(null);
    const res = await listarClientesPredio(id);
    if (!res.ok) {
      setError(res.error);
      setRows([]);
      return;
    }
    setRows(res.clientes);
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
      const cs = await getCanchasDelOwner(user.id);
      setCanchas(cs);
      if (cs[0]) setCanchaId(cs[0].id);
      setLoading(false);
    };
    void boot();
  }, []);

  useEffect(() => {
    if (canchaId) void load(canchaId);
  }, [canchaId, load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.nombre.toLowerCase().includes(s) ||
        (r.telefono ?? "").toLowerCase().includes(s) ||
        (r.notas ?? "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  const abrir = async (c: ClienteLista) => {
    setSel(c);
    setNotas(c.notas ?? "");
    const d = await detalleClientePredio(canchaId, c.clave);
    if (!d.ok) setError(d.error);
    else {
      setHist(d.historial);
      setNotas(d.notas);
    }
  };

  const recargarSel = async (clave: string) => {
    await load(canchaId);
    const d = await detalleClientePredio(canchaId, clave);
    if (d.ok) {
      setHist(d.historial);
      setNotas(d.notas);
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-subheading text-2xl font-semibold text-[#1A2E4A]">Clientes</h1>
      <p className="mt-1 text-sm text-[#1A2E4A]/70">
        Sale de las reservas: jugadores de la app y clientes cargados a mano.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-sm"
          value={canchaId}
          onChange={(e) => {
            setCanchaId(e.target.value);
            setSel(null);
          }}
        >
          {canchas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <input
          className="min-w-[12rem] flex-1 rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm"
          placeholder="Buscar nombre o teléfono"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="mt-6 text-sm text-[#1A2E4A]/70">Cargando clientes…</p> : null}

      <ul className="mt-6 space-y-2">
        {filtered.length === 0 && !loading ? (
          <li className="text-sm text-[#1A2E4A]/60">Todavía no hay clientes en este predio.</li>
        ) : (
          filtered.map((c) => (
            <li key={c.clave}>
              <button
                type="button"
                onClick={() => void abrir(c)}
                className="w-full rounded-xl border border-[#E0E0E0] bg-white px-4 py-3 text-left"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#1A2E4A]">{c.nombre}</span>
                  <span className="text-xs uppercase tracking-wide text-[#1A2E4A]/50">
                    {c.origen === "app" ? "App" : "A mano"}
                  </span>
                </span>
                <span className="mt-1 block text-sm text-[#1A2E4A]/70">
                  {c.telefono || "Sin teléfono"} · {c.reservas} reservas
                  {c.ultima_fecha ? ` · última ${c.ultima_fecha}` : ""}
                  {c.asistio || c.no_vino ? ` · vino ${c.asistio} / no vino ${c.no_vino}` : ""}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>

      {sel ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[#1A2E4A]">{sel.nombre}</p>
                <p className="text-sm text-[#1A2E4A]/70">{sel.telefono || "Sin teléfono"} · {sel.origen === "app" ? "App" : "A mano"}</p>
              </div>
              <button type="button" className="text-sm text-[#1A2E4A]/60" onClick={() => setSel(null)}>
                Cerrar
              </button>
            </div>

            <label className="mt-4 block text-sm text-[#1A2E4A]">Notas</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm"
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-[#1A2E4A] py-2.5 text-sm font-medium text-white"
              onClick={async () => {
                setBusy(true);
                const res = await guardarNotaCliente(canchaId, sel.clave, notas);
                setBusy(false);
                if (!res.ok) setError(res.error);
                else await load(canchaId);
              }}
            >
              Guardar nota
            </button>

            <p className="mt-5 font-medium text-[#1A2E4A]">Historial</p>
            {hist.length === 0 ? (
              <p className="mt-2 text-sm text-[#1A2E4A]/60">No hay reservas ligadas (puede ser solo un fijo).</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {hist.map((h) => (
                  <li key={h.reserva_id} className="rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm">
                    <p>
                      {h.fecha} {h.hora} · {h.campo}
                    </p>
                    <p className="text-[#1A2E4A]/60">
                      {h.estado ?? "—"} · {h.asistencia === "asistio" ? "Vino" : h.asistencia === "no_vino" ? "No vino" : "Sin marcar"}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="flex-1 rounded-lg bg-[var(--fulbito-green)] py-2 text-white"
                        onClick={async () => {
                          const res = await marcarAsistencia(h.reserva_id, "asistio");
                          if (!res.ok) setError(res.error);
                          else await recargarSel(sel.clave);
                        }}
                      >
                        Vino
                      </button>
                      <button
                        type="button"
                        className="flex-1 rounded-lg border border-[#1A2E4A] py-2"
                        onClick={async () => {
                          const res = await marcarAsistencia(h.reserva_id, "no_vino");
                          if (!res.ok) setError(res.error);
                          else await recargarSel(sel.clave);
                        }}
                      >
                        No vino
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
