"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { plcAdminSoy } from "@/lib/admin-plc";

const nav = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/movimientos", label: "Libro" },
  { href: "/admin/transferencias", label: "Transferencias" },
  { href: "/admin/revisiones", label: "Revisiones" },
  { href: "/admin/conciliacion", label: "Conciliación" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(pathname || "/admin")}`);
        return;
      }
      const admin = await plcAdminSoy();
      if (!mounted) return;
      setAllowed(admin);
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, [router, pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] text-sm text-[#1A2E4A]/70">
        Cargando…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold text-[#1A2E4A]">Sin acceso</h1>
        <p className="mt-2 text-sm text-[#1A2E4A]/70">
          Este panel es solo para usuarios con rol <code>admin</code> en la base (distinto de owner). Se asigna a
          mano, nunca desde la app.
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-[var(--fulbito-green)] underline">
          Volver al panel
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <header className="border-b border-[#E0E0E0] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#1A2E4A]/50">FulbitoYa</p>
            <h1 className="text-lg font-semibold text-[#1A2E4A]">Administración PorLaCancha</h1>
          </div>
          <Link href="/dashboard" className="text-sm text-[var(--fulbito-green)] underline">
            Panel predio
          </Link>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {nav.map((item) => {
            const on = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm whitespace-nowrap ${
                  on ? "bg-[var(--fulbito-green)] text-white" : "text-[#1A2E4A]/80 hover:bg-[#1A2E4A]/5"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
