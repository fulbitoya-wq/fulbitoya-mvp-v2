import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList, 
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, gradientRn, space } from "@shared/design";
import { useAuth } from "../../auth/AuthProvider";
import {
  esFinde,
  esHoy,
  esManana,
  etiquetaSuperficie,
  etiquetaTipoCorta,
  normalizarTipo,
  type Desafio,
} from "../../lib/desafios";
import { formatDistanciaKm, getUserLocation, haversineKm, type LatLng } from "../../lib/geo";
import { ChevronDown, ChevronRight, MapPin, UsersRound, iconStroke } from "../../lib/icons";
import { esPartidoProximo, listMisPartidos, type MiPartido } from "../../lib/mis-partidos";
import { loadFootballProfile } from "../../lib/perfil";
import { listarMisReservas, type ReservaMia } from "../../lib/reserva";
import { listarTurnosPublicos, type TurnoPublico } from "../../lib/plc";
import { BrandLogo, Button, FilterChip, Mute, NotifBell, PlayerAvatar, SectionTitle, TAB_BAR_CONTENT_INSET } from "../../ui";
import { typeStyle } from "../../ui/textStyle";
import { InicioOpenMatchCard } from "./InicioOpenMatchCard";
import { InicioQuickActions } from "./InicioQuickActions";
import { InicioUpcomingMatchCard, InicioUpcomingReservaCard } from "./InicioUpcomingCard";
import { InicioVenueCard } from "./InicioVenueCard";


type WhenFilter = "hoy" | "manana" | "finde" | "todos";
type TipoFilter = "todos" | "f5" | "f7" | "f9" | "f11";

type Props = {
  guest: boolean;
  items: Desafio[];
  loading: boolean;
  error: string | null;
  unreadNotifs: number;
  onOpenNotifs?: () => void;
  onRefresh: () => Promise<unknown>;
  onReservar: () => void;
  onArmar: () => void;
  onOpenDesafio: (d: Desafio) => void;
  onOpenReserva?: (reserva: ReservaMia) => void;
  onVerPartidos: () => void;
  onVerProximos: () => void;
  onReservarTurno: (canchaId: string, turnoId: string) => void;
  onOpenPredio: (canchaId: string) => void;
  onRequestAuth: () => void;
  onOpenZona?: () => void;
};

function firstName(nombre: string | null | undefined) {
  const n = (nombre ?? "").trim();
  if (!n) return "che";
  return n.split(/\s+/)[0] ?? "che";
}

function matchWhen(fecha: string, when: WhenFilter) {
  if (when === "todos") return true;
  if (when === "hoy") return esHoy(fecha);
  if (when === "manana") return esManana(fecha);
  return esFinde(fecha);
}

export function InicioScreen({
  guest,
  items,
  loading,
  error,
  unreadNotifs,
  onOpenNotifs,
  onRefresh,
  onReservar,
  onArmar,
  onOpenDesafio,
  onOpenReserva,
  onVerPartidos,
  onVerProximos,
  onReservarTurno,
  onOpenPredio,
  onRequestAuth,
  onOpenZona }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { profile } = useAuth();
  // Default "todos": crear partido often picks a day in the next 2 weeks, not only hoy.
  const [when, setWhen] = useState<WhenFilter>("todos");
  const [tipo, setTipo] = useState<TipoFilter>("todos");
  const [zona, setZona] = useState("");
  const [proximos, setProximos] = useState<MiPartido[]>([]);
  const [reservas, setReservas] = useState<ReservaMia[]>([]);
  const [turnos, setTurnos] = useState<TurnoPublico[]>([]);
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cardW = Math.min(240, Math.max(210, width - 32 - 40));

  const loadMine = useCallback(async () => {
    if (guest || !profile?.id) {
      setProximos([]);
      setReservas([]);
      setZona("");
      return;
    }
    const [partidos, mine, fp] = await Promise.all([
      listMisPartidos(),
      listarMisReservas(),
      loadFootballProfile(profile.id),
    ]);
    setProximos(partidos.ok ? partidos.items.filter(esPartidoProximo) : []);
    setReservas(mine.data.filter((r) => r.estado === "reservada"));
    setZona(fp.zona.trim());
  }, [guest, profile?.id]);

  const loadTurnos = useCallback(async () => {
    const res = await listarTurnosPublicos();
    setTurnos(res.data);
  }, []);

  const loadLocation = useCallback(async () => {
    const loc = await getUserLocation();
    setUserLoc(loc);
  }, []);

  useEffect(() => {
    let live = true;
    setHomeLoading(true);
    Promise.all([loadMine(), loadTurnos(), loadLocation()]).finally(() => {
      if (live) setHomeLoading(false);
    });
    return () => {
      live = false;
    };
  }, [loadMine, loadTurnos, loadLocation]);

  const pull = async () => {
    setRefreshing(true);
    await Promise.all([onRefresh(), loadMine(), loadTurnos(), loadLocation()]);
    setRefreshing(false);
  };

  const abiertos = useMemo(() => {
    return items.filter((d) => {
      if (d.estado !== "abierto") return false;
      if (!matchWhen(d.fecha, when)) return false;
      if (tipo !== "todos" && normalizarTipo(d.tipo) !== tipo) return false;
      return true;
    });
  }, [items, when, tipo]);

  const venues = useMemo(() => {
    type VenueAgg = {
      canchaId: string;
      nombre: string;
      barrio: string | null;
      direccion: string | null;
      lat: number | null;
      lng: number | null;
      tipos: Set<string>;
      superficies: Set<string>;
      techada: boolean;
      hours: { id: string; hora: string }[];
    };
    const by: Record<string, VenueAgg> = {};
    for (const t of turnos) {
      if (!matchWhen(t.fecha, when)) continue;
      if (tipo !== "todos" && normalizarTipo(t.campo_tipo) !== tipo) continue;
      const cur = by[t.cancha_id] ?? {
        canchaId: t.cancha_id,
        nombre: t.cancha_nombre,
        barrio: t.barrio,
        direccion: t.direccion,
        lat: t.lat,
        lng: t.lng,
        tipos: new Set<string>(),
        superficies: new Set<string>(),
        techada: false,
        hours: [] };
      if (!cur.direccion && t.direccion) cur.direccion = t.direccion;
      if (!cur.barrio && t.barrio) cur.barrio = t.barrio;
      if (cur.lat == null && t.lat != null) cur.lat = t.lat;
      if (cur.lng == null && t.lng != null) cur.lng = t.lng;
      const nt = normalizarTipo(t.campo_tipo);
      if (nt) cur.tipos.add(nt);
      if (t.campo_superficie) cur.superficies.add(t.campo_superficie);
      if (t.campo_techada) cur.techada = true;
      if (cur.hours.length < 5 && !cur.hours.some((h) => h.id === t.id)) {
        cur.hours.push({ id: t.id, hora: t.hora_inicio });
      }
      by[t.cancha_id] = cur;
    }

    const ranked = Object.values(by)
      .filter((v) => v.hours.length > 0)
      .map((v) => {
        const km =
          userLoc && v.lat != null && v.lng != null
            ? haversineKm(userLoc, { lat: v.lat, lng: v.lng })
            : null;
        const tiposOrden = [...v.tipos].sort();
        const superf = [...v.superficies]
          .map(etiquetaSuperficie)
          .filter((x): x is string => Boolean(x));
        const detallesParts = [
          ...tiposOrden.map(etiquetaTipoCorta),
          ...superf,
          v.techada ? "Techada" : null,
        ].filter(Boolean) as string[];
        const ubicacion =
          [v.direccion, v.barrio && v.direccion && !v.direccion.toLowerCase().includes(v.barrio.toLowerCase()) ? v.barrio : !v.direccion ? v.barrio : null]
            .filter(Boolean)
            .join(" · ") || null;
        return {
          canchaId: v.canchaId,
          nombre: v.nombre,
          ubicacion,
          distancia: formatDistanciaKm(km),
          km,
          detalles: detallesParts.join(" · "),
          hours: [...v.hours].sort((a, b) => a.hora.localeCompare(b.hora)) };
      });

    ranked.sort((a, b) => {
      if (a.km != null && b.km != null) return a.km - b.km;
      if (a.km != null) return -1;
      if (b.km != null) return 1;
      return a.nombre.localeCompare(b.nombre, "es");
    });

    return ranked.slice(0, 6);
  }, [turnos, when, tipo, userLoc]);

  const showProximos = !guest && (proximos.length > 0 || reservas.length > 0);
  const formatoLabel = tipo === "todos" ? "Formato" : `Fútbol ${tipo.slice(1)}`;

  const cycleTipo = () => {
    const order: TipoFilter[] = ["todos", "f5", "f7", "f9", "f11"];
    const i = order.indexOf(tipo);
    setTipo(order[(i + 1) % order.length] ?? "todos");
  };

  const toggleWhen = (v: WhenFilter) => setWhen((cur) => (cur === v ? "todos" : v));

  return (
    <View style={[styles.fill, { backgroundColor: colors.navy }]}>
      <LinearGradient colors={["rgba(0,27,68,0.35)", colors.navyDark]} style={StyleSheet.absoluteFill} />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={{
          paddingTop: Math.max(insets.top, space[12]),
          paddingHorizontal: 16,
          paddingBottom: TAB_BAR_CONTENT_INSET,
          gap: space[16] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pull()} tintColor={colors.gold} />}
      >
        {guest ? (
          <View style={styles.guestHero}>
            <BrandLogo size="sm" />
            <Text style={styles.welcome}>
              ¡Bienvenido/a{"\n"}a <Text style={styles.welcomeGold}>PorLaCancha</Text>!
            </Text>
            <Text style={styles.welcomeP}>Descubrí partidos, reservá canchas y viví el fútbol amateur.</Text>
            <View style={styles.guestCtas}>
              <Pressable onPress={onRequestAuth} accessibilityRole="button" style={{ flex: 1 }}>
                <LinearGradient colors={[...gradientRn.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.goldBtn}>
                  <Text style={styles.goldBtnT}>Iniciar sesión →</Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={onRequestAuth} accessibilityRole="button" style={styles.ghostBtn}>
                <Text style={styles.ghostBtnT}>Crear cuenta →</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.header}>
            <View style={styles.who}>
              <PlayerAvatar uri={profile?.avatar_url} nombre={profile?.nombre} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={styles.hola}>¡Hola, {firstName(profile?.nombre)}!</Text>
                <Pressable
                  onPress={onOpenZona}
                  accessibilityRole="button"
                  accessibilityLabel="Cambiar zona"
                  style={styles.zonaHit}
                >
                  <MapPin color={colors.sky} size={14} strokeWidth={iconStroke} />
                  <Text style={styles.zona} numberOfLines={1}>
                    {zona || "Elegí tu zona"}
                  </Text>
                  <ChevronDown color={colors.sky} size={16} strokeWidth={iconStroke} />
                </Pressable>
              </View>
            </View>
            {onOpenNotifs ? <NotifBell unread={unreadNotifs} onPress={onOpenNotifs} /> : null}
          </View>
        )}

        <InicioQuickActions onReservar={onReservar} onArmar={onArmar} />

        {showProximos ? (
          <View>
            <SectionTitle title="Tus próximos partidos" action="Ver todos →" onAction={onVerProximos} />
            <View style={{ gap: 10 }}>
              {reservas.slice(0, 2).map((r) => (
                <InicioUpcomingReservaCard
                  key={r.id}
                  reserva={r}
                  onPress={onOpenReserva ? () => onOpenReserva(r) : undefined}
                />
              ))}
              {proximos.slice(0, 3).map((p) => (
                <InicioUpcomingMatchCard key={`${p.id}-${p.inscripcionId ?? ""}`} partido={p} onPress={() => onOpenDesafio(p)} />
              ))}
            </View>
          </View>
        ) : null}

        <View>
          <SectionTitle title="Partidos abiertos cerca" action="Ver todos →" onAction={onVerPartidos} />
          {loading || homeLoading ? (
            <View style={styles.skelRow}>
              <View style={[styles.skel, { width: cardW, height: 220 }]} />
              <View style={[styles.skel, { width: 40, height: 220 }]} />
            </View>
          ) : error ? (
            <Mute>{error}</Mute>
          ) : abiertos.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyT}>No hay partidos abiertos cerca.</Text>
              <Text style={styles.emptyP}>¡Armá el tuyo!</Text>
              <Button label="Armar partido" onPress={onArmar} />
            </View>
          ) : (
            <FlatList
              horizontal
              nestedScrollEnabled
              data={abiertos}
              keyExtractor={(d) => d.id}
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardW + 12}
              decelerationRate="fast"
              contentContainerStyle={{ gap: 12, paddingRight: 24 }}
              renderItem={({ item }) => (
                <InicioOpenMatchCard desafio={item} width={cardW} onPress={() => onOpenDesafio(item)} />
              )}
            />
          )}
        </View>

        <View>
          <SectionTitle
            title={userLoc ? "Canchas libres cerca" : "Canchas libres hoy"}
            action="Ver todos →"
            onAction={onReservar}
          />
          {homeLoading ? (
            <View style={{ gap: 10 }}>
              <View style={[styles.skel, { height: 118 }]} />
              <View style={[styles.skel, { height: 118 }]} />
            </View>
          ) : venues.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyT}>No encontramos canchas libres para estos filtros.</Text>
              <Button label="Cambiar filtros" variant="secondary" onPress={() => { setWhen("todos"); setTipo("todos"); }} />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {venues.map((v) => (
                <InicioVenueCard
                  key={v.canchaId}
                  nombre={v.nombre}
                  ubicacion={v.ubicacion}
                  distancia={v.distancia}
                  detalles={v.detalles}
                  hours={v.hours}
                  onPressVenue={() => onOpenPredio(v.canchaId)}
                  onPressHour={(turnoId) => onReservarTurno(v.canchaId, turnoId)}
                />
              ))}
            </View>
          )}
        </View>

        <View>
          <Text style={styles.filtrosT}>Filtros rápidos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <FilterChip accent="sky" label="Hoy" selected={when === "hoy"} onPress={() => toggleWhen("hoy")} />
            <FilterChip accent="sky" label="Mañana" selected={when === "manana"} onPress={() => toggleWhen("manana")} />
            <FilterChip accent="sky" label="Este finde" selected={when === "finde"} onPress={() => toggleWhen("finde")} />
            <FilterChip accent="sky" label={formatoLabel} selected={tipo !== "todos"} onPress={cycleTipo} />
          </ScrollView>
        </View>

        {guest ? (
          <Pressable onPress={onRequestAuth} style={styles.invite} accessibilityRole="button">
            <UsersRound color={colors.sky} size={22} strokeWidth={iconStroke} />
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteT}>¿Querés crear tu propio partido?</Text>
              <Text style={styles.inviteP}>Iniciá sesión para publicar partidos y encontrar jugadores.</Text>
            </View>
            <View style={styles.inviteCta}>
              <Text style={styles.inviteCtaT}>Iniciar sesión</Text>
              <ChevronRight color={colors.navyDark} size={16} strokeWidth={iconStroke} />
            </View>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navyDark },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  hola: typeStyle("h2", colors.white),
  zonaHit: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, marginTop: 2 },
  zona: { ...typeStyle("caption", colors.sky), flexShrink: 1 },
  guestHero: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
    borderRadius: 22,
    padding: space[16],
    gap: space[10] },
  welcome: typeStyle("h2", colors.white),
  welcomeGold: { color: colors.gold },
  welcomeP: typeStyle("bodySmall", colors.textSecondary),
  guestCtas: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  goldBtn: { minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  goldBtnT: typeStyle("h3", colors.navyDark),
  ghostBtn: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16 },
  ghostBtnT: typeStyle("bodySmall", colors.white),
  empty: { gap: 8, paddingVertical: space[8] },
  emptyT: typeStyle("body", colors.white),
  emptyP: typeStyle("bodySmall", colors.textSecondary),
  skelRow: { flexDirection: "row", gap: 12 },
  skel: { backgroundColor: colors.surface, borderRadius: 20, opacity: 0.7 },
  filtrosT: { ...typeStyle("h3", colors.white), marginBottom: space[10] },
  filters: { flexDirection: "row", gap: 8, paddingRight: 16 },
  invite: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
    borderRadius: 18,
    padding: space[12] },
  inviteT: typeStyle("h3", colors.white),
  inviteP: typeStyle("caption", colors.textSecondary),
  inviteCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 36 },
  inviteCtaT: typeStyle("caption", colors.navyDark) });
