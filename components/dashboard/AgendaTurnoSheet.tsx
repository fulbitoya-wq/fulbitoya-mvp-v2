"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { fyMarcarCobrado, type AgendaTurno } from "@/lib/agenda";
import { fyBajaTurnoFijo, fyLiberarFechaFijo } from "@/lib/fijos";
import {
  enlaceReclamoWeb,
  mensajeErrorEquipo,
  mensajeWhatsappReserva,
  rpcCargarReservaManual,
  rpcCrearEnlacePago,
} from "@shared/equipos";

const PLC_WEB = (process.env.NEXT_PUBLIC_PLC_SITE_URL ?? "https://porlacancha.com").replace(/\/$/, "");

function pesos(n: number | null | undefined) {
  return `$${Number(n ?? 0).toLocaleString("es-AR")}`;
}

export function AgendaTurnoSheet({
  turno,
  predioNombre,
  senaDefault,
  onClose,
  onDone,
}: {
  turno: AgendaTurno;
  predioNombre: string;
  senaDefault: number;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [sena, setSena] = useState(String(senaDefault || turno.reserva?.monto_sena || 0));
  const [cobro, setCobro] = useState<"sena_fuera" | "a_cobrar_predio">("sena_fuera");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const libre = turno.visual === "libre";
  const r = turno.reserva;
  const pagadoApp = r?.estado_pago === "pagado" ? Number(r.tipo_cobro === "total" ? r.monto_total : r.monto_sena) : 0;
  const total = Number(r?.monto_total ?? turno.precio);
  const falta = r?.cobrado_predio_at ? 0 : Math.max(0, total - pagadoApp);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[#1A2E4A]">{turno.campo_nombre}</p>
            <p className="text-sm text-[#1A2E4A]/70">
              {turno.fecha} · {turno.hora_inicio}–{turno.hora_fin} · {pesos(turno.precio)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-[#1A2E4A]/60">
            Cerrar
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

        {libre ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="rounded-lg border border-[#E0E0E0] px-3 py-2.5" placeholder="Nombre (opcional)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <input className="rounded-lg border border-[#E0E0E0] px-3 py-2.5" placeholder="Teléfono (opcional)" value={tel} onChange={(e) => setTel(e.target.value)} />
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={cobro === "sena_fuera"} onChange={() => setCobro("sena_fuera")} />
                Seña cobrada por fuera
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={cobro === "a_cobrar_predio"} onChange={() => setCobro("a_cobrar_predio")} />
                A cobrar en el predio
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              className="w-full rounded-lg bg-[#1A2E4A] py-3 text-sm font-medium text-white"
              onClick={() =>
                void run(async () => {
                  const res = await rpcCargarReservaManual(supabase, turno.id, nombre, tel, cobro);
                  if (!res.ok) throw new Error(mensajeErrorEquipo(res.error));
                })
              }
            >
              Reservar a mano
            </button>
            <div>
              <label className="text-sm text-[#1A2E4A]">Seña del enlace</label>
              <input className="mt-1 w-full rounded-lg border border-[#E0E0E0] px-3 py-2.5" type="number" value={sena} onChange={(e) => setSena(e.target.value)} />
            </div>
            <button
              type="button"
              disabled={busy}
              className="w-full rounded-lg bg-[var(--fulbito-green)] py-3 text-sm font-medium text-white"
              onClick={() =>
                void run(async () => {
                  const linkPlaceholder = "[enlace]";
                  const msg = mensajeWhatsappReserva({
                    nombre: nombre || "[nombre]",
                    fecha: turno.fecha,
                    hora: turno.hora_inicio,
                    predio: predioNombre,
                    link: linkPlaceholder,
                    sena: Number(sena) || 0,
                  });
                  const res = await rpcCrearEnlacePago(supabase, {
                    disponibilidadId: turno.id,
                    nombre: nombre || "Cliente",
                    telefono: tel,
                    montoSena: Number(sena) || 0,
                    mensaje: msg,
                  });
                  if (!res.ok) throw new Error(mensajeErrorEquipo(res.error));
                })
              }
            >
              Generar enlace de WhatsApp
            </button>
            <button
              type="button"
              disabled={busy}
              className="w-full rounded-lg border border-[#E0E0E0] py-3 text-sm"
              onClick={() =>
                void run(async () => {
                  const { error: err } = await supabase.from("disponibilidades").update({ estado: "bloqueado" }).eq("id", turno.id);
                  if (err) throw new Error(err.message);
                })
              }
            >
              Bloquear turno
            </button>
            {turno.enlaces.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#1A2E4A]">Enlaces (el turno sigue libre hasta que paguen)</p>
                {turno.enlaces.map((e) => {
                  const link = enlaceReclamoWeb(PLC_WEB, e.token);
                  const text = e.mensaje || mensajeWhatsappReserva({
                    nombre: e.titular_nombre,
                    fecha: turno.fecha,
                    hora: turno.hora_inicio,
                    predio: predioNombre,
                    link,
                    sena: e.monto_sena,
                  });
                  const wa = `https://wa.me/${e.titular_telefono.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
                  return (
                    <a key={e.token} href={wa} target="_blank" rel="noreferrer" className="block rounded-lg border border-[#25D366] px-3 py-2 text-sm text-[#128C7E]">
                      WhatsApp · {e.titular_nombre}
                    </a>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-sm">
            {turno.visual === "pago" ? (
              <p className="rounded-lg bg-[#FFF8E1] px-3 py-2">En proceso de pago (bloqueo 10 min).</p>
            ) : null}
            {turno.visual === "bloqueado" ? (
              <button
                type="button"
                disabled={busy}
                className="w-full rounded-lg border border-[#E0E0E0] py-3"
                onClick={() =>
                  void run(async () => {
                    const { error: err } = await supabase.from("disponibilidades").update({ estado: "disponible" }).eq("id", turno.id);
                    if (err) throw new Error(err.message);
                  })
                }
              >
                Desbloquear
              </button>
            ) : null}
            {r ? (
              <>
                <p>
                  <b>{r.titular_nombre || "Sin nombre"}</b>
                  {r.titular_telefono ? ` · ${r.titular_telefono}` : ""}
                </p>
                <p className="text-[#1A2E4A]/70">
                  Canal: {r.canal === "app" ? "App" : r.canal === "whatsapp" ? "WhatsApp" : "Manual"}
                  {r.cobro_externo === "sena_fuera" ? " · seña por fuera" : r.cobro_externo === "a_cobrar_predio" ? " · a cobrar en el predio" : ""}
                </p>
                <p>Pagó en la app: {pesos(pagadoApp)} ({r.estado_pago ?? "—"})</p>
                <p>Falta cobrar: {pesos(falta)}</p>
                {r.cobrado_predio_at ? (
                  <p className="text-[#2E7D32]">Cobrado en el predio ({r.cobrado_predio_medio}).</p>
                ) : falta > 0 ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="flex-1 rounded-lg bg-[var(--fulbito-green)] py-2.5 text-white"
                      onClick={() =>
                        void run(async () => {
                          const res = await fyMarcarCobrado(r.id, "efectivo");
                          if (!res.ok) throw new Error(res.error ?? "");
                        })
                      }
                    >
                      Cobrado efectivo
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="flex-1 rounded-lg border border-[#1A2E4A] py-2.5"
                      onClick={() =>
                        void run(async () => {
                          const res = await fyMarcarCobrado(r.id, "transferencia");
                          if (!res.ok) throw new Error(res.error ?? "");
                        })
                      }
                    >
                      Transferencia
                    </button>
                  </div>
                ) : null}
                {turno.visual === "abierto" || r.busca_gente ? (
                  <div>
                    <p className="font-medium">Lista del partido abierto</p>
                    {turno.lista.length === 0 ? (
                      <p className="text-[#1A2E4A]/60">Todavía no cargaron nombres.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {turno.lista.map((p, i) => {
                          const pago = turno.pagos_lista.find((x) => x.usuario_id && x.usuario_id === p.usuario_id);
                          const enApp = pago?.estado_pago === "pagado";
                          return (
                            <li key={`${p.nombre}-${i}`}>
                              {p.nombre} · {enApp ? "pagó en la app" : "paga en el lugar"}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
                {turno.visual === "fijo" || turno.origen === "fijo" ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="w-full rounded-lg border border-red-200 py-3 text-red-700"
                      onClick={() =>
                        void run(async () => {
                          if (!confirm("¿Liberar solo esta fecha? El resto del fijo sigue.")) return;
                          const res = await fyLiberarFechaFijo(turno.id);
                          if (!res.ok) throw new Error(res.error ?? "");
                        })
                      }
                    >
                      Liberar esta fecha
                    </button>
                    {turno.turno_fijo_id ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="w-full rounded-lg border border-red-200 py-3 text-red-700"
                        onClick={() =>
                          void run(async () => {
                            if (!confirm("¿Dar de baja todo el fijo? Las fechas futuras se sueltan.")) return;
                            const res = await fyBajaTurnoFijo(turno.turno_fijo_id!);
                            if (!res.ok) throw new Error(res.error ?? "");
                          })
                        }
                      >
                        Dar de baja el fijo
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    className="w-full rounded-lg border border-red-200 py-3 text-red-700"
                    onClick={() =>
                      void run(async () => {
                        if (!confirm("¿Cancelar esta reserva? Se aplica la política del predio.")) return;
                        const { data, error: err } = await supabase.rpc("plc_predio_cancela_reserva", { p_reserva_id: r.id });
                        if (err) throw new Error(err.message);
                        const row = data as { ok?: boolean; error?: string } | null;
                        if (!row?.ok) throw new Error("No se pudo cancelar.");
                      })
                    }
                  >
                    Cancelar reserva
                  </button>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
