/** Places (New) en el browser de la app Expo web. */

const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

type MapsBootstrap = {
  importLibrary: (name: string) => Promise<unknown>;
  __ib__?: () => void;
};

type PlacePrediction = {
  text?: { toString: () => string } | string;
  toPlace: () => PlaceNew;
  structuredFormat?: {
    mainText?: { text?: string } | string;
    secondaryText?: { text?: string } | string;
  };
};

type PlaceNew = {
  fetchFields: (opts: { fields: string[] }) => Promise<void>;
  location?: {
    lat: (() => number) | number;
    lng: (() => number) | number;
    toJSON?: () => { lat: number; lng: number };
  } | null;
  formattedAddress?: string;
  displayName?: string | { text?: string };
  id?: string;
  nationalPhoneNumber?: string;
  addressComponents?: Array<{ longText?: string; long_name?: string; types: string[] }>;
};

export type PlacesHint = {
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string;
  prediction: PlacePrediction;
};

export type PlacesDetails = {
  placeId: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
  barrio: string | null;
  telefono: string | null;
};

let loading: Promise<void> | null = null;
let sessionToken: unknown = null;

function mapsNs(): MapsBootstrap | undefined {
  return (window as unknown as { google?: { maps?: MapsBootstrap } }).google?.maps;
}

function installBootstrap() {
  const win = window as unknown as { google: { maps: MapsBootstrap } };
  win.google = win.google ?? { maps: {} as MapsBootstrap };
  win.google.maps = win.google.maps ?? ({} as MapsBootstrap);
  const d = win.google.maps;
  if (typeof d.importLibrary === "function" && d.importLibrary !== bootstrapImport) return;

  d.importLibrary = bootstrapImport;
}

async function bootstrapImport(name: string): Promise<unknown> {
  const d = mapsNs();
  if (!d) throw new Error("Google Maps no disponible.");
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const params = new URLSearchParams({
        key,
        v: "weekly",
        language: "es",
        region: "AR",
        loading: "async",
        callback: "google.maps.__ib__",
      });
      d.__ib__ = () => resolve();
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.onerror = () => reject(new Error("No se pudo cargar Google Maps."));
      document.head.appendChild(script);
    });
  }
  await loading;
  const maps = mapsNs();
  if (!maps || maps.importLibrary === bootstrapImport) {
    throw new Error("No se pudo cargar Google Maps.");
  }
  return maps.importLibrary(name);
}

async function loadPlaces() {
  if (typeof window === "undefined") throw new Error("Solo en el navegador.");
  if (!key) throw new Error("Falta EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.");
  installBootstrap();
  const maps = mapsNs();
  if (!maps?.importLibrary) throw new Error("No se pudo cargar Google Maps.");
  const places = (await maps.importLibrary("places")) as {
    AutocompleteSuggestion?: {
      fetchAutocompleteSuggestions: (req: Record<string, unknown>) => Promise<{
        suggestions: Array<{ placePrediction?: PlacePrediction }>;
      }>;
    };
    AutocompleteSessionToken?: new () => unknown;
  };
  if (!places.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    throw new Error("Falta Places API (New) en la key de Google Cloud.");
  }
  return places;
}

function textOf(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "text" in v && typeof (v as { text?: string }).text === "string") {
    return (v as { text: string }).text;
  }
  if (typeof v === "object" && v && "toString" in v) return String(v);
  return "";
}

export async function autocompletePlacesWeb(q: string): Promise<PlacesHint[]> {
  const places = await loadPlaces();
  if (!sessionToken && places.AutocompleteSessionToken) {
    sessionToken = new places.AutocompleteSessionToken();
  }
  const { suggestions } = await places.AutocompleteSuggestion!.fetchAutocompleteSuggestions({
    input: q,
    includedRegionCodes: ["AR"],
    language: "es-AR",
    region: "AR",
    sessionToken: sessionToken ?? undefined,
  });
  return suggestions
    .map((s) => s.placePrediction)
    .filter((p): p is PlacePrediction => Boolean(p))
    .map((p) => {
      const main = textOf(p.structuredFormat?.mainText) || textOf(p.text);
      const secondary = textOf(p.structuredFormat?.secondaryText);
      const placeId = String((p as { placeId?: string }).placeId ?? "").replace(/^places\//, "");
      return {
        placeId: placeId || main,
        label: [main, secondary].filter(Boolean).join(" · "),
        mainText: main,
        secondaryText: secondary,
        prediction: p,
      };
    })
    .filter((h) => Boolean(h.mainText || h.label));
}

function coords(place: PlaceNew): { lat: number; lng: number } | null {
  const loc = place.location;
  if (!loc) return null;
  if (typeof loc.toJSON === "function") {
    const j = loc.toJSON();
    if (typeof j?.lat === "number" && typeof j?.lng === "number") return j;
  }
  const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
  const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
  if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
  return null;
}

function barrioFrom(components: PlaceNew["addressComponents"]): string | null {
  if (!components) return null;
  const hit =
    components.find((c) => c.types.includes("neighborhood")) ||
    components.find((c) => c.types.includes("sublocality_level_1")) ||
    components.find((c) => c.types.includes("locality"));
  return hit?.longText ?? hit?.long_name ?? null;
}

export async function detailsFromPredictionWeb(prediction: PlacePrediction): Promise<PlacesDetails> {
  const place = prediction.toPlace();
  await place.fetchFields({
    fields: ["formattedAddress", "location", "id", "addressComponents", "displayName", "nationalPhoneNumber"],
  });
  const c = coords(place);
  if (!c) throw new Error("Ese lugar no tiene coordenadas.");
  const nombre =
    textOf(place.displayName) || textOf(prediction.structuredFormat?.mainText) || textOf(prediction.text);
  sessionToken = null;
  return {
    placeId: place.id ?? "",
    nombre,
    direccion: place.formattedAddress || "",
    lat: c.lat,
    lng: c.lng,
    barrio: barrioFrom(place.addressComponents),
    telefono: place.nationalPhoneNumber ?? null,
  };
}

export function placesWebAvailable(): boolean {
  return Boolean(key) && typeof window !== "undefined";
}
