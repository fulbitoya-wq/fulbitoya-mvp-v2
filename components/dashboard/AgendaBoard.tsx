"use client";

import { useMemo } from "react";
import { addDaysISO, claseVisual, etiquetaVisual, type AgendaCampo, type AgendaTurno } from "@/lib/agenda";

function hhmm(t: string) {
  return t.slice(0, 5);
}

export function AgendaBoard({
  vista,
  fecha,
  campos,
  turnos,
  campoFiltro,
  onPick,
}: {
  vista: "dia" | "semana";
  fecha: string;
  campos: AgendaCampo[];
  turnos: AgendaTurno[];
  campoFiltro: string | null;
  onPick: (t: AgendaTurno) => void;
}) {
  const cols = useMemo(() => {
    if (vista === "semana") {
      return Array.from({ length: 7 }, (_, i) => ({
        key: addDaysISO(fecha, i),
        label: addDaysISO(fecha, i).slice(8),
      }));
    }
    const list = campoFiltro ? campos.filter((c) => c.id === campoFiltro) : campos;
    return list.map((c) => ({ key: c.id, label: c.nombre }));
  }, [vista, fecha, campos, campoFiltro]);

  const horas = useMemo(() => {
    const set = new Set<string>();
    for (const t of turnos) {
      if (vista === "dia" && t.fecha !== fecha) continue;
      if (vista === "semana" && campoFiltro && t.campo_id !== campoFiltro) continue;
      if (vista === "dia" && campoFiltro && t.campo_id !== campoFiltro) continue;
      set.add(hhmm(t.hora_inicio));
    }
    return [...set].sort();
  }, [turnos, vista, fecha, campoFiltro]);

  const cell = (hora: string, colKey: string) => {
    if (vista === "semana") {
      const cid = campoFiltro ?? campos[0]?.id;
      return turnos.find((t) => t.fecha === colKey && hhmm(t.hora_inicio) === hora && t.campo_id === cid);
    }
    return turnos.find((t) => t.fecha === fecha && t.campo_id === colKey && hhmm(t.hora_inicio) === hora);
  };

  if (!campos.length) {
    return <p className="mt-6 text-sm text-[#1A2E4A]/70">Cargá una cancha en el predio para ver la grilla.</p>;
  }

  if (horas.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-[#E0E0E0] bg-white px-4 py-6 text-sm text-[#1A2E4A]/70">
        No hay turnos para este día. En Canchas, cada cancha necesita precio y el predio tiene que tener horarios de apertura. Después tocá Armar turnos.
      </p>
    );
  }

  return (
    <>
      <div className="mt-4 hidden overflow-x-auto rounded-xl border border-[#E0E0E0] bg-white md:block">
        <table className="min-w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-[#1A2E4A] text-white">
              <th className="sticky left-0 z-10 bg-[#1A2E4A] px-2 py-2 text-left font-medium">Hora</th>
              {cols.map((c) => (
                <th key={c.key} className="min-w-[5.5rem] px-1 py-2 font-medium sm:min-w-[7rem]">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {horas.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-[#1A2E4A]/60" colSpan={cols.length + 1}>
                  No hay turnos para esta vista.
                </td>
              </tr>
            ) : (
              horas.map((h) => (
                <tr key={h} className="border-t border-[#EEE]">
                  <td className="sticky left-0 bg-white px-2 py-1 font-medium text-[#1A2E4A]">{h}</td>
                  {cols.map((c) => {
                    const t = cell(h, c.key);
                    if (!t) return <td key={c.key} className="px-1 py-1" />;
                    return (
                      <td key={c.key} className="px-1 py-1">
                        <button
                          type="button"
                          onClick={() => onPick(t)}
                          className={`w-full rounded-md border px-1 py-2 text-left leading-tight ${claseVisual(t.visual)}`}
                        >
                          <span className="block truncate font-medium">{etiquetaVisual(t.visual)}</span>
                          {t.reserva?.titular_nombre ? (
                            <span className="block truncate opacity-80">{t.reserva.titular_nombre}</span>
                          ) : t.enlaces.length ? (
                            <span className="block truncate opacity-80">enlace</span>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 space-y-2 md:hidden">
        {turnos
          .filter((t) => {
            if (campoFiltro && t.campo_id !== campoFiltro) return false;
            if (vista === "dia") return t.fecha === fecha;
            return true;
          })
          .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio))
          .map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left ${claseVisual(t.visual)}`}
              >
                <span>
                  <span className="block font-medium">
                    {t.hora_inicio} · {t.campo_nombre}
                  </span>
                  <span className="text-xs opacity-80">{t.reserva?.titular_nombre || etiquetaVisual(t.visual)}</span>
                </span>
                <span className="text-xs">${Number(t.precio).toLocaleString("es-AR")}</span>
              </button>
            </li>
          ))}
      </ul>
    </>
  );
}
