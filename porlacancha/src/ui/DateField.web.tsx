import { StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import { formatFechaAr } from "../lib/fecha-ui";
import { typeStyle } from "./textStyle";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  placeholder?: string;
  label?: string;
};

function toInputDate(d?: Date): string | undefined {
  if (!d) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DateField({ value, onChange, minimumDate, maximumDate, label }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <input
        type="date"
        value={value || ""}
        min={toInputDate(minimumDate)}
        max={toInputDate(maximumDate)}
        onChange={(e) => onChange((e.target as HTMLInputElement).value)}
        style={inputStyle as object}
      />
      {value ? <Text style={styles.hint}>{formatFechaAr(value)}</Text> : null}
    </View>
  );
}

const inputStyle: Record<string, string | number> = {
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
  hint: typeStyle("caption", colors.textSecondary),
});
