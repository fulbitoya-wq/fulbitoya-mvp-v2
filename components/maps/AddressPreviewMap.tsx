"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";

interface AddressPreviewMapProps {
  lat: number;
  lng: number;
  draggable?: boolean;
  onPinChange?: (lat: number, lng: number) => void;
}

export function AddressPreviewMap({ lat, lng, draggable, onPinChange }: AddressPreviewMapProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const onPinChangeRef = useRef(onPinChange);
  onPinChangeRef.current = onPinChange;

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await loadGoogleMaps();
      } catch {
        return;
      }
      if (cancelled || !elRef.current) return;

      const center = new google.maps.LatLng(lat, lng);
      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(elRef.current, {
          center,
          zoom: 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        markerRef.current = new google.maps.Marker({
          map: mapRef.current,
          position: center,
          draggable: Boolean(draggable),
        });
        google.maps.event.addListener(markerRef.current, "dragend", () => {
          const pos = markerRef.current?.getPosition();
          if (!pos) return;
          onPinChangeRef.current?.(pos.lat(), pos.lng());
        });
        google.maps.event.addListener(mapRef.current, "click", (e?: google.maps.MapMouseEvent) => {
          if (!draggable || !e?.latLng) return;
          markerRef.current?.setPosition(e.latLng);
          onPinChangeRef.current?.(e.latLng.lat(), e.latLng.lng());
        });
        return;
      }

      mapRef.current.panTo(center);
      markerRef.current?.setPosition(center);
      markerRef.current?.setDraggable(Boolean(draggable));
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [lat, lng, draggable]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return null;

  return (
    <div>
      <div ref={elRef} className="mt-2 h-48 w-full overflow-hidden rounded-lg border border-[#E0E0E0] sm:h-56" />
      {draggable ? (
        <p className="mt-1 text-xs text-[#1A2E4A]/60">Arrastrá el pin o tocá el mapa para ajustar la ubicación.</p>
      ) : null}
    </div>
  );
}
