# Pagos de reserva PorLaCancha

- `preferencia/route.ts` crea el checkout (app PorLaCancha).
- `webhook/route.ts` confirma con `plc_confirmar_pago_reserva`.
- `estado/route.ts` polling del QR en escritorio.
- `reembolsar/route.ts` reembolso real en Mercado Pago tras cancelar.

No usar `/api/pagos/mercadopago/*` de FulbitoYa.

## Fase 0 — Probar pago de punta a punta (modo prueba)

### 1) Variables en Vercel (`porlacancha-web`)

Ver `.env.example`. Mínimo:

- `PLC_MERCADOPAGO_ACCESS_TOKEN` (credenciales de **prueba** de la app PLC)
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` = URL pública HTTPS de este deploy

En la app Expo: `EXPO_PUBLIC_WEB_URL` = misma URL.

Webhook de MP (Tus integraciones → Webhooks):  
`https://<NEXT_PUBLIC_SITE_URL>/api/pagos/reservas/webhook`  
Eventos de pagos. Probar con `GET` a esa URL → `{ "ok": true }`.

### 2) Apagar checkout de prueba en la base

Por defecto `plc_checkout_prueba = true` confirma sin Mercado Pago.

Como admin de plataforma, en la app → Perfil → Reloj de simulación → **Usar Mercado Pago real**.  
O SQL: `update config_plataforma set valor_bool = false where clave = 'plc_checkout_prueba';`

Para volver al modo local: **Checkout de prueba (sin MP)**.

### 3) Usuario comprador y tarjeta

1. En [Mercado Pago Developers](https://www.mercadopago.com.ar/developers) → Tu aplicación → **Pruebas → Cuentas de prueba**: creá un usuario **Comprador**.
2. Iniciá sesión en Mercado Pago con ese usuario cuando el checkout lo pida (o usá el flujo con tarjeta).
3. En el checkout, email de prueba: `test@testuser.com`.
4. Tarjeta (crédito Mastercard de prueba):

| Campo | Valor |
|---|---|
| Número | `5031 7557 3453 0604` |
| Vencimiento | `11/30` |
| CVV | `123` |
| Titular | `APRO` |
| DNI | `12345678` |

Más escenarios: [tarjetas de prueba](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards).

### 4) Flujo a probar

1. App o web → predio adherido → horario libre → **Reserva simple** → **Seña** → aceptar reglas → pagar.
2. En **computadora**: aparece QR (`PagoQrCard`); escaneá o abrí el link. En celular: redirección a MP.
3. Pagá con la tarjeta de arriba. El webhook confirma → reserva `reservada`.
4. En FulbitoYa (dashboard predio) → agenda del día: debe verse el turno reservado.
5. En la app → Mis partidos / detalle de reserva → **Cancelar** (con anticipación suficiente para reembolso total).  
   Si el pago fue real (no `prueba-res-…`), la API llama al reembolso de MP.

### 5) Script automático

Desde la raíz del repo (con env cargado):

```bash
export PLC_MERCADOPAGO_ACCESS_TOKEN=TEST-…
export SUPABASE_SERVICE_ROLE_KEY=…
export NEXT_PUBLIC_SUPABASE_URL=https://….supabase.co
export PLC_WEB_URL=https://porlacancha.com
export PLC_TEST_HOLD_ID=<uuid de un hold vivo>
# o: PLC_TEST_USUARIO_ID + PLC_TEST_DISPONIBILIDAD_ID

npm run prueba:mp-pago
```

El script: tokeniza tarjeta APRO → crea pago en MP → POST al webhook → verifica reserva `reservada` → reembolsa.

### 6) Si falla

| Síntoma | Qué mirar |
|---|---|
| Confirma al toque sin abrir MP | `plc_checkout_prueba` sigue en true |
| “Mercado Pago no está configurado” | `PLC_MERCADOPAGO_ACCESS_TOKEN` en Vercel |
| Preferencia ok pero no confirma | Webhook URL + token; `NEXT_PUBLIC_SITE_URL` no localhost |
| QR no aparece | Estás en móvil (ahí redirige); en desktop sí es QR |
| Agenda vacía | Webhook no corrió o predio distinto |
