import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import { chipToneEstado, etiquetaEstado, formatFechaCorta, formatHora, type Desafio } from "../../lib/desafios";
import { etiquetaEstadoReserva, type ReservaMia } from "../../lib/reserva";
import { Chip } from "../../ui";
import { PitchCover } from "../../ui/PitchCover";
import { typeStyle } from "../../ui/textStyle";

export function InicioUpcomingMatchCard({
  partido,
  onPress,
}: {
  partido: Desafio & { miEquipoNombre?: string | null; rivalNombre?: string | null };
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.dia}>{formatFechaCorta(partido.fecha).toUpperCase()}</Text>
        <Text style={styles.hora}>{formatHora(partido.hora_inicio)}</Text>
        <Chip label={etiquetaEstado(partido.estado)} tone={chipToneEstado(partido.estado)} />
      </View>
      {partido.miEquipoNombre || partido.rivalNombre ? (
        <Text style={styles.vs} numberOfLines={1}>
          {partido.miEquipoNombre || "Tu equipo"}
          {partido.rivalNombre ? `  VS  ${partido.rivalNombre}` : ""}
        </Text>
      ) : (
        <Text style={styles.vs} numberOfLines={1}>
          {partido.titulo}
        </Text>
      )}
      <Text style={styles.meta} numberOfLines={1}>
        {partido.predio_nombre || partido.direccion}
        {partido.barrio ? ` · ${partido.barrio}` : ""}
      </Text>
    </Pressable>
  );
}

export function InicioUpcomingReservaCard({
  reserva,
  onPress,
}: {
  reserva: ReservaMia;
  onPress?: () => void;
}) {
  const tone = reserva.estado === "reservada" ? "gold" : reserva.estado === "cancelada" ? "cancelled" : "pending";
  const body = (
    <>
      <View style={styles.head}>
        <Text style={styles.dia}>{formatFechaCorta(reserva.fecha).toUpperCase()}</Text>
        <Text style={styles.hora}>{formatHora(reserva.hora_inicio)}</Text>
        <Chip label={etiquetaEstadoReserva(reserva.estado, reserva.convertida_a_plus)} tone={tone} />
      </View>
      <View style={styles.resRow}>
        <PitchCover height={56} width={56} variant="thumb" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.vs} numberOfLines={1}>
            {reserva.cancha_nombre}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {reserva.campo_nombre}
            {reserva.barrio ? ` · ${reserva.barrio}` : ""}
          </Text>
        </View>
      </View>
    </>
  );
  if (!onPress) return <View style={styles.card}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.card}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
    padding: space[12],
    gap: 8,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  dia: typeStyle("caption", colors.textSecondary),
  hora: typeStyle("h3", colors.white),
  vs: typeStyle("body", colors.white),
  meta: typeStyle("caption", colors.textSecondary),
  resRow: { flexDirection: "row", gap: 10, alignItems: "center" },
});
