const SCRIPT_ID = "google-maps-js";

type MapsBootstrap = {
  importLibrary: (name: string, ...rest: unknown[]) => Promise<unknown>;
  __ib__?: () => void;
};

export function getGoogleMapsApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key ? key : null;
}

function mapsNs(): MapsBootstrap | undefined {
  return window.google?.maps as unknown as MapsBootstrap | undefined;
}

function installMapsBootstrap(key: string) {
  const win = window as unknown as { google: { maps: MapsBootstrap } };
  win.google = win.google ?? { maps: {} as MapsBootstrap };
  win.google.maps = win.google.maps ?? ({} as MapsBootstrap);
  const d = win.google.maps;
  if (typeof d.importLibrary === "function") return;

  let loading: Promise<void> | null = null;
  const bootstrapImport = (name: string, ...rest: unknown[]) => {
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
        script.id = SCRIPT_ID;
        script.async = true;
        script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
        script.onerror = () => reject(new Error("No se pudo cargar Google Maps."));
        document.head.appendChild(script);
      });
    }
    return loading.then(() => {
      if (d.importLibrary === bootstrapImport) {
        throw new Error("No se pudo cargar Google Maps.");
      }
      return d.importLibrary(name, ...rest);
    });
  };
  d.importLibrary = bootstrapImport;
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps solo corre en el navegador."));
  }

  const key = getGoogleMapsApiKey();
  if (!key) {
    return Promise.reject(
      new Error("Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en este deploy. Cargala en Vercel y volvé a buildear."),
    );
  }

  const pending = (window as unknown as { __gmapsLoader?: Promise<typeof google> }).__gmapsLoader;
  if (pending) return pending;

  const loader = (async () => {
    installMapsBootstrap(key);
    const maps = mapsNs();
    if (!maps?.importLibrary) {
      throw new Error("No se pudo cargar Google Maps.");
    }
    await maps.importLibrary("maps");
    return window.google;
  })();

  (window as unknown as { __gmapsLoader?: Promise<typeof google> }).__gmapsLoader = loader;
  return loader;
}

type PlacesLib = {
  AutocompleteSuggestion?: {
    fetchAutocompleteSuggestions: (req: Record<string, unknown>) => Promise<{
      suggestions: Array<{ placePrediction?: PlacePrediction }>;
    }>;
  };
  AutocompleteSessionToken?: new () => unknown;
};

export type PlacePrediction = {
  text?: { toString: () => string } | string;
  toPlace: () => PlaceNew;
};

export type PlaceNew = {
  fetchFields: (opts: { fields: string[] }) => Promise<void>;
  location?: { lat: (() => number) | number; lng: (() => number) | number; toJSON?: () => { lat: number; lng: number } } | null;
  formattedAddress?: string;
  displayName?: string | { text?: string };
  id?: string;
  addressComponents?: Array<{ longText?: string; long_name?: string; types: string[] }>;
};

export async function loadGooglePlacesLib(): Promise<PlacesLib> {
  await loadGoogleMaps();
  const maps = mapsNs();
  if (!maps?.importLibrary) {
    throw new Error("No se pudo cargar Google Maps.");
  }
  const places = (await maps.importLibrary("places")) as PlacesLib;
  if (!places.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    throw new Error("Falta Places API (New) en la key de Google.");
  }
  return places;
}

export function formatPremioArs(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPremioPin(value: number): string {
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

export const MATCH_TIPO_LABEL: Record<string, string> = {
  f5: "Fútbol 5",
  f7: "Fútbol 7",
  f9: "Fútbol 9",
  f11: "Fútbol 11",
};
