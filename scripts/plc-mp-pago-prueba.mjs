#!/usr/bin/env node
/**
 * Fase 0 — prueba automática Mercado Pago (modo prueba).
 *
 * Crea un pago de prueba vía API MP, simula el webhook de reserva PLC,
 * verifica confirmación en Supabase y pide reembolso.
 *
 * Env requeridas:
 *   PLC_MERCADOPAGO_ACCESS_TOKEN   (token de prueba de la app PLC)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   PLC_WEB_URL                    (ej. https://porlacancha.com) — webhook
 *
 * Env opcionales:
 *   PLC_TEST_HOLD_ID               hold existente de plc_checkout_hold
 *   PLC_TEST_DISPONIBILIDAD_ID     para crear hold si no hay HOLD_ID
 *   PLC_TEST_USUARIO_ID            usuario dueño del hold
 *   PLC_TEST_MONTO                 default 100
 *
 * Uso:
 *   node scripts/plc-mp-pago-prueba.mjs
 */

import { createClient } from "@supabase/supabase-js";

const token = process.env.PLC_MERCADOPAGO_ACCESS_TOKEN?.trim() || process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const webUrl = (process.env.PLC_WEB_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function ok(msg) {
  console.log("OK:", msg);
}

if (!token) fail("Falta PLC_MERCADOPAGO_ACCESS_TOKEN");
if (!supabaseUrl || !serviceKey) fail("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
if (!webUrl) fail("Falta PLC_WEB_URL (URL pública de porlacancha-web)");

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const monto = Number(process.env.PLC_TEST_MONTO || 100);

async function ensureHold() {
  const holdId = process.env.PLC_TEST_HOLD_ID?.trim();
  if (holdId) {
    const { data, error } = await admin.from("plc_checkout_hold").select("*").eq("id", holdId).maybeSingle();
    if (error || !data) fail(`Hold ${holdId} no existe: ${error?.message}`);
    ok(`Usando hold existente ${holdId}`);
    return data;
  }

  const userId = process.env.PLC_TEST_USUARIO_ID?.trim();
  const dispId = process.env.PLC_TEST_DISPONIBILIDAD_ID?.trim();
  if (!userId || !dispId) {
    fail(
      "Sin PLC_TEST_HOLD_ID. Pasá PLC_TEST_HOLD_ID o (PLC_TEST_USUARIO_ID + PLC_TEST_DISPONIBILIDAD_ID) para crear uno."
    );
  }

  const expira = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("plc_checkout_hold")
    .insert({
      usuario_id: userId,
      disponibilidad_id: dispId,
      tipo_cobro: "sena",
      monto,
      expira_at: expira,
      condiciones: { origen: "script_prueba", tipo_cobro: "sena", cancha_id: null },
    })
    .select("*")
    .single();
  if (error || !data) fail(`No se pudo crear hold: ${error?.message}`);
  ok(`Hold creado ${data.id}`);
  return data;
}

async function createTestPayment(hold) {
  // Pago de prueba con tarjeta APRO vía API Payments (sandbox)
  const body = {
    transaction_amount: Number(hold.monto) || monto,
    token: process.env.PLC_TEST_CARD_TOKEN?.trim() || undefined,
    description: "Prueba automática PorLaCancha",
    installments: 1,
    payment_method_id: "visa",
    payer: {
      email: process.env.PLC_TEST_PAYER_EMAIL?.trim() || "test_user_plc@testuser.com",
    },
    external_reference: hold.id,
    metadata: {
      hold_id: hold.id,
      origen: "porlacancha",
      usuario_id: hold.usuario_id,
    },
  };

  // Si no hay token de tarjeta, usamos el flujo de payment con card test (sandbox card token API)
  if (!body.token) {
    const cardRes = await fetch("https://api.mercadopago.com/v1/card_tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        card_number: "5031755734530604",
        security_code: "123",
        expiration_month: 11,
        expiration_year: 2030,
        cardholder: { name: "APRO", identification: { type: "DNI", number: "12345678" } },
      }),
    });
    const cardJson = await cardRes.json().catch(() => ({}));
    if (!cardRes.ok || !cardJson.id) {
      fail(`No se pudo tokenizar tarjeta de prueba: ${JSON.stringify(cardJson).slice(0, 300)}`);
    }
    body.token = cardJson.id;
    ok(`Card token ${body.token}`);
  }

  const payRes = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `plc-prueba-${hold.id}-${Date.now()}`,
    },
    body: JSON.stringify(body),
  });
  const pay = await payRes.json().catch(() => ({}));
  if (!payRes.ok || pay.id == null) {
    fail(`No se pudo crear pago: ${JSON.stringify(pay).slice(0, 400)}`);
  }
  ok(`Pago MP ${pay.id} status=${pay.status}`);
  return pay;
}

async function simulateWebhook(paymentId) {
  const url = `${webUrl}/api/pagos/reservas/webhook`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "payment", data: { id: paymentId } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) fail(`Webhook HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  ok(`Webhook: ${JSON.stringify(json)}`);
  return json;
}

async function verifyReserva(paymentId, holdId) {
  const { data: byPay } = await admin
    .from("reservas")
    .select("id, estado_reserva, mercadopago_payment_id, monto_total")
    .eq("mercadopago_payment_id", String(paymentId))
    .maybeSingle();

  if (byPay?.estado_reserva === "reservada") {
    ok(`Reserva confirmada ${byPay.id}`);
    return byPay;
  }

  // A veces el hold se confirma y deja la reserva por hold; reintentar breve
  await new Promise((r) => setTimeout(r, 1500));
  const { data: again } = await admin
    .from("reservas")
    .select("id, estado_reserva, mercadopago_payment_id, monto_total")
    .eq("mercadopago_payment_id", String(paymentId))
    .maybeSingle();
  if (again?.estado_reserva === "reservada") {
    ok(`Reserva confirmada ${again.id} (retry)`);
    return again;
  }

  fail(
    `No hay reserva reservada para payment ${paymentId} / hold ${holdId}. ` +
      `¿plc_checkout_prueba apagado? ¿Webhook URL correcta?`
  );
}

async function refund(paymentId) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `plc-refund-${paymentId}`,
    },
    body: "{}",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) fail(`Reembolso falló: ${JSON.stringify(json).slice(0, 300)}`);
  ok(`Reembolso OK ${json.id ?? ""} status=${json.status ?? ""}`);
  return json;
}

async function main() {
  console.log("=== PLC MP pago de prueba E2E ===");
  console.log("Web:", webUrl);

  // Ping webhook
  const ping = await fetch(`${webUrl}/api/pagos/reservas/webhook`);
  const pingJson = await ping.json().catch(() => ({}));
  if (!ping.ok || !pingJson.ok) fail(`Webhook GET no responde ok en ${webUrl}`);
  ok("Webhook vivo");

  const hold = await ensureHold();
  const payment = await createTestPayment(hold);

  if (payment.status !== "approved") {
    fail(`El pago no quedó approved (status=${payment.status}). Revisá cuenta de prueba / tarjeta APRO.`);
  }

  await simulateWebhook(String(payment.id));
  const reserva = await verifyReserva(String(payment.id), hold.id);
  await refund(String(payment.id));

  console.log("\nRESUMEN");
  console.log({
    hold_id: hold.id,
    payment_id: payment.id,
    reserva_id: reserva.id,
    monto: payment.transaction_amount,
    reembolsado: true,
  });
  console.log("\nListo. Si querés, cancelá la reserva en la app para ejercitar también /api/pagos/reservas/reembolsar.");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
