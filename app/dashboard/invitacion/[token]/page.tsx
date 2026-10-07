"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { enterFulbitoYa } from "@/lib/auth/profile";

export default function InvitacionPredioPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token ?? "";
  const [msg, setMsg] = useState("Revisando la invitación…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const { data: vista } = await supabase.rpc("fy_ver_invitacion", { p_token: token });
      const v = vista as { ok?: boolean; error?: string; nombre?: string; email?: string } | null;
      if (!v?.ok) {
        if (v?.error === "ya_usada") setError("Esta invitación ya se usó.");
        else if (v?.error === "vencida") setError("La invitación venció. Pedile otra al administrador.");
        else setError("No encontramos esa invitación.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(`/dashboard/invitacion/${token}`)}`);
        return;
      }

      await enterFulbitoYa();
      const { data: claim } = await supabase.rpc("fy_reclamar_predio", { p_token: token });
      const c = claim as { ok?: boolean; error?: string; cancha_id?: string } | null;
      if (!c?.ok || !c.cancha_id) {
        setError("No se pudo tomar el predio. Probá ingresar con el mail de la invitación.");
        return;
      }
      setMsg(`Listo: ${v.nombre ?? "el predio"} ya es tuyo. Completá los datos.`);
      router.replace(`/dashboard/canchas/${c.cancha_id}/editar`);
    };
    if (token) void run();
  }, [token, router]);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-700">{error}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-[var(--fulbito-green)] underline">
          Ir al panel
        </Link>
      </div>
    );
  }

  return <p className="p-6 text-sm text-[#1A2E4A]/70">{msg}</p>;
}
