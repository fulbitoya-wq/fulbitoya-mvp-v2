import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { completeBirthdateSchema, firstZodError, identidadDesafioSchema } from "@shared/validation/auth";
import { mensajeErrorEquipo, rpcGuardarFechaNacimiento, rpcGuardarIdentidadDesafio } from "@shared/equipos";
import { colors, radius, space } from "@shared/design";
import type { JugateLaProfile } from "../../auth/AuthProvider";
import { useAuth } from "../../auth/AuthProvider";
import { ChevronLeft, iconStroke } from "../../lib/icons";
import type { FootballProfile } from "../../lib/perfil";
import { supabase } from "../../lib/supabase";
import { BirthdateField, Button, Card, ErrorText, Field, IconBtn, Mute, showNotice } from "../../ui";
import { typeStyle } from "../../ui/textStyle";

const SOPORTE = "https://porlacancha.com/soporte";

type Props = {
  profile: JugateLaProfile;
  football: FootballProfile;
  onBack: () => void;
  onUpdated: (patch: { fechaNacimiento?: string | null; tieneDni?: boolean }) => void;
};

export function DatosPersonalesScreen({ profile, football, onBack, onUpdated }: Props) {
  const insets = useSafeAreaInsets();
  const { mergeProfile } = useAuth();
  const tieneDni = Boolean(profile.tiene_dni);
  const [fecha, setFecha] = useState(football.fechaNacimiento ?? profile.fecha_nacimiento ?? "");
  const [dni, setDni] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modoDni, setModoDni] = useState(false);

  const guardarFecha = async () => {
    setError(null);
    const parsed = completeBirthdateSchema.safeParse({ fechaNacimiento: fecha });
    if (!parsed.success) {
      setError(firstZodError(parsed.error));
      return;
    }
    setBusy(true);
    const res = await rpcGuardarFechaNacimiento(supabase, parsed.data.fechaNacimiento);
    setBusy(false);
    if (!res.ok) {
      setError(mensajeErrorEquipo(res.error));
      return;
    }
    mergeProfile({ fecha_nacimiento: parsed.data.fechaNacimiento });
    onUpdated({ fechaNacimiento: parsed.data.fechaNacimiento });
    showNotice("Listo", "Guardamos tu fecha de nacimiento.");
  };

  const guardarDni = async () => {
    setError(null);
    const parsed = identidadDesafioSchema.safeParse({ fechaNacimiento: fecha, dni });
    if (!parsed.success) {
      setError(firstZodError(parsed.error));
      return;
    }
    setBusy(true);
    const res = await rpcGuardarIdentidadDesafio(supabase, parsed.data.dni, parsed.data.fechaNacimiento);
    setBusy(false);
    if (!res.ok) {
      setError(mensajeErrorEquipo(res.error));
      return;
    }
    mergeProfile({ fecha_nacimiento: parsed.data.fechaNacimiento, tiene_dni: true });
    onUpdated({ fechaNacimiento: parsed.data.fechaNacimiento, tieneDni: true });
    setDni("");
    setModoDni(false);
    showNotice("Listo", "Guardamos tu DNI. No se muestra en tu perfil público.");
  };

  return (
    <View style={styles.fill}>
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, space[8]) }]}>
        <IconBtn onPress={onBack} label="Volver">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </IconBtn>
        <Text style={styles.title}>Datos personales</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[16], paddingBottom: insets.bottom + space[40] }}>
        <Mute>
          Esta sección es privada. La fecha de nacimiento y el DNI no aparecen en perfiles ni en búsquedas.
        </Mute>

        <Card style={{ marginTop: space[16] }}>
          <Text style={styles.h}>Fecha de nacimiento</Text>
          <Mute>Obligatoria. Tenés que tener al menos 13 años.</Mute>
          {error && !modoDni ? <ErrorText>{error}</ErrorText> : null}
          <View style={{ marginTop: space[12], gap: space[12] }}>
            <BirthdateField
              value={fecha}
              onChange={(v) => {
                setFecha(v);
                if (error) setError(null);
              }}
            />
            <Button
              label={busy && !modoDni ? "Guardando..." : "Guardar fecha"}
              onPress={() => void guardarFecha()}
              loading={busy && !modoDni}
            />
          </View>
        </Card>

        <Card style={{ marginTop: space[16] }}>
          <Text style={styles.h}>DNI</Text>
          <Mute>
            Solo hace falta para desafíos por la cancha (mayores de 18). Una vez cargado no se puede cambiar
            desde la app.
          </Mute>
          {tieneDni ? (
            <View style={{ marginTop: space[12], gap: space[8] }}>
              <Text style={styles.val}>Cargado</Text>
              <Mute>Para corregirlo escribinos a soporte.</Mute>
              <Pressable onPress={() => void Linking.openURL(SOPORTE)} accessibilityRole="link">
                <Text style={styles.link}>Ir a soporte</Text>
              </Pressable>
            </View>
          ) : modoDni ? (
            <View style={{ marginTop: space[12], gap: space[12] }}>
              {error ? <ErrorText>{error}</ErrorText> : null}
              <Mute>Confirmá tu fecha de nacimiento e ingresá el DNI (solo números).</Mute>
              <BirthdateField
                value={fecha}
                onChange={(v) => {
                  setFecha(v);
                  if (error) setError(null);
                }}
              />
              <Field
                placeholder="DNI (7 u 8 números)"
                value={dni}
                keyboardType="number-pad"
                autoCapitalize="none"
                onChangeText={(v) => {
                  setDni(v.replace(/\D/g, "").slice(0, 8));
                  if (error) setError(null);
                }}
              />
              <Button
                label={busy ? "Guardando..." : "Guardar DNI"}
                onPress={() => void guardarDni()}
                loading={busy}
              />
              <Button label="Cancelar" variant="ghost" onPress={() => setModoDni(false)} />
            </View>
          ) : (
            <View style={{ marginTop: space[12] }}>
              <Text style={styles.val}>No cargado</Text>
              <View style={{ marginTop: space[12] }}>
                <Button label="Cargar DNI" onPress={() => setModoDni(true)} />
              </View>
            </View>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navy },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[8],
    paddingBottom: space[8],
  },
  title: { ...typeStyle("h3", colors.white), flex: 1, textAlign: "center" },
  h: { ...typeStyle("h3", colors.white), marginBottom: space[4] },
  val: { ...typeStyle("body", colors.sky) },
  link: { ...typeStyle("bodySmall", colors.gold), textDecorationLine: "underline" },
});
