import { StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import { halfHourSlots } from "../lib/fecha-ui";
import { typeStyle } from "./textStyle";

type Props = {
  value: string;
  onChange: (hhmm: string) => void;
  placeholder?: string;
  label?: string;
};

const SLOTS = halfHourSlots();

export function TimeField({ value, onChange, label }: Props) {
  const shown = value.slice(0, 5);
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <select
        value={shown || ""}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        style={selectStyle as object}
      >
        <option value="" disabled>
          Elegí la hora
        </option>
        {SLOTS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </View>
  );
}

const selectStyle: Record<string, string | number> = {
  minHeight: 48,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: colors.border,
  borderRadius: radius.md,
  paddingLeft: space[12],
  paddingRight: space[12],
  backgroundColor: colors.surface,
  color: colors.white,
  fontSize: 16,
  width: "100%",
  boxSizing: "border-box",
};

const styles = StyleSheet.create({
  wrap: { gap: space[8], marginTop: space[8] },
  label: typeStyle("caption", colors.textSecondary),
});
