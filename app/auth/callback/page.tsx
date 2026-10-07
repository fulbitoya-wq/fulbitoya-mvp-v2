"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { completeOrigenRegistro, redirectPathForUser } from "@/lib/auth/profile";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completando ingreso...");

  useEffect(() => {
    const run = async () => {
      const code = searchParams.get("code");
      const oauthError = searchParams.get("error_description") || searchParams.get("error");
      if (oauthError) {
        setMessage(oauthError);
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMessage(error.message);
          return;
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      await completeOrigenRegistro(user.id, "fulbitoya");
      await redirectPathForUser(user.id);
      const next = searchParams.get("next");
      const dest = next && next.startsWith("/dashboard") ? next : "/dashboard";
      router.replace(dest);
      router.refresh();
    };

    run();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[80vh] items-center justify-center bg-[#1A2E4A] px-4">
      <p className="rounded-xl bg-white px-6 py-4 text-sm text-[#1A2E4A]">{message}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center bg-[#1A2E4A]">
          <p className="text-white">Cargando...</p>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
