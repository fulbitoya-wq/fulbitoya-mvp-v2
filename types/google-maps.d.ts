export {};

declare global {
  interface Window {
    google: typeof google;
  }

  namespace google.maps {
    function importLibrary(name: string, ...rest: unknown[]): Promise<unknown>;
    class Map {
      constructor(el: HTMLElement, opts?: Record<string, unknown>);
      fitBounds(bounds: LatLngBounds, padding?: number): void;
      panTo(latLng: LatLng | LatLngLiteral): void;
      setZoom(zoom: number): void;
      addListener(event: string, handler: (e: MapMouseEvent) => void): void;
    }
    interface MapMouseEvent {
      latLng?: LatLng | null;
    }
    class Marker {
      constructor(opts?: Record<string, unknown>);
      setPosition(latLng: LatLng | LatLngLiteral): void;
      getPosition(): LatLng | null;
      setDraggable(draggable: boolean): void;
      setMap(map: Map | null): void;
      addListener(event: string, handler: () => void): void;
    }
    class LatLngBounds {
      extend(latLng: LatLng | LatLngLiteral): void;
      isEmpty(): boolean;
    }
    class OverlayView {
      setMap(map: Map | null): void;
      getPanes(): {
        overlayMouseTarget: HTMLElement;
        floatPane: HTMLElement;
      } | null;
      getProjection(): {
        fromLatLngToDivPixel(latLng: LatLng | LatLngLiteral): { x: number; y: number } | null;
      };
      draw(): void;
      onAdd(): void;
      onRemove(): void;
    }
    class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }
    interface LatLngLiteral {
      lat: number;
      lng: number;
    }
    namespace places {
      class Autocomplete {
        constructor(input: HTMLInputElement, opts?: Record<string, unknown>);
        addListener(event: string, handler: () => void): void;
        getPlace(): {
          place_id?: string;
          formatted_address?: string;
          geometry?: { location?: { lat(): number; lng(): number } };
          address_components?: Array<{ long_name: string; types: string[] }>;
        };
      }
    }
    namespace event {
      function addListener(instance: unknown, event: string, handler: (e?: MapMouseEvent) => void): void;
      function clearInstanceListeners(instance: unknown): void;
    }
  }
}
