import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, space } from "@shared/design";
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

type Hint = { placeId: string; label: string; mainText: string; secondaryText: string };

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

export function PlacesSearch({ onConfirmed, placeholder = "Buscá una cancha o predio..." }: Props) {
  const [q, setQ] = useState("");
  const [hints, setHints] = useState<Hint[]>([]);
  const [pending, setPending] = useState<PlacePick | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const req = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3 || pending) {
      setHints([]);
      return;
    }
    const base = apiBase();
    if (!base) {
      setErr("Falta la URL web para buscar lugares.");
      return;
    }
    const handle = setTimeout(() => {
      const id = ++req.current;
      void (async () => {
        try {
          const res = await fetch(`${base}/api/places/autocomplete?q=${encodeURIComponent(query)}`);
          const body = (await res.json()) as { ok?: boolean; suggestions?: Hint[]; error?: string };
          if (id !== req.current) return;
          if (!body.ok) {
            setErr(body.error ?? "No se pudo buscar.");
            setHints([]);
            return;
          }
          setErr(null);
          setHints(
            (body.suggestions ?? []).map((s) => ({
              placeId: s.placeId,
              label: s.label,
              mainText: s.mainText,
              secondaryText: s.secondaryText,
            }))
          );
        } catch {
          if (id !== req.current) return;
          setErr("No se pudo buscar lugares.");
          setHints([]);
        }
      })();
    }, 220);
    return () => clearTimeout(handle);
  }, [q, pending]);

  const pickHint = async (h: Hint) => {
    setBusy(true);
    setErr(null);
    try {
      const base = apiBase();
      const res = await fetch(`${base}/api/places/details?placeId=${encodeURIComponent(h.placeId)}`);
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
        setErr(body.error ?? "No se pudo confirmar el lugar.");
        return;
      }
      setPending({
        placeId: body.place.placeId,
        nombre: body.place.nombre || h.mainText,
        direccion: String(body.place.direccion || ""),
        lat: body.place.lat,
        lng: body.place.lng,
        barrio: body.place.barrio,
        telefono: body.place.telefono,
      });
      setHints([]);
      setQ(body.place.nombre || h.mainText);
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
          <Pressable
            onPress={() => onConfirmed(pending)}
            style={styles.btn}
          >
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
      {hints.map((h) => (
        <Pressable key={h.placeId} onPress={() => void pickHint(h)} style={styles.hint}>
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
