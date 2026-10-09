import { Image,  Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "@shared/design";
import type { JugateLaProfile } from "../../auth/AuthProvider";
import type { EquipoListItem } from "../../lib/equipos";
import {
  Calendar,
  ChevronRight,
  Crown,
  Info,
  Pencil,
  Search,
  Settings,
  Trophy,
  User,
  Users,
  iconStroke } from "../../lib/icons";
import {
  displayName,
  edadDesde,
  formatTarifa,
  formatosLabel,
  labelModoJuego,
  splitNombre,
  type FootballProfile } from "../../lib/perfil";
import { Button, Card, EmptyState, IconBtn, KvRow, Mute, NotifBell, PlayerAvatar, SectionTitle, showConfirm, TAB_BAR_CONTENT_INSET } from "../../ui";
import { typeStyle } from "../../ui/textStyle";


type Props = {
  guest: boolean;
  profile: JugateLaProfile | null;
  football: FootballProfile;
  equipos: EquipoListItem[];
  loadError: string | null;
  onRetry: () => void;
  onRequestAuth: () => void;
  onOpenSettings: () => void;
  onOpenEdit: () => void;
  onOpenTeam: (id: string) => void;
  onOpenExplore: () => void;
  onCreateTeam: () => void;
  onJoinTeam: () => void;
  onSearchPlayers: () => void;
  onSignOut: () => void;
  email: string | null;
  unreadNotifs?: number;
  onOpenNotifs?: () => void;
};

export function MiPerfilScreen({
  guest,
  profile,
  football,
  equipos,
  loadError,
  onRetry,
  onRequestAuth,
  onOpenSettings,
  onOpenEdit,
  onOpenTeam,
  onOpenExplore,
  onCreateTeam,
  onJoinTeam,
  onSearchPlayers,
  onSignOut,
  email,
  unreadNotifs = 0,
  onOpenNotifs }: Props) {
  const insets = useSafeAreaInsets();
  const split = splitNombre(profile?.nombre ?? null);
  const apellido = football.apellido || split.apellido;
  const nombreDePila = split.nombre;
  const nombre = displayName(nombreDePila || profile?.nombre || null, apellido);
  const edad = edadDesde(football.fechaNacimiento);
  const partidos = 0;
  const ganados = 0;
  const empatados = 0;
  const perdidos = 0;
  const winPct = partidos > 0 ? Math.round((ganados / partidos) * 100) : null;
  const meta = [football.puestoPrincipal, football.zona].filter(Boolean).join(" · ");

  if (guest) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.navy }]}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, space[16]) }]}>
          <Text style={styles.hTitle}>Perfil</Text>
        </View>
        <View style={styles.pad}>
          <Mute>Entrá para armar tu identidad futbolera.</Mute>
          <View style={{ marginTop: space[16], gap: space[8] }}>
            <Button label="Crear cuenta o ingresar" onPress={onRequestAuth} />
            <Button label="Buscar jugadores" variant="secondary" onPress={onSearchPlayers} />
          </View>
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.fill, styles.pad, { paddingTop: insets.top + space[24] }, { backgroundColor: colors.navy }]}>
        <EmptyState title="No pudimos cargar tu perfil" body={loadError} action={<Button label="Reintentar" onPress={onRetry} />} />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.navy }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: space[40] + TAB_BAR_CONTENT_INSET }}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, space[16]) }]}>
          <View style={styles.headRow}>
            {onOpenNotifs ? <NotifBell unread={unreadNotifs} onPress={onOpenNotifs} /> : <View style={{ width: 48 }} />}
            <Text style={styles.hTitle}>Perfil</Text>
            <IconBtn onPress={onOpenSettings} label="Configuración">
              <View style={styles.cogDisc}>
                <Settings color={colors.white} size={18} strokeWidth={2.4} />
              </View>
            </IconBtn>
          </View>
          <View style={styles.identity}>
            <PlayerAvatar
              uri={profile?.avatar_url}
              nombre={profile?.nombre}
              apellido={football.apellido}
              onCamera={onOpenEdit}
            />
            <Pressable onPress={onOpenEdit} style={styles.nameRow} accessibilityLabel="Editar perfil">
              <Text style={styles.name}>{nombre}</Text>
              <Pencil color={colors.sky} size={16} strokeWidth={iconStroke} />
            </Pressable>
            {profile?.username ? <Text style={styles.user}>@{profile.username}</Text> : null}
            {email || profile?.email ? <Text style={styles.meta}>{email || profile?.email}</Text> : null}
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            {edad != null ? <Text style={styles.meta}>{edad} años</Text> : null}
          </View>
        </View>

        <View style={styles.pad}>
          <View style={styles.activity}>
            <View style={styles.actCol}>
              <Calendar color={colors.sky} size={18} strokeWidth={iconStroke} />
              <Text style={styles.actN}>{partidos}</Text>
              <Text style={styles.actL}>Partidos</Text>
            </View>
            <View style={styles.sep} />
            <View style={styles.actCol}>
              <Trophy color={colors.gold} size={18} strokeWidth={iconStroke} />
              <Text style={styles.actN}>{ganados}</Text>
              <Text style={styles.actL}>Ganados</Text>
            </View>
            <View style={styles.sep} />
            <View style={styles.actCol}>
              <Users color={colors.sky} size={18} strokeWidth={iconStroke} />
              <Text style={styles.actN}>{equipos.length}</Text>
              <Text style={styles.actL}>Equipos</Text>
            </View>
          </View>

          <Card onPress={onSearchPlayers} style={{ marginBottom: space[16] }}>
            <View style={styles.cardHead}>
              <Search color={colors.gold} size={18} strokeWidth={iconStroke} />
              <Text style={styles.cardH}>Buscar jugadores</Text>
              <ChevronRight color={colors.textSecondary} size={18} strokeWidth={iconStroke} />
            </View>
              <Mute>Jugadores que activaron “Busco equipo”. Todavía no hay nivel ni contratación.</Mute>
          </Card>

          <Card onPress={onOpenEdit} style={{ marginBottom: space[16] }}>
            <View style={styles.cardHead}>
              <User color={colors.gold} size={18} strokeWidth={iconStroke} />
              <Text style={styles.cardH}>Mi cuenta</Text>
              <ChevronRight color={colors.textSecondary} size={18} strokeWidth={iconStroke} />
            </View>
            <KvRow label="Nombre" value={nombreDePila} />
            <KvRow label="Apellido" value={apellido} />
            <KvRow label="Username" value={profile?.username ? `@${profile.username}` : "—"} />
            <KvRow label="Email" value={email || profile?.email || ""} />
            <KvRow label="Teléfono" value={profile?.telefono ?? ""} last />
          </Card>

          <Card onPress={onOpenEdit} style={{ marginTop: space[16] }}>
            <View style={styles.cardHead}>
              <User color={colors.gold} size={18} strokeWidth={iconStroke} />
              <Text style={styles.cardH}>Mi perfil futbolero</Text>
              <ChevronRight color={colors.textSecondary} size={18} strokeWidth={iconStroke} />
            </View>
            <KvRow label="Puesto principal" value={football.puestoPrincipal} />
            <KvRow label="Puesto secundario" value={football.puestoSecundario || "Ninguno"} />
            <KvRow label="Pierna hábil" value={football.pierna} />
            <KvRow label="Formato preferido" value={formatosLabel(football.formatos)} />
            <KvRow label="Zona" value={football.zona} />
            <KvRow label="Disponibilidad" value={football.disponibilidad} />
            <KvRow label="Busco equipo" value={football.buscaEquipo ? "Sí" : "No"} />
            <KvRow label="Cómo jugás" value={labelModoJuego(football.modoJuego)} />
            <KvRow
              label="Tarifa"
              value={
                football.modoJuego === "cobro_por_partido" && football.tarifaPartido != null
                  ? formatTarifa(football.tarifaPartido)
                  : "Gratis"
              }
              last
            />
          </Card>

          <SectionTitle title="Estadísticas" />
          {partidos === 0 ? (
            <EmptyState
              title="Todavía no jugaste ningún desafío"
              body="Cuando completes partidos, acá vas a ver ganados, empatados y perdidos."
              action={<Button label="Explorar desafíos" onPress={onOpenExplore} />}
            />
          ) : (
            <>
              <View style={styles.statGrid}>
                {[
                  [partidos, "PARTIDOS"],
                  [ganados, "GANADOS"],
                  [empatados, "EMPATADOS"],
                  [perdidos, "PERDIDOS"],
                ].map(([n, l]) => (
                  <View key={String(l)} style={styles.statMini}>
                    <Text style={styles.statN}>{n}</Text>
                    <Text style={styles.statL}>{l}</Text>
                  </View>
                ))}
              </View>
              {winPct != null ? (
                <View style={styles.winRow}>
                  <View style={styles.winCircle}>
                    <Text style={styles.winN}>{winPct}%</Text>
                  </View>
                  <Text style={styles.winL}>Victorias</Text>
                  <Info color={colors.textSecondary} size={16} strokeWidth={iconStroke} />
                </View>
              ) : null}
            </>
          )}

          <SectionTitle title="Mis equipos" action={equipos.length ? "Ver todos →" : undefined} onAction={onJoinTeam} />
          {equipos.length === 0 ? (
            <EmptyState
              title="Todavía no estás en ningún equipo"
              body="Creá uno o pedile al capitán el enlace."
              action={
                <View style={{ gap: space[8] }}>
                  <Button label="Crear equipo" onPress={onCreateTeam} />
                  <Button label="Unirme a un equipo" variant="secondary" onPress={onJoinTeam} />
                </View>
              }
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamRow}>
              {equipos.map((eq) => (
                <Pressable key={eq.id} onPress={() => onOpenTeam(eq.id)} style={styles.teamCard} accessibilityRole="button">
                  {eq.escudo_url ? (
                    <Image source={{ uri: eq.escudo_url }} style={styles.crest} />
                  ) : (
                    <View style={styles.crest} />
                  )}
                  <Text style={styles.teamN} numberOfLines={1}>
                    {eq.nombre}
                  </Text>
                  <View style={styles.teamMeta}>
                    {eq.rol === "capitan" ? <Crown color={colors.gold} size={12} strokeWidth={iconStroke} /> : null}
                    <Text style={styles.teamR}>
                      {eq.rol === "capitan" ? "Capitán" : "Jugador"}
                      {eq.formato_habitual ? ` · ${eq.formato_habitual.toUpperCase()}` : ""}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <SectionTitle title="Historial reciente" />
          <EmptyState
            title="Todavía no hay partidos en el historial"
            body="Cuando juegues un desafío, va a aparecer acá."
            action={<Button label="Explorar desafíos" onPress={onOpenExplore} />}
          />
          <View style={{ marginTop: space[24] }}>
            <Button
              label="Cerrar sesión"
              variant="danger"
              onPress={() =>
                showConfirm({
                  title: "¿Cerrar sesión?",
                  body: "Vas a poder seguir explorando desafíos como invitado.",
                  cancelLabel: "Seguir conectado",
                  confirmLabel: "Cerrar sesión",
                  danger: true,
                  onConfirm: onSignOut })
              }
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navyDark },
  header: { paddingHorizontal: space[16], paddingBottom: space[20] },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hTitle: { ...typeStyle("h3", colors.white), textAlign: "center" },
  cogDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1E6BFF",
    alignItems: "center",
    justifyContent: "center" },
  identity: { alignItems: "center", marginTop: space[12], gap: space[8] },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space[8] },
  name: typeStyle("h2", colors.white),
  user: typeStyle("bodySmall", colors.sky),
  meta: typeStyle("bodySmall", colors.textSecondary),
  pad: { paddingHorizontal: space[16], paddingTop: space[16] },
  activity: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space[16],
    marginBottom: space[20] },
  actCol: { flex: 1, alignItems: "center", gap: 4 },
  actN: typeStyle("numM", colors.white),
  actL: typeStyle("caption", colors.textSecondary),
  sep: { width: 1, backgroundColor: colors.border },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space[8], marginBottom: space[8] },
  cardH: { ...typeStyle("h3", colors.white), flex: 1 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  statMini: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space[12] },
  statN: typeStyle("numL", colors.white),
  statL: typeStyle("caption", colors.textSecondary),
  winRow: { flexDirection: "row", alignItems: "center", gap: space[12], marginTop: space[16] },
  winCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center" },
  winN: typeStyle("numM", colors.gold),
  winL: typeStyle("bodySmall", colors.white),
  teamRow: { gap: space[12], paddingRight: space[16] },
  teamCard: {
    width: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space[12],
    gap: space[8] },
  crest: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceElevated },
  teamN: typeStyle("h3", colors.white),
  teamMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  teamR: typeStyle("caption", colors.textSecondary) });
