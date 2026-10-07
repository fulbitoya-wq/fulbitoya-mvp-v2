"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCanchasDelOwner, type Cancha } from "@/lib/canchas";
import {
  cargarAgendaPredio,
  claseVisual,
  etiquetaVisual,
  hoyArgentina,
  type AgendaTurno,
} from "@/lib/agenda";
import { AgendaTurnoSheet } from "@/components/dashboard/AgendaTurnoSheet";
import { cargarHoyPredio, faltaCobroPredio, type HoyResumen } from "@/lib/hoy";

function pesos(n: number) {
  return `$${Number(n).toLocaleString("es-AR")}`;
}

function claseAlerta(tipo: string) {
  if (tipo === "cancelacion" || tipo === "disputa") return "border-red-200 bg-[#FFEBEE]";
  if (tipo === "abierto") return "border-[#C8E6C9] bg-[#E8F5E9]";
  if (tipo === "app") return "border-[#1A2E4A]/20 bg-[#E8EEF5]";
  return "border-[#E0E0E0] bg-white";
}

export default function DashboardPage() {
  const [canchas, setCanchas] = useState<Cancha[]>([]);
  const [canchaId, setCanchaId] = useState("");
  const [turnos, setTurnos] = useState<AgendaTurno[]>([]);
  const [resumen, setResumen] = useState<HoyResumen | null>(null);
  const [sel, setSel] = useState<AgendaTurno | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const hoy = hoyArgentina();

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setError(null);
    const [ag, rs] = await Promise.all([cargarAgendaPredio(id, hoy, hoy), cargarHoyPredio(id)]);
    if (!ag.ok) {
      setError(ag.error);
      setTurnos([]);
    } else {
      setTurnos(
        [...ag.turnos].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio) || a.campo_nombre.localeCompare(b.campo_nombre)),
      );
    }
    if (!rs.ok) setError(rs.error);
    else setResumen(rs.data);
  }, [hoy]);

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
  }, [load]);

  useEffect(() => {
    if (canchaId) void load(canchaId);
  }, [canchaId, load]);

  const predio = canchas.find((c) => c.id === canchaId);
  const senaDefault = useMemo(() => Number(predio?.valor_reserva ?? 0), [predio]);
  const ocupados = turnos.filter((t) => t.visual !== "libre" && t.visual !== "bloqueado");

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-subheading text-2xl font-semibold text-[#1A2E4A]">Hoy</h1>
          <p className="mt-1 text-sm text-[#1A2E4A]/70">{hoy} · turnos, cobros y alertas del día.</p>
        </div>
        <Link href="/dashboard/disponibilidades" className="rounded-lg bg-[#1A2E4A] px-4 py-2.5 text-sm font-medium text-white">
          Ver agenda
        </Link>
      </div>

      <select
        className="mt-4 rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-sm"
        value={canchaId}
        onChange={(e) => setCanchaId(e.target.value)}
      >
        {canchas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="mt-6 text-sm text-[#1A2E4A]/70">Cargando el día…</p> : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#E0E0E0] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[#1A2E4A]/50">Ocupación</p>
          <p className="mt-1 text-2xl font-semibold text-[#1A2E4A]">{resumen ? `${resumen.ocupacion_pct}%` : "—"}</p>
          <p className="text-sm text-[#1A2E4A]/60">
            {resumen ? `${resumen.ocupados} de ${resumen.total_turnos} turnos` : "Sin datos"}
          </p>
        </div>
        <div className="rounded-xl border border-[#E0E0E0] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[#1A2E4A]/50">A cobrar en el predio</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--fulbito-green)]">{resumen ? pesos(resumen.a_cobrar) : "—"}</p>
        </div>
        <div className="rounded-xl border border-[#E0E0E0] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[#1A2E4A]/50">Turnos tomados</p>
          <p className="mt-1 text-2xl font-semibold text-[#1A2E4A]">{ocupados.length}</p>
          <p className="text-sm text-[#1A2E4A]/60">de {turnos.length} en la grilla</p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-medium text-[#1A2E4A]">Alertas</h2>
        {!resumen?.alertas.length ? (
          <p className="mt-2 text-sm text-[#1A2E4A]/60">Nada urgente por ahora.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {resumen.alertas.map((a, i) => {
              const t = a.disponibilidad_id ? turnos.find((x) => x.id === a.disponibilidad_id) : undefined;
              return (
                <li key={`${a.tipo}-${i}`}>
                  <button
                    type="button"
                    disabled={!t}
                    onClick={() => t && setSel(t)}
                    className={`w-full rounded-xl border px-4 py-3 text-left ${claseAlerta(a.tipo)} ${t ? "" : "opacity-80"}`}
                  >
                    <p className="text-sm font-semibold text-[#1A2E4A]">{a.titulo}</p>
                    <p className="text-sm text-[#1A2E4A]/70">{a.detalle}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-medium text-[#1A2E4A]">Turnos de hoy</h2>
        {turnos.length === 0 && !loading ? (
          <p className="mt-2 text-sm text-[#1A2E4A]/60">No hay turnos generados para hoy.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {turnos.map((t) => {
              const falta = faltaCobroPredio(t.reserva, t.precio);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSel(t)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left ${claseVisual(t.visual)}`}
                  >
                    <span>
                      <span className="block text-sm font-semibold">
                        {t.hora_inicio} · {t.campo_nombre}
                      </span>
                      <span className="block text-xs opacity-80">
                        {t.reserva?.titular_nombre || etiquetaVisual(t.visual)}
                        {falta > 0 ? ` · falta ${pesos(falta)}` : ""}
                      </span>
                    </span>
                    <span className="text-xs font-medium">{etiquetaVisual(t.visual)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {sel ? (
        <AgendaTurnoSheet
          turno={sel}
          predioNombre={predio?.nombre ?? ""}
          senaDefault={senaDefault}
          onClose={() => setSel(null)}
          onDone={async () => {
            setSel(null);
            await load(canchaId);
          }}
        />
      ) : null}
    </div>
  );
}
