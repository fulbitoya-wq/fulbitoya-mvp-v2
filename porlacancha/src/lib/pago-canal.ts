import { Platform } from "react-native";

/** Computadora de escritorio: el pago se muestra como QR. Celular y app nativa abren Mercado Pago. */
export function pagoEnComputadora(): boolean {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
  if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) return false;
  return true;
}
