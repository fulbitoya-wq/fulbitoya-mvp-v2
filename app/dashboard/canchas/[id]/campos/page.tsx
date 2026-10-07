"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCanchaDelOwnerById, type Cancha } from "@/lib/canchas";
import { getCamposByCancha, type Campo } from "@/lib/campos";
import { AddressPreviewMap } from "@/components/maps/AddressPreviewMap";

function etiquetaSuperficie(valor: string | null): string {
  if (valor === "cesped_sintetico") return "sintético";
  if (valor === "cesped_natural") return "natural";
  if (valor === "salon") return "salón";
  return valor ?? "—";
}

export default function CanchaCamposPage() {
  const params = useParams();
  const canchaId = params.id as string;
  const [cancha, setCancha] = useState<Cancha | null>(null);
  const [campos, setCampos] = useState<Campo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Debés estar logueado.");
        setCargando(false);
        return;
      }
      const found = await getCanchaDelOwnerById(canchaId);
      if (!found) {
        setError("No encontré el predio o no es tuyo.");
        setCargando(false);
        return;
      }
      setCancha(found);
      setCampos(await getCamposByCancha(canchaId));
      setCargando(false);
    };
    void load();
  }, [canchaId]);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/canchas" className="text-sm font-medium text-[#1A2E4A]/70 hover:underline">
          ← Predios
        </Link>
        {cancha ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/canchas/${cancha.id}/excepciones`}
              className="rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm font-medium text-[#1A2E4A]"
            >
              Feriados y cierres
            </Link>
            <Link
              href={`/dashboard/canchas/${cancha.id}/campos/crear`}
              className="rounded-lg bg-[var(--fulbito-green)] px-3 py-2 text-sm font-medium text-white"
            >
              Nueva cancha
            </Link>
          </div>
        ) : null}
      </div>

      <h1 className="mt-4 font-subheading text-2xl font-semibold text-[#1A2E4A]">
        {cargando ? "Cargando…" : `Canchas · ${cancha?.nombre ?? ""}`}
      </h1>
      <p className="mt-1 text-sm text-[#1A2E4A]/70">
        {cancha?.direccion ?? "Cada cancha arma sola los turnos según apertura, duración y precios."}
      </p>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      {cancha?.lat != null && cancha?.lng != null ? (
        <div className="mt-4">
          <AddressPreviewMap lat={cancha.lat} lng={cancha.lng} />
        </div>
      ) : null}

      {cargando ? (
        <p className="mt-4 text-[#1A2E4A]/70">Obteniendo canchas…</p>
      ) : campos.length === 0 ? (
        <div className="mt-6 rounded-xl border border-[#E0E0E0] bg-white p-6 text-center">
          <p className="text-[#1A2E4A]/70">Todavía no cargaste canchas en este predio.</p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {campos.map((campo) => {
            const foto = campo.foto_url || campo.fotos?.[0];
            return (
              <li key={campo.id} className="overflow-hidden rounded-xl border border-[#E0E0E0] bg-white shadow-sm">
                {foto ? (
                  <img src={foto} alt="" className="h-36 w-full object-cover" />
                ) : (
                  <div className="flex h-36 items-center justify-center bg-[#1A2E4A]/5 text-sm text-[#1A2E4A]/50">
                    Sin foto
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold text-[#1A2E4A]">{campo.nombre}</p>
                    <span className="rounded-full bg-[#1A2E4A] px-2 py-0.5 text-xs font-medium text-white">
                      F{campo.tipo ?? "—"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#1A2E4A]/70">
                    {etiquetaSuperficie(campo.superficie)} · {campo.duracion_min ?? 60} min
                    {campo.techada ? " · techada" : ""}
                    {campo.luz ? " · luz" : ""}
                  </p>
                  <Link
                    href={`/dashboard/canchas/${canchaId}/campos/${campo.id}/editar`}
                    className="mt-3 inline-block text-sm font-medium text-[var(--fulbito-green)]"
                  >
                    Editar precios y turnos
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
