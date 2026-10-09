import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "@shared/design";
import {
  listJugadoresBusqueda,
  playerMatchesFilter,
  type PositionFilter,
  type SearchPlayer,
} from "../lib/player-search";
import { Button } from "./Button";
import { Mute } from "./Copy";
import { typeStyle } from "./textStyle";

type Tab = "invitado" | "jugadores";

type Props = {
  visible: boolean;
  posLabel: string;
  /** Zona del partido para sugerir jugadores cercanos. */
  zonaHint?: string | null;
  excludeUserIds: string[];
  busy?: boolean;
  onClose: () => void;
  onAddGuest: (nombre: string) => void | Promise<void>;
  onAddPlayer: (player: SearchPlayer) => void | Promise<void>;
};

function posToFilter(pos: string): PositionFilter {
  const p = pos.toUpperCase();
  if (p === "ARQ") return "ARQ";
  if (p.startsWith("DEF") || p === "CEN") return "DEF";
  if (p.startsWith("MED") || p === "VOL") return "MED";
  if (p.startsWith("DEL") || p === "EXT" || p === "SEG") return "DEL";
  return "all";
}

function zoneScore(playerZone: string, hint: string): number {
  const a = playerZone.trim().toLowerCase();
  const b = hint.trim().toLowerCase();
  if (!a || !b || a === "zona no cargada") return 0;
  if (a === b) return 3;
  if (a.includes(b) || b.includes(a)) return 2;
  const tokens = b.split(/[\s,·]+/).filter((t) => t.length > 3);
  if (tokens.some((t) => a.includes(t))) return 1;
  return 0;
}

export function SumarJugadorModal({
  visible,
  posLabel,
  zonaHint,
  excludeUserIds,
  busy = false,
  onClose,
  onAddGuest,
  onAddPlayer,
}: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("invitado");
  const [nombre, setNombre] = useState("");
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState<SearchPlayer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const filter = posToFilter(posLabel);

  useEffect(() => {
    if (!visible) {
      setNombre("");
      setTab("invitado");
      setError(null);
      return;
    }
    if (tab !== "jugadores") return;
    let live = true;
    setLoading(true);
    void listJugadoresBusqueda().then((res) => {
      if (!live) return;
      if (!res.ok) {
        setError(res.error);
        setPlayers([]);
      } else {
        setError(null);
        setPlayers(res.players);
      }
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [visible, tab]);

  const sugeridos = useMemo(() => {
    const exclude = new Set(excludeUserIds);
    const hint = zonaHint ?? "";
    return players
      .filter((p) => !exclude.has(p.id))
      .filter((p) => playerMatchesFilter(p, filter) || filter === "all")
      .map((p) => ({ p, score: zoneScore(p.zone, hint) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.p.name.localeCompare(b.p.name, "es");
      })
      .slice(0, 40)
      .map((x) => x.p);
  }, [players, excludeUserIds, filter, zonaHint]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space[16] }]}>
        <Text style={styles.title}>Sumar a {posLabel}</Text>
        <Mute>Invitado sin cuenta, o un jugador de PorLaCancha cerca de la zona.</Mute>

        <View style={styles.tabs}>
          <Pressable
            onPress={() => setTab("invitado")}
            style={[styles.tab, tab === "invitado" && styles.tabOn]}
          >
            <Text style={[styles.tabTxt, tab === "invitado" && styles.tabTxtOn]}>Invitado</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("jugadores")}
            style={[styles.tab, tab === "jugadores" && styles.tabOn]}
          >
            <Text style={[styles.tabTxt, tab === "jugadores" && styles.tabTxtOn]}>Jugadores</Text>
          </Pressable>
        </View>

        {tab === "invitado" ? (
          <View style={{ gap: space[12], marginTop: space[12] }}>
            <TextInput
              value={nombre}
              onChangeText={setNombre}
              placeholder="Nombre del invitado"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              autoFocus
            />
            <Button
              label={busy ? "Agregando…" : "Agregar invitado"}
              onPress={() => void onAddGuest(nombre.trim())}
              disabled={busy || !nombre.trim()}
              loading={busy}
            />
          </View>
        ) : (
          <View style={{ flexGrow: 1, marginTop: space[12], minHeight: 220 }}>
            {loading ? (
              <ActivityIndicator color={colors.gold} />
            ) : error ? (
              <Mute>{error}</Mute>
            ) : sugeridos.length === 0 ? (
              <Mute>
                No hay jugadores sugeridos{filter !== "all" ? ` para ${posLabel}` : ""}. Pediles que
                activen “Busco equipo” en el perfil.
              </Mute>
            ) : (
              <FlatList
                data={sugeridos}
                keyExtractor={(p) => p.id}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.row}
                    disabled={busy}
                    onPress={() => void onAddPlayer(item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{item.name}</Text>
                      <Text style={styles.rowMeta}>
                        {[item.primaryPosition || "—", item.zone].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <Text style={styles.rowAdd}>Sumar</Text>
                  </Pressable>
                )}
              />
            )}
          </View>
        )}

        <Button label="Cerrar" variant="ghost" onPress={onClose} disabled={busy} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: colors.navy,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space[16],
    paddingTop: space[16],
    gap: space[8],
    maxHeight: "85%",
  },
  title: typeStyle("h3", colors.white),
  tabs: {
    flexDirection: "row",
    gap: space[8],
    marginTop: space[8],
  },
  tab: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tabOn: {
    backgroundColor: "#2F7AAD",
    borderColor: "#2F7AAD",
  },
  tabTxt: typeStyle("bodySmall", colors.textSecondary),
  tabTxtOn: typeStyle("bodySmall", colors.white),
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space[12],
    paddingVertical: space[12],
    color: colors.white,
    ...typeStyle("body", colors.white),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    paddingVertical: space[12],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowName: typeStyle("bodySmall", colors.white),
  rowMeta: typeStyle("caption", colors.textSecondary),
  rowAdd: typeStyle("label", colors.gold),
});
