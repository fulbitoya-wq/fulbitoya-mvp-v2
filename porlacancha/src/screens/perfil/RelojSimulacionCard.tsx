import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import {
  correrTareaPeriodicaPlc,
  getRelojPlc,
  setRelojSimulacion,
  type RelojPlc,
} from "../../lib/plc";
import { setCheckoutPrueba } from "../../lib/reserva";
import { Clock, iconStroke } from "../../lib/icons";
import { Button, Mute, showNotice } from "../../ui";
import { typeStyle } from "../../ui/textStyle";
import { fontFamily } from "../../lib/fonts";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalInput(txt: string): Date | null {
  const m = txt.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function RelojSimulacionCard() {
  const [reloj, setReloj] = useState<RelojPlc | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await getRelojPlc();
    setReloj(r);
    if (r) setInput(toLocalInput(r.reloj_iso ?? r.ahora));
  };

  useEffect(() => {
    void load();
  }, []);

  if (!reloj?.soy_admin) return null;

  const apply = async (iso: string | null) => {
    setBusy(true);
    const res = await setRelojSimulacion(iso);
    setBusy(false);
    if (!res.ok) {
      showNotice("No se pudo cambiar el reloj", res.error);
      return;
    }
    await load();
  };

  const saltar = (hours: number) => {
    const base = parseLocalInput(input) ?? new Date();
    base.setHours(base.getHours() + hours);
    void apply(base.toISOString());
  };

  const correr = async () => {
    setBusy(true);
    const res = await correrTareaPeriodicaPlc();
    setBusy(false);
    if (!res.ok) {
      showNotice("No se pudo correr la tarea", res.error);
      return;
    }
    showNotice("Listo", "Se corrió la tarea periódica con el reloj actual.");
    await load();
  };

  return (
    <View style={styles.box}>
      <View style={styles.hrow}>
        <Clock color={colors.gold} size={18} strokeWidth={iconStroke} />
        <Text style={styles.h}>Reloj de simulación</Text>
      </View>
      <Mute>
        Adelantá el reloj de la base (Argentina) para probar plazos, seña y cierres. Con checkout de
        prueba el pago se confirma acá; con Mercado Pago real usás el token de prueba de Vercel.
      </Mute>
      <Mute>
        {reloj.checkout_prueba
          ? "Checkout de prueba: ON (no abre Mercado Pago)."
          : "Checkout de prueba: OFF (va a Mercado Pago)."}
      </Mute>
      <View style={{ marginTop: space[8] }}>
        <Button
          label={
            busy
              ? "Guardando..."
              : reloj.checkout_prueba
                ? "Usar Mercado Pago real"
                : "Checkout de prueba (sin MP)"
          }
          variant="secondary"
          onPress={() => {
            setBusy(true);
            void setCheckoutPrueba(!reloj.checkout_prueba).then(async (res) => {
              setBusy(false);
              if (!res.ok) {
                showNotice("No se pudo cambiar", res.error);
                return;
              }
              await load();
              showNotice(
                "Checkout",
                res.checkoutPrueba
                  ? "Quedó en modo prueba (sin Mercado Pago)."
                  : "Quedó con Mercado Pago real (token de prueba en Vercel)."
              );
            });
          }}
          loading={busy}
        />
      </View>
      <Text style={styles.lab}>Ahora en la app</Text>
      <Text style={styles.val}>{reloj.ahora ?? "—"}</Text>
      <Mute>{reloj.simulando ? "Simulando" : "Hora real"}</Mute>
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="AAAA-MM-DD HH:mm"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        autoCapitalize="none"
      />
      <View style={{ marginTop: space[12] }}>
        <Button
          label={busy ? "Guardando..." : "Fijar reloj"}
          onPress={() => {
            const d = parseLocalInput(input);
            if (!d) {
              showNotice("Fecha inválida", "Usá el formato AAAA-MM-DD HH:mm.");
              return;
            }
            void apply(d.toISOString());
          }}
          loading={busy}
        />
      </View>
      <View style={styles.rowWrap}>
        {[1, 3, 12, 24].map((h) => (
          <Pressable key={h} onPress={() => saltar(h)} style={styles.chip}>
            <Text style={styles.chipT}>+{h} h</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: space[8] }}>
        <Button label="Volver a la hora real" variant="secondary" onPress={() => void apply(null)} />
      </View>
      <View style={{ marginTop: space[8] }}>
        <Button label="Correr tarea periódica" variant="secondary" onPress={() => void correr()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: space[16], gap: space[8] },
  hrow: { flexDirection: "row", alignItems: "center", gap: space[8] },
  h: typeStyle("h3", colors.white),
  lab: typeStyle("bodySmall", colors.textSecondary),
  val: typeStyle("body", colors.white),
  input: {
    minHeight: 48,
    backgroundColor: colors.navy,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    paddingHorizontal: space[16],
    color: colors.white,
    fontFamily: fontFamily.ui,
    fontSize: 16,
  },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: space[8], marginTop: space[8] },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space[12],
    paddingVertical: space[8],
  },
  chipT: typeStyle("bodySmall", colors.gold),
});
