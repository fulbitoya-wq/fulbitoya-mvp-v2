"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { pesos, plcAdminRevisiones } from "@/lib/admin-plc";
import { supabase } from "@/lib/supabase";

export default function AdminRevisionesPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waMsg, setWaMsg] = useState<string | null>(null);

  const load = async () => {
    const res = await plcAdminRevisiones();
    if (!res.ok) setError(res.error);
    else setData(res);
  };

  useEffect(() => {
    void load();
  }, []);

  const enviarWa = async (validacionId: string) => {
    setWaMsg(null);
    const { data: res } = await supabase.rpc("plc_admin_enlace_validacion", {
      p_validacion_id: validacionId,
    });
    const row = res as { ok?: boolean; token?: string; telefono?: string; path?: string; error?: string } | null;
    if (!row?.ok) {
      setWaMsg(row?.error ?? "No se pudo armar el enlace");
      return;
    }
    const web = process.env.NEXT_PUBLIC_PLC_SITE_URL?.replace(/\/$/, "") || "https://porlacancha.com";
    const url = `${web}${row.path}`;
    const tel = String(row.telefono ?? "").replace(/\D/g, "");
    const text = encodeURIComponent(`Hola, confirmá esta reserva de PorLaCancha: ${url}`);
    setWaMsg(url);
    if (typeof window !== "undefined") {
      window.open(tel ? `https://wa.me/${tel}?text=${text}` : url, "_blank");
    }
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-[#1A2E4A]/70">Cargando…</p>;

  const validaciones = Array.isArray(data.validaciones) ? (data.validaciones as Record<string, unknown>[]) : [];
  const primer = Array.isArray(data.primer_pago_alias) ? (data.primer_pago_alias as Record<string, unknown>[]) : [];
  const conflictos = Array.isArray(data.alias_conflicto) ? (data.alias_conflicto as Record<string, unknown>[]) : [];
  const montos = Array.isArray(data.montos_fuera_referencia)
    ? (data.montos_fuera_referencia as Record<string, unknown>[])
    : [];
  const disputas = Array.isArray(data.disputas) ? (data.disputas as Record<string, unknown>[]) : [];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-[#1A2E4A]">Revisiones pendientes</h2>
        <p className="mt-1 text-sm text-[#1A2E4A]/70">
          Validaciones de predios, primeros pagos a alias, montos fuera de referencia, conflictos y disputas.
        </p>
        {waMsg ? <p className="mt-2 break-all text-sm text-[#1A2E4A]">{waMsg}</p> : null}
        <Link href="/dashboard/admin/no-adheridos" className="mt-2 inline-block text-sm text-[var(--fulbito-green)] underline">
          También: lista comercial no adheridos
        </Link>
      </div>

      <Section title="Validaciones de predios">
        {validaciones.length === 0 ? <Empty /> : null}
        {validaciones.map((v) => (
          <Row key={String(v.id)}>
            <div>
              <p className="font-medium">{String(v.cancha_nombre)}</p>
              <p className="text-[#1A2E4A]/70">
                {String(v.fecha)} {String(v.hora_inicio ?? "").slice(0, 5)} · {pesos(v.monto_pendiente)} ·{" "}
                {String(v.alias_cbu)}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg bg-[var(--fulbito-green)] px-3 py-1.5 text-white"
              onClick={() => void enviarWa(String(v.id))}
            >
              WhatsApp al predio
            </button>
          </Row>
        ))}
      </Section>

      <Section title="Primer pago a alias nuevos">
        {primer.length === 0 ? <Empty /> : null}
        {primer.map((a) => (
          <Row key={String(a.alias_normalizado)}>
            <p>{String(a.alias_normalizado)}</p>
          </Row>
        ))}
      </Section>

      <Section title="Alias en conflicto">
        {conflictos.length === 0 ? <Empty /> : null}
        {conflictos.map((c) => (
          <Row key={String(c.id)}>
            <p>
              {String(c.alias_anterior)} → {String(c.alias_nuevo)}
            </p>
          </Row>
        ))}
      </Section>

      <Section title="Montos fuera de referencia">
        {montos.length === 0 ? <Empty /> : null}
        {montos.map((d) => (
          <Row key={String(d.id)}>
            <p>
              {String(d.titulo)} · {String(d.fecha)} · {pesos(d.precio_cancha)}
            </p>
          </Row>
        ))}
      </Section>

      <Section title="Disputas">
        {disputas.length === 0 ? <Empty /> : null}
        {disputas.map((d) => (
          <Row key={String(d.id)}>
            <p>
              {String(d.titulo)} · {String(d.fecha)} · {pesos(d.precio_cancha)}
            </p>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-lg font-semibold text-[#1A2E4A]">{title}</h3>
      <ul className="mt-2 divide-y divide-[#E0E0E0] rounded-xl border border-[#E0E0E0] bg-white">{children}</ul>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <li className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">{children}</li>;
}

function Empty() {
  return <li className="p-3 text-sm text-[#1A2E4A]/60">Nada pendiente.</li>;
}
