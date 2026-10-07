"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PredioAltaForm } from "@/components/dashboard/PredioAltaForm";
import { getCanchaDelOwnerById, type Cancha } from "@/lib/canchas";

export default function EditarCanchaPage() {
  const params = useParams<{ id: string }>();
  const canchaId = params?.id;
  const [cancha, setCancha] = useState<Cancha | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!canchaId) return;
      const row = await getCanchaDelOwnerById(canchaId);
      if (!row) setError("No encontramos el predio o no es tuyo.");
      setCancha(row);
      setLoading(false);
    };
    void load();
  }, [canchaId]);

  if (loading) {
    return <p className="p-6 text-sm text-[#1A2E4A]/70">Cargando predio…</p>;
  }
  if (error || !cancha) {
    return <p className="p-6 text-sm text-red-700">{error ?? "No se pudo cargar."}</p>;
  }
  return <PredioAltaForm cancha={cancha} />;
}
