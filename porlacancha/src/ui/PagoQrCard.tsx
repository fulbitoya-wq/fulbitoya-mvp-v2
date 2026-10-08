import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { colors, radius, space } from "@shared/design";
import { webBaseUrl } from "../lib/web-url";
import { Button } from "./Button";
import { Mute } from "./Copy";
import { typeStyle } from "./textStyle";

type Props = {
  initPoint: string;
  holdId: string;
  accessToken: string;
  onConfirmada: (reservaId: string) => void;
  onVencida: () => void;
};

type Estado = "pendiente" | "confirmada" | "vencida";

export function PagoQrCard({ initPoint, holdId, accessToken, onConfirmada, onVencida }: Props) {
  const [estado, setEstado] = useState<Estado>("pendiente");
  const [error, setError] = useState<string | null>(null);
  const since = useState(() => new Date().toISOString())[0];
  const finished = useRef(false);
  const onConfirmadaRef = useRef(onConfirmada);
  const onVencidaRef = useRef(onVencida);
  onConfirmadaRef.current = onConfirmada;
  onVencidaRef.current = onVencida;

  useEffect(() => {
    let live = true;
    const tick = async () => {
      if (finished.current) return;
      const web = webBaseUrl();
      if (!web) {
        if (live) setError("Falta configurar el sitio para confirmar el pago.");
        return;
      }
      try {
        const url = `${web}/api/pagos/reservas/estado?holdId=${encodeURIComponent(holdId)}&since=${encodeURIComponent(since)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        const body = (await res.json().catch(() => null)) as { estado?: Estado; reservaId?: string; error?: string } | null;
        if (!live) return;
        if (!res.ok || !body?.estado) {
          setError(body?.error ?? "No pudimos revisar el pago.");
          return;
        }
        setError(null);
        if (body.estado === "confirmada" && body.reservaId) {
          finished.current = true;
          setEstado("confirmada");
          onConfirmadaRef.current(body.reservaId);
          return;
        }
        if (body.estado === "vencida") {
          finished.current = true;
          setEstado("vencida");
          onVencidaRef.current();
        }
      } catch {
        if (live) setError("Sin conexión para revisar el pago.");
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [accessToken, holdId, since]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Pagá con el celular</Text>
      <Mute>Abrí la cámara o la app de Mercado Pago y escaneá este código. Esta pantalla se actualiza sola cuando el pago se confirma.</Mute>
      <View style={styles.qr}>
        <QRCode value={initPoint} size={220} backgroundColor={colors.white} color={colors.navyDark} />
      </View>
      {estado === "pendiente" ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.gold} />
          <Text style={styles.wait}>Esperando el pago…</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {estado === "vencida" ? <Button label="El tiempo de pago se venció" variant="secondary" onPress={onVencida} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space[16],
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
    padding: space[16],
    gap: space[12],
    alignItems: "center",
  },
  title: typeStyle("h3", colors.white),
  qr: { backgroundColor: colors.white, padding: 12, borderRadius: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  wait: typeStyle("bodySmall", colors.textSecondary),
  err: typeStyle("caption", colors.danger),
});
