import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "@shared/design";
import type { MapPin } from "./CanchaMap";

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Props = {
  style?: StyleProp<ViewStyle>;
  region: Region;
  pins: MapPin[];
  onSelectPin?: (id: string) => void;
  scrollEnabled?: boolean;
};

type GoogleMaps = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
      fitBounds: (bounds: unknown) => void;
    };
    Marker: new (opts: Record<string, unknown>) => {
      addListener: (event: string, fn: () => void) => void;
      setMap: (map: unknown) => void;
    };
    LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void };
    SymbolPath: { CIRCLE: number };
  };
};

declare global {
  interface Window {
    google?: GoogleMaps;
  }
}

const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
let loading: Promise<void> | null = null;

function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("sin ventana"));
  if (window.google?.maps) return Promise.resolve();
  if (!key) return Promise.reject(new Error("sin clave"));
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("no cargo el mapa"));
      document.head.appendChild(script);
    });
  }
  return loading;
}

export function CanchaMap({ style, region, pins, onSelectPin, scrollEnabled = true }: Props) {
  const host = useRef<View>(null);
  const [failed, setFailed] = useState(!key);

  const signature = pins
    .map((pin) => `${pin.id}:${pin.latitude}:${pin.longitude}:${pin.active ? 1 : 0}:${pin.label ?? ""}`)
    .join("|");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const markers: { setMap: (map: unknown) => void }[] = [];
    void loadMaps()
      .then(() => {
        if (cancelled) return;
        const maps = window.google?.maps;
        const el = host.current as unknown as HTMLElement | null;
        if (!maps || !el) {
          setFailed(true);
          return;
        }
        const map = new maps.Map(el, {
          center: { lat: region.latitude, lng: region.longitude },
          zoom: zoomFromDelta(region.latitudeDelta),
          disableDefaultUI: !scrollEnabled,
          gestureHandling: scrollEnabled ? "auto" : "none",
          clickableIcons: false,
          backgroundColor: colors.navyDark,
        });
        const bounds = new maps.LatLngBounds();
        for (const pin of pins) {
          const position = { lat: pin.latitude, lng: pin.longitude };
          bounds.extend(position);
          const marker = new maps.Marker({
            position,
            map,
            title: pin.title ?? pin.label,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: pin.active ? 11 : 8,
              fillColor: pin.active ? colors.gold : colors.sky,
              fillOpacity: 1,
              strokeColor: colors.navyDark,
              strokeWeight: 2,
            },
          });
          if (onSelectPin) marker.addListener("click", () => onSelectPin(pin.id));
          markers.push(marker);
        }
        if (pins.length > 1) map.fitBounds(bounds);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      for (const marker of markers) marker.setMap(null);
    };
  }, [onSelectPin, signature, region.latitude, region.longitude, region.latitudeDelta, scrollEnabled]);

  if (failed) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>El mapa no está disponible en este navegador.</Text>
      </View>
    );
  }

  return <View ref={host} style={style} />;
}

function zoomFromDelta(delta: number) {
  if (delta <= 0.02) return 15;
  if (delta <= 0.08) return 13;
  return 11;
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  fallbackText: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
});
