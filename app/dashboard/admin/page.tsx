"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  fyAdminInvitarPredio,
  fyAdminListarPredios,
  fyAdminSetEstado,
  fySoyAdmin,
  claseEstadoPredio,
  etiquetaEstadoPredio,
  type AdminPredioRow,
} from "@/lib/predios";
import type { PredioEstado } from "@/lib/canchas";

export default function AdminPrediosPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [predios, setPredios] = useState<AdminPredioRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | PredioEstado>("en_revision");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const admin = await fySoyAdmin();
    setAllowed(admin);
    if (!admin) return;
    const res = await fyAdminListarPredios();
    if (!res.ok) setError(res.error);
    else setPredios(res.predios);
  };

  useEffect(() => {
    void load();
  }, []);

  const visibles = useMemo(
    () => (filtro === "todos" ? predios : predios.filter((p) => p.estado === filtro)),
    [predios, filtro],
  );

  const setEstado = async (id: string, estado: PredioEstado) => {
    setBusy(true);
    const res = await fyAdminSetEstado(id, estado);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else await load();
  };

  const invitar = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteMsg(null);
    setBusy(true);
    const created = await fyAdminInvitarPredio(nombre, email);
    if (!created.ok || !created.token) {
      setBusy(false);
      setInviteMsg(created.error);
      return;
    }
    const origin = window.location.origin;
    const url = `${origin}/dashboard/invitacion/${created.token}`;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const mail = await fetch("/api/predios/invitar-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ email, nombre, url }),
    });
    const body = (await mail.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    setNombre("");
    setEmail("");
    await load();
    if (body.ok) setInviteMsg(`Invitación enviada a ${email}.`);
    else setInviteMsg(`Predio creado. El mail no salió (${body.error ?? "sin Resend"}). Mandale este enlace: ${url}`);
  };

  if (allowed === null) return <p className="p-6 text-sm text-[#1A2E4A]/70">Cargando…</p>;
  if (!allowed) {
    return (
      <div className="p-6">
        <p className="text-sm text-[#1A2E4A]/70">Este panel es solo para el administrador de FulbitoYa.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-[var(--fulbito-green)] underline">
          Volver al panel
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-subheading text-2xl font-semibold text-[#1A2E4A]">Administración</h1>
      <p className="mt-1 text-sm text-[#1A2E4A]/70">
        Aprobá predios para que salgan en PorLaCancha. El piloto entra por el enlace de invitación.
      </p>

      <form onSubmit={(e) => void invitar(e)} className="mt-6 space-y-3 rounded-xl border border-[#E0E0E0] bg-white p-4">
        <p className="font-medium text-[#1A2E4A]">Invitar predio piloto</p>
        <input
          className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2.5"
          placeholder="Nombre comercial"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <input
          type="email"
          className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2.5"
          placeholder="Email del dueño"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[var(--fulbito-green)] py-2.5 font-medium text-white sm:w-auto sm:px-5"
        >
          Crear e invitar
        </button>
        {inviteMsg ? <p className="text-sm text-[#1A2E4A]/80 break-all">{inviteMsg}</p> : null}
      </form>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
        {(["en_revision", "borrador", "aprobado", "suspendido", "todos"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
              filtro === f ? "bg-[#1A2E4A] text-white" : "border border-[#E0E0E0] bg-white"
            }`}
          >
            {f === "todos" ? "Todos" : etiquetaEstadoPredio(f)}
          </button>
        ))}
      </div>

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

      <ul className="mt-4 space-y-3">
        {visibles.map((p) => (
          <li key={p.id} className="rounded-xl border border-[#E0E0E0] bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[#1A2E4A]">{p.nombre}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${claseEstadoPredio(p.estado)}`}>
                {etiquetaEstadoPredio(p.estado)}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#1A2E4A]/70">{p.direccion || p.barrio || "Sin dirección"}</p>
            <p className="text-sm text-[#1A2E4A]/70">
              {p.responsable_nombre || "Sin responsable"} · {p.responsable_email || p.owner_email || "sin mail"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.estado !== "aprobado" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setEstado(p.id, "aprobado")}
                  className="rounded-lg bg-[var(--fulbito-green)] px-3 py-2 text-sm text-white"
                >
                  Aprobar
                </button>
              ) : null}
              {p.estado !== "suspendido" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setEstado(p.id, "suspendido")}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700"
                >
                  Suspender
                </button>
              ) : null}
              {p.estado === "suspendido" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setEstado(p.id, "en_revision")}
                  className="rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm"
                >
                  Volver a revisión
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {visibles.length === 0 ? <p className="mt-6 text-sm text-[#1A2E4A]/60">No hay predios en este filtro.</p> : null}
    </div>
  );
}
