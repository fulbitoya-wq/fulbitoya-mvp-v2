"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCanchasDelOwner, type Cancha } from "@/lib/canchas";
import { PoliticaReservasForm } from "@/components/dashboard/PoliticaReservasForm";
import { enlacePredioWeb } from "@shared/equipos";
import {
  invitarEncargado,
  listarEncargados,
  revocarEncargado,
  slugDeCancha,
  type EncargadoRow,
} from "@/lib/configuracion";

const PLC_WEB = (process.env.NEXT_PUBLIC_PLC_SITE_URL ?? "https://porlacancha.com").replace(/\/$/, "");

export default function ConfiguracionPage() {
  const [canchas, setCanchas] = useState<Cancha[]>([]);
  const [canchaId, setCanchaId] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [staff, setStaff] = useState<EncargadoRow[]>([]);
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const predio = canchas.find((c) => c.id === canchaId);
  const link = slug ? enlacePredioWeb(PLC_WEB, slug) : null;

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setError(null);
    const [s, e] = await Promise.all([slugDeCancha(id), listarEncargados(id)]);
    if (!s.ok) setError(s.error);
    else setSlug(s.slug);
    setStaff(e);
  }, []);

  useEffect(() => {
    const boot = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Debés estar logueado.");
        setLoading(false);
        return;
      }
      const rows = await getCanchasDelOwner(user.id);
      const mias = rows.filter((c) => c.owner_id === user.id);
      setCanchas(mias);
      if (mias[0]) setCanchaId(mias[0].id);
      else if (rows.length) setError("El encargado no puede cambiar la configuración.");
      setLoading(false);
    };
    void boot();
  }, []);

  useEffect(() => {
    if (canchaId) void load(canchaId);
  }, [canchaId, load]);

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-subheading text-2xl font-semibold text-[#1A2E4A]">Configuración</h1>
      <p className="mt-1 text-sm text-[#1A2E4A]/70">Datos del predio, políticas, encargados y enlaces.</p>

      <select
        className="mt-4 rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-sm"
        value={canchaId}
        onChange={(e) => setCanchaId(e.target.value)}
      >
        {canchas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="mt-6 text-sm text-[#1A2E4A]/70">Cargando…</p> : null}

      {predio ? (
        <section className="mt-6 rounded-xl border border-[#E0E0E0] bg-white p-4">
          <h2 className="font-medium text-[#1A2E4A]">Datos del predio</h2>
          <p className="mt-1 text-sm text-[#1A2E4A]/70">{predio.direccion || "Sin dirección"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/dashboard/canchas/${predio.id}/editar`} className="rounded-lg bg-[#1A2E4A] px-4 py-2 text-sm text-white">
              Editar datos
            </Link>
            <Link href={`/dashboard/canchas/${predio.id}/campos`} className="rounded-lg border border-[#E0E0E0] px-4 py-2 text-sm">
              Canchas y precios
            </Link>
          </div>
        </section>
      ) : null}

      {canchaId ? (
        <section className="mt-6 rounded-xl border border-[#E0E0E0] bg-white p-4">
          <h2 className="font-medium text-[#1A2E4A]">Cancelación, señas y partidos abiertos</h2>
          <p className="mb-4 mt-1 text-sm text-[#1A2E4A]/70">
            Horarios habilitados, anticipación y cierre de partidos abiertos van en este mismo formulario.
          </p>
          <PoliticaReservasForm
            canchaId={canchaId}
            valorHora={String(predio?.valor_hora ?? 0)}
            valorReserva={String(predio?.valor_reserva ?? 0)}
          />
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border border-[#E0E0E0] bg-white p-4">
        <h2 className="font-medium text-[#1A2E4A]">Enlace y QR</h2>
        {link ? (
          <>
            <a href={link} className="mt-2 block break-all text-sm text-[var(--fulbito-green)]" target="_blank" rel="noreferrer">
              {link}
            </a>
            <img
              alt="QR del predio"
              className="mt-3 h-40 w-40 rounded-lg border border-[#E0E0E0] bg-white"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(link)}`}
            />
            <button
              type="button"
              className="mt-3 rounded-lg border border-[#E0E0E0] px-4 py-2 text-sm"
              onClick={() => window.print()}
            >
              Imprimir QR
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-[#1A2E4A]/60">Elegí un predio para ver el enlace.</p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-[#E0E0E0] bg-white p-4">
        <h2 className="font-medium text-[#1A2E4A]">Encargados</h2>
        <p className="mt-1 text-sm text-[#1A2E4A]/70">
          Pueden usar la agenda, cobrar y reservar. No cambian precios, políticas ni ven la caja.
        </p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!canchaId || !email.trim()) return;
            const res = await invitarEncargado(canchaId, email.trim());
            if (!res.ok) setError(res.error);
            else {
              setInviteUrl(`${window.location.origin}/dashboard/encargado/${res.token}`);
              setEmail("");
              setStaff(await listarEncargados(canchaId));
            }
          }}
        >
          <input
            className="min-w-[12rem] flex-1 rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm"
            placeholder="Email del encargado"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="rounded-lg bg-[#1A2E4A] px-4 py-2 text-sm text-white">
            Invitar
          </button>
        </form>
        {inviteUrl ? (
          <p className="mt-2 break-all text-sm text-[#1A2E4A]/80">
            Enlace: {inviteUrl}
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#EEE] px-3 py-2 text-sm">
              <span>
                {s.email} · {s.estado}
              </span>
              <button
                type="button"
                className="text-red-700"
                onClick={async () => {
                  await revocarEncargado(s.id);
                  setStaff(await listarEncargados(canchaId));
                }}
              >
                Revocar
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-dashed border-[#1A2E4A]/30 bg-[#E8EEF5] p-4">
        <h2 className="font-medium text-[#1A2E4A]">Mercado Pago</h2>
        <p className="mt-1 text-sm text-[#1A2E4A]/70">
          Acá se va a conectar la cuenta del predio (modelo marketplace). Todavía no está habilitado.
        </p>
        <button type="button" disabled className="mt-3 rounded-lg bg-[#90A4AE] px-4 py-2.5 text-sm text-white">
          Conectar Mercado Pago (próximamente)
        </button>
      </section>
    </div>
  );
}
