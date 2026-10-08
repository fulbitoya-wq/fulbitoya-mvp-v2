import { useEffect, useState } from "react";
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, PLAYER_RANKS, space } from "@shared/design";
import { mensajeErrorEquipo, rpcInvitarJugador } from "@shared/equipos";
import type { EquipoListItem } from "../../lib/equipos";
import type { SearchPlayer } from "../../lib/player-search";
import { formatArs } from "../../lib/player-ranks";
import { ChevronLeft, Heart, MoreHorizontal, Share2, Users, iconStroke } from "../../lib/icons";
import { hapticLight } from "../../lib/haptics";
import { compartirTexto } from "../../lib/share-text";
import { listMisFavoritos, toggleFavorito } from "../../lib/favoritos";
import {
  bloquearUsuario,
  desbloquearUsuario,
  estaBloqueado,
  reportarUsuario,
  type MotivoReporte,
} from "../../lib/moderacion";
import { setPendingAction } from "../../lib/pending-action";
import { supabase } from "../../lib/supabase";
import { Button, Card, IconBtn, Mute, showConfirm, showNotice } from "../../ui";
import { PlayerSeekingChip } from "../../ui/players/PlayerSeekingChip";
import { PlayerRankShield } from "../../ui/players/PlayerRankShield";
import { PlayerPositionChip } from "../../ui/players/PlayerPositionChip";
import { PlayerRankBadge } from "../../ui/players/PlayerRankBadge";
import { PlayerTeamMiniBadge } from "../../ui/players/PlayerTeamMiniBadge";
import { typeStyle } from "../../ui/textStyle";
import { fontFamily } from "../../lib/fonts";
import { InviteTeamSheet } from "./InviteTeamSheet";
import { ReportBlockSheet } from "./ReportBlockSheet";

const fondoAzul = require("../../../assets/fondo-azul.jpeg");

type Props = {
  player: SearchPlayer;
  myUserId?: string | null;
  captainTeams: EquipoListItem[];
  preferredEquipoId?: string;
  onBack: () => void;
  onCreateTeam: () => void;
  onRequestAuth?: () => void;
  onBlocked?: () => void;
};

export function PlayerPublicProfileScreen({
  player,
  myUserId,
  captainTeams,
  preferredEquipoId,
  onBack,
  onCreateTeam,
  onRequestAuth,
  onBlocked,
}: Props) {
  const insets = useSafeAreaInsets();
  const rank = PLAYER_RANKS[player.range];
  const isNew = player.range === "new";
  const isSelf = Boolean(myUserId && myUserId === player.id);
  const [picker, setPicker] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [moderation, setModeration] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [modBusy, setModBusy] = useState(false);

  useEffect(() => {
    if (!myUserId || isSelf) {
      setFavorite(false);
      setBlocked(false);
      return;
    }
    void listMisFavoritos().then((ids) => setFavorite(ids.includes(player.id)));
    void estaBloqueado(player.id).then(setBlocked);
  }, [myUserId, isSelf, player.id]);

  const onHeart = async () => {
    void hapticLight();
    if (!myUserId) {
      await setPendingAction({ kind: "favorite", jugadorId: player.id });
      onRequestAuth?.();
      return;
    }
    if (isSelf) return;
    const res = await toggleFavorito(player.id);
    if (res.ok) setFavorite(res.favorito);
  };

  const share = () => {
    const message = player.username
      ? `${player.name} (@${player.username}) en PorLaCancha`
      : `${player.name} en PorLaCancha`;
    void compartirTexto(message);
  };

  const sendInvite = async (equipoId: string) => {
    setInviting(true);
    const res = await rpcInvitarJugador(supabase, equipoId, player.username || player.id);
    setInviting(false);
    setPicker(false);
    if (!res.ok) {
      showNotice("Invitación", mensajeErrorEquipo(res.error));
      return;
    }
    showNotice("Listo", `Le mandamos la invitación a ${player.username ? `@${player.username}` : player.name}.`);
  };

  const onInvite = () => {
    if (!myUserId) {
      onRequestAuth?.();
      return;
    }
    if (isSelf) return;
    if (preferredEquipoId && captainTeams.some((t) => t.id === preferredEquipoId)) {
      void sendInvite(preferredEquipoId);
      return;
    }
    if (captainTeams.length === 0) {
      showConfirm({
        title: "Invitar a mi equipo",
        body: "Tenés que ser capitán de un equipo para invitar.",
        cancelLabel: "Cancelar",
        confirmLabel: "Crear equipo",
        onConfirm: onCreateTeam,
      });
      return;
    }
    if (captainTeams.length === 1) {
      void sendInvite(captainTeams[0].id);
      return;
    }
    setPicker(true);
  };

  const needAuth = () => {
    if (!myUserId) {
      onRequestAuth?.();
      return true;
    }
    return false;
  };

  const onOpenModeration = () => {
    if (isSelf) return;
    if (needAuth()) return;
    setModeration(true);
  };

  const onReport = (motivo: MotivoReporte, detalle: string) => {
    setModBusy(true);
    void reportarUsuario(player.id, motivo, detalle).then((res) => {
      setModBusy(false);
      if (!res.ok) {
        showNotice("Denuncia", res.error);
        return;
      }
      setModeration(false);
      showNotice("Denuncia enviada", "La revisamos. Gracias por avisar.");
    });
  };

  const onBlock = () => {
    showConfirm({
      title: "Bloquear",
      body: "No vas a ver más a esta persona en la búsqueda. Podés desbloquearla después en Configuración.",
      cancelLabel: "Cancelar",
      confirmLabel: "Bloquear",
      danger: true,
      onConfirm: () => {
        setModBusy(true);
        void bloquearUsuario(player.id).then((res) => {
          setModBusy(false);
          if (!res.ok) {
            showNotice("No se pudo bloquear", res.error);
            return;
          }
          setBlocked(true);
          setFavorite(false);
          setModeration(false);
          onBlocked?.();
        });
      },
    });
  };

  const onUnblock = () => {
    setModBusy(true);
    void desbloquearUsuario(player.id).then((res) => {
      setModBusy(false);
      if (!res.ok) {
        showNotice("No se pudo desbloquear", res.error);
        return;
      }
      setBlocked(false);
      setModeration(false);
    });
  };

  const positions = [player.primaryPosition, ...player.secondaryPositions].filter(Boolean);

  return (
    <ImageBackground source={fondoAzul} style={styles.fill} resizeMode="cover">
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, space[8]) }]}>
        <IconBtn onPress={onBack} label="Volver">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </IconBtn>
        <Text style={styles.barT}>Ficha de jugador</Text>
        {!isSelf ? (
          <View style={styles.barRight}>
            <Pressable
              onPress={() => void onHeart()}
              accessibilityRole="button"
              accessibilityLabel={favorite ? "Sacar de favoritos" : "Agregar a favoritos"}
              style={styles.heartBtn}
            >
              <Heart
                color={favorite ? colors.gold : colors.white}
                fill={favorite ? colors.gold : "none"}
                size={22}
                strokeWidth={iconStroke}
              />
            </Pressable>
            <IconBtn onPress={onOpenModeration} label="Denunciar o bloquear">
              <MoreHorizontal color={colors.white} size={22} strokeWidth={iconStroke} />
            </IconBtn>
          </View>
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: space[16], paddingBottom: insets.bottom + 140 }}>
        <View style={styles.hero}>
          <PlayerRankShield
            name={player.name}
            avatarUrl={player.avatarUrl}
            level={player.level ?? undefined}
            range={player.range}
            size="hero"
          />
          <View style={styles.heroTxt}>
            {isNew ? null : (
              <Text style={[styles.heroLv, { color: rank.accent }]} accessibilityLabel={`Nivel ${player.level}`}>
                {player.level}
              </Text>
            )}
            <View>
              <PlayerRankBadge range={player.range} compact={false} />
            </View>
            {isNew ? <Text style={styles.newHint}>Nuevo en PorLaCancha</Text> : null}
            {player.buscaEquipo ? (
              <View>
                <PlayerSeekingChip />
              </View>
            ) : null}
            <Text style={styles.playHow}>
              {player.modoJuego === "cobro_por_partido" && player.tarifaPartido != null
                ? `Juega por ${formatArs(player.tarifaPartido)}`
                : "Juega gratis"}
            </Text>
            <Text style={styles.name}>{player.name}</Text>
            {player.username ? <Text style={styles.user}>@{player.username}</Text> : null}
            {positions.length > 0 ? (
              <View style={styles.pos}>
                {positions.map((p) => (
                  <PlayerPositionChip key={p} label={p} primary={p === player.primaryPosition} />
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.infoRow}>
          <Card style={styles.infoCard}>
            <Text style={styles.infoL}>Pierna hábil</Text>
            <Text style={styles.infoV}>{player.skilledFoot}</Text>
          </Card>
          <Card style={styles.infoCard}>
            <Text style={styles.infoL}>Zona</Text>
            <Text style={styles.infoV}>{player.zone}</Text>
          </Card>
        </View>
        <Card style={{ marginTop: space[8] }}>
          <Text style={styles.infoL}>Formatos</Text>
          <Text style={styles.infoV}>{player.formatLabels.join(" · ") || "—"}</Text>
        </Card>

        <Text style={styles.sec}>Estadísticas</Text>
        <Mute>Todavía no hay estadísticas. Cuando complete 5 partidos verificados, aparece el rango.</Mute>

        <View style={styles.teamsHead}>
          <Text style={styles.secInline}>Equipos en los que juega</Text>
          <Text style={styles.teamsN}>{player.teams.length} equipos</Text>
        </View>
        {player.teams.length === 0 ? (
          <Mute>Todavía no figura en un plantel.</Mute>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teams}>
            {player.teams.map((t) => (
              <PlayerTeamMiniBadge key={t.id} name={t.name} />
            ))}
          </ScrollView>
        )}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, space[16]) }]}>
        <View style={styles.actions}>
          <Pressable
            onPress={share}
            accessibilityRole="button"
            accessibilityLabel="Compartir"
            style={styles.shareBtn}
          >
            <Share2 color={colors.white} size={20} strokeWidth={iconStroke} />
          </Pressable>
          {!isSelf ? (
            <Button
              label="Invitar a mi equipo"
              variant="primary"
              loading={inviting}
              onPress={onInvite}
              fill
              icon={<Users color={colors.navyDark} size={18} strokeWidth={iconStroke} />}
            />
          ) : null}
        </View>
      </View>

      <InviteTeamSheet visible={picker} teams={captainTeams} onClose={() => setPicker(false)} onPick={(id) => void sendInvite(id)} />
      <ReportBlockSheet
        visible={moderation}
        blocked={blocked}
        busy={modBusy}
        onClose={() => setModeration(false)}
        onReport={onReport}
        onBlock={onBlock}
        onUnblock={onUnblock}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navyDark },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[8] },
  barT: { ...typeStyle("h3", colors.white), flex: 1, textAlign: "center" },
  barRight: { flexDirection: "row", alignItems: "center" },
  heartBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  hero: { alignItems: "center", gap: space[12], marginBottom: space[20] },
  heroTxt: { width: "100%", alignItems: "center", gap: 6 },
  heroLv: {
    fontFamily: fontFamily.numBold,
    fontSize: 48,
    lineHeight: 50,
    textAlign: "center",
  },
  newHint: { ...typeStyle("caption", colors.sky), textAlign: "center" },
  playHow: { ...typeStyle("bodySmall", colors.goldLight), textAlign: "center" },
  name: { ...typeStyle("h2", colors.white), textAlign: "center" },
  user: { ...typeStyle("bodySmall", colors.sky), textAlign: "center" },
  pos: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 4 },
  infoRow: { flexDirection: "row", gap: space[8] },
  infoCard: { flex: 1 },
  infoL: typeStyle("caption", colors.textSecondary),
  infoV: typeStyle("bodySmall", colors.white),
  sec: { ...typeStyle("h3", colors.white), marginTop: space[24], marginBottom: space[12] },
  secInline: typeStyle("h3", colors.white),
  teamsHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: space[24],
    marginBottom: space[12],
  },
  teamsN: typeStyle("bodySmall", colors.sky),
  teams: { gap: space[12], paddingRight: space[16] },
  bottom: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "rgba(0,27,68,0.72)",
    paddingHorizontal: space[16],
    paddingTop: space[12],
    gap: space[8],
  },
  actions: { flexDirection: "row", alignItems: "center", gap: space[8] },
  shareBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
