"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SiteShell } from "@/components/SiteShell";
import { getSupabase } from "@/lib/supabase";
import { rpcResponderValidacionPredio, rpcVerValidacionPredio } from "@shared/equipos";

export default function ValidacionPredioPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !token) return;
    void rpcVerValidacionPredio(supabase, token).then((res) => {
      if (!res.ok) setError(res.error);
      else setData(res);
    });
  }, [token]);

  const responder = async (confirma: boolean) => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    const res = await rpcResponderValidacionPredio(supabase, token, confirma);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(confirma ? "confirmada" : "rechazada");
  };

  return (
    <SiteShell>
      <h1 className="font-display mt-4 text-4xl leading-none text-plc-white">Validación de reserva</h1>
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {done ? (
        <p className="mt-6 text-sm text-plc-text-secondary">
          {done === "confirmada"
            ? "Gracias. Confirmaste la reserva."
            : "Listo. Marcaste que no reconocés esta reserva."}
        </p>
      ) : data ? (
        <div className="card-plc mt-6 space-y-2 px-4 py-4 text-sm text-plc-text-secondary">
          <p>
            <span className="text-plc-white">Quién reservó:</span> {String(data.quien_reservo ?? "")}
          </p>
          <p>
            <span className="text-plc-white">Predio:</span> {String(data.cancha ?? "")}
          </p>
          <p>
            <span className="text-plc-white">Día:</span> {String(data.fecha ?? "")}
          </p>
          <p>
            <span className="text-plc-white">Hora:</span> {String(data.hora_inicio ?? "").slice(0, 5)}
          </p>
          <p>
            <span className="text-plc-white">Monto:</span> ${String(data.monto ?? "")}
          </p>
          <p>
            <span className="text-plc-white">Alias / CBU:</span> {String(data.alias ?? "")}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void responder(true)}
              className="rounded-md bg-plc-gold px-4 py-2 text-sm font-medium text-plc-navy"
            >
              Confirmo
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void responder(false)}
              className="rounded-md border border-white/20 px-4 py-2 text-sm text-plc-white"
            >
              No reconozco esta reserva
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-plc-text-secondary">Cargando…</p>
      )}
    </SiteShell>
  );
}
