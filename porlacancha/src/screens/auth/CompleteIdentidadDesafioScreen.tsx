import { useEffect, useState } from "react";
import { firstZodError, identidadDesafioSchema } from "@shared/validation/auth";
import { mensajeErrorEquipo, rpcGuardarIdentidadDesafio, rpcMiEstadoEdad } from "@shared/equipos";
import { useAuth } from "../../auth/AuthProvider";
import { supabase } from "../../lib/supabase";
import { BrandLogo, Button, ErrorText, Field, Heading, Lead, Screen } from "../../ui";
import { AuthBackBar } from "./AuthBackBar";

type Props = {
  onDone: () => void;
  onCancel: () => void;
};

export function CompleteIdentidadDesafioScreen({ onDone, onCancel }: Props) {
  const { mergeProfile } = useAuth();
  const [fecha, setFecha] = useState("");
  const [dni, setDni] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void rpcMiEstadoEdad(supabase).then((res) => {
      if (cancelled || !res.ok) return;
      if (res.fecha_nacimiento) setFecha(String(res.fecha_nacimiento).slice(0, 10));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    setError(null);
    const parsed = identidadDesafioSchema.safeParse({ fechaNacimiento: fecha, dni });
    if (!parsed.success) {
      setError(firstZodError(parsed.error));
      return;
    }
    setLoading(true);
    const res = await rpcGuardarIdentidadDesafio(
      supabase,
      parsed.data.dni,
      parsed.data.fechaNacimiento
    );
    setLoading(false);
    if (!res.ok) {
      setError(mensajeErrorEquipo(res.error));
      return;
    }
    mergeProfile({ fecha_nacimiento: parsed.data.fechaNacimiento, tiene_dni: true });
    onDone();
  };

  return (
    <Screen scroll>
      <AuthBackBar onBack={onCancel} label="Volver" />
      <BrandLogo size="sm" />
      <Heading>Verificá tu identidad</Heading>
      <Lead>
        Para crear, aceptar o pagar un desafío por la cancha necesitás ser mayor de 18 y cargar DNI y fecha de
        nacimiento. El DNI no aparece en tu perfil ni en búsquedas.
      </Lead>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Field
        placeholder="Fecha de nacimiento (AAAA-MM-DD)"
        value={fecha}
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
        invalid={Boolean(error)}
        onChangeText={(v) => {
          setFecha(v);
          if (error) setError(null);
        }}
      />
      <Field
        placeholder="DNI (solo números)"
        value={dni}
        keyboardType="number-pad"
        autoCapitalize="none"
        invalid={Boolean(error)}
        onChangeText={(v) => {
          setDni(v.replace(/\D/g, "").slice(0, 8));
          if (error) setError(null);
        }}
      />
      <Button label={loading ? "Guardando..." : "Guardar y continuar"} onPress={submit} loading={loading} />
    </Screen>
  );
}
