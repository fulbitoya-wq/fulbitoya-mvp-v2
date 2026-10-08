/**
 * Google y Apple entran por el navegador de Supabase (OAuth).
 * No uses los SDK nativos: rompen Expo Go.
 * En Supabase hay que tener los dos proveedores activos y estas URLs de retorno:
 *   https://app.porlacancha.com/auth/callback
 *   porlacancha://auth/callback
 */
import { useState } from "react";
import { fontFamily } from "../../lib/fonts";
import { colors as palette, space } from "@shared/design";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";
import { showNotice } from "../../ui";

function GoogleMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
}

function AppleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        fill={palette.white}
        d="M16.37 12.23c.03 3.02 2.65 4.03 2.68 4.04-.02.07-.42 1.44-1.39 2.85-.83 1.22-1.7 2.43-3.06 2.46-1.34.03-1.77-.8-3.31-.8-1.53 0-2.01.77-3.28.83-1.32.06-2.32-1.32-3.16-2.53-1.72-2.48-3.04-7-1.27-10.06.88-1.52 2.45-2.48 4.16-2.51 1.3-.02 2.52.87 3.31.87.79 0 2.27-1.08 3.83-.92.65.03 2.48.26 3.65 1.98-.09.06-2.18 1.27-2.16 3.79ZM13.9 5.72c.7-.85 1.17-2.03 1.04-3.22-1.01.04-2.23.67-2.96 1.52-.65.75-1.22 1.95-1.07 3.1 1.13.09 2.29-.57 2.99-1.4Z"
      />
    </Svg>
  );
}

export function SocialAuthButtons() {
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);

  const entrar = async (provider: "google" | "apple") => {
    if (busy) return;
    setBusy(provider);
    const redirectTo =
      Platform.OS === "web" && typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : Linking.createURL("auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: Platform.OS !== "web",
      },
    });
    if (error || !data?.url) {
      setBusy(null);
      showNotice("No se pudo entrar", "Revisá que Google o Apple estén activos en Supabase.");
      return;
    }
    if (Platform.OS !== "web") {
      await Linking.openURL(data.url);
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.sep} accessibilityRole="none">
        <View style={styles.sepLine} />
        <Text style={styles.sepTxt}>O</Text>
        <View style={styles.sepLine} />
      </View>
      <Pressable
        style={({ pressed }) => [styles.google, pressed && styles.pressed, busy === "google" && styles.pressed]}
        disabled={busy !== null}
        onPress={() => void entrar("google")}
        accessibilityRole="button"
        accessibilityLabel="Continuar con Google"
      >
        <View style={styles.side}>
          <GoogleMark />
        </View>
        <Text style={styles.googleTxt}>Continuar con Google</Text>
        <View style={styles.side} />
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.apple, pressed && styles.pressed, busy === "apple" && styles.pressed]}
        disabled={busy !== null}
        onPress={() => void entrar("apple")}
        accessibilityRole="button"
        accessibilityLabel="Continuar con Apple"
      >
        <View style={styles.side}>
          <AppleMark />
        </View>
        <Text style={styles.appleTxt}>Continuar con Apple</Text>
        <View style={styles.side} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space[8], gap: 10 },
  sep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 6,
  },
  sepLine: { flex: 1, height: StyleSheet.hairlineWidth + 0.5, backgroundColor: "rgba(255,255,255,0.15)" },
  sepTxt: {
    color: palette.textSecondary,
    fontFamily: fontFamily.ui,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  google: {
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.white,
    flexDirection: "row",
    alignItems: "center",
  },
  apple: {
    height: 52,
    borderRadius: 26,
    backgroundColor: "#000000",
    flexDirection: "row",
    alignItems: "center",
  },
  side: { width: 48, alignItems: "center", justifyContent: "center" },
  googleTxt: {
    flex: 1,
    textAlign: "center",
    color: palette.navyDark,
    fontFamily: fontFamily.uiSemibold,
    fontSize: 15,
  },
  appleTxt: {
    flex: 1,
    textAlign: "center",
    color: palette.white,
    fontFamily: fontFamily.uiSemibold,
    fontSize: 15,
  },
  pressed: { transform: [{ scale: 0.97 }] },
});
