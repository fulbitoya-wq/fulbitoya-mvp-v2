import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList, 
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "@shared/design";
import { fontFamily } from "../../lib/fonts";
import { useAuth } from "../../auth/AuthProvider";
import { hapticLight } from "../../lib/haptics";
import { listMisFavoritos, toggleFavorito } from "../../lib/favoritos";
import { setPendingAction } from "../../lib/pending-action";
import { ChevronLeft, Search, SlidersHorizontal, iconStroke } from "../../lib/icons";
import {
  listJugadoresBusqueda,
  playerMatchesFilter,
  playerMatchesQuery,
  type PositionFilter,
  type SearchPlayer } from "../../lib/player-search";
import { Button, EmptyState, IconBtn, Mute } from "../../ui";
import { PlayerCompactCard } from "../../ui/players/PlayerCompactCard";
import { PlayerCompactCardSkeleton } from "../../ui/players/PlayerCompactCardSkeleton";
import { PlayerRankLegend } from "../../ui/players/PlayerRankLegend";
import { typeStyle } from "../../ui/textStyle";


const FILTERS: { id: PositionFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "ARQ", label: "Arqueros" },
  { id: "DEF", label: "Defensores" },
  { id: "MED", label: "Mediocampistas" },
  { id: "DEL", label: "Delanteros" },
];

type Props = {
  onBack: () => void;
  onOpenPlayer: (player: SearchPlayer) => void;
  onRequestAuth?: () => void;
};

export function PlayersSearchScreen({ onBack, onOpenPlayer, onRequestAuth }: Props) {
  const insets = useSafeAreaInsets();
  const { session, loading: authLoading } = useAuth();
  const myId = session?.user?.id ?? null;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PositionFilter>("all");
  const [onlyFav, setOnlyFav] = useState(false);
  const [legend, setLegend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<SearchPlayer[]>([]);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listJugadoresBusqueda();
    if (!res.ok) {
      setError(res.error);
      setPlayers([]);
    } else {
      setPlayers(res.players);
    }
    if (myId) {
      const ids = await listMisFavoritos();
      setFavIds(new Set(ids));
    } else {
      setFavIds(new Set());
    }
    setLoading(false);
  }, [myId]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  const items = useMemo(() => {
    return players.filter((p) => {
      if (onlyFav && !favIds.has(p.id)) return false;
      return playerMatchesQuery(p, query) && playerMatchesFilter(p, filter);
    });
  }, [players, query, filter, onlyFav, favIds]);

  const onHeart = async (jugadorId: string) => {
    void hapticLight();
    if (!myId) {
      await setPendingAction({ kind: "favorite", jugadorId });
      onRequestAuth?.();
      return;
    }
    if (jugadorId === myId) return;
    const res = await toggleFavorito(jugadorId);
    if (!res.ok) return;
    setFavIds((prev) => {
      const next = new Set(prev);
      if (res.favorito) next.add(jugadorId);
      else next.delete(jugadorId);
      return next;
    });
  };

  const clear = () => {
    setQuery("");
    setFilter("all");
    setOnlyFav(false);
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.navy }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, space[8]) }]}>
        <View style={styles.headRow}>
          <IconBtn onPress={onBack} label="Volver">
            <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
          </IconBtn>
          <Text style={styles.title}>Buscar jugadores</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={styles.searchRow}>
          <View style={styles.inputWrap}>
            <Search color={colors.textSecondary} size={18} strokeWidth={iconStroke} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Nombre, username o posición..."
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Pressable
            onPress={() => setLegend(true)}
            accessibilityRole="button"
            accessibilityLabel="Filtros y rangos"
            style={styles.filterBtn}
          >
            <SlidersHorizontal color={colors.gold} size={20} strokeWidth={iconStroke} />
          </Pressable>
        </View>
      </View>

      <View style={styles.filtersPad}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.fchip, on && styles.fchipOn]}
              >
                <Text style={[styles.fTxt, on && styles.fTxtOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setOnlyFav((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ selected: onlyFav }}
            style={[styles.fchip, onlyFav && styles.fchipOn]}
          >
            <Text style={[styles.fTxt, onlyFav && styles.fTxtOn]}>Favoritos</Text>
          </Pressable>
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.listPad}>
          <PlayerCompactCardSkeleton />
          <PlayerCompactCardSkeleton />
          <PlayerCompactCardSkeleton />
        </View>
      ) : error ? (
        <View style={styles.listPad}>
          <EmptyState
            title="No pudimos cargar jugadores"
            body="Probá de nuevo en un rato."
            action={<Button label="Reintentar" onPress={() => void load()} />}
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[styles.listPad, { paddingBottom: insets.bottom + space[24] }]}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <EmptyState
              title={players.length === 0 ? "Nadie está buscando equipo" : "No encontramos jugadores"}
              body={
                players.length === 0
                  ? "Cuando un jugador active “Busco equipo” en su perfil, aparece acá."
                  : "Probá cambiando la búsqueda o los filtros."
              }
              action={players.length === 0 ? undefined : <Button label="Limpiar filtros" onPress={clear} />}
            />
          }
          ListHeaderComponent={
            players.length > 0 ? (
              <Mute>Todos figuran como nuevos hasta que haya resultados de partidos.</Mute>
            ) : null
          }
          renderItem={({ item }) => (
            <PlayerCompactCard
              id={item.id}
              name={item.name}
              username={item.username}
              avatarUrl={item.avatarUrl}
              level={item.level}
              range={item.range}
              primaryPosition={item.primaryPosition}
              secondaryPositions={item.secondaryPositions}
              zone={item.zone}
              formats={item.formatLabels}
              buscaEquipo={item.buscaEquipo}
              modoJuego={item.modoJuego}
              pricePerMatch={item.tarifaPartido}
              favorite={favIds.has(item.id)}
              showFavorite={item.id !== myId}
              onPress={() => onOpenPlayer(item)}
              onFavoritePress={() => void onHeart(item.id)}
            />
          )}
        />
      )}

      <Modal visible={legend} animationType="slide" transparent onRequestClose={() => setLegend(false)}>
        <Pressable style={styles.sheetBg} onPress={() => setLegend(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space[24] }]} onPress={() => undefined}>
            <PlayerRankLegend />
            <View style={{ marginTop: space[20] }}>
              <Button label="Cerrar" onPress={() => setLegend(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navyDark },
  header: {
    paddingHorizontal: space[8],
    paddingBottom: space[12],
    minHeight: 88 },
  headRow: { flexDirection: "row", alignItems: "center" },
  title: { ...typeStyle("h3", colors.white), flex: 1, textAlign: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space[8], paddingHorizontal: space[8], marginTop: space[8] },
  inputWrap: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[12],
    gap: space[8] },
  input: {
    flex: 1,
    color: colors.white,
    fontFamily: fontFamily.ui,
    fontSize: 14 },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center" },
  filtersPad: { paddingVertical: space[12] },
  filters: { paddingHorizontal: space[16], gap: space[8], alignItems: "center" },
  fchip: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: space[16],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface },
  fchipOn: { backgroundColor: colors.sky, borderColor: colors.sky },
  fTxt: {
    fontFamily: fontFamily.uiBold,
    fontSize: 13,
    color: colors.white },
  fTxtOn: { color: colors.navyDark },
  listPad: { paddingHorizontal: space[16], gap: 12, flexGrow: 1 },
  sheetBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.navyDark,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: space[24] } });
