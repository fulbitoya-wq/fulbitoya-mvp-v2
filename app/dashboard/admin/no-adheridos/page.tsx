"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fySoyAdmin } from "@/lib/predios";
import {
  mensajeErrorEquipo,
  rpcAdminEnlaceValidacion,
  rpcAdminListarAliasConflicto,
  rpcAdminListarDesafiosMarcados,
  rpcAdminListarNoAdheridos,
  rpcAdminListarTransferenciasPendientes,
  rpcAdminListarValidacionesPendientes,
} from "@shared/equipos";

export default function AdminNoAdheridosPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [predios, setPredios] = useState<Record<string, unknown>[]>([]);
  const [validaciones, setValidaciones] = useState<Record<string, unknown>[]>([]);
  const [conflictos, setConflictos] = useState<Record<string, unknown>[]>([]);
  const [primerPago, setPrimerPago] = useState<Record<string, unknown>[]>([]);
  const [transferencias, setTransferencias] = useState<Record<string, unknown>[]>([]);
  const [marcados, setMarcados] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [waMsg, setWaMsg] = useState<string | null>(null);

  const load = async () => {
    const admin = await fySoyAdmin();
    setAllowed(admin);
    if (!admin) return;
    const [p, v, a, t, d] = await Promise.all([
      rpcAdminListarNoAdheridos(supabase),
      rpcAdminListarValidacionesPendientes(supabase),
      rpcAdminListarAliasConflicto(supabase),
      rpcAdminListarTransferenciasPendientes(supabase),
      rpcAdminListarDesafiosMarcados(supabase),
    ]);
    if (!p.ok) setError(mensajeErrorEquipo(p.error));
    else setPredios(p.predios);
    if (v.ok) setValidaciones(v.validaciones);
    if (a.ok) {
      setConflictos(Array.isArray(a.conflictos) ? (a.conflictos as Record<string, unknown>[]) : []);
      setPrimerPago(
        Array.isArray(a.primer_pago_pendiente) ? (a.primer_pago_pendiente as Record<string, unknown>[]) : []
      );
    }
    if (t.ok) setTransferencias(t.transferencias);
    if (d.ok) setMarcados(d.desafios);
  };

  useEffect(() => {
    void load();
  }, []);

  const enviarWa = async (validacionId: string) => {
    setWaMsg(null);
    const res = await rpcAdminEnlaceValidacion(supabase, validacionId);
    if (!res.ok) {
      setWaMsg(mensajeErrorEquipo(res.error));
      return;
    }
    const tel = String(res.telefono ?? "").replace(/\D/g, "");
    const path = String(res.path ?? "");
    const origin = typeof window !== "undefined" ? window.location.origin.replace("fulbitoya", "porlacancha") : "";
    const web =
      process.env.NEXT_PUBLIC_PORLACANCHA_WEB_URL?.replace(/\/$/, "") ||
      "https://porlacancha.com";
    const url = `${web}${path}`;
    const text = encodeURIComponent(`Hola, confirmá esta reserva de PorLaCancha: ${url}`);
    const wa = tel ? `https://wa.me/${tel}?text=${text}` : url;
    setWaMsg(origin ? `Enlace: ${url}` : url);
    if (typeof window !== "undefined") window.open(wa, "_blank");
  };

  if (allowed === null) return <p className="p-6 text-sm text-[#1A2E4A]/70">Cargando…</p>;
  if (!allowed) {
    return (
      <div className="p-6">
        <p className="text-sm text-[#1A2E4A]/70">Solo el administrador de FulbitoYa.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-[var(--fulbito-green)] underline">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-10 p-4 sm:p-8">
      <div>
        <h1 className="font-subheading text-2xl font-semibold text-[#1A2E4A]">Predios no adheridos</h1>
        <p className="mt-1 text-sm text-[#1A2E4A]/70">
          Lista comercial, validaciones, alias en conflicto y transferencias manuales.
        </p>
        <Link href="/dashboard/admin" className="mt-2 inline-block text-sm text-[var(--fulbito-green)] underline">
          Volver a administración
        </Link>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {waMsg ? <p className="text-sm text-[#1A2E4A]">{waMsg}</p> : null}

      <section>
        <h2 className="text-lg font-semibold text-[#1A2E4A]">Predios</h2>
        <ul className="mt-3 divide-y divide-[#1A2E4A]/10 rounded-lg border border-[#1A2E4A]/10">
          {predios.length === 0 ? (
            <li className="p-4 text-sm text-[#1A2E4A]/60">No hay predios no adheridos.</li>
          ) : null}
          {predios.map((p) => (
            <li key={String(p.id)} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div>
                <p className="font-medium text-[#1A2E4A]">{String(p.nombre)}</p>
                <p className="text-[#1A2E4A]/70">
                  {String(p.direccion ?? "")} · {String(p.partidos ?? 0)} partidos ·{" "}
                  {String(p.verificacion_estado ?? "sin_validar")}
                </p>
              </div>
              {p.place_id ? (
                <Link
                  href={`https://porlacancha.com/lugar/${String(p.place_id)}`}
                  className="text-[var(--fulbito-green)] underline"
                  target="_blank"
                >
                  Ver página
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[#1A2E4A]">Validaciones pendientes</h2>
        <ul className="mt-3 divide-y divide-[#1A2E4A]/10 rounded-lg border border-[#1A2E4A]/10">
          {validaciones.length === 0 ? (
            <li className="p-4 text-sm text-[#1A2E4A]/60">Nada pendiente.</li>
          ) : null}
          {validaciones.map((v) => (
            <li key={String(v.id)} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div>
                <p className="font-medium text-[#1A2E4A]">{String(v.cancha_nombre)}</p>
                <p className="text-[#1A2E4A]/70">
                  {String(v.fecha)} {String(v.hora_inicio ?? "").slice(0, 5)} · ${String(v.monto_pendiente)} ·{" "}
                  {String(v.alias_cbu)} · {String(v.telefono_predio)}
                </p>
              </div>
              <button
                type="button"
                className="rounded-md bg-[var(--fulbito-green)] px-3 py-1.5 text-white"
                onClick={() => void enviarWa(String(v.id))}
              >
                Enviar por WhatsApp
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[#1A2E4A]">Alias en conflicto / primer pago</h2>
        <ul className="mt-3 space-y-2 text-sm text-[#1A2E4A]/80">
          {conflictos.map((c) => (
            <li key={String(c.id)} className="rounded border border-[#1A2E4A]/10 p-3">
              Conflicto: {String(c.alias_anterior)} → {String(c.alias_nuevo)}
            </li>
          ))}
          {primerPago.map((a) => (
            <li key={String(a.alias_normalizado)} className="rounded border border-[#1A2E4A]/10 p-3">
              Primer pago pendiente: {String(a.alias_normalizado)}
            </li>
          ))}
          {conflictos.length === 0 && primerPago.length === 0 ? (
            <li className="text-[#1A2E4A]/60">Sin conflictos.</li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[#1A2E4A]">Transferencias pendientes a predios</h2>
        <ul className="mt-3 divide-y divide-[#1A2E4A]/10 rounded-lg border border-[#1A2E4A]/10">
          {transferencias.length === 0 ? (
            <li className="p-4 text-sm text-[#1A2E4A]/60">Ninguna.</li>
          ) : null}
          {transferencias.map((t) => (
            <li key={String(t.id)} className="p-4 text-sm">
              <p className="font-medium text-[#1A2E4A]">
                {String(t.cancha_nombre)} · ${String(t.monto)}
              </p>
              <p className="text-[#1A2E4A]/70">
                Alias {String(t.alias_cbu ?? "—")} · {String(t.detalle ?? "")}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[#1A2E4A]">Desafíos marcados</h2>
        <ul className="mt-3 divide-y divide-[#1A2E4A]/10 rounded-lg border border-[#1A2E4A]/10">
          {marcados.length === 0 ? (
            <li className="p-4 text-sm text-[#1A2E4A]/60">Ninguno.</li>
          ) : null}
          {marcados.map((d) => (
            <li key={String(d.id)} className="p-4 text-sm">
              <p className="font-medium text-[#1A2E4A]">{String(d.titulo)}</p>
              <p className="text-[#1A2E4A]/70">
                {String(d.fecha)} · {String(d.cancha_nombre)} · estado {String(d.estado)}
                {d.requiere_aprobacion_precio ? " · precio en revisión" : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
