import { useState } from "react";
import { Pressable, Text } from "react-native";
import { firstZodError, registerSchema } from "@shared/validation/auth";
import { colors } from "@shared/design";
import { supabase } from "../../lib/supabase";
import { emailRedirectConfirm } from "../../lib/web-url";
import { AuthScreen, BrandLogo, Button, Field, Heading, Lead } from "../../ui";
import { typeStyle } from "../../ui/textStyle";
import { AuthBackBar } from "./AuthBackBar";
import { AuthNoticeModal } from "./AuthNoticeModal";
import { SocialAuthButtons } from "./SocialAuthButtons";

type Props = { onGoLogin: () => void; onSkip?: () => void };

function mapSignupError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("menor_13")) return "Tenés que tener al menos 13 años para crear una cuenta.";
  if (m.includes("fecha_nacimiento")) return "Revisá la fecha de nacimiento (AAAA-MM-DD).";
  return message;
}

export function RegisterScreen({ onGoLogin, onSkip }: Props) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const goHome = () => {
    if (onSkip) onSkip();
    else onGoLogin();
  };

  const submit = async () => {
    setError(null);
    const parsed = registerSchema.safeParse({ nombre, email, password, fechaNacimiento });
    if (!parsed.success) {
      setError(firstZodError(parsed.error));
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: emailRedirectConfirm(),
        data: {
          nombre: parsed.data.nombre,
          origen_registro: "porlacancha",
          fecha_nacimiento: parsed.data.fechaNacimiento,
        },
      },
    });
    setLoading(false);
    if (err) {
      setError(mapSignupError(err.message));
      return;
    }
    setDone(true);
  };

  const onChangeClear = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    if (error) setError(null);
  };

  return (
    <AuthScreen>
      <AuthBackBar onBack={onGoLogin} label="Volver a ingresar" />
      <BrandLogo size="md" />
      <Heading>Crear cuenta</Heading>
      <Lead>Desde los 13 años. La fecha de nacimiento no se muestra en tu perfil público.</Lead>
      <Field leftIcon="user" placeholder="Nombre" value={nombre} invalid={Boolean(error)} onChangeText={onChangeClear(setNombre)} />
      <Field
        leftIcon="mail"
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
        value={email}
        invalid={Boolean(error)}
        onChangeText={onChangeClear(setEmail)}
      />
      <Field
        placeholder="Fecha de nacimiento (AAAA-MM-DD)"
        value={fechaNacimiento}
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
        invalid={Boolean(error)}
        onChangeText={onChangeClear(setFechaNacimiento)}
      />
      <Field
        leftIcon="lock"
        secureTextEntry
        placeholder="Contraseña (mín. 8)"
        value={password}
        invalid={Boolean(error)}
        error={error}
        onChangeText={onChangeClear(setPassword)}
      />
      <Button label={loading ? "Creando..." : "Registrarme"} onPress={submit} loading={loading} />
      <SocialAuthButtons />
      <Pressable onPress={onGoLogin} style={{ marginTop: 20 }}>
        <Text style={typeStyle("bodySmall", colors.sky)}>Ya tengo cuenta</Text>
      </Pressable>
      {onSkip ? (
        <Pressable onPress={onSkip} style={{ marginTop: 22 }}>
          <Text style={typeStyle("bodySmall", colors.sky)}>Seguir mirando sin cuenta</Text>
        </Pressable>
      ) : null}
      <AuthNoticeModal
        visible={done}
        title="Cuenta creada con éxito"
        body="Te mandamos un mail para confirmar. Abrí el link y después ingresá con tu email."
        primaryLabel="Volver al inicio"
        onPrimary={goHome}
        secondaryLabel="Ir a ingresar"
        onSecondary={onGoLogin}
      />
    </AuthScreen>
  );
}
