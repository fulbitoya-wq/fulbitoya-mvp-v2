import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import {
  type Desafio,
} from "../lib/desafios";
import { Building2, MapPin, Trophy, Users, iconStroke } from "../lib/icons";
import { BrandLogo, Button, Card, Chip, DesafioCard, EmptyState, Heading, Kicker, Lead, Mute, Screen, showNotice } from "../ui";
import { typeStyle } from "../ui/textStyle";

type HomeScreenProps = {
  items: Desafio[];
  loading: boolean;
  error: string | null;
  guest?: boolean;
  onOpenMap: (id?: string) => void;
  onOpenDesafio: (d: Desafio) => void;
  onRequestAuth: () => void;
};

export function HomeScreen({
  items,
  loading,
  error,
  guest,
  onOpenMap,
  onOpenDesafio,
  onRequestAuth,
}: HomeScreenProps) {
  const publish = () => {
    if (guest) {
      onRequestAuth();
      return;
    }
    showNotice(
      "Publicar desafío",
      "Pronto vas a poder crear un partido por plata desde acá. Hoy el predio ya puede publicarlo desde su panel."
    );
  };

  return (
    <Screen scroll>
      <BrandLogo size="sm" />
      <Kicker>Desafíos</Kicker>
      <Heading>Encontrá un partido por plata</Heading>
      <Lead>
        El premio lo pone quien arma el desafío: el predio, o un grupo de jugadores. Vos ves el monto
        en el mapa y te sumás.
      </Lead>

      {guest ? (
        <View style={styles.guestCta}>
          <Button label="Crear cuenta o ingresar" onPress={onRequestAuth} />
          <Mute>Podés mirar desafíos y el mapa sin cuenta. Para unirte o armar equipo, entrá.</Mute>
        </View>
      ) : null}

      <View style={styles.split}>
        <Card style={styles.originCard}>
          <Building2 color={colors.gold} size={22} strokeWidth={iconStroke} />
          <Chip label="Predio" tone="complete" />
          <Text style={styles.originTitle}>El dueño publica</Text>
          <Mute>El predio crea el desafío, elige cancha y pone cuánta plata hay en juego.</Mute>
        </Card>
        <Card style={styles.originCard}>
          <Users color={colors.gold} size={22} strokeWidth={iconStroke} />
          <Chip label="Jugadores" tone="gold" />
          <Text style={styles.originTitle}>Ustedes lo arman</Text>
          <Mute>Un usuario crea el partido, fija el premio y lo tira al mapa.</Mute>
        </Card>
      </View>

      <Text style={styles.h2}>Cómo funciona</Text>
      {(
        [
          [MapPin, "Mirá el mapa", "Cada pin es un partido. El número es el premio."],
          [Users, "Elegí origen", "Predio o jugadores: mismo juego, distinta cancha de salida."],
          [Trophy, "Jugate", "Te anotás, juegan, y el premio queda para el que gana."],
        ] as const
      ).map(([Icon, t, d]) => (
        <View key={t} style={styles.step}>
          <View style={styles.stepN}>
            <Icon color={colors.navy} size={16} strokeWidth={iconStroke} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepT}>{t}</Text>
            <Mute>{d}</Mute>
          </View>
        </View>
      ))}

      <View style={styles.rowHead}>
        <Text style={styles.h2}>Abiertos ahora</Text>
        <Pressable onPress={() => onOpenMap()}>
          <Text style={typeStyle("bodySmall", colors.gold)}>Ver mapa</Text>
        </Pressable>
      </View>

      {loading ? (
        <Mute>Cargando desafíos…</Mute>
      ) : error ? (
        <Text style={typeStyle("bodySmall", colors.danger)}>{error}</Text>
      ) : items.length === 0 ? (
        <EmptyState
          title="Todavía no hay partidos en el mapa"
          body="Cuando un predio o un jugador publique un desafío con premio, aparece acá y como pin."
        />
      ) : (
        items.slice(0, 5).map((d) => (
          <DesafioCard key={d.id} desafio={d} onPress={() => onOpenDesafio(d)} />
        ))
      )}

      <View style={{ marginTop: space[20] }}>
        <Button label="Quiero publicar un desafío" variant="secondary" onPress={publish} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  guestCta: { gap: space[12], marginBottom: space[16] },
  split: { flexDirection: "row", gap: space[12], marginTop: space[4] },
  originCard: { flex: 1, gap: space[8], borderRadius: radius.lg },
  originTitle: { ...typeStyle("h3", colors.white), fontSize: 15 },
  h2: { ...typeStyle("h3", colors.white), marginTop: space[32], marginBottom: space[12] },
  step: { flexDirection: "row", gap: space[12], marginBottom: space[12], alignItems: "flex-start" },
  stepN: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  stepT: typeStyle("h3", colors.white),
  rowHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  match: { marginBottom: space[12], gap: space[8], borderRadius: radius.lg },
  matchTop: { flexDirection: "row", justifyContent: "space-between", gap: space[12] },
  matchTitle: { flex: 1, ...typeStyle("h3", colors.white) },
  prize: typeStyle("numM", colors.gold),
  meta: { ...typeStyle("caption", colors.textSecondary), marginTop: space[4] },
  addrRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  addr: { flex: 1, ...typeStyle("bodySmall", colors.sky) },
});
