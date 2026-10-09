import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, space } from "@shared/design";
import { mensajeErrorEquipo, rpcResponderSolicitud } from "@shared/equipos";
import type { SolicitudItem } from "../../lib/equipos";
import { supabase } from "../../lib/supabase";
import { Button, TAB_BAR_CONTENT_INSET } from "../../ui";
import { Check, X, iconStroke } from "../../lib/icons";
import { useState } from "react";


type Props = {
  items: SolicitudItem[];
  onBack: () => void;
  onChanged: () => void;
  onAccept: (solicitudId: string, run: () => Promise<void>) => void;
};

export function InvitacionesScreen({ items, onBack, onChanged, onAccept }: Props) {
  const [error, setError] = useState<string | null>(null);

  const responder = async (id: string, aceptar: boolean) => {
    setError(null);
    const res = await rpcResponderSolicitud(supabase, id, aceptar);
    if (!res.ok) {
      setError(mensajeErrorEquipo(res.error));
      return;
    }
    onChanged();
  };

  return (
    <View style={[styles.page, { backgroundColor: colors.navy }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← Equipos</Text>
      </Pressable>
      <Text style={styles.h1}>Invitaciones</Text>
      <Text style={styles.lead}>Aceptá o rechazá cuando un capitán te invita al plantel.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {items.length === 0 ? (
        <Text style={styles.muted}>No tenés invitaciones pendientes.</Text>
      ) : (
        items.map((s) => (
          <View key={s.id} style={styles.card}>
            <Text style={styles.title}>{s.equipo_nombre ?? "Equipo"}</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Aceptar"
                  icon={<Check color={colors.navyDark} size={20} strokeWidth={iconStroke} />}
                  onPress={() => onAccept(s.id, () => responder(s.id, true))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Rechazar"
                  variant="danger"
                  icon={<X color={colors.danger} size={20} strokeWidth={iconStroke} />}
                  onPress={() => void responder(s.id, false)}
                />
              </View>
            </View>
          </View>
        ))
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.navyDark },
  scroll: { flex: 1, backgroundColor: "transparent" },
  content: { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 40 + TAB_BAR_CONTENT_INSET },
  back: { color: colors.gold, fontWeight: "700", marginBottom: 12 },
  h1: { fontSize: 26, fontWeight: "800", color: colors.white },
  lead: { marginTop: 8, marginBottom: 16, color: colors.textSecondary, lineHeight: 20 },
  muted: { color: colors.textSecondary },
  error: { color: colors.danger, marginBottom: 10 },
  card: {
    backgroundColor: "rgba(0,27,68,0.28)",
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.35)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#001B44",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8 },
  title: { fontWeight: "800", color: colors.white, marginBottom: 10 },
  row: { flexDirection: "row", gap: space[12] } });
