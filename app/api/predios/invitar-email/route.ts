import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const from = process.env.SMTP_FROM || "FulbitoYa <onboarding@resend.dev>";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key?.trim()) return null;
  return new Resend(key);
}

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!token || !supabaseUrl || !anonKey) {
      return NextResponse.json({ ok: false, error: "no_auth" }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const {
      data: { user },
    } = await authClient.auth.getUser(token);
    if (!user?.id || !user.email) {
      return NextResponse.json({ ok: false, error: "no_auth" }, { status: 401 });
    }

    const sr = getSupabaseAdmin();
    const { data: row } = await sr
      .from("plataforma_admins")
      .select("usuario_id")
      .eq("usuario_id", user.id)
      .maybeSingle();
    const { data: cfg } = await sr
      .from("config_plataforma")
      .select("valor_text")
      .eq("clave", "fy_admin_email")
      .maybeSingle();
    const envAdmin = process.env.FY_ADMIN_EMAIL?.trim().toLowerCase();
    const admin =
      Boolean(row) ||
      Boolean(cfg?.valor_text && cfg.valor_text.toLowerCase() === user.email.toLowerCase()) ||
      Boolean(envAdmin && envAdmin === user.email.toLowerCase());

    if (!admin) {
      return NextResponse.json({ ok: false, error: "no_admin" }, { status: 403 });
    }

    const body = (await req.json()) as { email?: string; nombre?: string; url?: string };
    if (!body.email || !body.url || !body.nombre) {
      return NextResponse.json({ ok: false, error: "datos_invalidos" }, { status: 400 });
    }

    const resend = getResend();
    if (!resend) {
      return NextResponse.json({ ok: false, error: "Falta RESEND_API_KEY" }, { status: 503 });
    }

    const { error } = await resend.emails.send({
      from,
      to: body.email,
      subject: `Te invitaron a cargar ${body.nombre} en FulbitoYa`,
      text: `Hola,\n\nTe invitaron a tomar el predio "${body.nombre}" en FulbitoYa.\n\nEntrá a este enlace, ingresá o creá la cuenta, y completá los datos:\n${body.url}\n\nEl enlace vale 14 días.\n`,
    });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("invitar-email", e);
    return NextResponse.json({ ok: false, error: "error" }, { status: 500 });
  }
}
