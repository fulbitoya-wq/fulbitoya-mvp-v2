import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "@shared/design";
import {
  etiquetaSuperficie,
  etiquetaTipo,
  etiquetaTipoCorta,
  formatFechaCorta,
  formatHora,
  normalizarTipo,
} from "../lib/desafios";
import { addDaysLocal, hourSlots, toIsoDateLocal } from "../lib/fecha-ui";
import { formatDistanciaKm, getUserLocation, haversineKm, type LatLng } from "../lib/geo";
import { ChevronLeft, iconStroke } from "../lib/icons";
import { listarTurnosPublicos, pesosReserva } from "../lib/reserva";
import type { TurnoPublico } from "../lib/plc";
import { Button, EmptyState, FilterChip, IconBtn, Mute, ZonaSearch, type ZonaPick } from "../ui";
import { CanchaMap } from "../ui/maps/CanchaMap";
import { typeStyle } from "../ui/textStyle";
import { InicioVenueCard } from "./inicio/InicioVenueCard";

type Props = {
  onBack: () => void;
  onRequestAuth: () => void;
  onDone: () => void;
  onOpenPredio?: (canchaId: string) => void;
  onReservarTurno?: (canchaId: string, turnoId: string) => void;
  initialCanchaId?: string | null;
  initialTurnoId?: string | null;
  initialTipoCobro?: "sena" | "total" | null;
  initialAcepto?: boolean;
};

type VenueRow = {
  canchaId: string;
  nombre: string;
  ubicacion: string | null;
  distancia: string | null;
  km: number | null;
  detalles: string;
  hours: { id: string; hora: string; precioLabel: string | null }[];
  lat: number | null;
  lng: number | null;
};

function horaMinutos(hora: string): number {
  const [hh, mm] = String(hora).slice(0, 5).split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function withinHourWindow(turnoHora: string, targetHora: string | null): boolean {
  if (!targetHora) return true;
  const diff = Math.abs(horaMinutos(turnoHora) - horaMinutos(targetHora));
  return diff <= 60;
}

export function ReservarCanchaScreen({
  onBack,
  onOpenPredio,
  onReservarTurno,
}: Props) {
  const insets = useSafeAreaInsets();
  const [zona, setZona] = useState<ZonaPick | null>(null);
  const [anchor, setAnchor] = useState<LatLng | null>(null);
  const [hasZone, setHasZone] = useState(false);
  const [bootLocDone, setBootLocDone] = useState(false);
  const [deporte] = useState("Fútbol");
  const [fecha, setFecha] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [turnos, setTurnos] = useState<TurnoPublico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"lista" | "mapa">("lista");

  const dias = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => toIsoDateLocal(addDaysLocal(today, i)));
  }, []);

  const horas = useMemo(() => hourSlots().filter((h) => {
    const n = Number(h.slice(0, 2));
    return n >= 8 && n <= 23;
  }), []);

  const loadTurnos = useCallback(async () => {
    setLoading(true);
    const res = await listarTurnosPublicos();
    setTurnos(res.data);
    setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTurnos();
  }, [loadTurnos]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const loc = await getUserLocation();
      if (!live) return;
      if (loc) {
        setAnchor(loc);
        setZona({ label: "Cerca mío", lat: loc.lat, lng: loc.lng, source: "gps" });
        setHasZone(true);
      }
      setBootLocDone(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (zona) {
      setAnchor({ lat: zona.lat, lng: zona.lng });
      setHasZone(true);
    }
  }, [zona]);

  const venues = useMemo((): VenueRow[] => {
    if (!hasZone || !anchor) return [];
    type Agg = {
      canchaId: string;
      nombre: string;
      barrio: string | null;
      direccion: string | null;
      lat: number | null;
      lng: number | null;
      tipos: Set<string>;
      superficies: Set<string>;
      techada: boolean;
      hours: { id: string; hora: string; precioLabel: string | null }[];
    };
    const by: Record<string, Agg> = {};
    for (const t of turnos) {
      if (fecha && t.fecha !== fecha) continue;
      if (!fecha && !dias.includes(t.fecha)) continue;
      if (!withinHourWindow(t.hora_inicio, hora)) continue;
      const nt = normalizarTipo(t.campo_tipo);
      if (!nt) continue; // solo fútbol / formatos conocidos
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
        hours: [],
      };
      if (!cur.direccion && t.direccion) cur.direccion = t.direccion;
      if (!cur.barrio && t.barrio) cur.barrio = t.barrio;
      if (cur.lat == null && t.lat != null) cur.lat = t.lat;
      if (cur.lng == null && t.lng != null) cur.lng = t.lng;
      cur.tipos.add(nt);
      if (t.campo_superficie) cur.superficies.add(t.campo_superficie);
      if (t.campo_techada) cur.techada = true;
      if (cur.hours.length < 8 && !cur.hours.some((h) => h.id === t.id)) {
        cur.hours.push({
          id: t.id,
          hora: t.hora_inicio,
          precioLabel: t.precio != null ? pesosReserva(t.precio) : null,
        });
      }
      by[t.cancha_id] = cur;
    }

    return Object.values(by)
      .filter((v) => v.hours.length > 0)
      .map((v) => {
        const km =
          v.lat != null && v.lng != null ? haversineKm(anchor, { lat: v.lat, lng: v.lng }) : null;
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
          hours: [...v.hours].sort((a, b) => a.hora.localeCompare(b.hora)),
          lat: v.lat,
          lng: v.lng,
        };
      })
      .sort((a, b) => {
        if (a.km != null && b.km != null) return a.km - b.km;
        if (a.km != null) return -1;
        if (b.km != null) return 1;
        return a.nombre.localeCompare(b.nombre, "es");
      });
  }, [turnos, fecha, hora, hasZone, anchor, dias]);

  const openTurno = (canchaId: string, turnoId: string) => {
    if (onReservarTurno) {
      onReservarTurno(canchaId, turnoId);
      return;
    }
    onOpenPredio?.(canchaId);
  };

  const pedirUbicacion = async () => {
    const loc = await getUserLocation();
    if (!loc) return;
    setZona({ label: "Cerca mío", lat: loc.lat, lng: loc.lng, source: "gps" });
    setAnchor(loc);
    setHasZone(true);
  };

  const mapPins = venues
    .filter((v) => v.lat != null && v.lng != null)
    .map((v) => ({
      id: v.canchaId,
      latitude: v.lat!,
      longitude: v.lng!,
      title: v.nombre,
      label: v.distancia ?? undefined,
    }));

  const region = anchor
    ? {
        latitude: anchor.lat,
        longitude: anchor.lng,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }
    : {
        latitude: -34.6,
        longitude: -58.45,
        latitudeDelta: 0.2,
        longitudeDelta: 0.2,
      };

  return (
    <View style={[styles.fill, { paddingTop: Math.max(insets.top, space[8]) }]}>
      <View style={styles.bar}>
        <IconBtn onPress={onBack} label="Volver">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </IconBtn>
        <Text style={styles.title}>Reservar cancha</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space[16], paddingBottom: insets.bottom + space[40], gap: space[12] }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.h}>Buscar</Text>
        <ZonaSearch value={zona} onChange={setZona} placeholder="Ciudad o barrio…" />

        <View style={styles.chips}>
          <FilterChip label={deporte} selected onPress={() => undefined} />
        </View>

        <Text style={styles.sub}>Día</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <FilterChip label="Cualquiera" selected={fecha == null} onPress={() => setFecha(null)} />
          {dias.map((d) => (
            <FilterChip
              key={d}
              label={formatFechaCorta(d).replace(/^\w/, (c) => c.toUpperCase()).slice(0, 12)}
              selected={fecha === d}
              onPress={() => setFecha((cur) => (cur === d ? null : d))}
            />
          ))}
        </ScrollView>

        <Text style={styles.sub}>Horario</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <FilterChip label="Cualquiera" selected={hora == null} onPress={() => setHora(null)} />
          {horas.map((h) => (
            <FilterChip
              key={h}
              label={formatHora(h)}
              selected={hora === h}
              onPress={() => setHora((cur) => (cur === h ? null : h))}
            />
          ))}
        </ScrollView>

        <View style={styles.segment}>
          <Pressable onPress={() => setMode("lista")} style={[styles.segBtn, mode === "lista" && styles.segOn]}>
            <Text style={[styles.segTxt, mode === "lista" && styles.segTxtOn]}>Lista</Text>
          </Pressable>
          <Pressable onPress={() => setMode("mapa")} style={[styles.segBtn, mode === "mapa" && styles.segOn]}>
            <Text style={[styles.segTxt, mode === "mapa" && styles.segTxtOn]}>Mapa</Text>
          </Pressable>
        </View>

        <Text style={styles.h}>Nuestras canchas</Text>
        {loading || !bootLocDone ? <Mute>Cargando canchas…</Mute> : null}
        {error ? <Mute>{error}</Mute> : null}

        {!loading && bootLocDone && !hasZone ? (
          <EmptyState
            title="Buscá una zona para ver las canchas disponibles"
            body="Activá tu ubicación o elegí una ciudad / barrio arriba."
            action={<Button label="Usar mi ubicación" onPress={() => void pedirUbicacion()} />}
          />
        ) : null}

        {hasZone && mode === "mapa" ? (
          <CanchaMap
            style={styles.map}
            region={region}
            pins={mapPins}
            onSelectPin={(id) => onOpenPredio?.(id)}
          />
        ) : null}

        {hasZone && mode === "lista" ? (
          venues.length === 0 && !loading ? (
            <EmptyState
              title="No hay turnos con esos filtros"
              body="Probá otro día u horario, o ampliá la zona."
            />
          ) : (
            <View style={{ gap: space[12] }}>
              {venues.map((v) => (
                <InicioVenueCard
                  key={v.canchaId}
                  nombre={v.nombre}
                  ubicacion={v.ubicacion}
                  distancia={v.distancia}
                  detalles={v.detalles || etiquetaTipo("f5")}
                  hours={v.hours}
                  onPressVenue={onOpenPredio ? () => onOpenPredio(v.canchaId) : undefined}
                  onPressHour={(turnoId) => openTurno(v.canchaId, turnoId)}
                />
              ))}
            </View>
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navy },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[8] },
  title: { ...typeStyle("h3", colors.white), flex: 1, textAlign: "center" },
  h: typeStyle("h3", colors.white),
  sub: typeStyle("caption", colors.textSecondary),
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[8], alignItems: "center" },
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
  map: { height: 280, borderRadius: radius.lg, overflow: "hidden" },
});
