import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { reembolsarPagoMp } from "@/lib/mp-refund";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** Reembolso real en Mercado Pago tras cancelar una reserva PLC. */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Tenés que iniciar sesión." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Configuración incompleta." }, { status: 500 });
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const {
    data: { user },
  } = await authClient.auth.getUser(token);
  if (!user?.id) {
    return NextResponse.json({ error: "Tenés que iniciar sesión." }, { status: 401 });
  }

  let body: { reservaId?: string; paymentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  let paymentId = body.paymentId?.trim() || "";
  const reservaId = body.reservaId?.trim() || "";

  if (!paymentId && reservaId) {
    let admin;
    try {
      admin = getSupabaseAdmin();
    } catch {
      return NextResponse.json({ error: "Servidor sin service role." }, { status: 500 });
    }
    const { data: reserva } = await admin
      .from("reservas")
      .select("id, organizador_id, mercadopago_payment_id, estado_reserva")
      .eq("id", reservaId)
      .maybeSingle();
    if (!reserva || reserva.organizador_id !== user.id) {
      return NextResponse.json({ error: "No encontramos esa reserva." }, { status: 400 });
    }
    paymentId = String(reserva.mercadopago_payment_id ?? "");
  }

  if (!paymentId) {
    return NextResponse.json({ ok: true, skipped: true, reason: "sin_payment_id" });
  }
  // Checkout de prueba local: no hay pago real en MP
  if (paymentId.startsWith("prueba-res-") || paymentId.startsWith("prueba-")) {
    return NextResponse.json({ ok: true, skipped: true, reason: "checkout_prueba" });
  }

  const ok = await reembolsarPagoMp(paymentId);
  if (!ok) {
    return NextResponse.json({ error: "No se pudo reembolsar en Mercado Pago." }, { status: 502 });
  }

  if (reservaId) {
    try {
      const admin = getSupabaseAdmin();
      await admin
        .from("movimientos")
        .update({ estado: "procesado", processed_at: new Date().toISOString() })
        .eq("reserva_id", reservaId)
        .eq("tipo", "reembolso_reserva")
        .eq("estado", "pendiente");
    } catch {
      /* best effort */
    }
  }

  return NextResponse.json({ ok: true, reembolsado: true });
}
