"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { enterFulbitoYa } from "@/lib/auth/profile";

export default function AceptarEncargadoPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token ?? "";
  const [msg, setMsg] = useState("Revisando la invitación…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(`/dashboard/encargado/${token}`)}`);
        return;
      }
      await enterFulbitoYa();
      const { data } = await supabase.rpc("fy_aceptar_encargado", { p_token: token });
      const row = data as { ok?: boolean; error?: string } | null;
      if (!row?.ok) {
        if (row?.error === "email") setError("Entrá con el mismo email de la invitación.");
        else setError("No se pudo aceptar. Pedile otro enlace al dueño.");
        return;
      }
      setMsg("Listo, ya podés usar la agenda.");
      router.replace("/dashboard");
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
