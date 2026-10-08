import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import {
  chipToneEstado,
  etiquetaEstado,
  etiquetaModalidad,
  etiquetaTipo,
  formatFechaCorta,
  formatHora,
  esHoy,
  esManana,
  type Desafio,
} from "../../lib/desafios";
import { MapPin, iconStroke } from "../../lib/icons";
import { Chip } from "../../ui";
import { PitchCover } from "../../ui/PitchCover";
import { typeStyle } from "../../ui/textStyle";

function cuando(fecha: string, hora: string) {
  if (esHoy(fecha)) return `Hoy ${formatHora(hora)}`;
  if (esManana(fecha)) return `Mañana ${formatHora(hora)}`;
  return `${formatFechaCorta(fecha)} ${formatHora(hora)}`;
}

function cupoLabel(d: Desafio): { label: string; urgent: boolean } | null {
  const falta = Math.max(0, (d.cupos || 2) - (d.inscritos?.length ?? 0));
  if (falta <= 0) return { label: "Completo", urgent: false };
  if (falta === 1) return { label: "Falta 1", urgent: true };
  return { label: `Faltan ${falta}`, urgent: false };
}

export function InicioOpenMatchCard({ desafio, width, onPress }: { desafio: Desafio; width: number; onPress: () => void }) {
  const cupo = cupoLabel(desafio);
  const predio = desafio.predio_nombre || desafio.direccion;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.card, { width }]}>
      <View style={styles.top}>
        {cupo ? <Chip label={cupo.label} tone={cupo.urgent ? "gold" : "complete"} /> : null}
        <Text style={styles.when}>{cuando(desafio.fecha, desafio.hora_inicio)}</Text>
      </View>
      <PitchCover height={88} variant="flush" />
      <View style={styles.body}>
        <Text style={styles.meta}>
          {etiquetaTipo(desafio.tipo)} · {etiquetaModalidad(Number(desafio.premio), desafio.modalidad)}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {desafio.titulo}
        </Text>
        <View style={styles.row}>
          <MapPin color={colors.sky} size={14} strokeWidth={iconStroke} />
          <Text style={styles.place} numberOfLines={1}>
            {predio}
            {desafio.barrio ? ` · ${desafio.barrio}` : ""}
          </Text>
        </View>
        <Chip label={etiquetaEstado(desafio.estado)} tone={chipToneEstado(desafio.estado)} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
    overflow: "hidden",
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[12],
    paddingTop: space[10],
    paddingBottom: space[8],
    gap: space[8],
  },
  when: typeStyle("caption", colors.white),
  body: { padding: space[12], gap: 6 },
  meta: typeStyle("caption", colors.sky),
  title: typeStyle("h3", colors.white),
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  place: { flex: 1, ...typeStyle("caption", colors.textSecondary) },
});
