import { useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
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
  const [open, setOpen] = useState(false);
  const current = parseIsoDateLocal(value) ?? max;

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable onPress={() => setOpen(true)} style={styles.btn} accessibilityRole="button">
        <Text style={value ? styles.value : styles.placeholder}>
          {value ? formatFechaAr(value) : "Elegí día, mes y año"}
        </Text>
      </Pressable>
      {open && Platform.OS === "android" ? (
        <DateTimePicker
          value={current}
          mode="date"
          display="spinner"
          minimumDate={min}
          maximumDate={max}
          onChange={(_, date) => {
            setOpen(false);
            if (date) onChange(toIsoDateLocal(date));
          }}
        />
      ) : null}
      {Platform.OS === "ios" ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetBar}>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={styles.link}>Listo</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={current}
              mode="date"
              display="spinner"
              themeVariant="dark"
              minimumDate={min}
              maximumDate={max}
              onChange={(_, date) => {
                if (date) onChange(toIsoDateLocal(date));
              }}
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[8], marginTop: space[8] },
  label: typeStyle("caption", colors.textSecondary),
  btn: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space[12],
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  value: typeStyle("body", colors.white),
  placeholder: typeStyle("body", colors.textSecondary),
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: colors.navy,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: space[24],
  },
  sheetBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: space[16],
    paddingVertical: space[12],
  },
  link: typeStyle("body", colors.gold),
});
