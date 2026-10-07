import { useState } from "react";
import { Pressable, Text } from "react-native";
import { firstZodError } from "@shared/validation/auth";
import { guardarUsername, normalizeUsername, usernameSchema } from "@shared/equipos";
import { colors } from "@shared/design";
import { useAuth } from "../../auth/AuthProvider";
import { supabase } from "../../lib/supabase";
import { BrandLogo, Button, ErrorText, Field, Heading, Lead, Screen } from "../../ui";
import { typeStyle } from "../../ui/textStyle";
import { AuthBackBar } from "./AuthBackBar";

export function CompleteUsernameScreen() {
  const { session, profile, mergeProfile, refreshProfile, signOut } = useAuth();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    const normalized = normalizeUsername(username);
    if (normalized !== username) setUsername(normalized);

    const parsed = usernameSchema.safeParse(normalized);
    if (!parsed.success) {
      setError(firstZodError(parsed.error) || "Username inválido.");
      return;
    }

    const userId = profile?.id ?? session?.user?.id;
    if (!userId) {
      setError("No hay sesión. Cerrá sesión e ingresá de nuevo.");
      return;
    }

    setLoading(true);
    try {
      const res = await Promise.race([
        guardarUsername(supabase, userId, parsed.data),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("abort")), 12000);
        }),
      ]);
      if (!res.ok) {
        setError(res.error);
        return;
      }

      mergeProfile({
        id: userId,
        email: profile?.email ?? session?.user?.email ?? "",
        nombre: profile?.nombre ?? null,
        telefono: profile?.telefono ?? null,
        username: res.username,
        rol: profile?.rol ?? "jugador",
        origen_registro: profile?.origen_registro ?? "porlacancha",
        avatar_url: profile?.avatar_url ?? null,
        fecha_nacimiento: profile?.fecha_nacimiento ?? null,
        tiene_dni: profile?.tiene_dni ?? false,
      });

      try {
        await Promise.race([
          refreshProfile(),
          new Promise<void>((resolve) => setTimeout(resolve, 8000)),
        ]);
      } catch {
        // El merge ya desbloquea la navegación si el re-fetch se cuelga.
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo guardar.";
      setError(
        msg.toLowerCase().includes("abort")
          ? "Tardó demasiado. Revisá la conexión y reintentá."
          : msg || "No se pudo guardar el username."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <AuthBackBar onBack={() => signOut()} label="Cerrar sesión" />
      <BrandLogo size="sm" />
      <Heading>Elegí tu username</Heading>
      <Lead>
        En PorLaCancha el equipo te invita por username o teléfono. Tiene que ser único: minúsculas,
        números y guion bajo.
      </Lead>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Field
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="ej. pablo_9"
        value={username}
        onChangeText={(t) => {
          setUsername(t);
          if (error) setError(null);
        }}
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
