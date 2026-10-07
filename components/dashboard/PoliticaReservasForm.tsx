"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
  DIAS_POLITICA,
  POLITICA_DEFAULTS,
  cargarPoliticaPredio,
  guardarPoliticaPredio,
  matrizSenaDefault,
  politicaToDatos,
  simularCondicionesPredio,
  type PoliticaForm,
  type SimulacionCondiciones,
} from "@/lib/politica";

type Props = {
  canchaId: string | null;
  campoId?: string | null;
  valorHora: string;
  valorReserva: string;
  formato?: string;
  showSaveButton?: boolean;
};

export type PoliticaReservasFormHandle = {
  getDatos: (extra?: { valor_hora?: number; valor_reserva?: number; formato?: string }) => Record<string, unknown>;
  save: (canchaId: string, campoId?: string | null) => Promise<{ ok: boolean; error: string | null }>;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm focus:border-[var(--fulbito-green)] focus:outline-none focus:ring-1 focus:ring-[var(--fulbito-green)]";

function peso(n: number | undefined) {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

export const PoliticaReservasForm = forwardRef<PoliticaReservasFormHandle, Props>(function PoliticaReservasForm(
  {
  canchaId,
  campoId = null,
  valorHora,
  valorReserva,
  formato = "5",
  showSaveButton = true,
},
  ref
) {
  const [form, setForm] = useState<PoliticaForm>({
    ...POLITICA_DEFAULTS,
    horarios: { ...POLITICA_DEFAULTS.horarios },
  });
  const [loading, setLoading] = useState(Boolean(canchaId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [tipoSim, setTipoSim] = useState<"por_la_cancha" | "amistoso">("por_la_cancha");
  const [horasSim, setHorasSim] = useState("30");
  const [sim, setSim] = useState<SimulacionCondiciones | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    if (!canchaId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const loaded = await cargarPoliticaPredio(canchaId, campoId);
      if (!cancelled) {
        setForm(loaded);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canchaId, campoId]);

  const senaNum = Number(valorReserva);
  useEffect(() => {
    if (!Number.isFinite(senaNum) || senaNum <= 0) return;
    let cancelled = false;
    (async () => {
      const m = await matrizSenaDefault(senaNum);
      if (!m || cancelled) return;
      setForm((prev) => {
        const vacia =
          !prev.sena_cancha_mas_48 &&
          !prev.sena_amistoso_mas_48;
        if (!vacia) {
          return {
            ...prev,
            sena_amistoso_mas_48: prev.sena_amistoso_mas_48 || String(m.amistoso_mas_48),
            sena_amistoso_48_24: prev.sena_amistoso_48_24 || String(m.amistoso_48_24),
            sena_amistoso_menos_24: prev.sena_amistoso_menos_24 || String(m.amistoso_menos_24),
            sena_cancha_mas_48: prev.sena_cancha_mas_48 || String(m.cancha_mas_48),
            sena_cancha_48_24: prev.sena_cancha_48_24 || String(m.cancha_48_24),
            sena_cancha_menos_24: prev.sena_cancha_menos_24 || String(m.cancha_menos_24),
          };
        }
        return {
          ...prev,
          sena_amistoso_mas_48: String(m.amistoso_mas_48),
          sena_amistoso_48_24: String(m.amistoso_48_24),
          sena_amistoso_menos_24: String(m.amistoso_menos_24),
          sena_cancha_mas_48: String(m.cancha_mas_48),
          sena_cancha_48_24: String(m.cancha_48_24),
          sena_cancha_menos_24: String(m.cancha_menos_24),
        };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [senaNum]);

  const datos = useMemo(
    () =>
      politicaToDatos(form, {
        valor_hora: Number(valorHora) || undefined,
        valor_reserva: Number(valorReserva) || undefined,
        formato,
      }),
    [form, valorHora, valorReserva, formato]
  );

  useImperativeHandle(ref, () => ({
    getDatos: (extra) => politicaToDatos(form, extra),
    save: (id, campo) =>
      guardarPoliticaPredio(id, campo ?? campoId ?? null, {
        ...politicaToDatos(form),
        valor_hora: Number(valorHora) || undefined,
        valor_reserva: Number(valorReserva) || undefined,
      }),
  }));

  const patch = (partial: Partial<PoliticaForm>) => setForm((f) => ({ ...f, ...partial }));

  const handleSave = async () => {
    if (!canchaId) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    const res = await guardarPoliticaPredio(canchaId, campoId ?? null, datos);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg("Política guardada.");
  };

  const handleSimular = async () => {
    setSimLoading(true);
    setError(null);
    const horas = Number(horasSim);
    const res = await simularCondicionesPredio({
      canchaId,
      campoId: campoId ?? null,
      tipo: tipoSim,
      anticipacionHoras: Number.isFinite(horas) ? horas : 30,
      datos,
    });
    setSimLoading(false);
    setSim(res);
    if (!res.ok) setError(res.error ?? "No se pudo simular.");
  };

  if (loading) {
    return <p className="text-sm text-[#1A2E4A]/70">Cargando política...</p>;
  }

  return (
    <section id="politica" className="space-y-6 rounded-xl border border-[#E0E0E0] bg-[#FAFBFC] p-5">
      <div>
        <h2 className="font-heading text-xl uppercase tracking-wide text-[#1A2E4A]">
          Política de reservas y desafíos
        </h2>
        <p className="mt-1 text-sm text-[#1A2E4A]/70">
          Los montos los calcula el servidor. Acá configurás las reglas; el simulador te muestra qué
          cobra el predio y qué arriesga el equipo.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {okMsg && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{okMsg}</div>}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[#1A2E4A]">Reserva común</h3>
        <p className="text-xs text-[#1A2E4A]/60">
          Se muestra en la ficha del predio. No cambia el cobro actual de FulbitoYa.
        </p>
        <label className="flex items-center gap-2 text-sm text-[#1A2E4A]">
          <input
            type="checkbox"
            checked={form.reserva_sena_nunca_devuelve}
            onChange={(e) => patch({ reserva_sena_nunca_devuelve: e.target.checked })}
          />
          La seña nunca se devuelve
        </label>
        {!form.reserva_sena_nunca_devuelve && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[#1A2E4A]">Devolución total con más de (horas)</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={form.reserva_devolucion_total_horas}
                onChange={(e) => patch({ reserva_devolucion_total_horas: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm text-[#1A2E4A]">Cobro total con menos de (horas)</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={form.reserva_cobro_total_horas}
                onChange={(e) => patch({ reserva_cobro_total_horas: e.target.value })}
              />
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-[#1A2E4A]">
          <input
            type="checkbox"
            checked={form.reserva_descuento_total_activo}
            onChange={(e) => patch({ reserva_descuento_total_activo: e.target.checked })}
          />
          Descuento si pagan el total por adelantado (PorLaCancha)
        </label>
        {form.reserva_descuento_total_activo ? (
          <div>
            <label className="text-sm text-[#1A2E4A]">Porcentaje de descuento</label>
            <input
              className={inputClass}
              type="number"
              min={0}
              max={50}
              value={form.reserva_descuento_total_pct}
              onChange={(e) => patch({ reserva_descuento_total_pct: e.target.value })}
            />
            <p className="mt-1 text-xs text-[#1A2E4A]/60">
              Es por pagar el total adelantado, no por el medio de pago. Por defecto 5%.
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[#1A2E4A]">Partidos abiertos</h3>
        <label className="flex items-center gap-2 text-sm text-[#1A2E4A]">
          <input
            type="checkbox"
            checked={form.desafios_habilitados}
            onChange={(e) => patch({ desafios_habilitados: e.target.checked })}
          />
          Habilitar partidos abiertos en este predio
        </label>
        <p className="text-xs text-[#1A2E4A]/60">Horarios habilitados (días y franjas)</p>
        <div className="space-y-2">
          {DIAS_POLITICA.map((d) => {
            const franjas = form.horarios[d.key];
            const activo = franjas.length > 0;
            const franja = franjas[0] ?? { desde: "00:00", hasta: "23:59" };
            return (
              <div key={d.key} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex w-28 items-center gap-2 text-[#1A2E4A]">
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={(e) =>
                      patch({
                        horarios: {
                          ...form.horarios,
                          [d.key]: e.target.checked ? [{ desde: "00:00", hasta: "23:59" }] : [],
                        },
                      })
                    }
                  />
                  {d.label}
                </label>
                {activo && (
                  <>
                    <input
                      type="time"
                      className={inputClass + " mt-0 w-auto"}
                      value={franja.desde}
                      onChange={(e) =>
                        patch({
                          horarios: {
                            ...form.horarios,
                            [d.key]: [{ ...franja, desde: e.target.value }],
                          },
                        })
                      }
                    />
                    <span className="text-[#1A2E4A]/50">a</span>
                    <input
                      type="time"
                      className={inputClass + " mt-0 w-auto"}
                      value={franja.hasta}
                      onChange={(e) =>
                        patch({
                          horarios: {
                            ...form.horarios,
                            [d.key]: [{ ...franja, hasta: e.target.value }],
                          },
                        })
                      }
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm text-[#1A2E4A]">Anticipación mínima F5 (h)</label>
            <input className={inputClass} type="number" min={3} value={form.anticipacion_min_f5_horas} onChange={(e) => patch({ anticipacion_min_f5_horas: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-[#1A2E4A]">Anticipación mínima F7 (h)</label>
            <input className={inputClass} type="number" min={3} value={form.anticipacion_min_f7_horas} onChange={(e) => patch({ anticipacion_min_f7_horas: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-[#1A2E4A]">Anticipación mínima F9 (h)</label>
            <input className={inputClass} type="number" min={3} value={form.anticipacion_min_f9_horas} onChange={(e) => patch({ anticipacion_min_f9_horas: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-[#1A2E4A]">Anticipación mínima F11 (h)</label>
            <input className={inputClass} type="number" min={3} value={form.anticipacion_min_f11_horas} onChange={(e) => patch({ anticipacion_min_f11_horas: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-[#1A2E4A]">Cierre sin rival si se publicó con 24 h o más</label>
            <input className={inputClass} type="number" min={3} value={form.cierre_sin_rival_mas_24h_horas} onChange={(e) => patch({ cierre_sin_rival_mas_24h_horas: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-[#1A2E4A]">Cierre sin rival si se publicó con menos de 24 h</label>
            <input className={inputClass} type="number" min={3} value={form.cierre_sin_rival_menos_24h_horas} onChange={(e) => patch({ cierre_sin_rival_menos_24h_horas: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-[#1A2E4A]">Tolerancia de llegada (minutos)</label>
            <input className={inputClass} type="number" min={0} value={form.tolerancia_walkover_min} onChange={(e) => patch({ tolerancia_walkover_min: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-[#1A2E4A]">Si el predio cancela</label>
            <select
              className={inputClass}
              value={form.predio_cancela}
              onChange={(e) => patch({ predio_cancela: e.target.value as PoliticaForm["predio_cancela"] })}
            >
              <option value="devolver_todo">Devolver todo</option>
              <option value="reprogramar">Reprogramar</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#1A2E4A]">
          <input
            type="checkbox"
            checked={form.permitir_seguir_hasta_inicio}
            onChange={(e) => patch({ permitir_seguir_hasta_inicio: e.target.checked })}
          />
          Permitir seguir esperando rival hasta el inicio
        </label>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[#1A2E4A]">Seña si no aparece rival</h3>
        <p className="text-xs text-[#1A2E4A]/60">
          Por defecto se arma desde la seña base. Podés editar cada valor.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[#1A2E4A]/70">
                <th className="py-1 pr-2 font-medium">Tipo</th>
                <th className="py-1 pr-2 font-medium">Más de 48 h</th>
                <th className="py-1 pr-2 font-medium">Entre 48 y 24 h</th>
                <th className="py-1 font-medium">Menos de 24 h</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 pr-2">Amistoso</td>
                <td className="pr-2"><input className={inputClass + " mt-0"} type="number" min={0} value={form.sena_amistoso_mas_48} onChange={(e) => patch({ sena_amistoso_mas_48: e.target.value })} /></td>
                <td className="pr-2"><input className={inputClass + " mt-0"} type="number" min={0} value={form.sena_amistoso_48_24} onChange={(e) => patch({ sena_amistoso_48_24: e.target.value })} /></td>
                <td><input className={inputClass + " mt-0"} type="number" min={0} value={form.sena_amistoso_menos_24} onChange={(e) => patch({ sena_amistoso_menos_24: e.target.value })} /></td>
              </tr>
              <tr>
                <td className="py-2 pr-2">Por la cancha</td>
                <td className="pr-2"><input className={inputClass + " mt-0"} type="number" min={0} value={form.sena_cancha_mas_48} onChange={(e) => patch({ sena_cancha_mas_48: e.target.value })} /></td>
                <td className="pr-2"><input className={inputClass + " mt-0"} type="number" min={0} value={form.sena_cancha_48_24} onChange={(e) => patch({ sena_cancha_48_24: e.target.value })} /></td>
                <td><input className={inputClass + " mt-0"} type="number" min={0} value={form.sena_cancha_menos_24} onChange={(e) => patch({ sena_cancha_menos_24: e.target.value })} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-[#1A2E4A]/10 bg-white p-4">
        <h3 className="text-sm font-semibold text-[#1A2E4A]">Simulador</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-sm text-[#1A2E4A]">Tipo de desafío</label>
            <select className={inputClass} value={tipoSim} onChange={(e) => setTipoSim(e.target.value as typeof tipoSim)}>
              <option value="por_la_cancha">Por la cancha</option>
              <option value="amistoso">Amistoso</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-[#1A2E4A]">Anticipación (horas)</label>
            <input className={inputClass} type="number" min={1} value={horasSim} onChange={(e) => setHorasSim(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleSimular}
              disabled={simLoading}
              className="w-full rounded-lg bg-[#1A2E4A] px-4 py-2 text-sm font-medium text-white hover:bg-[#2C4A72] disabled:opacity-70"
            >
              {simLoading ? "Calculando..." : "Ver qué pasa"}
            </button>
          </div>
        </div>
        {sim?.ok && (
          <div className="space-y-2 text-sm text-[#1A2E4A]">
            <p className="font-medium">{sim.mensaje_predio}</p>
            <p>{sim.mensaje_equipo}</p>
            {sim.periodo_gratis && (
              <p className="text-[#1A2E4A]/70">Hay período gratis hasta 24 h antes del partido.</p>
            )}
            {sim.cargos_cancelacion && (
              <ul className="list-disc pl-5 text-[#1A2E4A]/80">
                {sim.cargos_cancelacion.map((c) => (
                  <li key={c.tramo}>
                    {c.label} {c.cargo > 0 ? `(${peso(c.cargo)})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {showSaveButton && canchaId && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-[var(--fulbito-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--fulbito-green-hover)] disabled:opacity-70"
        >
          {saving ? "Guardando política..." : "Guardar política"}
        </button>
      )}
    </section>
  );
});

export { politicaToDatos };
