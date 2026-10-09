import { colors, space } from "@shared/design";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import {
  etiquetaModalidad,
  etiquetaEstado,
  chipToneEstado,
  esSoloCancha,
  formatDiaSemana,
  formatHora,
  formatPremioArriba,
  type Desafio,
} from "../lib/desafios";
import { MapPin, iconStroke } from "../lib/icons";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { EquipoCupos } from "./EquipoCupos";
import { PitchCover } from "./PitchCover";
import { typeStyle } from "./textStyle";

type Props = {
  desafio: Desafio;
  onPress: () => void;
  compact?: boolean;
};

export function DesafioCard({ desafio, onPress, compact }: Props) {
  const { profile } = useAuth();
  const solo = esSoloCancha(Number(desafio.premio));
  const predio = desafio.predio_nombre || desafio.direccion;
  const h = compact ? space[48] + space[48] + space[24] : space[48] + space[48] + space[48] + space[16];
  const soyOrganizador = Boolean(profile?.id && desafio.owner_id && profile.id === desafio.owner_id);

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <PitchCover height={h} width={74} variant="thumb" />
        <View style={styles.body}>
          <View style={styles.chips}>
            <Chip label={etiquetaEstado(desafio.estado)} tone={chipToneEstado(desafio.estado)} />
            {soyOrganizador ? <Chip label="Organizador" tone="gold" /> : null}
          </View>
          <View style={styles.top}>
            <View style={styles.when}>
              <Text style={styles.dia}>{formatDiaSemana(desafio.fecha)}</Text>
              <Text style={styles.hora}>{formatHora(desafio.hora_inicio)}</Text>
            </View>
            <View style={styles.copy}>
              <Text style={styles.mod}>{etiquetaModalidad(Number(desafio.premio), desafio.modalidad)}</Text>
              {solo ? null : <Text style={styles.prize}>{formatPremioArriba(Number(desafio.premio))}</Text>}
            </View>
          </View>
          <View style={styles.meta}>
            <MapPin color={colors.sky} size={14} strokeWidth={iconStroke} />
            <Text style={styles.addr} numberOfLines={2}>
              {predio}
            </Text>
          </View>
          {desafio.barrio ? <Text style={styles.barrio}>{desafio.barrio}</Text> : null}
          <EquipoCupos desafio={desafio} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space[12], padding: 0, overflow: "hidden" },
  row: { flexDirection: "row" },
  body: { flex: 1, padding: space[12], gap: space[8], justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  top: { flexDirection: "row", gap: space[12] },
  when: { minWidth: 64 },
  copy: { flex: 1 },
  dia: typeStyle("label", colors.white),
  hora: typeStyle("numL", colors.white),
  mod: typeStyle("bodySmall", colors.white),
  prize: typeStyle("numM", colors.gold),
  meta: { flexDirection: "row", alignItems: "flex-start", gap: space[8] },
  addr: { flex: 1, ...typeStyle("bodySmall", colors.sky) },
  barrio: typeStyle("caption", colors.textSecondary),
});
