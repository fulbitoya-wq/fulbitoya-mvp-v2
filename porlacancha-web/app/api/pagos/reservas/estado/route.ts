import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const holdId = url.searchParams.get("holdId")?.trim();
  const since = url.searchParams.get("since")?.trim();
  if (!holdId) {
    return NextResponse.json({ error: "Falta el hold." }, { status: 400 });
  }
  const sinceDate = since ? new Date(since) : null;
  if (!sinceDate || Number.isNaN(sinceDate.getTime())) {
    return NextResponse.json({ error: "Falta el inicio del pago." }, { status: 400 });
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Servidor sin service role." }, { status: 500 });
  }

  const { data: hold, error: holdError } = await admin
    .from("plc_checkout_hold")
    .select("id, usuario_id, expira_at")
    .eq("id", holdId)
    .maybeSingle();

  if (holdError) {
    return NextResponse.json({ error: "No se pudo revisar el pago." }, { status: 500 });
  }
  if (hold && hold.usuario_id !== user.id) {
    return NextResponse.json({ error: "Ese checkout no es tuyo." }, { status: 403 });
  }
  if (hold) {
    if (new Date(hold.expira_at).getTime() <= Date.now()) {
      return NextResponse.json({ estado: "vencida" });
    }
    return NextResponse.json({ estado: "pendiente" });
  }

  const desde = new Date(sinceDate.getTime() - 2 * 60 * 1000).toISOString();
  const { data: reserva, error: reservaError } = await admin
    .from("reservas")
    .select("id")
    .eq("organizador_id", user.id)
    .eq("origen", "porlacancha")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reservaError) {
    return NextResponse.json({ error: "No se pudo revisar el pago." }, { status: 500 });
  }
  if (reserva?.id) {
    return NextResponse.json({ estado: "confirmada", reservaId: reserva.id });
  }
  return NextResponse.json({ estado: "vencida" });
}
