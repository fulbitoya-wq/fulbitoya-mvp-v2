"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCanchasDelOwner, type Cancha } from "@/lib/canchas";
import {
  addDaysISO,
  cargarAgendaPredio,
  hoyArgentina,
  mondayOf,
  type AgendaCampo,
  type AgendaTurno,
} from "@/lib/agenda";
import { regenerarTurnosPredio } from "@/lib/turnos";
import { AgendaBoard } from "@/components/dashboard/AgendaBoard";
import { AgendaTurnoSheet } from "@/components/dashboard/AgendaTurnoSheet";

export default function DashboardAgendaPage() {
  const [canchas, setCanchas] = useState<Cancha[]>([]);
  const [canchaId, setCanchaId] = useState("");
  const [campos, setCampos] = useState<AgendaCampo[]>([]);
  const [turnos, setTurnos] = useState<AgendaTurno[]>([]);
  const [vista, setVista] = useState<"dia" | "semana">("dia");
  const [fecha, setFecha] = useState(hoyArgentina());
  const [campoFiltro, setCampoFiltro] = useState<string | null>(null);
  const [sel, setSel] = useState<AgendaTurno | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [suelto, setSuelto] = useState({ campoId: "", hora: "18:00", fin: "19:00", precio: "" });
  const [armando, setArmando] = useState(false);

  const semanaInicio = vista === "semana" ? mondayOf(fecha) : fecha;
  const hasta = vista === "semana" ? addDaysISO(semanaInicio, 6) : fecha;

  const load = useCallback(async (id: string, desde: string, h: string, intentarArmar = true) => {
    if (!id) return;
    setError(null);
    const res = await cargarAgendaPredio(id, desde, h);
    if (!res.ok) {
      setError(res.error);
      setTurnos([]);
      setCampos([]);
      return;
    }
    setCampos(res.campos);
    setTurnos(res.turnos);
    setCampoFiltro((prev) => {
      if (prev && res.campos.some((c) => c.id === prev)) return prev;
      return null;
    });
    if (intentarArmar && res.campos.length > 0 && res.turnos.length === 0) {
      const gen = await regenerarTurnosPredio(id);
      if (gen.ok) {
        await load(id, desde, h, false);
        return;
      }
      setError(gen.error ?? "No se pudieron armar los turnos. Revisá horarios de apertura y precios de cada cancha.");
    }
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
      if (rows[0]) {
        setCanchaId(rows[0].id);
        await load(rows[0].id, semanaInicio, hasta);
      }
      setLoading(false);
    };
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canchaId) return;
    void load(canchaId, semanaInicio, hasta);
  }, [canchaId, semanaInicio, hasta, load]);

  useEffect(() => {
    if (vista !== "semana") return;
    if (!campoFiltro && campos[0]) setCampoFiltro(campos[0].id);
  }, [vista, campoFiltro, campos]);

  const predio = canchas.find((c) => c.id === canchaId);
  const senaDefault = useMemo(() => Number(predio?.valor_reserva ?? 0), [predio]);

  const crearSuelto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suelto.campoId) return;
    const { error: err } = await supabase.from("disponibilidades").insert({
      campo_id: suelto.campoId,
      fecha,
      hora_inicio: suelto.hora,
      hora_fin: suelto.fin,
      precio: Number(suelto.precio) || 0,
      estado: "disponible",
      origen: "manual",
    });
    if (err) setError(err.message);
    else await load(canchaId, semanaInicio, hasta);
  };

  return (
    <div className="p-4 sm:p-6">
      <h1 className="font-subheading text-2xl font-semibold text-[#1A2E4A]">Agenda</h1>
      <p className="mt-1 text-sm text-[#1A2E4A]/70">
        Cada columna es una cancha. El blanco es un turno libre.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
        <button type="button" className="rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-sm" onClick={() => setFecha(addDaysISO(vista === "semana" ? semanaInicio : fecha, - (vista === "semana" ? 7 : 1)))}>
          ←
        </button>
        <button type="button" className="rounded-lg bg-[#1A2E4A] px-3 py-2 text-sm text-white" onClick={() => setFecha(hoyArgentina())}>
          Hoy
        </button>
        <button type="button" className="rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-sm" onClick={() => setFecha(addDaysISO(vista === "semana" ? semanaInicio : fecha, vista === "semana" ? 7 : 1))}>
          →
        </button>
        <input type="date" className="rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <div className="flex rounded-lg border border-[#E0E0E0] bg-white p-0.5 text-sm">
          <button type="button" onClick={() => { setVista("dia"); setCampoFiltro(null); }} className={`rounded-md px-3 py-1.5 ${vista === "dia" ? "bg-[#1A2E4A] text-white" : ""}`}>
            Día
          </button>
          <button
            type="button"
            onClick={() => {
              setVista("semana");
              setFecha(mondayOf(fecha));
            }}
            className={`rounded-md px-3 py-1.5 ${vista === "semana" ? "bg-[#1A2E4A] text-white" : ""}`}
          >
            Semana
          </button>
        </div>
        <button
          type="button"
          disabled={armando || !canchaId}
          className="rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-sm disabled:opacity-60"
          onClick={async () => {
            if (!canchaId) return;
            setArmando(true);
            const gen = await regenerarTurnosPredio(canchaId);
            if (!gen.ok) setError(gen.error);
            else await load(canchaId, semanaInicio, hasta, false);
            setArmando(false);
          }}
        >
          {armando ? "Armando…" : "Armar turnos"}
        </button>
      </div>

      {campos.length > 0 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {vista === "dia" ? (
            <button
              type="button"
              onClick={() => setCampoFiltro(null)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${!campoFiltro ? "bg-[#1A2E4A] text-white" : "border border-[#E0E0E0] bg-white"}`}
            >
              Todas las canchas
            </button>
          ) : null}
          {campos.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCampoFiltro(c.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${campoFiltro === c.id ? "bg-[#1A2E4A] text-white" : "border border-[#E0E0E0] bg-white"}`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#1A2E4A]/70">
        {[
          ["Libre", "bg-white border"],
          ["App", "bg-[#1A2E4A] text-white"],
          ["A mano", "bg-[#2C4A72] text-white"],
          ["Pago 10 min", "bg-[#FFC107]"],
          ["Bloqueado", "bg-[#ECEFF1]"],
          ["Abierto", "bg-[#E8F5E9] border border-[#4CAF50]"],
          ["Fijo", "bg-[#90A4AE] text-white"],
        ].map(([l, cls]) => (
          <span key={l} className={`rounded px-2 py-0.5 ${cls}`}>
            {l}
          </span>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="mt-6 text-sm text-[#1A2E4A]/70">Cargando agenda…</p> : (
        <AgendaBoard
          vista={vista}
          fecha={semanaInicio}
          campos={campos}
          turnos={turnos}
          campoFiltro={vista === "semana" ? campoFiltro : campoFiltro}
          onPick={setSel}
        />
      )}

      <details className="mt-6 rounded-xl border border-[#E0E0E0] bg-white p-4">
        <summary className="cursor-pointer font-medium text-[#1A2E4A]">Turno suelto</summary>
        <form onSubmit={(e) => void crearSuelto(e)} className="mt-3 grid gap-2 sm:grid-cols-4">
          <select className="rounded-lg border border-[#E0E0E0] px-3 py-2" value={suelto.campoId} onChange={(e) => setSuelto({ ...suelto, campoId: e.target.value })}>
            <option value="">Cancha</option>
            {campos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <input type="time" className="rounded-lg border border-[#E0E0E0] px-3 py-2" value={suelto.hora} onChange={(e) => setSuelto({ ...suelto, hora: e.target.value })} />
          <input type="time" className="rounded-lg border border-[#E0E0E0] px-3 py-2" value={suelto.fin} onChange={(e) => setSuelto({ ...suelto, fin: e.target.value })} />
          <input type="number" placeholder="Precio" className="rounded-lg border border-[#E0E0E0] px-3 py-2" value={suelto.precio} onChange={(e) => setSuelto({ ...suelto, precio: e.target.value })} />
          <button className="rounded-lg bg-[var(--fulbito-green)] py-2 text-sm font-medium text-white sm:col-span-4">Crear</button>
        </form>
      </details>

      {sel ? (
        <AgendaTurnoSheet
          turno={sel}
          predioNombre={predio?.nombre ?? "el predio"}
          senaDefault={senaDefault}
          onClose={() => setSel(null)}
          onDone={async () => {
            setSel(null);
            await load(canchaId, semanaInicio, hasta);
          }}
        />
      ) : null}
    </div>
  );
}
