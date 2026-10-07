"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCanchasDelOwner, type Cancha } from "@/lib/canchas";
import { contarCamposPorCancha } from "@/lib/campos";
import { claseEstadoPredio, etiquetaEstadoPredio } from "@/lib/predios";
import { PrediosOverviewMap } from "@/components/maps/PrediosOverviewMap";

export default function DashboardCanchasPage() {
  const [loading, setLoading] = useState(true);
  const [canchas, setCanchas] = useState<Cancha[]>([]);
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setError(null);
      setLoading(true);
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
      setConteo(await contarCamposPorCancha(rows.map((c) => c.id)));
      setSelectedId(rows.find((c) => c.lat != null && c.lng != null)?.id ?? rows[0]?.id ?? null);
      setLoading(false);
    };
    void load();
  }, []);

  const pins = useMemo(
    () =>
      canchas
        .filter((c) => c.lat != null && c.lng != null)
        .map((c) => ({ id: c.id, lat: c.lat as number, lng: c.lng as number, title: c.nombre })),
    [canchas],
  );

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-subheading text-2xl font-semibold text-[#1A2E4A]">Mis predios</h1>
      <p className="mt-1 text-sm text-[#1A2E4A]/70 sm:text-base">
        Mirá tus predios en el mapa y entrá a cada uno para ver las canchas.
      </p>

      <div className="mt-6">
        <Link
          href="/dashboard/canchas/crear"
          className="inline-flex rounded-lg bg-[var(--fulbito-green)] px-4 py-2.5 text-sm font-medium text-white"
        >
          Cargar predio
        </Link>
      </div>

      <div className="mt-8">
        {loading ? (
          <p className="text-[#1A2E4A]/70">Cargando predios…</p>
        ) : error ? (
          <p className="text-red-700">{error}</p>
        ) : canchas.length === 0 ? (
          <div className="rounded-xl border border-[#E0E0E0] bg-white p-6 text-center">
            <p className="text-[#1A2E4A]/70">Todavía no cargaste un predio.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pins.length ? (
              <PrediosOverviewMap pins={pins} selectedId={selectedId} onSelect={setSelectedId} />
            ) : (
              <p className="rounded-xl border border-[#E0E0E0] bg-white px-4 py-3 text-sm text-[#1A2E4A]/70">
                Completá la dirección con Google en un predio para verlo en el mapa.
              </p>
            )}
            <ul className="space-y-3">
              {canchas.map((c) => {
                const activa = selectedId === c.id;
                const n = conteo[c.id] ?? 0;
                return (
                  <li
                    key={c.id}
                    className={`rounded-xl border bg-white p-4 shadow-sm ${
                      activa ? "border-[var(--fulbito-green)]" : "border-[#E0E0E0]"
                    }`}
                  >
                    <button type="button" className="w-full text-left" onClick={() => setSelectedId(c.id)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-[#1A2E4A]">{c.nombre}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${claseEstadoPredio(c.estado)}`}>
                          {etiquetaEstadoPredio(c.estado)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[#1A2E4A]/70">
                        {c.direccion || c.barrio || "Sin dirección"}
                        {" · "}
                        {n === 1 ? "1 cancha" : `${n} canchas`}
                      </p>
                    </button>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/canchas/${c.id}/editar`}
                        className="rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm font-medium text-[#1A2E4A]"
                      >
                        Completar / editar
                      </Link>
                      <Link
                        href={`/dashboard/canchas/${c.id}/campos`}
                        className="rounded-lg bg-[#1A2E4A] px-3 py-2 text-sm font-medium text-white"
                      >
                        Ver canchas
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
