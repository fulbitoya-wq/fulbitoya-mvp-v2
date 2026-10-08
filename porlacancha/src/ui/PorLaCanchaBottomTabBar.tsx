import { LinearGradient } from "expo-linear-gradient";
import { colors as palette } from "@shared/design";
import { fontFamily } from "../lib/fonts";
import { Home, Plus, Shield, Trophy, UserRound } from "../lib/icons";
import { hapticLight, hapticMedium } from "../lib/haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type BottomTabId = "explore" | "matches" | "teams" | "profile";

type Props = {
  activeTab: BottomTabId;
  onTabPress: (tab: BottomTabId) => void;
  onPlusPress: () => void;
  matchesBadge?: number;
  teamsBadge?: number;
};

export const BOTTOM_NAV_HEIGHT = 88;
export const TAB_BAR_CONTENT_INSET = BOTTOM_NAV_HEIGHT + 56;

const TABS: { id: BottomTabId; label: string; a11y: string; Icon: typeof Home }[] = [
  { id: "explore", label: "Inicio", a11y: "Inicio", Icon: Home },
  { id: "matches", label: "Partidos", a11y: "Partidos", Icon: Trophy },
  { id: "teams", label: "Equipos", a11y: "Equipos", Icon: Shield },
  { id: "profile", label: "Perfil", a11y: "Perfil", Icon: UserRound },
];

function TabItem({
  label,
  a11y,
  Icon,
  selected,
  badge,
  onPress,
}: {
  label: string;
  a11y: string;
  Icon: typeof Home;
  selected: boolean;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected }}
      onPress={() => {
        void hapticLight();
        onPress();
      }}
      style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
    >
      <View style={[styles.tabInner, selected && styles.tabOn]}>
        <View style={selected ? styles.iconGlow : undefined}>
          <Icon
            color={selected ? palette.sky : palette.textSecondary}
            size={26}
            strokeWidth={2}
          />
          {badge && badge > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeT}>{badge > 9 ? "9+" : String(badge)}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.label, selected && styles.labelOn]} numberOfLines={1}>
          {label}
        </Text>
        {selected ? <View style={styles.indicator} /> : <View style={styles.indicatorOff} />}
      </View>
    </Pressable>
  );
}

export function PorLaCanchaBottomTabBar({
  activeTab,
  onTabPress,
  onPlusPress,
  matchesBadge,
  teamsBadge,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.footer,
        {
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      <View style={styles.row}>
        <TabItem
          {...TABS[0]}
          selected={activeTab === "explore"}
          onPress={() => onTabPress("explore")}
        />
        <TabItem
          {...TABS[1]}
          selected={activeTab === "matches"}
          badge={matchesBadge}
          onPress={() => onTabPress("matches")}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir acciones rápidas"
          onPress={() => {
            void hapticMedium();
            onPlusPress();
          }}
          style={({ pressed }) => [styles.plusSlot, pressed && styles.plusPressed]}
        >
          <LinearGradient
            colors={["#F3D477", "#D9A928", "#A97812"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.plus}
          >
            <Plus color={palette.navyDark} size={32} strokeWidth={3} />
          </LinearGradient>
        </Pressable>
        <TabItem
          {...TABS[2]}
          selected={activeTab === "teams"}
          badge={teamsBadge}
          onPress={() => onTabPress("teams")}
        />
        <TabItem
          {...TABS[3]}
          selected={activeTab === "profile"}
          onPress={() => onTabPress("profile")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    width: "100%",
    backgroundColor: palette.navyDark,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 16,
    overflow: "visible",
  },
  row: {
    height: BOTTOM_NAV_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
  },
  slot: {
    flex: 1,
    minHeight: 64,
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  tabInner: {
    width: 72,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tabOn: {
    backgroundColor: "rgba(13,74,140,0.50)",
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.12)",
  },
  label: {
    fontFamily: fontFamily.uiMedium,
    fontSize: 12,
    lineHeight: 14,
    color: palette.textSecondary,
    textAlign: "center",
  },
  labelOn: {
    fontFamily: fontFamily.uiSemibold,
    fontSize: 12.5,
    color: palette.white,
  },
  indicator: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.sky,
  },
  indicatorOff: {
    width: 24,
    height: 3,
  },
  iconGlow: {
    shadowColor: "#8BC9EB",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  plusSlot: {
    width: 72,
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: -20,
    zIndex: 2,
    elevation: 16,
  },
  plus: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(243,212,119,0.90)",
    shadowColor: "#D9A928",
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 16,
  },
  plusPressed: { transform: [{ scale: 0.95 }], opacity: 0.92 },
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.85 },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: palette.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeT: {
    color: palette.navyDark,
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 11,
  },
});
