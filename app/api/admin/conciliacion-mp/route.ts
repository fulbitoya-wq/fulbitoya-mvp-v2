import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function mpToken(): string | null {
  const t =
    process.env.PLC_MERCADOPAGO_ACCESS_TOKEN?.trim() ||
    process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ||
    "";
  return t || null;
}

type MpPayment = {
  id?: number | string;
  status?: string;
  transaction_amount?: number;
  date_created?: string;
  external_reference?: string | null;
};

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Tenés que iniciar sesión." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Configuración incompleta." }, { status: 500 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: soy } = await userClient.rpc("plc_admin_soy");
  if (!(soy as { admin?: boolean } | null)?.admin) {
    return NextResponse.json({ error: "no_admin" }, { status: 403 });
  }

  let body: { desde?: string | null; hasta?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  const desdeIso = body.desde ? `${body.desde}T00:00:00.000Z` : null;
  const hastaIso = body.hasta ? `${body.hasta}T23:59:59.999Z` : null;

  const { data: dbRes, error: dbErr } = await userClient.rpc("plc_admin_mp_payment_ids", {
    p_desde: desdeIso,
    p_hasta: hastaIso,
  });
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  const dbRow = dbRes as { ok?: boolean; pagos?: Array<Record<string, unknown>>; error?: string } | null;
  if (!dbRow?.ok) return NextResponse.json({ error: dbRow?.error ?? "no_admin" }, { status: 403 });

  const dbPagos = Array.isArray(dbRow.pagos) ? dbRow.pagos : [];
  const dbById = new Map<string, Record<string, unknown>>();
  for (const p of dbPagos) {
    const id = String(p.mp_payment_id ?? "");
    if (id) dbById.set(id, p);
  }

  const accessToken = mpToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "Falta PLC_MERCADOPAGO_ACCESS_TOKEN o MERCADOPAGO_ACCESS_TOKEN en Vercel." },
      { status: 503 }
    );
  }

  // Search payments (last 100). Range filters via begin/end date if provided.
  const params = new URLSearchParams({ sort: "date_created", criteria: "desc", limit: "100" });
  if (body.desde) params.set("begin_date", `${body.desde}T00:00:00.000-03:00`);
  if (body.hasta) params.set("end_date", `${body.hasta}T23:59:59.000-03:00`);

  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!mpRes.ok) {
    const text = await mpRes.text().catch(() => "");
    return NextResponse.json({ error: "No se pudo leer Mercado Pago.", detail: text.slice(0, 200) }, { status: 502 });
  }
  const mpBody = (await mpRes.json()) as { results?: MpPayment[] };
  const mpList = mpBody.results ?? [];
  const mpById = new Map<string, MpPayment>();
  for (const p of mpList) {
    if (p.id != null) mpById.set(String(p.id), p);
  }

  const diffs: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const [id, mp] of mpById) {
    seen.add(id);
    const db = dbById.get(id);
    if (!db) {
      diffs.push({
        mp_payment_id: id,
        en_mp: true,
        en_db: false,
        monto_mp: mp.transaction_amount ?? null,
        status_mp: mp.status ?? null,
        nota: "Está en Mercado Pago y no en la base",
      });
      continue;
    }
    const montoDb = Number(db.monto ?? 0);
    const montoMp = Number(mp.transaction_amount ?? 0);
    if (Math.abs(montoDb - montoMp) > 0.5 || (mp.status && mp.status !== "approved" && db.origen)) {
      diffs.push({
        mp_payment_id: id,
        en_mp: true,
        en_db: true,
        monto_mp: montoMp,
        monto_db: montoDb,
        status_mp: mp.status ?? null,
        origen_db: db.origen ?? null,
        nota:
          Math.abs(montoDb - montoMp) > 0.5
            ? "Montos distintos"
            : `Estado MP: ${mp.status}`,
      });
    }
  }

  for (const [id, db] of dbById) {
    if (seen.has(id)) continue;
    // Puede estar fuera de la ventana de search; marcar como solo DB
    diffs.push({
      mp_payment_id: id,
      en_mp: false,
      en_db: true,
      monto_db: Number(db.monto ?? 0),
      origen_db: db.origen ?? null,
      nota: "Está en la base y no apareció en la búsqueda de MP (ventana o token)",
    });
  }

  return NextResponse.json({
    ok: true,
    mp_count: mpList.length,
    db_count: dbPagos.length,
    diffs,
  });
}
