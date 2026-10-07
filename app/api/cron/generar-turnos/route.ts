import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const hdr = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const q = new URL(req.url).searchParams.get("secret");
  if (!secret || (hdr !== secret && q !== secret)) {
    return NextResponse.json({ ok: false, error: "no_auth" }, { status: 401 });
  }
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("fy_generar_turnos_plataforma");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json(data ?? { ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export const POST = GET;
