import { useState } from "react";
import { Pressable, Text } from "react-native";
import { completeBirthdateSchema, firstZodError } from "@shared/validation/auth";
import { mensajeErrorEquipo, rpcGuardarFechaNacimiento } from "@shared/equipos";
import { colors } from "@shared/design";
import { useAuth } from "../../auth/AuthProvider";
import { supabase } from "../../lib/supabase";
import { BirthdateField, BrandLogo, Button, ErrorText, Heading, Lead, Screen } from "../../ui";
import { typeStyle } from "../../ui/textStyle";
import { AuthBackBar } from "./AuthBackBar";

type Props = { onDone?: () => void };

export function CompleteBirthdateScreen({ onDone }: Props) {
  const { signOut, mergeProfile } = useAuth();
  const [fecha, setFecha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    const parsed = completeBirthdateSchema.safeParse({ fechaNacimiento: fecha });
    if (!parsed.success) {
      setError(firstZodError(parsed.error));
      return;
    }
    setLoading(true);
    const res = await rpcGuardarFechaNacimiento(supabase, parsed.data.fechaNacimiento);
    setLoading(false);
    if (!res.ok) {
      setError(mensajeErrorEquipo(res.error));
      return;
    }
    mergeProfile({ fecha_nacimiento: parsed.data.fechaNacimiento });
    onDone?.();
  };

  return (
    <Screen scroll>
      <AuthBackBar onBack={() => signOut()} label="Cerrar sesión" />
      <BrandLogo size="sm" />
      <Heading>Tu fecha de nacimiento</Heading>
      <Lead>La necesitamos para reservar y jugar. Tenés que tener al menos 13 años. No la mostramos en tu perfil público.</Lead>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <BirthdateField
        value={fecha}
        onChange={(v) => {
          setFecha(v);
          if (error) setError(null);
        }}
      />
      <Button label={loading ? "Guardando..." : "Continuar"} onPress={submit} loading={loading} />
      <Pressable onPress={() => signOut()} style={{ marginTop: 20 }}>
        <Text style={typeStyle("bodySmall", colors.sky)}>Cerrar sesión</Text>
      </Pressable>
    </Screen>
  );
}
