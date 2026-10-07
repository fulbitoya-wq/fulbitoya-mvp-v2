"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadGooglePlacesLib,
  type PlaceNew,
  type PlacePrediction,
} from "@/lib/google-maps";

export interface PlaceSelection {
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId: string | null;
  barrio: string | null;
}

interface PlacesAutocompleteInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onPlaceSelected: (place: PlaceSelection) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

type AddressPiece = { longText?: string; long_name?: string; types: string[] };

function barrioFromComponents(components: AddressPiece[] | undefined): string | null {
  if (!components) return null;
  const subtype =
    components.find((c) => c.types.includes("neighborhood")) ||
    components.find((c) => c.types.includes("sublocality_level_1")) ||
    components.find((c) => c.types.includes("locality"));
  return subtype?.longText ?? subtype?.long_name ?? null;
}

function predictionLabel(pred: PlacePrediction): string {
  const text = pred.text;
  if (!text) return "";
  return typeof text === "string" ? text : text.toString();
}

function coordsFromPlace(place: PlaceNew): { lat: number; lng: number } | null {
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

function displayNameText(place: PlaceNew): string {
  const n = place.displayName;
  if (!n) return "";
  return typeof n === "string" ? n : n.text ?? "";
}

export function PlacesAutocompleteInput({
  id,
  value,
  onChange,
  onPlaceSelected,
  placeholder = "Buscá una dirección...",
  required,
  className,
}: PlacesAutocompleteInputProps) {
  const [hints, setHints] = useState<PlacePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const tokenRef = useRef<unknown>(null);
  const reqIdRef = useRef(0);
  const skipFetchRef = useRef(false);
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  const onChangeRef = useRef(onChange);
  onPlaceSelectedRef.current = onPlaceSelected;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setHints([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        const requestId = ++reqIdRef.current;
        try {
          const places = await loadGooglePlacesLib();
          if (!tokenRef.current && places.AutocompleteSessionToken) {
            tokenRef.current = new places.AutocompleteSessionToken();
          }
          const { suggestions } = await places.AutocompleteSuggestion!.fetchAutocompleteSuggestions({
            input: q,
            includedRegionCodes: ["AR"],
            language: "es-AR",
            region: "AR",
            sessionToken: tokenRef.current ?? undefined,
          });
          if (requestId !== reqIdRef.current) return;
          setMapsError(null);
          setHints(suggestions.map((s) => s.placePrediction).filter((p): p is PlacePrediction => Boolean(p)));
          setOpen(true);
        } catch (err) {
          if (requestId !== reqIdRef.current) return;
          setHints([]);
          setMapsError(err instanceof Error ? err.message : "No se pudo cargar Google Maps.");
        }
      })();
    }, 220);
    return () => window.clearTimeout(handle);
  }, [value]);

  const pick = async (pred: PlacePrediction) => {
    setOpen(false);
    setHints([]);
    try {
      const place = pred.toPlace();
      await place.fetchFields({
        fields: ["formattedAddress", "location", "id", "addressComponents", "displayName"],
      });
      const coords = coordsFromPlace(place);
      const address = place.formattedAddress || predictionLabel(pred) || displayNameText(place) || value;
      skipFetchRef.current = true;
      onChangeRef.current(address);
      if (coords) {
        onPlaceSelectedRef.current({
          formattedAddress: address,
          lat: coords.lat,
          lng: coords.lng,
          placeId: place.id ?? null,
          barrio: barrioFromComponents(place.addressComponents),
        });
      }
      tokenRef.current = null;
    } catch (err) {
      setMapsError(err instanceof Error ? err.message : "No se pudo completar la dirección.");
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (hints.length) setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 180);
        }}
        className={
          className ??
          "mt-1 w-full rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-[#1A2E4A] focus:border-[#4CAF50] focus:outline-none focus:ring-1 focus:ring-[#4CAF50]"
        }
      />
      {open && hints.length > 0 ? (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[#E0E0E0] bg-white py-1 shadow-lg">
          {hints.map((pred, i) => {
            const label = predictionLabel(pred);
            return (
              <li key={`${label}-${i}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-[#1A2E4A] hover:bg-[#F5F5F5]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pick(pred)}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {mapsError ? <p className="mt-1 text-xs text-red-700">{mapsError}</p> : null}
    </div>
  );
}
