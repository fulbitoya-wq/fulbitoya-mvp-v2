"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { pesos } from "@/lib/admin-plc";

type Diff = {
  mp_payment_id: string;
  en_mp: boolean;
  en_db: boolean;
  monto_mp?: number | null;
  monto_db?: number | null;
  status_mp?: string | null;
  origen_db?: string | null;
  nota?: string;
};

export default function AdminConciliacionPage() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [diffs, setDiffs] = useState<Diff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const correr = async () => {
    setBusy(true);
    setError(null);
    setSummary(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setBusy(false);
      setError("Tenés que iniciar sesión.");
      return;
    }
    const res = await fetch("/api/admin/conciliacion-mp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ desde: desde || null, hasta: hasta || null }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      diffs?: Diff[];
      mp_count?: number;
      db_count?: number;
    };
    setBusy(false);
    if (!res.ok || !body.ok) {
      setError(body.error ?? "No se pudo conciliar.");
      return;
    }
    setDiffs(body.diffs ?? []);
    setSummary(`MP: ${body.mp_count ?? 0} pagos · DB: ${body.db_count ?? 0} registros · Diferencias: ${(body.diffs ?? []).length}`);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-[#1A2E4A]">Conciliación Mercado Pago</h2>
      <p className="mt-1 text-sm text-[#1A2E4A]/70">
        Compara los pagos registrados en PorLaCancha con los de Mercado Pago (token de prueba/prod en Vercel) y marca
        diferencias.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded border px-2 py-1.5 text-sm" />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded border px-2 py-1.5 text-sm" />
        <button
          type="button"
          disabled={busy}
          onClick={() => void correr()}
          className="rounded-lg bg-[var(--fulbito-green)] px-3 py-1.5 text-sm text-white"
        >
          {busy ? "Comparando…" : "Correr conciliación"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {summary ? <p className="mt-3 text-sm text-[#1A2E4A]">{summary}</p> : null}

      <ul className="mt-4 divide-y divide-[#E0E0E0] rounded-xl border border-[#E0E0E0] bg-white">
        {diffs.length === 0 ? (
          <li className="p-4 text-sm text-[#1A2E4A]/60">Sin diferencias (o todavía no corriste el chequeo).</li>
        ) : null}
        {diffs.map((d) => (
          <li key={d.mp_payment_id} className="p-3 text-sm">
            <p className="font-mono text-xs text-[#1A2E4A]/70">{d.mp_payment_id}</p>
            <p className="text-[#1A2E4A]">
              MP: {d.en_mp ? `${d.status_mp ?? "?"} · ${pesos(d.monto_mp)}` : "no está"} · DB:{" "}
              {d.en_db ? `${d.origen_db ?? "?"} · ${pesos(d.monto_db)}` : "no está"}
            </p>
            {d.nota ? <p className="text-xs text-amber-700">{d.nota}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
