import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import { formatHora24, hourSlots } from "../lib/fecha-ui";
import { typeStyle } from "./textStyle";

type Props = {
  value: string;
  onChange: (hhmm: string) => void;
  placeholder?: string;
  label?: string;
};

const SLOTS = hourSlots();

export function TimeField({ value, onChange, placeholder = "Elegí la hora", label }: Props) {
  const [open, setOpen] = useState(false);
  const shown = value ? formatHora24(value) : "";

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable onPress={() => setOpen(true)} style={styles.btn} accessibilityRole="button">
        <Text style={shown ? styles.value : styles.placeholder}>{shown || placeholder}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Hora</Text>
          <FlatList
            data={SLOTS}
            keyExtractor={(item) => item}
            style={{ maxHeight: 320 }}
            renderItem={({ item }) => {
              const on = item === shown;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                  style={[styles.row, on && styles.rowOn]}
                >
                  <Text style={styles.value}>{item}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
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
    paddingHorizontal: space[8],
  },
  sheetTitle: { ...typeStyle("h3", colors.white), padding: space[16] },
  row: {
    minHeight: 48,
    paddingHorizontal: space[16],
    justifyContent: "center",
    borderRadius: radius.md,
  },
  rowOn: { backgroundColor: colors.surface },
});
