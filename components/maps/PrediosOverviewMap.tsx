"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";

export interface PredioMapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
}

export function PrediosOverviewMap({
  pins,
  selectedId,
  onSelect,
}: {
  pins: PredioMapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!pins.length) return;
      try {
        await loadGoogleMaps();
      } catch {
        return;
      }
      if (cancelled || !elRef.current) return;

      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(elRef.current, {
          center: { lat: pins[0].lat, lng: pins[0].lng },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
      }

      for (const m of markersRef.current) {
        google.maps.event.clearInstanceListeners(m);
        m.setMap(null);
      }
      markersRef.current = [];

      const bounds = new google.maps.LatLngBounds();
      for (const pin of pins) {
        const pos = { lat: pin.lat, lng: pin.lng };
        bounds.extend(pos);
        const marker = new google.maps.Marker({
          map: mapRef.current,
          position: pos,
          title: pin.title,
        });
        google.maps.event.addListener(marker, "click", () => {
          onSelectRef.current?.(pin.id);
        });
        markersRef.current.push(marker);
      }

      if (pins.length === 1) {
        mapRef.current.panTo({ lat: pins[0].lat, lng: pins[0].lng });
        mapRef.current.setZoom(15);
      } else if (!bounds.isEmpty()) {
        mapRef.current.fitBounds(bounds, 48);
      }

      const selected = pins.find((p) => p.id === selectedId);
      if (selected) {
        mapRef.current.panTo({ lat: selected.lat, lng: selected.lng });
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [pins, selectedId]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || pins.length === 0) return null;

  return <div ref={elRef} className="h-56 w-full overflow-hidden rounded-xl border border-[#E0E0E0] sm:h-72" />;
}
