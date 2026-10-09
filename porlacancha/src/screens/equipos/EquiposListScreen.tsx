import { Image, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import type { EquipoListItem } from "../../lib/equipos";
import { Button, Card, EmptyState, Heading, Kicker, Lead, Mute, Screen } from "../../ui";
import { typeStyle } from "../../ui/textStyle";


type Props = {
  items: EquipoListItem[];
  loading: boolean;
  inboxCount: number;
  onCreate: () => void;
  onInbox: () => void;
  onOpen: (id: string) => void;
};

export function EquiposListScreen({ items, loading, inboxCount, onCreate, onInbox, onOpen }: Props) {
  return (
    <Screen scroll tabBar>
      <Kicker>Equipos</Kicker>
      <Heading>Mis equipos</Heading>
      <Lead>
        El capitán inscribe al equipo en los desafíos. Pedí entrar con un enlace o esperá una
        invitación.
      </Lead>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button label="Crear equipo" onPress={onCreate} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            variant="secondary"
            label={`Invitaciones${inboxCount > 0 ? ` (${inboxCount})` : ""}`}
            onPress={onInbox}
          />
        </View>
      </View>

      {loading ? (
        <Mute>Cargando…</Mute>
      ) : items.length === 0 ? (
        <EmptyState
          title="Todavía no estás en ningún equipo"
          body="Creá uno o pedile al capitán el enlace de invitación."
        />
      ) : (
        items.map((eq) => (
          <Card key={eq.id} onPress={() => onOpen(eq.id)} style={styles.card}>
            {eq.escudo_url ? (
              <Image source={{ uri: eq.escudo_url }} style={styles.crest} />
            ) : (
              <View style={[styles.crest, styles.crestFallback]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{eq.nombre}</Text>
              <Mute>
                {eq.rol === "capitan" ? "Capitán" : "Jugador"}
                {eq.formato_habitual ? ` · ${eq.formato_habitual.toUpperCase()}` : ""}
              </Mute>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space[12], marginBottom: space[16] },
  card: { flexDirection: "row", alignItems: "center", gap: space[12], marginBottom: space[12] },
  cardTitle: typeStyle("h3", colors.white),
  crest: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  crestFallback: { backgroundColor: colors.surfaceHover },
});
