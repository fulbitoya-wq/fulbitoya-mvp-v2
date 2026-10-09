import { useEffect, useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "@shared/design";
import {
  esFinde,
  esHoy,
  esManana,
  esSoloCancha,
  formatFechaCorta,
  normalizarTipo,
  type Desafio,
} from "../lib/desafios";
import { getUserLocation, haversineKm, type LatLng } from "../lib/geo";
import {
  BrandLogo,
  Button,
  DesafioCard,
  EmptyState,
  FilterChip,
  Mute,
  NotifBell,
  TAB_BAR_CONTENT_INSET,
  ZonaSearch,
  type ZonaPick,
} from "../ui";
import { typeStyle } from "../ui/textStyle";
import { MapScreen } from "./MapScreen";

type WhenFilter = "todos" | "hoy" | "manana" | "finde";
type TipoFilter = "todos" | "f5" | "f7" | "f9" | "f11";
type ModoFilter = "todos" | "premio" | "cancha";

type Props = {
  items: Desafio[];
  loading: boolean;
  error: string | null;
  guest?: boolean;
  /** Para no filtrar por distancia los partidos que creaste vos. */
  myUserId?: string | null;
  selectedId: string | null;
  preferMap?: boolean;
  onSelectId: (id: string | null) => void;
  onOpenDesafio: (d: Desafio) => void;
  onArmar?: () => void;
  unreadNotifs?: number;
  onOpenNotifs?: () => void;
};

type DaySection = { title: string; fecha: string; data: Desafio[] };

const PAGE = 20;
const NEAR_KM = 35;

function dayHeading(fecha: string): string {
  if (esHoy(fecha)) return "Hoy";
  if (esManana(fecha)) return "Mañana";
  const raw = formatFechaCorta(fecha);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function inicioMs(fecha: string, hora: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = String(hora).slice(0, 5).split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0).getTime();
}

export function ExplorarScreen({
  items,
  loading,
  error,
  myUserId = null,
  selectedId,
  preferMap,
  onSelectId,
  onOpenDesafio,
  onArmar,
  unreadNotifs = 0,
  onOpenNotifs,
}: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"lista" | "mapa">(preferMap ? "mapa" : "lista");
  const [when, setWhen] = useState<WhenFilter>("todos");
  const [tipo, setTipo] = useState<TipoFilter>("todos");
  const [modo, setModo] = useState<ModoFilter>("todos");
  const [hayLugar, setHayLugar] = useState(false);
  const [zona, setZona] = useState<ZonaPick | null>(null);
  const [anchor, setAnchor] = useState<LatLng | null>(null);
  const [hasZone, setHasZone] = useState(false);
  const [bootLocDone, setBootLocDone] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE);

  useEffect(() => {
    if (preferMap) setMode("mapa");
  }, [preferMap]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const loc = await getUserLocation();
      if (!live) return;
      // Solo ancla para ordenar por cercanía. No activar radio duro al boot:
      // en local el GPS del browser suele quedar lejos del predio y escondía todo.
      if (loc) setAnchor(loc);
      setBootLocDone(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (zona) {
      setAnchor({ lat: zona.lat, lng: zona.lng });
      // Radio duro solo si el usuario eligió zona / “cerca mío” a mano.
      setHasZone(true);
    } else {
      setHasZone(false);
      // Mantener última ancla de GPS solo para ordenar, si había.
    }
  }, [zona]);

  useEffect(() => {
    setVisibleCount(PAGE);
  }, [when, tipo, modo, hayLugar, zona?.lat, zona?.lng, hasZone]);

  const filtered = useMemo(() => {
    const kmOf = (d: Desafio): number | null => {
      if (!anchor) return null;
      const lat = Number(d.lat);
      const lng = Number(d.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
      return haversineKm(anchor, { lat, lng });
    };
    return items
      .filter((d) => {
        if (when === "hoy" && !esHoy(d.fecha)) return false;
        if (when === "manana" && !esManana(d.fecha)) return false;
        if (when === "finde" && !esFinde(d.fecha)) return false;
        if (tipo !== "todos" && normalizarTipo(d.tipo) !== tipo) return false;
        if (modo === "premio" && esSoloCancha(Number(d.premio))) return false;
        if (modo === "cancha" && !esSoloCancha(Number(d.premio))) return false;
        if (hayLugar && (d.inscritos?.length ?? 0) >= (d.cupos || 2)) return false;
        const mine = Boolean(myUserId && d.owner_id && d.owner_id === myUserId);
        // Tus partidos siempre entran.
        if (mine) return true;
        // Radio duro solo con zona elegida a mano (Places / Cerca mío).
        if (hasZone && anchor && zona) {
          const km = kmOf(d);
          if (km == null) return true;
          if (km > NEAR_KM) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aMine = Boolean(myUserId && a.owner_id === myUserId) ? 0 : 1;
        const bMine = Boolean(myUserId && b.owner_id === myUserId) ? 0 : 1;
        if (aMine !== bMine) return aMine - bMine;
        const ka = kmOf(a);
        const kb = kmOf(b);
        if (ka != null && kb != null && ka !== kb) return ka - kb;
        if (ka != null && kb == null) return -1;
        if (kb != null && ka == null) return 1;
        return inicioMs(a.fecha, a.hora_inicio) - inicioMs(b.fecha, b.hora_inicio);
      });
  }, [items, when, tipo, modo, hayLugar, hasZone, anchor, myUserId, zona]);

  const sections = useMemo((): DaySection[] => {
    const slice = filtered.slice(0, visibleCount);
    const map = new Map<string, Desafio[]>();
    for (const d of slice) {
      const list = map.get(d.fecha) ?? [];
      list.push(d);
      map.set(d.fecha, list);
    }
    return [...map.entries()].map(([fecha, data]) => ({
      fecha,
      title: dayHeading(fecha),
      data,
    }));
  }, [filtered, visibleCount]);

  const pedirUbicacion = async () => {
    const loc = await getUserLocation();
    if (!loc) return;
    setZona({ label: "Cerca mío", lat: loc.lat, lng: loc.lng, source: "gps" });
    setAnchor(loc);
    setHasZone(true);
  };

  const header = (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, space[16]) }]}>
      <View style={styles.brandRow}>
        {onOpenNotifs ? (
          <NotifBell unread={unreadNotifs} onPress={onOpenNotifs} />
        ) : (
          <View style={styles.brandSide} />
        )}
        <BrandLogo size="sm" />
        <View style={styles.brandSide} />
      </View>
      <ZonaSearch value={zona} onChange={setZona} placeholder="Ciudad o barrio…" />
      <View style={styles.segment}>
        <Pressable
          onPress={() => setMode("lista")}
          style={[styles.segBtn, mode === "lista" && styles.segOn]}
        >
          <Text style={[styles.segTxt, mode === "lista" && styles.segTxtOn]}>Lista</Text>
        </Pressable>
        <Pressable
          onPress={() => setMode("mapa")}
          style={[styles.segBtn, mode === "mapa" && styles.segOn]}
        >
          <Text style={[styles.segTxt, mode === "mapa" && styles.segTxtOn]}>Mapa</Text>
        </Pressable>
      </View>
      <View style={styles.filtersWrap}>
        <FilterChip label="Hoy" selected={when === "hoy"} onPress={() => setWhen((v) => (v === "hoy" ? "todos" : "hoy"))} />
        <FilterChip
          label="Mañana"
          selected={when === "manana"}
          onPress={() => setWhen((v) => (v === "manana" ? "todos" : "manana"))}
        />
        <FilterChip
          label="Finde"
          selected={when === "finde"}
          onPress={() => setWhen((v) => (v === "finde" ? "todos" : "finde"))}
        />
        {(["f5", "f7", "f9", "f11"] as const).map((t) => (
          <FilterChip
            key={t}
            label={t.toUpperCase()}
            selected={tipo === t}
            onPress={() => setTipo((v) => (v === t ? "todos" : t))}
          />
        ))}
        <FilterChip label="Hay lugar" selected={hayLugar} onPress={() => setHayLugar((v) => !v)} />
        <FilterChip
          label="Con premio"
          selected={modo === "premio"}
          onPress={() => setModo((v) => (v === "premio" ? "todos" : "premio"))}
        />
        <FilterChip
          label="Solo cancha"
          selected={modo === "cancha"}
          onPress={() => setModo((v) => (v === "cancha" ? "todos" : "cancha"))}
        />
      </View>
    </View>
  );

  const emptyNoMatches = (
    <EmptyState
      title={hasZone ? "No hay partidos cerca" : "No hay partidos"}
      body={
        hasZone
          ? "Probá otra zona (ej. Monte Grande) o armá el tuyo."
          : "Elegí una ciudad arriba para ordenar por cercanía, o armá el tuyo."
      }
      action={
        hasZone ? (
          onArmar ? <Button label="Armá el tuyo" onPress={onArmar} /> : undefined
        ) : (
          <Button label="Usar mi ubicación" onPress={() => void pedirUbicacion()} />
        )
      }
    />
  );

  const body =
    mode === "mapa" ? (
      <View style={styles.body}>
        {!bootLocDone ? (
          <Mute>Cargando…</Mute>
        ) : (
          <MapScreen
            items={filtered}
            loading={loading}
            error={error}
            selectedId={selectedId}
            onSelect={onSelectId}
            onClear={() => onSelectId(null)}
            onOpenDesafio={onOpenDesafio}
          />
        )}
      </View>
    ) : (
      <SectionList
        style={styles.body}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        contentContainerStyle={[styles.list, { paddingBottom: TAB_BAR_CONTENT_INSET }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: space[8], marginBottom: space[8] }}>
            {loading ? <Mute>Cargando desafíos…</Mute> : null}
            {error ? <Text style={typeStyle("bodySmall", colors.danger)}>{error}</Text> : null}
            {!hasZone && !loading && filtered.length > 0 ? (
              <Mute>Mostrando todos. Elegí una zona para filtrar a 35 km.</Mute>
            ) : null}
          </View>
        }
        ListEmptyComponent={!loading && bootLocDone ? emptyNoMatches : null}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHead}>
            <Text style={styles.dayHeadT}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => <DesafioCard desafio={item} onPress={() => onOpenDesafio(item)} />}
        onEndReached={() => {
          if (visibleCount < filtered.length) setVisibleCount((n) => n + PAGE);
        }}
        onEndReachedThreshold={0.4}
      />
    );

  return (
    <View style={[styles.fill, { backgroundColor: colors.navy }]}>
      {header}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navyDark },
  header: {
    paddingHorizontal: space[16],
    paddingBottom: space[12],
    gap: space[12],
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 72,
  },
  brandSide: { width: 48, minHeight: 48 },
  segment: {
    flexDirection: "row",
    backgroundColor: "rgba(0,27,68,0.55)",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space[4],
    minHeight: 40,
  },
  segBtn: {
    flex: 1,
    minHeight: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segOn: { backgroundColor: "#2F7AAD" },
  segTxt: typeStyle("bodySmall", colors.textSecondary),
  segTxtOn: typeStyle("bodySmall", colors.white),
  filtersWrap: { flexDirection: "row", flexWrap: "wrap", gap: space[8] },
  body: { flex: 1 },
  list: { paddingHorizontal: space[16], paddingTop: space[8] },
  dayHead: {
    backgroundColor: colors.navy,
    paddingVertical: space[8],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dayHeadT: typeStyle("h3", colors.gold),
});
