"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { fySoyAdmin } from "@/lib/predios";
import { fyPanelRol } from "@/lib/configuracion";

const itemsOwner: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Hoy" },
  { href: "/dashboard/disponibilidades", label: "Agenda" },
  { href: "/dashboard/reservas", label: "Reservas" },
  { href: "/dashboard/fijos", label: "Turnos fijos" },
  { href: "/dashboard/canchas", label: "Canchas" },
  { href: "/dashboard/caja", label: "Caja" },
  { href: "/dashboard/clientes", label: "Clientes" },
  { href: "/dashboard/configuracion", label: "Configuración" },
];

const itemsEncargado: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Hoy" },
  { href: "/dashboard/disponibilidades", label: "Agenda" },
  { href: "/dashboard/reservas", label: "Reservas" },
  { href: "/dashboard/clientes", label: "Clientes" },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [esOwner, setEsOwner] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const go = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) {
        const next = pathname && pathname.startsWith("/dashboard") ? `?next=${encodeURIComponent(pathname)}` : "";
        router.replace(`/login${next}`);
        return;
      }
      setAdmin(await fySoyAdmin());
      const rol = await fyPanelRol();
      setEsOwner(rol.owner);
      setReady(true);
    };
    void go();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        const next = pathname && pathname.startsWith("/dashboard") ? `?next=${encodeURIComponent(pathname)}` : "";
        router.replace(`/login${next}`);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, pathname]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] text-sm text-[#1A2E4A]/70">
        Cargando el panel…
      </div>
    );
  }

  const items = esOwner ? itemsOwner : itemsEncargado;

  const nav = (
    <>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          onClick={() => setMenuOpen(false)}
          className="block rounded-lg px-3 py-2 text-sm hover:bg-[#2C4A72]"
        >
          {it.label}
        </Link>
      ))}
      {admin ? (
        <Link
          href="/dashboard/admin"
          onClick={() => setMenuOpen(false)}
          className="block rounded-lg px-3 py-2 text-sm hover:bg-[#2C4A72]"
        >
          Admin
        </Link>
      ) : null}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="flex items-center justify-between bg-[#1A2E4A] px-4 py-3 text-white md:hidden">
        <Link href="/dashboard" className="font-heading text-xl">
          FulbitoYa
        </Link>
        <button type="button" onClick={() => setMenuOpen((v) => !v)} className="rounded-lg px-3 py-2 text-sm">
          Menú
        </button>
      </header>
      {menuOpen ? (
        <nav className="space-y-1 bg-[#1A2E4A] px-3 pb-4 text-white md:hidden">
          {nav}
          <button type="button" onClick={() => void logout()} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-white/80">
            Cerrar sesión
          </button>
        </nav>
      ) : null}

      <aside className="hidden w-56 flex-shrink-0 bg-[#1A2E4A] text-white md:flex md:flex-col">
        <div className="p-4">
          <Link href="/dashboard" className="font-heading text-xl">
            FulbitoYa
          </Link>
          <p className="mt-1 text-xs text-white/60">Panel del predio</p>
        </div>
        <nav className="mt-4 space-y-1 px-3">{nav}</nav>
        <p className="mt-8 px-4 text-xs leading-relaxed text-white/50">
          Los jugadores reservan en PorLaCancha. Acá cargás el predio y, cuando lo aprueben, sale en la app.
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          className="mx-3 mt-6 mb-4 block rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-[#2C4A72]"
        >
          Cerrar sesión
        </button>
      </aside>
      <div className="min-w-0 flex-1 bg-[#F5F5F5] pb-8">{children}</div>
    </div>
  );
}
