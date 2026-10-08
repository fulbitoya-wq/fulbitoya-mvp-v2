import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, radius, space } from "@shared/design";
import { formatFechaAr, parseIsoDateLocal, toIsoDateLocal } from "../lib/fecha-ui";
import { typeStyle } from "./textStyle";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  placeholder?: string;
  label?: string;
};

export function DateField({
  value,
  onChange,
  minimumDate,
  maximumDate,
  placeholder = "Elegí la fecha",
  label,
}: Props) {
  const [open, setOpen] = useState(false);
  const current = parseIsoDateLocal(value) ?? minimumDate ?? new Date();

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable onPress={() => setOpen(true)} style={styles.btn} accessibilityRole="button">
        <Text style={value ? styles.value : styles.placeholder}>
          {value ? formatFechaAr(value) : placeholder}
        </Text>
      </Pressable>
      {open && Platform.OS === "android" ? (
        <DateTimePicker
          value={current}
          mode="date"
          display="calendar"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
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
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onChange={(_, date) => {
                if (date) onChange(toIsoDateLocal(date));
              }}
              style={{ alignSelf: "stretch" }}
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
