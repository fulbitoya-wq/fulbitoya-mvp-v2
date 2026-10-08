import { Platform, Share } from "react-native";
import { showNotice } from "../ui";

export async function compartirTexto(message: string) {
  try {
    await Share.share({ message });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    const unsupported = /not supported/i.test(msg);
    if (
      Platform.OS === "web" &&
      unsupported &&
      typeof navigator !== "undefined" &&
      navigator.clipboard
    ) {
      await navigator.clipboard.writeText(message);
      showNotice("Copiado", "El texto quedó en el portapapeles.");
    }
  }
}
