"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getCamposByCancha, type Campo } from "@/lib/campos";
import { getCanchaDelOwnerById } from "@/lib/canchas";
import {
  borrarExcepcion,
  crearExcepcion,
  listarExcepciones,
  regenerarTurnosPredio,
  type PredioExcepcion,
} from "@/lib/turnos";

export default function ExcepcionesPage() {
  const params = useParams<{ id: string }>();
  const canchaId = params.id;
  const [campos, setCampos] = useState<Campo[]>([]);
  const [rows, setRows] = useState<PredioExcepcion[]>([]);
  const [tipo, setTipo] = useState<"feriado" | "cierre" | "mantenimiento">("cierre");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [campoId, setCampoId] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setRows(await listarExcepciones(canchaId));
    setCampos(await getCamposByCancha(canchaId));
  };

  useEffect(() => {
    void getCanchaDelOwnerById(canchaId);
    void load();
  }, [canchaId]);

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!desde || !hasta) {
      setError("Completá las fechas.");
      return;
    }
    setBusy(true);
    const res = await crearExcepcion({
      cancha_id: canchaId,
      campo_id: campoId || null,
      tipo,
      fecha_desde: desde,
      fecha_hasta: hasta,
      nota: nota.trim() || null,
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    await regenerarTurnosPredio(canchaId);
    setNota("");
    setBusy(false);
    await load();
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <Link href={`/dashboard/canchas/${canchaId}/campos`} className="text-sm text-[#1A2E4A]/70 hover:underline">
        ← Canchas
      </Link>
      <h1 className="mt-4 font-subheading text-2xl font-semibold text-[#1A2E4A]">Feriados, cierres y mantenimiento</h1>
      <p className="mt-1 text-sm text-[#1A2E4A]/70">
        En esas fechas no se arman turnos libres. Lo que ya está reservado se deja como está.
      </p>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <form onSubmit={(e) => void agregar(e)} className="mt-6 space-y-3 rounded-xl border border-[#E0E0E0] bg-white p-4">
        <select className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2.5" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
          <option value="feriado">Feriado</option>
          <option value="cierre">Cierre del predio</option>
          <option value="mantenimiento">Mantenimiento</option>
        </select>
        <select className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2.5" value={campoId} onChange={(e) => setCampoId(e.target.value)}>
          <option value="">Todo el predio</option>
          {campos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className="rounded-lg border border-[#E0E0E0] px-3 py-2.5" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <input type="date" className="rounded-lg border border-[#E0E0E0] px-3 py-2.5" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <input className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2.5" placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
        <button disabled={busy} className="w-full rounded-lg bg-[var(--fulbito-green)] py-2.5 font-medium text-white">
          {busy ? "Guardando…" : "Agregar y regenerar turnos"}
        </button>
      </form>

      <ul className="mt-6 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-[#E0E0E0] bg-white p-4">
            <div>
              <p className="font-medium capitalize text-[#1A2E4A]">{r.tipo}</p>
              <p className="text-sm text-[#1A2E4A]/70">
                {r.fecha_desde} → {r.fecha_hasta}
                {r.campo_id ? " · una cancha" : " · todo el predio"}
              </p>
              {r.nota ? <p className="text-sm text-[#1A2E4A]/60">{r.nota}</p> : null}
            </div>
            <button
              type="button"
              className="text-sm text-red-700"
              onClick={async () => {
                await borrarExcepcion(r.id);
                await regenerarTurnosPredio(canchaId);
                await load();
              }}
            >
              Sacar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
