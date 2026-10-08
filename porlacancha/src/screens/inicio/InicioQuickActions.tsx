import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import { CalendarDays, ChevronRight, UsersRound, iconStroke } from "../../lib/icons";
import { typeStyle } from "../../ui/textStyle";

type Props = {
  onReservar: () => void;
  onArmar: () => void;
};

function QuickCard({
  title,
  body,
  Icon,
  onPress,
}: {
  title: string;
  body: string;
  Icon: typeof CalendarDays;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={styles.card}>
      <View style={styles.iconWrap}>
        <Icon color={colors.sky} size={22} strokeWidth={iconStroke} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body} numberOfLines={2}>
        {body}
      </Text>
      <ChevronRight color={colors.sky} size={18} strokeWidth={iconStroke} style={styles.chev} />
    </Pressable>
  );
}

export function InicioQuickActions({ onReservar, onArmar }: Props) {
  return (
    <View style={styles.row}>
      <QuickCard
        title="Reservar cancha"
        body="Buscá un predio y reservá tu turno"
        Icon={CalendarDays}
        onPress={onReservar}
      />
      <QuickCard
        title="Armar partido"
        body="Publicá un partido y encontrá jugadores"
        Icon={UsersRound}
        onPress={onArmar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  card: {
    flex: 1,
    minHeight: 102,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
    borderRadius: 22,
    padding: space[12],
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.navyDark,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[8],
  },
  title: typeStyle("h3", colors.white),
  body: { ...typeStyle("caption", colors.textSecondary), marginTop: 4, paddingRight: 16 },
  chev: { position: "absolute", right: 10, top: 14 },
});
