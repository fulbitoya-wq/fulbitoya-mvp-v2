"use client";

import { useEffect, useState } from "react";
import { pesos, plcAdminResumen } from "@/lib/admin-plc";

export default function AdminResumenPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void plcAdminResumen().then((res) => {
      if (!res.ok) setError(res.error);
      else setData(res);
    });
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-[#1A2E4A]/70">Cargando resumen…</p>;

  const cards = [
    { label: "Tarifas cobradas hoy", value: pesos(data.tarifas_dia) },
    { label: "Tarifas esta semana", value: pesos(data.tarifas_semana) },
    { label: "Tarifas este mes", value: pesos(data.tarifas_mes) },
    { label: "Retenido esperando resultado", value: pesos(data.retenido_esperando_resultado) },
    { label: "Total adeudado a predios", value: pesos(data.adeudado_predios) },
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold text-[#1A2E4A]">Resumen</h2>
      <p className="mt-1 text-sm text-[#1A2E4A]/70">
        Tarifas retenidas, plata en juego y deudas a predios. Día de referencia: {String(data.hoy ?? "")}.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-[#E0E0E0] bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-[#1A2E4A]/50">{c.label}</p>
            <p className="mt-2 text-2xl font-semibold text-[#1A2E4A]">{c.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-[#1A2E4A]/60">
        Para dar acceso a alguien: en Supabase SQL,{" "}
        <code className="rounded bg-white px-1">update usuarios set rol = &apos;admin&apos; where email = &apos;…&apos;;</code>{" "}
        (solo service_role / SQL Editor).
      </p>
    </div>
  );
}
