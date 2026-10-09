import { Image,  Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "@shared/design";
import type { EquipoListItem } from "../../lib/equipos";
import { Calendar, ChevronLeft, Crown, MoreHorizontal, iconStroke } from "../../lib/icons";
import { displayName, formatosLabel, miembroDesde, type FootballProfile } from "../../lib/perfil";
import { Card, IconBtn, KvRow, Mute, PlayerAvatar, SectionTitle } from "../../ui";
import { typeStyle } from "../../ui/textStyle";


type PublicUser = {
  nombre: string | null;
  username: string | null;
  avatar_url: string | null;
  created_at: string | null;
};

type Props = {
  user: PublicUser;
  football: FootballProfile;
  equipos: EquipoListItem[];
  onBack: () => void;
  onOpenTeam?: (id: string) => void;
};

export function PerfilPublicoScreen({ user, football, equipos, onBack, onOpenTeam }: Props) {
  const insets = useSafeAreaInsets();
  const nombre = displayName(user.nombre, football.apellido);
  const meta = [football.puestoPrincipal, football.zona].filter(Boolean).join(" · ");
  const desde = miembroDesde(user.created_at);

  return (
    <View style={[styles.fill, { backgroundColor: colors.navy }]}>
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, space[8]) }]}>
        <IconBtn onPress={onBack} label="Volver">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </IconBtn>
        <Text style={styles.title}>Perfil de jugador</Text>
        <IconBtn onPress={() => undefined} label="Más opciones">
          <MoreHorizontal color={colors.textSecondary} size={22} strokeWidth={iconStroke} />
        </IconBtn>
      </View>
      <ScrollView contentContainerStyle={{ padding: space[16], paddingBottom: insets.bottom + space[32] }}>
        <View style={styles.id}>
          <PlayerAvatar uri={user.avatar_url} nombre={user.nombre} apellido={football.apellido} />
          <Text style={styles.name}>{nombre}</Text>
          {user.username ? <Text style={styles.user}>@{user.username}</Text> : null}
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          {desde ? (
            <View style={styles.since}>
              <Calendar color={colors.sky} size={14} strokeWidth={iconStroke} />
              <Text style={styles.meta}>{desde}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.activity}>
          <View style={styles.actCol}>
            <Text style={styles.actN}>0</Text>
            <Text style={styles.actL}>Partidos</Text>
          </View>
          <View style={styles.sep} />
          <View style={styles.actCol}>
            <Text style={styles.actN}>0</Text>
            <Text style={styles.actL}>Ganados</Text>
          </View>
          <View style={styles.sep} />
          <View style={styles.actCol}>
            <Text style={styles.actN}>{equipos.length}</Text>
            <Text style={styles.actL}>Equipos</Text>
          </View>
        </View>

        {football.bio ? (
          <Card style={{ marginBottom: space[16] }}>
            <Text style={styles.h}>Sobre mí</Text>
            <Mute>{football.bio}</Mute>
          </Card>
        ) : null}

        <Card>
          <Text style={styles.h}>Perfil futbolero</Text>
          <KvRow label="Puesto principal" value={football.puestoPrincipal} />
          <KvRow label="Puesto secundario" value={football.puestoSecundario || "Ninguno"} />
          <KvRow label="Pierna hábil" value={football.pierna} />
          <KvRow label="Formato preferido" value={formatosLabel(football.formatos)} />
          <KvRow label="Zona" value={football.zona} />
          <KvRow label="Disponibilidad" value={football.disponibilidad} last />
        </Card>

        <SectionTitle title="Equipos" action={`${equipos.length} equipos`} />
        {equipos.map((eq) => (
          <Pressable
            key={eq.id}
            onPress={() => onOpenTeam?.(eq.id)}
            style={styles.eq}
            accessibilityRole="button"
          >
            {eq.escudo_url ? <Image source={{ uri: eq.escudo_url }} style={styles.crest} /> : <View style={styles.crest} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.eqN}>{eq.nombre}</Text>
              <View style={styles.eqM}>
                {eq.rol === "capitan" ? <Crown color={colors.gold} size={12} strokeWidth={iconStroke} /> : null}
                <Text style={styles.meta}>
                  {eq.rol === "capitan" ? "Capitán" : "Jugador"}
                  {eq.formato_habitual ? ` · ${eq.formato_habitual.toUpperCase()}` : ""}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
        {equipos.length === 0 ? <Mute>Todavía no está en ningún equipo.</Mute> : null}

        <Text style={[styles.h, { marginTop: space[24] }]}>Reputación</Text>
        <Mute>Cuando juegue desafíos, acá van a figurar partidos completados y ausencias. Sin estrellas subjetivas.</Mute>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navyDark },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[8] },
  title: { ...typeStyle("h3", colors.white), flex: 1, textAlign: "center" },
  id: { alignItems: "center", gap: space[8], marginBottom: space[20] },
  name: typeStyle("h2", colors.white),
  user: typeStyle("bodySmall", colors.sky),
  meta: typeStyle("bodySmall", colors.textSecondary),
  since: { flexDirection: "row", alignItems: "center", gap: 6 },
  h: { ...typeStyle("h3", colors.white), marginBottom: space[8] },
  activity: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space[16],
    marginBottom: space[16] },
  actCol: { flex: 1, alignItems: "center" },
  actN: typeStyle("numM", colors.white),
  actL: typeStyle("caption", colors.textSecondary),
  sep: { width: 1, backgroundColor: colors.border },
  eq: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space[12],
    marginBottom: space[8],
    minHeight: 48 },
  crest: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceElevated },
  eqN: typeStyle("h3", colors.white),
  eqM: { flexDirection: "row", alignItems: "center", gap: 4 } });
