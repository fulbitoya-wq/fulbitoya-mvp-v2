import { LinearGradient } from "expo-linear-gradient";
import { colors, gradientRn, radius, space } from "@shared/design";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontFamily } from "../lib/fonts";
import { typeStyle } from "./textStyle";

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accent?: "gold" | "sky";
};

export function FilterChip({ label, selected, onPress, accent = "gold" }: Props) {
  const on = selected && accent === "sky" ? styles.txtSkyOn : selected ? styles.txtOn : undefined;
  const txt = <Text style={[styles.txt, on]}>{label}</Text>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
    >
      {selected && accent === "sky" ? (
        <View style={[styles.chip, styles.skyOn]}>{txt}</View>
      ) : selected ? (
        <LinearGradient colors={[...gradientRn.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chip}>
          {txt}
        </LinearGradient>
      ) : (
        <View style={[styles.chip, styles.off]}>{txt}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: space[16],
    paddingVertical: space[8],
    minHeight: 36,
    justifyContent: "center",
  },
  off: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
  },
  skyOn: {
    backgroundColor: colors.sky,
  },
  txt: {
    ...typeStyle("caption", colors.white),
    fontFamily: fontFamily.uiBold,
    textTransform: "uppercase",
  },
  txtOn: { color: colors.navyDark },
  txtSkyOn: { color: colors.navyDark },
});
