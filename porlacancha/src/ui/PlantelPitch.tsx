import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import { minimoConvocados, normalizarTipo } from "../lib/desafios";
import { typeStyle } from "./textStyle";

export type PlantelSlot = {
  id: string;
  label: string;
};

export type PlantelSlotTap = {
  index: number;
  pos: string;
  player: PlantelSlot | null;
};

type Props = {
  tipo: string;
  filled: PlantelSlot[];
  onPressEmpty?: (slot: PlantelSlotTap) => void;
  onPressFilled?: (slot: PlantelSlotTap) => void;
};

/** Etiquetas tipo Pista: arquero + jugadores de campo según formato. */
function labelsForTipo(tipo: string): string[] {
  const n = normalizarTipo(tipo);
  const min = minimoConvocados(n);
  if (n === "f7") {
    return ["ARQ", "DEF", "DEF", "MED", "MED", "DEL", "DEL"];
  }
  if (n === "f9" || n === "f11") {
    return Array.from({ length: min }, (_, i) => (i === 0 ? "ARQ" : `J${i}`));
  }
  // f5 default: arquero + 4 de campo
  return ["ARQ", "DEF", "DEF", "MED", "DEL"];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/**
 * Cancha esquemática: ARQ abajo, campo arriba (estilo apps de pádel / fútbol 5).
 */
export function PlantelPitch({ tipo, filled, onPressEmpty, onPressFilled }: Props) {
  const labels = labelsForTipo(tipo);
  const slots = labels.map((pos, i) => ({
    pos,
    player: filled[i] ?? null,
  }));
  const arq = slots[0]!;
  const campo = slots.slice(1);
  // Filas de campo: repartir en 2 filas (arriba / medio)
  const mid = Math.ceil(campo.length / 2);
  const filaAlta = campo.slice(0, mid);
  const filaBaja = campo.slice(mid);

  const Slot = ({
    index,
    pos,
    player,
  }: {
    index: number;
    pos: string;
    player: PlantelSlot | null;
  }) => (
    <Pressable
      onPress={() => {
        const tap = { index, pos, player };
        if (player) onPressFilled?.(tap);
        else onPressEmpty?.(tap);
      }}
      style={[styles.slot, player ? styles.slotOn : styles.slotOff]}
      accessibilityRole="button"
      accessibilityLabel={player ? `${pos}: ${player.label}` : `${pos} libre`}
    >
      <Text style={styles.pos}>{pos}</Text>
      <Text style={styles.name} numberOfLines={1}>
        {player ? initials(player.label) : "+"}
      </Text>
      {player ? (
        <Text style={styles.fullName} numberOfLines={1}>
          {player.label}
        </Text>
      ) : (
        <Text style={styles.fullName}>Libre</Text>
      )}
    </Pressable>
  );

  return (
    <View style={styles.pitch}>
      <View style={styles.row}>
        {filaAlta.map((s, i) => (
          <Slot key={`a-${i}`} index={1 + i} pos={s.pos} player={s.player} />
        ))}
      </View>
      {filaBaja.length > 0 ? (
        <View style={styles.row}>
          {filaBaja.map((s, i) => (
            <Slot key={`b-${i}`} index={1 + mid + i} pos={s.pos} player={s.player} />
          ))}
        </View>
      ) : null}
      <View style={styles.rowArq}>
        <Slot index={0} pos={arq.pos} player={arq.player} />
      </View>
      <Text style={styles.hint}>
        {filled.length}/{labels.length} en cancha
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pitch: {
    marginTop: space[8],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.35)",
    backgroundColor: "rgba(0, 80, 40, 0.35)",
    padding: space[12],
    gap: space[10],
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space[8],
  },
  rowArq: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: space[4],
  },
  slot: {
    width: 72,
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 2,
  },
  slotOn: {
    backgroundColor: colors.surfaceHover,
    borderColor: colors.gold,
  },
  slotOff: {
    backgroundColor: "rgba(0,27,68,0.45)",
    borderColor: "rgba(139,201,235,0.45)",
    borderStyle: "dashed",
  },
  pos: typeStyle("caption", colors.gold),
  name: { ...typeStyle("h3", colors.white), fontSize: 16 },
  fullName: { ...typeStyle("caption", colors.textSecondary), maxWidth: 68, textAlign: "center" },
  hint: { ...typeStyle("caption", colors.textSecondary), textAlign: "center", marginTop: 2 },
});
