import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { supabase } from "./supabase";

function paramsFromUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parsed = Linking.parse(url);
  const qp = parsed.queryParams ?? {};
  for (const [k, v] of Object.entries(qp)) {
    if (typeof v === "string") out[k] = v;
  }
  const hash = url.split("#")[1];
  if (hash) {
    const sp = new URLSearchParams(hash);
    sp.forEach((val, key) => {
      out[key] = val;
    });
  }
  return out;
}

export async function handleAuthCallbackUrl(url: string | null) {
  if (!url || !url.includes("auth/callback")) return;

  const params = paramsFromUrl(url);
  const code = params.code;
  const access_token = params.access_token;
  const refresh_token = params.refresh_token;

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    limpiarUrlDeAuth();
    return;
  }
  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
    limpiarUrlDeAuth();
  }
}

function limpiarUrlDeAuth() {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  window.history.replaceState({}, "", "/");
}
