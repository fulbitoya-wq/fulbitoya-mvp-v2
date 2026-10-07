/**
 * Smoke estático de la matriz PRUEBA (fases 1–4).
 * No necesita DB ni token. Exit 0 si todo el wiring local está presente.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const cases = [];

function check(id, fase, title, ok, detail = "") {
  cases.push({ id, fase, title, ok: Boolean(ok), detail });
}

// --- Fase 1
check("F1.1", 1, "Migración reglas edad", exists("supabase/migrations/086_plc_reglas_edad.sql"));
check("F1.2", 1, "Migración DNI inmutable", exists("supabase/migrations/087_plc_dni_inmutable.sql"));
const edadSql = exists("supabase/migrations/086_plc_reglas_edad.sql")
  ? read("supabase/migrations/086_plc_reglas_edad.sql")
  : "";
check("F1.3", 1, "RPC plc_check_edad_basica", edadSql.includes("plc_check_edad_basica"));
check("F1.4", 1, "RPC plc_check_desafio_cancha", edadSql.includes("plc_check_desafio_cancha"));
check(
  "F1.5",
  1,
  "Pantalla Datos personales",
  exists("porlacancha/src/screens/perfil/DatosPersonalesScreen.tsx")
);
check(
  "F1.6",
  1,
  "CompleteIdentidadDesafio",
  exists("porlacancha/src/screens/auth/CompleteIdentidadDesafioScreen.tsx")
);
const pending = read("porlacancha/src/lib/pending-action.ts");
check("F1.7", 1, "Gate birthdate / identidad", pending.includes("profileNeedsBirthdate") && pending.includes("tiene_dni"));

// --- Fase 2
const predio = read("porlacancha/src/screens/predio/PredioDetalleScreen.tsx");
check("F2.1", 2, "¿Qué querés hacer? simple/plus", predio.includes("Reserva simple") && predio.includes("Reserva Plus"));
check("F2.2", 2, "ReservaPagoBlock en predio", predio.includes("ReservaPagoBlock"));
check("F2.3", 2, "onArmarPlus callback", predio.includes("onArmarPlus"));

// --- Fase 3
check("F3.1", 3, "Migración 088 Plus", exists("supabase/migrations/088_plc_reserva_plus.sql"));
const m088 = exists("supabase/migrations/088_plc_reserva_plus.sql")
  ? read("supabase/migrations/088_plc_reserva_plus.sql")
  : "";
check("F3.2", 3, "plc_tarifa_plus", m088.includes("plc_tarifa_plus"));
check("F3.3", 3, "plc_cotizar_reserva_plus", m088.includes("plc_cotizar_reserva_plus"));
check("F3.4", 3, "plc_pasar_a_plus usa organizador_id", m088.includes("organizador_id") && !m088.includes("v_r.usuario_id"));
check(
  "F3.5",
  3,
  "pasar_a_plus no usa convertida_plus inválido",
  m088.includes("convertida_a_plus") && !m088.includes("'convertida_plus'")
);
check("F3.6", 3, "modalidad competitivo", m088.includes("'competitivo'"));
check("F3.7", 3, "ReservaPlusWizard", exists("porlacancha/src/screens/reserva/ReservaPlusWizard.tsx"));
check("F3.8", 3, "reserva-draft AsyncStorage", exists("porlacancha/src/lib/reserva-draft.ts"));
const rpc = read("shared/equipos/rpc.ts");
check("F3.9", 3, "rpcCotizarReservaPlus + rpcPasarAPlus", rpc.includes("rpcCotizarReservaPlus") && rpc.includes("rpcPasarAPlus"));
check("F3.10", 3, "CrearPartidoScreen conservado", exists("porlacancha/src/screens/CrearPartidoScreen.tsx"));
const tabs = read("porlacancha/src/screens/MainTabs.tsx");
check("F3.11", 3, "MainTabs abre ReservaPlusWizard", tabs.includes("ReservaPlusWizard") && tabs.includes("setReservaPlus"));

// --- Fase 4
check("F4.1", 4, "Migración 089 listado", exists("supabase/migrations/089_plc_mis_reservas_detalle.sql"));
check("F4.2", 4, "ReservaDetalleScreen", exists("porlacancha/src/screens/reserva/ReservaDetalleScreen.tsx"));
const detalle = read("porlacancha/src/screens/reserva/ReservaDetalleScreen.tsx");
check("F4.3", 4, "Detalle: lista + busca gente + cancelar + plus", [
  "Cargar lista",
  "abrirBuscaGente",
  "cancelarReservaMia",
  "Pasar a Plus",
].every((s) => detalle.includes(s)));
check("F4.4", 4, "Inicio abre reserva", tabs.includes("onOpenReserva") && read("porlacancha/src/screens/inicio/InicioScreen.tsx").includes("onOpenReserva"));
check("F4.5", 4, "MisPartidos abre detalle", read("porlacancha/src/screens/MisPartidosScreen.tsx").includes("onOpenReserva"));
const reservaLib = read("porlacancha/src/lib/reserva.ts");
check(
  "F4.6",
  4,
  "ReservaMia enriquecida",
  ["resta_en_predio", "busca_gente", "cancha_id", "convertida_a_plus"].every((k) => reservaLib.includes(k))
);

// --- Artefactos PRUEBA
check("P.1", 0, "Verify SQL 086–089", exists("supabase/verify/086_089_plc_redesign_checklist.sql"));
check("P.2", 0, "Test SQL tarifas Plus", exists("supabase/tests/plc_reserva_plus.sql"));

const failed = cases.filter((c) => !c.ok);
for (const c of cases) {
  const mark = c.ok ? "PASS" : "FAIL";
  console.log(`${mark}\t${c.id}\tF${c.fase}\t${c.title}${c.detail ? ` — ${c.detail}` : ""}`);
}
console.log("---");
console.log(`total=${cases.length} pass=${cases.length - failed.length} fail=${failed.length}`);
if (failed.length) {
  console.error("FALLÓ el smoke estático. Revisá los FAIL.");
  process.exit(1);
}
console.log("OK: wiring local de la matriz PRUEBA completo.");
console.log("Pendiente remoto: db push 088+089 y correr verify/tests SQL.");
