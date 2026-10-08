import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import { birthdateBounds, formatFechaAr, parseIsoDateLocal, toIsoDateLocal } from "../lib/fecha-ui";
import { typeStyle } from "./textStyle";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
};

export function BirthdateField({ value, onChange, label = "Fecha de nacimiento" }: Props) {
  const { min, max } = useMemo(() => birthdateBounds(), []);
  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = max.getFullYear(); y >= min.getFullYear(); y--) out.push(y);
    return out;
  }, [min, max]);

  const parsed = parseIsoDateLocal(value);
  const year = parsed?.getFullYear() ?? "";
  const month = parsed ? parsed.getMonth() + 1 : "";
  const day = parsed?.getDate() ?? "";

  const commit = (y: number, m: number, d: number) => {
    const dt = new Date(y, m - 1, d);
    if (dt < min || dt > max) return;
    // Evitar overflow (31/02 → marzo)
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return;
    onChange(toIsoDateLocal(dt));
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <select
          value={year === "" ? "" : String(year)}
          onChange={(e) => {
            const y = Number((e.target as HTMLSelectElement).value);
            commit(y, Number(month) || 1, Number(day) || 1);
          }}
          style={selectStyle as object}
        >
          <option value="" disabled>
            Año
          </option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={month === "" ? "" : String(month)}
          onChange={(e) => {
            const m = Number((e.target as HTMLSelectElement).value);
            commit(Number(year) || max.getFullYear(), m, Number(day) || 1);
          }}
          style={selectStyle as object}
        >
          <option value="" disabled>
            Mes
          </option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
        <select
          value={day === "" ? "" : String(day)}
          onChange={(e) => {
            const d = Number((e.target as HTMLSelectElement).value);
            commit(Number(year) || max.getFullYear(), Number(month) || 1, d);
          }}
          style={selectStyle as object}
        >
          <option value="" disabled>
            Día
          </option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {String(d).padStart(2, "0")}
            </option>
          ))}
        </select>
      </View>
      {value ? <Text style={styles.hint}>{formatFechaAr(value)}</Text> : null}
    </View>
  );
}

const selectStyle: Record<string, string | number> = {
  flex: 1,
  minHeight: 48,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: colors.border,
  borderRadius: radius.md,
  paddingLeft: space[8],
  paddingRight: space[8],
  backgroundColor: colors.surface,
  color: colors.white,
  fontSize: 16,
};

const styles = StyleSheet.create({
  wrap: { gap: space[8], marginTop: space[8] },
  label: typeStyle("caption", colors.textSecondary),
  row: { flexDirection: "row", gap: space[8] },
  hint: typeStyle("caption", colors.textSecondary),
});
