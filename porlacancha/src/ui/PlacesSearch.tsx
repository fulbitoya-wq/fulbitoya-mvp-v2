import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, space } from "@shared/design";
import {
  autocompletePlacesWeb,
  detailsFromPredictionWeb,
  placesWebAvailable,
  type PlacesHint,
} from "../lib/places-web";
import { webBaseUrl } from "../lib/web-url";
import { Mute } from "./index";
import { typeStyle } from "./textStyle";

export type PlacePick = {
  placeId: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
  barrio: string | null;
  telefono: string | null;
};

type Hint = {
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string;
  prediction?: PlacesHint["prediction"];
};

type Props = {
  onConfirmed: (place: PlacePick) => void;
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
  return (body.suggestions ?? []).map((s) => ({
    placeId: s.placeId,
    label: s.label,
    mainText: s.mainText,
    secondaryText: s.secondaryText,
  }));
}

async function detailsServer(placeId: string): Promise<PlacePick> {
  const base = apiBase();
  const res = await fetch(`${base}/api/places/details?placeId=${encodeURIComponent(placeId)}`);
  const body = (await res.json()) as {
    ok?: boolean;
    place?: {
      placeId: string;
      nombre: string;
      direccion: string;
      lat: number | null;
      lng: number | null;
      barrio: string | null;
      telefono: string | null;
    };
    error?: string;
  };
  if (!body.ok || !body.place || body.place.lat == null || body.place.lng == null) {
    throw new Error(body.error ?? "No se pudo confirmar el lugar.");
  }
  return {
    placeId: body.place.placeId,
    nombre: body.place.nombre,
    direccion: String(body.place.direccion || ""),
    lat: body.place.lat,
    lng: body.place.lng,
    barrio: body.place.barrio,
    telefono: body.place.telefono,
  };
}

export function PlacesSearch({ onConfirmed, placeholder = "Buscá una cancha o predio..." }: Props) {
  const [q, setQ] = useState("");
  const [hints, setHints] = useState<Hint[]>([]);
  const [pending, setPending] = useState<PlacePick | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const req = useRef(0);
  const useClient = Platform.OS === "web" && placesWebAvailable();

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3 || pending) {
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
          setErr(null);
          setHints(list);
        } catch (e) {
          if (id !== req.current) return;
          setHints([]);
          setErr(e instanceof Error ? e.message : "No se pudo buscar lugares.");
        }
      })();
    }, 220);
    return () => clearTimeout(handle);
  }, [q, pending, useClient]);

  const pickHint = async (h: Hint) => {
    setBusy(true);
    setErr(null);
    try {
      let place: PlacePick;
      if (useClient && h.prediction) {
        const d = await detailsFromPredictionWeb(h.prediction);
        place = {
          placeId: d.placeId || h.placeId,
          nombre: d.nombre || h.mainText,
          direccion: d.direccion,
          lat: d.lat,
          lng: d.lng,
          barrio: d.barrio,
          telefono: d.telefono,
        };
      } else {
        place = await detailsServer(h.placeId);
        if (!place.nombre) place.nombre = h.mainText;
      }
      if (!place.placeId) {
        setErr("Google no devolvió el place_id de ese lugar.");
        return;
      }
      setPending(place);
      setHints([]);
      setQ(place.nombre);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo confirmar el lugar.");
    } finally {
      setBusy(false);
    }
  };

  if (pending) {
    return (
      <View style={styles.card}>
        <Text style={styles.h}>¿Es este lugar?</Text>
        <Text style={styles.body}>{pending.nombre}</Text>
        <Mute>{pending.direccion}</Mute>
        {pending.telefono ? <Mute>Tel. {pending.telefono}</Mute> : null}
        <Mute>Información de Google</Mute>
        <View style={styles.row}>
          <Pressable
            onPress={() => {
              setPending(null);
              setQ("");
            }}
            style={styles.btnGhost}
          >
            <Text style={styles.chipT}>No, buscar otro</Text>
          </Pressable>
          <Pressable onPress={() => onConfirmed(pending)} style={styles.btn}>
            <Text style={styles.chipT}>Sí, es este</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: space[8] }}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        autoCorrect={false}
      />
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {busy ? <Mute>Cargando…</Mute> : null}
      {!err && q.trim().length >= 3 && hints.length === 0 && !busy ? (
        <Mute>Escribí el nombre del predio (mín. 3 letras). Si no aparece, probá con el barrio.</Mute>
      ) : null}
      {hints.map((h, i) => (
        <Pressable key={`${h.placeId}-${i}`} onPress={() => void pickHint(h)} style={styles.hint}>
          <Text style={styles.body}>{h.mainText || h.label}</Text>
          {h.secondaryText ? <Mute>{h.secondaryText}</Mute> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space[12],
    color: colors.white,
    backgroundColor: colors.surface,
    ...typeStyle("body", colors.white),
  },
  hint: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space[12],
    backgroundColor: colors.surface,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    padding: space[12],
    backgroundColor: colors.surface,
    gap: space[4],
  },
  h: typeStyle("h3", colors.white),
  body: typeStyle("body", colors.white),
  err: { ...typeStyle("caption", colors.danger) },
  row: { flexDirection: "row", gap: space[8], marginTop: space[12] },
  btn: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.gold,
  },
  btnGhost: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipT: typeStyle("bodySmall", colors.white),
});
