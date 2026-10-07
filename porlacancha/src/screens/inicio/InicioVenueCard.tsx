import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import { formatHora } from "../../lib/desafios";
import { MapPin, iconStroke } from "../../lib/icons";
import { typeStyle } from "../../ui/textStyle";

export type InicioTurnoChip = { id: string; hora: string };

type Props = {
  nombre: string;
  ubicacion: string | null;
  distancia: string | null;
  detalles: string;
  hours: InicioTurnoChip[];
  onPressHour: (turnoId: string) => void;
};

export function InicioVenueCard({
  nombre,
  ubicacion,
  distancia,
  detalles,
  hours,
  onPressHour,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.photo} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {nombre}
          </Text>
          {distancia ? <Text style={styles.dist}>{distancia}</Text> : null}
        </View>
        {ubicacion ? (
          <View style={styles.placeRow}>
            <MapPin color={colors.sky} size={13} strokeWidth={iconStroke} />
            <Text style={styles.zona} numberOfLines={2}>
              {ubicacion}
            </Text>
          </View>
        ) : null}
        {detalles ? <Text style={styles.tipos}>{detalles}</Text> : null}
        <Text style={styles.sub}>Horarios disponibles</Text>
        <View style={styles.hours}>
          {hours.map((h) => (
            <Pressable
              key={h.id}
              onPress={() => onPressHour(h.id)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Reservar ${formatHora(h.hora)}`}
              style={styles.hourHit}
            >
              <View style={styles.hour}>
                <Text style={styles.hourT}>{formatHora(h.hora)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
    overflow: "hidden",
    minHeight: 118,
  },
  photo: { width: 92, backgroundColor: colors.navyDark },
  body: { flex: 1, padding: space[12], gap: 4 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: { flex: 1, ...typeStyle("h3", colors.white) },
  dist: typeStyle("caption", colors.sky),
  placeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginTop: 1,
  },
  zona: { flex: 1, ...typeStyle("caption", colors.textSecondary) },
  tipos: typeStyle("caption", colors.sky),
  sub: { ...typeStyle("caption", colors.white), marginTop: 6 },
  hours: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  hourHit: { minHeight: 48, justifyContent: "center" },
  hour: {
    height: 40,
    minWidth: 64,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  hourT: typeStyle("bodySmall", colors.white),
});
