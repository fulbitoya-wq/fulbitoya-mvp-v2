import { useCallback, useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors } from "@shared/design";
import {
  enlaceCompartirEquipo,
  invitarJugadorSchema,
  mensajeErrorEquipo,
  rpcExpulsarJugador,
  rpcGenerarEnlaceEquipo,
  rpcInvitarJugador,
  rpcInvitarSinCuenta,
  rpcResponderSolicitud,
  rpcSalirDelEquipo,
  rpcTransferirCapitania,
} from "@shared/equipos";
import { firstZodError } from "@shared/validation/auth";
import { useAuth } from "../../auth/AuthProvider";
import { compartirTexto } from "../../lib/share-text";
import {
  getEquipoDetalle,
  listSolicitudesEntrada,
  type MiembroPlantel,
  type SolicitudItem,
} from "../../lib/equipos";
import { supabase } from "../../lib/supabase";
import { showConfirm, showNotice, TAB_BAR_CONTENT_INSET } from "../../ui";

type Props = {
  equipoId: string;
  onBack: () => void;
  onLeft: () => void;
  onBuscarJugadores?: () => void;
};

export function EquipoDetalleScreen({ equipoId, onBack, onLeft, onBuscarJugadores }: Props) {
  const { profile } = useAuth();
  const [nombre, setNombre] = useState("");
  const [escudo, setEscudo] = useState<string | null>(null);
  const [formato, setFormato] = useState<string | null>(null);
  const [miembros, setMiembros] = useState<MiembroPlantel[]>([]);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudItem[]>([]);
  const [identificador, setIdentificador] = useState("");
  const [invitadoNombre, setInvitadoNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const soyCapitan =
    miembros.find((m) => m.usuario_id === profile?.id)?.rol === "capitan";

  const load = useCallback(async () => {
    setLoading(true);
    const det = await getEquipoDetalle(equipoId);
    setNombre(det.equipo?.nombre ?? "Equipo");
    setEscudo(det.equipo?.escudo_url ?? null);
    setFormato(det.equipo?.formato_habitual ?? null);
    setMiembros(det.miembros);
    setEnlace(det.enlaceToken);
    const capitan = det.miembros.find((m) => m.usuario_id === profile?.id)?.rol === "capitan";
    if (capitan) {
      setSolicitudes(await listSolicitudesEntrada(equipoId));
    } else {
      setSolicitudes([]);
    }
    setLoading(false);
  }, [equipoId, profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const fail = (code: string) => setError(mensajeErrorEquipo(code));

  const generarEnlace = async () => {
    setError(null);
    const res = await rpcGenerarEnlaceEquipo(supabase, equipoId);
    if (!res.ok) return fail(res.error);
    setEnlace(res.token);
  };

  const compartirEnlace = async () => {
    if (!enlace) return;
    const url = enlaceCompartirEquipo(enlace, process.env.EXPO_PUBLIC_WEB_URL);
    await compartirTexto(`Sumate a ${nombre} en PorLaCancha: ${url}`);
  };

  const invitar = async () => {
    setError(null);
    const parsed = invitarJugadorSchema.safeParse({ equipo_id: equipoId, identificador });
    if (!parsed.success) {
      setError(firstZodError(parsed.error));
      return;
    }
    const res = await rpcInvitarJugador(supabase, equipoId, parsed.data.identificador);
    if (!res.ok) return fail(res.error);
    setIdentificador("");
    showNotice("Listo", "Invitación enviada.");
  };

  const invitarSinCuenta = async () => {
    setError(null);
    const nombreInv = invitadoNombre.trim();
    if (!nombreInv) {
      setError("Poné el nombre del invitado.");
      return;
    }
    const res = await rpcInvitarSinCuenta(supabase, equipoId, nombreInv);
    if (!res.ok) return fail(res.error);
    setInvitadoNombre("");
    const token = typeof res.claim_token === "string" ? res.claim_token : "";
    if (token && enlace) {
      const url = enlaceCompartirEquipo(enlace, process.env.EXPO_PUBLIC_WEB_URL);
      await compartirTexto(
        `Sumate a ${nombre} en PorLaCancha (soy ${nombreInv}): ${url}`
      );
    }
    showNotice("Listo", `${nombreInv} quedó como invitado hasta que se registre.`);
    await load();
  };

  const responder = async (id: string, aceptar: boolean) => {
    setError(null);
    const res = await rpcResponderSolicitud(supabase, id, aceptar);
    if (!res.ok) return fail(res.error);
    await load();
  };

  const transferir = (usuarioId: string) => {
    showConfirm({
      title: "Transferir capitanía",
      body: "Ese jugador pasa a ser capitán.",
      confirmLabel: "Transferir",
      onConfirm: () => {
        void (async () => {
          const res = await rpcTransferirCapitania(supabase, equipoId, usuarioId);
          if (!res.ok) return fail(res.error);
          await load();
        })();
      },
    });
  };

  const expulsar = (usuarioId: string) => {
    showConfirm({
      title: "Expulsar",
      body: "Sale del plantel.",
      confirmLabel: "Expulsar",
      danger: true,
      onConfirm: () => {
        void (async () => {
          const res = await rpcExpulsarJugador(supabase, equipoId, usuarioId);
          if (!res.ok) return fail(res.error);
          await load();
        })();
      },
    });
  };

  const salir = () => {
    showConfirm({
      title: "Salir del equipo",
      body: "Vas a dejar de figurar en el plantel.",
      confirmLabel: "Salir",
      danger: true,
      onConfirm: () => {
        void (async () => {
          const res = await rpcSalirDelEquipo(supabase, equipoId);
          if (!res.ok) return fail(res.error);
          onLeft();
        })();
      },
    });
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← Equipos</Text>
      </Pressable>
      <View style={styles.head}>
        {escudo ? <Image source={{ uri: escudo }} style={styles.crest} /> : <View style={styles.crest} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{nombre}</Text>
          <Text style={styles.muted}>
            {soyCapitan ? "Sos capitán" : "Jugás en este equipo"}
            {formato ? ` · ${formato.toUpperCase()}` : ""}
          </Text>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <Text style={styles.muted}>Cargando…</Text> : null}

      <Text style={styles.h2}>Plantel</Text>
      {miembros.map((m) => (
        <View key={m.usuario_id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{m.username ? `@${m.username}` : m.nombre ?? "Jugador"}</Text>
            <Text style={styles.muted}>{m.rol === "capitan" ? "Capitán" : "Jugador"}</Text>
          </View>
          {soyCapitan && m.usuario_id !== profile?.id ? (
            <View style={styles.actions}>
              <Pressable onPress={() => transferir(m.usuario_id)}>
                <Text style={styles.link}>Capitanía</Text>
              </Pressable>
              <Pressable onPress={() => expulsar(m.usuario_id)}>
                <Text style={styles.danger}>Expulsar</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}

      {soyCapitan ? (
        <>
          <Pressable style={[styles.cta, { marginTop: 8 }]} onPress={onBuscarJugadores} disabled={!onBuscarJugadores}>
            <Text style={styles.ctaTxt}>Buscar jugadores para invitar</Text>
          </Pressable>

          <Text style={styles.h2}>Invitar</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            placeholder="Username o teléfono"
            value={identificador}
            onChangeText={setIdentificador}
          />
          <Pressable style={styles.cta} onPress={invitar}>
            <Text style={styles.ctaTxt}>Enviar invitación</Text>
          </Pressable>

          <Text style={styles.h2}>Invitado sin cuenta</Text>
          <Text style={styles.muted}>Queda como “Soy {invitadoNombre.trim() || "Nico"}” hasta que se registre.</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre (ej: Nico)"
            value={invitadoNombre}
            onChangeText={setInvitadoNombre}
          />
          <Pressable style={styles.cta} onPress={() => void invitarSinCuenta()}>
            <Text style={styles.ctaTxt}>Agregar e invitar por WhatsApp</Text>
          </Pressable>

          <Text style={styles.h2}>Enlace</Text>
          {enlace ? (
            <Text style={styles.mono}>
              {enlaceCompartirEquipo(enlace, process.env.EXPO_PUBLIC_WEB_URL)}
            </Text>
          ) : (
            <Text style={styles.muted}>Todavía no hay un enlace activo.</Text>
          )}
          <View style={styles.actions}>
            <Pressable style={styles.ghost} onPress={generarEnlace}>
              <Text style={styles.ghostTxt}>{enlace ? "Regenerar" : "Generar enlace"}</Text>
            </Pressable>
            {enlace ? (
              <Pressable style={styles.ghost} onPress={compartirEnlace}>
                <Text style={styles.ghostTxt}>Compartir</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.h2}>Solicitudes</Text>
          {solicitudes.length === 0 ? (
            <Text style={styles.muted}>Nadie pidió entrar.</Text>
          ) : (
            solicitudes.map((s) => (
              <View key={s.id} style={styles.row}>
                <Text style={styles.rowTitle}>
                  {s.username ? `@${s.username}` : s.nombre ?? "Jugador"}
                </Text>
                <View style={styles.actions}>
                  <Pressable onPress={() => responder(s.id, true)}>
                    <Text style={styles.link}>Aceptar</Text>
                  </Pressable>
                  <Pressable onPress={() => responder(s.id, false)}>
                    <Text style={styles.danger}>Rechazar</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </>
      ) : (
        <Pressable style={styles.leave} onPress={salir}>
          <Text style={styles.danger}>Salir del equipo</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.navyDark },
  content: { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 48 + TAB_BAR_CONTENT_INSET },
  back: { color: colors.gold, fontWeight: "700", marginBottom: 12 },
  head: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 14 },
  crest: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceElevated },
  h1: { fontSize: 24, fontWeight: "800", color: colors.white },
  h2: { marginTop: 22, marginBottom: 10, fontSize: 16, fontWeight: "800", color: colors.white },
  muted: { color: colors.textSecondary, lineHeight: 20 },
  error: { color: colors.danger, marginBottom: 8 },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
  },
  rowTitle: { fontWeight: "700", color: colors.white },
  actions: { flexDirection: "row", gap: 12, alignItems: "center" },
  link: { color: colors.gold, fontWeight: "800" },
  danger: { color: colors.danger, fontWeight: "800" },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.white,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cta: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaTxt: { color: colors.navyDark, fontWeight: "800" },
  ghost: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  ghostTxt: { fontWeight: "700", color: colors.white },
  mono: { fontSize: 12, color: colors.sky, lineHeight: 18 },
  leave: { marginTop: 28, alignItems: "center" },
});
