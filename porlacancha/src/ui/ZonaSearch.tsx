import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import type { LatLng } from "../lib/geo";
import { getUserLocation } from "../lib/geo";
import {
  autocompletePlacesWeb,
  detailsFromPredictionWeb,
  placesWebAvailable,
  type PlacesHint,
} from "../lib/places-web";
import { webBaseUrl } from "../lib/web-url";
import { typeStyle } from "./textStyle";

export type ZonaPick = {
  label: string;
  lat: number;
  lng: number;
  source: "places" | "gps";
};

type Hint = {
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string;
  prediction?: PlacesHint["prediction"];
};

type Props = {
  value: ZonaPick | null;
  onChange: (zona: ZonaPick | null) => void;
  placeholder?: string;
};

function apiBase(): string {
  const web = webBaseUrl();
  if (web) return web;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "";
}

async function autocompleteServer(q: string): Promise<Hint[]> {
  const base = apiBase();
  if (!base) throw new Error("Falta la URL web para buscar lugares.");
  const res = await fetch(`${base}/api/places/autocomplete?q=${encodeURIComponent(q)}`);
  const body = (await res.json()) as { ok?: boolean; suggestions?: Hint[]; error?: string };
  if (!body.ok) throw new Error(body.error ?? "No se pudo buscar.");
  return body.suggestions ?? [];
}

async function detailsServer(placeId: string): Promise<{ lat: number; lng: number; label: string }> {
  const base = apiBase();
  const res = await fetch(`${base}/api/places/details?placeId=${encodeURIComponent(placeId)}`);
  const body = (await res.json()) as {
    ok?: boolean;
    place?: { nombre?: string; direccion?: string; lat: number | null; lng: number | null };
    error?: string;
  };
  if (!body.ok || !body.place || body.place.lat == null || body.place.lng == null) {
    throw new Error(body.error ?? "No se pudo confirmar el lugar.");
  }
  return {
    lat: body.place.lat,
    lng: body.place.lng,
    label: String(body.place.nombre || body.place.direccion || "Zona"),
  };
}

export function ZonaSearch({ value, onChange, placeholder = "Ciudad o barrio…" }: Props) {
  const [q, setQ] = useState(value?.label ?? "");
  const [hints, setHints] = useState<Hint[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyGps, setBusyGps] = useState(false);
  const req = useRef(0);
  const useClient = Platform.OS === "web" && placesWebAvailable();

  useEffect(() => {
    if (value?.label && value.label !== q) setQ(value.label);
    if (!value) {
      /* keep typed q */
    }
  }, [value?.label]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3 || (value && value.label === query)) {
      setHints([]);
      return;
    }
    const handle = setTimeout(() => {
      const id = ++req.current;
      void (async () => {
        try {
          let list: Hint[];
          if (useClient) {
            const webHints = await autocompletePlacesWeb(query);
            list = webHints.map((h) => ({
              placeId: h.placeId,
              label: h.label,
              mainText: h.mainText,
              secondaryText: h.secondaryText,
              prediction: h.prediction,
            }));
          } else {
            list = await autocompleteServer(query);
          }
          if (id !== req.current) return;
          setHints(list);
          setErr(null);
        } catch (e) {
          if (id !== req.current) return;
          setHints([]);
          setErr(e instanceof Error ? e.message : "No se pudo buscar.");
        }
      })();
    }, 280);
    return () => clearTimeout(handle);
  }, [q, useClient, value]);

  const pickHint = async (h: Hint) => {
    try {
      let lat: number;
      let lng: number;
      let label = h.mainText || h.label;
      if (useClient && h.prediction) {
        const d = await detailsFromPredictionWeb(h.prediction);
        if (d.lat == null || d.lng == null) throw new Error("Sin coordenadas.");
        lat = d.lat;
        lng = d.lng;
        label = d.nombre || d.direccion || label;
      } else {
        const d = await detailsServer(h.placeId);
        lat = d.lat;
        lng = d.lng;
        label = d.label;
      }
      setQ(label);
      setHints([]);
      onChange({ label, lat, lng, source: "places" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo confirmar.");
    }
  };

  const cercaMio = async () => {
    setBusyGps(true);
    setErr(null);
    const loc: LatLng | null = await getUserLocation();
    setBusyGps(false);
    if (!loc) {
      setErr("No pudimos usar tu ubicación. Activá el permiso o buscá una zona.");
      return;
    }
    setQ("Cerca mío");
    setHints([]);
    onChange({ label: "Cerca mío", lat: loc.lat, lng: loc.lng, source: "gps" });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          value={q}
          onChangeText={(t) => {
            setQ(t);
            if (value) onChange(null);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          autoCorrect={false}
        />
        <Pressable onPress={() => void cercaMio()} style={styles.gps} disabled={busyGps}>
          <Text style={styles.gpsT}>{busyGps ? "…" : "Cerca mío"}</Text>
        </Pressable>
      </View>
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {hints.length > 0 ? (
        <View style={styles.hints}>
          {hints.slice(0, 6).map((h) => (
            <Pressable key={h.placeId} onPress={() => void pickHint(h)} style={styles.hint}>
              <Text style={styles.hintMain}>{h.mainText || h.label}</Text>
              {h.secondaryText ? <Text style={styles.hintSub}>{h.secondaryText}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[8], zIndex: 2 },
  row: { flexDirection: "row", gap: space[8], alignItems: "center" },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space[12],
    color: colors.white,
    ...typeStyle("body", colors.white),
  },
  gps: {
    minHeight: 48,
    paddingHorizontal: space[12],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  gpsT: typeStyle("bodySmall", colors.gold),
  hints: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  hint: { paddingHorizontal: space[12], paddingVertical: space[10], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  hintMain: typeStyle("body", colors.white),
  hintSub: typeStyle("caption", colors.textSecondary),
  err: typeStyle("caption", colors.danger),
});
