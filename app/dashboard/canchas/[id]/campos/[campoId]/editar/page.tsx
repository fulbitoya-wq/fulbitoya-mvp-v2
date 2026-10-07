"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CampoForm } from "@/components/dashboard/CampoForm";
import { getCamposByCancha, type Campo } from "@/lib/campos";

export default function EditarCampoPage() {
  const params = useParams<{ id: string; campoId: string }>();
  const [campo, setCampo] = useState<Campo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!params.id || !params.campoId) return;
      const rows = await getCamposByCancha(params.id);
      const row = rows.find((c) => c.id === params.campoId) ?? null;
      if (!row) setError("No encontramos esa cancha.");
      setCampo(row);
    };
    void load();
  }, [params.id, params.campoId]);

  if (error) return <p className="p-6 text-sm text-red-700">{error}</p>;
  if (!campo) return <p className="p-6 text-sm text-[#1A2E4A]/70">Cargando…</p>;
  return <CampoForm canchaId={params.id} campo={campo} />;
}
