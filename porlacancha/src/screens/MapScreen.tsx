import { useMemo } from "react";
import { colors, radius, space } from "@shared/design";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { formatPremioCorto, type Desafio } from "../lib/desafios";
import { X, iconStroke } from "../lib/icons";
import { DesafioCard, TAB_BAR_CONTENT_INSET } from "../ui";
import { CanchaMap } from "../ui/maps/CanchaMap";

const BA = {
  latitude: -34.6037,
  longitude: -58.3816,
  latitudeDelta: 0.18,
  longitudeDelta: 0.18,
};

type MapScreenProps = {
  items: Desafio[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClear?: () => void;
  onOpenDesafio?: (d: Desafio) => void;
};

export function MapScreen({
  items,
  loading,
  error,
  selectedId,
  onSelect,
  onClear,
  onOpenDesafio,
}: MapScreenProps) {
  const selected = useMemo(
    () => items.find((d) => d.id === selectedId) ?? null,
    [items, selectedId]
  );

  return (
    <View style={styles.root}>
      <CanchaMap
        style={StyleSheet.absoluteFill}
        region={BA}
        onSelectPin={onSelect}
        pins={items.flatMap((d) => {
          const lat = Number(d.lat);
          const lng = Number(d.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
          const active = d.id === selectedId;
          const premio = formatPremioCorto(Number(d.premio));
          return [
            {
              id: d.id,
              latitude: lat,
              longitude: lng,
              title: premio,
              description: d.titulo,
              label: Platform.OS === "ios" ? undefined : premio,
              active,
            },
          ];
        })}
      />

      <View style={styles.sheet}>
        {loading ? (
          <ActivityIndicator color={colors.gold} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !selected ? (
          <Text style={styles.muted}>Tocá un pin para ver el desafío.</Text>
        ) : (
          <View>
            {onClear ? (
              <Pressable onPress={onClear} style={styles.close} accessibilityRole="button" accessibilityLabel="Cerrar">
                <X color={colors.textSecondary} size={18} strokeWidth={iconStroke} />
              </Pressable>
            ) : null}
            <DesafioCard
              compact
              desafio={selected}
              onPress={() => (onOpenDesafio ? onOpenDesafio(selected) : onSelect(selected.id))}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  sheet: {
    position: "absolute",
    left: space[16],
    right: space[16],
    bottom: TAB_BAR_CONTENT_INSET,
  },
  close: {
    position: "absolute",
    right: space[8],
    top: space[8],
    zIndex: 4,
    minWidth: 48,
    minHeight: 48,
    alignItems: "flex-end",
  },
  muted: {
    fontSize: 14,
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
  },
  error: { fontSize: 13, color: colors.danger },
});
