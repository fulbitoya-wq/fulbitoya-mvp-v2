import { useState } from "react";
import { Pressable, Text } from "react-native";
import { completePhoneSchema, firstZodError } from "@shared/validation/auth";
import { colors } from "@shared/design";
import { useAuth } from "../../auth/AuthProvider";
import { supabase } from "../../lib/supabase";
import { BrandLogo, Button, ErrorText, Field, Heading, Lead, Screen } from "../../ui";
import { typeStyle } from "../../ui/textStyle";
import { AuthBackBar } from "./AuthBackBar";

function abortAfter(ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(timer) };
}

export function CompletePhoneScreen() {
  const { session, profile, mergeProfile, signOut } = useAuth();
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    const parsed = completePhoneSchema.safeParse({ telefono });
    if (!parsed.success) {
      setError(firstZodError(parsed.error));
      return;
    }
    const userId = profile?.id ?? session?.user?.id;
    const email = profile?.email ?? session?.user?.email ?? "";
    if (!userId) {
      setError("No hay sesión. Cerrá sesión e ingresá de nuevo.");
      return;
    }

    const phone = parsed.data.telefono;
    setLoading(true);
    const { signal, cancel } = abortAfter(12000);

    try {
      const { data, error: updateErr } = await supabase
        .from("usuarios")
        .update({ telefono: phone })
        .eq("id", userId)
        .select("id, telefono")
        .maybeSingle()
        .abortSignal(signal);

      if (updateErr) {
        setError(updateErr.message);
        return;
      }

      if (!data) {
        const { error: insertErr } = await supabase
          .from("usuarios")
          .insert({
            id: userId,
            email,
            telefono: phone,
            rol: "jugador",
            origen_registro: "porlacancha",
          })
          .abortSignal(signal);
        if (insertErr) {
          setError(insertErr.message);
          return;
        }
      }

      mergeProfile({
        id: userId,
        email,
        telefono: phone,
        nombre: profile?.nombre ?? null,
        username: profile?.username ?? null,
        rol: profile?.rol ?? "jugador",
        origen_registro: profile?.origen_registro ?? "porlacancha",
        avatar_url: profile?.avatar_url ?? null,
        fecha_nacimiento: profile?.fecha_nacimiento ?? null,
        tiene_dni: profile?.tiene_dni ?? false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo guardar.";
      setError(
        msg.toLowerCase().includes("abort") ? "Tardó demasiado. Revisá la conexión y reintentá." : msg
      );
    } finally {
      cancel();
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <AuthBackBar onBack={() => signOut()} label="Cerrar sesión" />
      <BrandLogo size="sm" />
      <Heading>Tu teléfono</Heading>
      <Lead>Para coordinar partidos necesitamos un WhatsApp. Mínimo 6 dígitos (podés poner el 11).</Lead>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Field
        keyboardType="phone-pad"
        placeholder="Ej. 1123456789"
        value={telefono}
        onChangeText={setTelefono}
        onSubmitEditing={submit}
        returnKeyType="done"
      />
      <Button
        label={loading ? "Guardando..." : "Continuar"}
        onPress={submit}
        loading={loading}
        disabled={loading}
      />
      <Pressable onPress={() => signOut()} disabled={loading} style={{ marginTop: 20 }}>
        <Text style={typeStyle("bodySmall", colors.gold)}>Cerrar sesión</Text>
      </Pressable>
    </Screen>
  );
}
