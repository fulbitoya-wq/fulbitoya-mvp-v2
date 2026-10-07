import { useEffect, useState, type ReactNode } from "react";
import { ImageBackground, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "@shared/design";
import type { JugateLaProfile } from "../../auth/AuthProvider";
import { eliminarMiCuenta, updatePassword } from "../../lib/account";
import { hapticMedium } from "../../lib/haptics";
import {
  Ban,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  FileText,
  Lock,
  LogOut,
  Shield,
  User,
  iconStroke,
} from "../../lib/icons";
import type { FootballProfile } from "../../lib/perfil";
import { listUsuariosBloqueados, desbloquearUsuario, type BloqueadoItem } from "../../lib/moderacion";
import { RelojSimulacionCard } from "./RelojSimulacionCard";
import {
  NOTIF_LABELS,
  NOTIF_TIPOS,
  listPreferenciasNotificacion,
  setPreferenciaNotificacion,
  type NotifTipo,
} from "../../lib/notificaciones";
import { Button, Card, Chip, IconBtn, Mute, showConfirm, showNotice } from "../../ui";
import { typeStyle } from "../../ui/textStyle";
import { fontFamily } from "../../lib/fonts";

const TERMINOS = "https://porlacancha.com/terminos";
const PRIVACIDAD = "https://porlacancha.com/privacidad";
const SOPORTE = "https://porlacancha.com/soporte";
const fondoAzul3 = require("../../../assets/fondo-azul-3.jpeg");

type Panel = "home" | "privacy" | "security" | "password" | "notifications" | "blocked";

type Props = {
  profile: JugateLaProfile;
  football: FootballProfile;
  email: string | null;
  onBack: () => void;
  onEdit: () => void;
  onDatosPersonales: () => void;
  onPublic: () => void;
  onSignOut: () => void;
};

function Row({
  label,
  value,
  onPress,
  icon,
  disabled,
  trailing,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled || !onPress}
      style={[styles.row, disabled && { opacity: 0.55 }]}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={styles.lab}>{label}</Text>
        {value ? <Text style={styles.val}>{value}</Text> : null}
      </View>
      {trailing ?? (disabled || !onPress ? null : <ChevronRight color={colors.textSecondary} size={18} strokeWidth={iconStroke} />)}
    </Pressable>
  );
}

export function ConfiguracionScreen({
  profile,
  football,
  email,
  onBack,
  onEdit,
  onDatosPersonales,
  onPublic,
  onSignOut,
}: Props) {
  const insets = useSafeAreaInsets();
  const [panel, setPanel] = useState<Panel>("home");
  const [sheet, setSheet] = useState(false);
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [passErr, setPassErr] = useState<string | null>(null);
  const [passBusy, setPassBusy] = useState(false);
  const [prefs, setPrefs] = useState<Record<NotifTipo, boolean> | null>(null);
  const [blocked, setBlocked] = useState<BloqueadoItem[] | null>(null);

  useEffect(() => {
    if (panel !== "notifications") return;
    void listPreferenciasNotificacion().then(setPrefs);
  }, [panel]);

  useEffect(() => {
    if (panel !== "blocked") return;
    void listUsuariosBloqueados().then(setBlocked);
  }, [panel]);

  const logout = () => {
    void hapticMedium();
    setSheet(false);
    onSignOut();
  };

  const savePassword = async () => {
    setPassErr(null);
    if (pass1 !== pass2) {
      setPassErr("Las contraseñas no coinciden.");
      return;
    }
    setPassBusy(true);
    const res = await updatePassword(pass1);
    setPassBusy(false);
    if (!res.ok) {
      setPassErr(res.error);
      return;
    }
    showNotice("Listo", "Tu contraseña se actualizó.");
    setPass1("");
    setPass2("");
    setPanel("security");
  };

  const pedirBaja = () => {
    showConfirm({
      title: "Eliminar mi cuenta",
      body: "Se borra ahora: login, perfil, favoritos y denuncias. No se puede deshacer. Si sos capitán de un equipo con más gente, transferí la capitanía antes.",
      cancelLabel: "Cancelar",
      confirmLabel: "Borrar cuenta",
      danger: true,
      onConfirm: () => {
        void eliminarMiCuenta().then((res) => {
          if (!res.ok) {
            showNotice("No se pudo borrar", res.error);
            return;
          }
          void onSignOut();
        });
      },
    });
  };

  const title =
    panel === "privacy"
      ? "Privacidad"
      : panel === "security"
        ? "Seguridad"
        : panel === "password"
          ? "Cambiar contraseña"
          : panel === "notifications"
            ? "Notificaciones"
            : panel === "blocked"
              ? "Usuarios bloqueados"
              : "Configuración";

  const goBack = () => {
    if (panel === "password") {
      setPanel("security");
      return;
    }
    if (panel !== "home") {
      setPanel("home");
      return;
    }
    onBack();
  };

  return (
    <ImageBackground source={fondoAzul3} style={styles.fill} resizeMode="cover">
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, space[8]) }]}>
        <IconBtn onPress={goBack} label="Volver">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </IconBtn>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[16], paddingBottom: insets.bottom + space[32] }}>
        {panel === "home" ? (
          <>
            <Card>
              <View style={styles.cardH}>
                <User color={colors.gold} size={18} strokeWidth={iconStroke} />
                <Text style={styles.h}>Cuenta</Text>
              </View>
              <Row label="Nombre" value={profile.nombre?.split(" ")[0] ?? "—"} onPress={onEdit} />
              <Row label="Apellido" value={football.apellido || "—"} onPress={onEdit} />
              <Row label="Username" value={profile.username ? `@${profile.username}` : "—"} onPress={onEdit} />
              <Row label="Teléfono" value={profile.telefono ?? "—"} onPress={onEdit} />
              <Row label="Email" value={email ?? profile.email ?? "—"} onPress={onEdit} />
            </Card>

            <View style={{ height: space[16] }} />
            <Card>
              <View style={styles.cardH}>
                <Shield color={colors.gold} size={18} strokeWidth={iconStroke} />
                <Text style={styles.h}>Datos personales</Text>
              </View>
              <Mute>Privado: no se muestra en perfiles ni búsquedas.</Mute>
              <Row
                label="Fecha de nacimiento"
                value={football.fechaNacimiento ?? profile.fecha_nacimiento ?? "Sin cargar"}
                onPress={onDatosPersonales}
              />
              <Row
                label="DNI"
                value={profile.tiene_dni ? "Cargado" : "Sin cargar"}
                onPress={onDatosPersonales}
              />
            </Card>

            <View style={{ height: space[16] }} />
            <Card>
              <Row label="Cómo te ven los demás" onPress={onPublic} icon={<User color={colors.sky} size={18} strokeWidth={iconStroke} />} />
              <Row
                label="Notificaciones"
                onPress={() => setPanel("notifications")}
                icon={<Bell color={colors.sky} size={18} strokeWidth={iconStroke} />}
              />
              <Row label="Privacidad" onPress={() => setPanel("privacy")} icon={<Shield color={colors.sky} size={18} strokeWidth={iconStroke} />} />
              <Row
                label="Usuarios bloqueados"
                onPress={() => setPanel("blocked")}
                icon={<Ban color={colors.sky} size={18} strokeWidth={iconStroke} />}
              />
              <Row label="Seguridad" onPress={() => setPanel("security")} icon={<Lock color={colors.sky} size={18} strokeWidth={iconStroke} />} />
              <Row
                label="Métodos de pago"
                disabled
                icon={<CreditCard color={colors.sky} size={18} strokeWidth={iconStroke} />}
                trailing={<Chip label="Prueba" tone="pending" />}
              />
              <RelojSimulacionCard />
              <Row
                label="Ayuda y soporte"
                onPress={() => void Linking.openURL(SOPORTE)}
                icon={<CircleHelp color={colors.sky} size={18} strokeWidth={iconStroke} />}
              />
              <Row label="Términos y condiciones" onPress={() => void Linking.openURL(TERMINOS)} icon={<FileText color={colors.sky} size={18} strokeWidth={iconStroke} />} />
              <Row label="Política de privacidad" onPress={() => void Linking.openURL(PRIVACIDAD)} icon={<FileText color={colors.sky} size={18} strokeWidth={iconStroke} />} />
            </Card>

            <Pressable onPress={() => setSheet(true)} style={styles.logout} accessibilityRole="button">
              <LogOut color={colors.danger} size={18} strokeWidth={iconStroke} />
              <Text style={styles.logoutT}>Cerrar sesión</Text>
            </Pressable>
          </>
        ) : null}

        {panel === "privacy" ? (
          <Card>
            <Text style={styles.h}>Qué se ve de tu perfil</Text>
            <Mute>
              Si prendés “Busco equipo” en Editar perfil, los capitanes ven tu nombre, username, foto, puestos, zona,
              formatos y si jugás gratis o con tarifa. Nunca ven tu email, teléfono, fecha de nacimiento ni DNI.
            </Mute>
            <Mute>
              “Busco equipo” y “Cómo jugás” son independientes: podés buscar plantel jugando gratis o cobrando.
            </Mute>
            <View style={{ marginTop: space[16] }}>
              <Button label="Editar perfil" onPress={onEdit} />
            </View>
          </Card>
        ) : null}

        {panel === "blocked" ? (
          <Card>
            <Text style={styles.h}>Quién no te ve</Text>
            <Mute>Si bloqueás a alguien, no aparece en tu búsqueda ni te puede invitar. Las denuncias van aparte, desde su ficha (los tres puntos).</Mute>
            <View style={{ marginTop: space[16] }}>
              {blocked == null ? (
                <Mute>Cargando…</Mute>
              ) : blocked.length === 0 ? (
                <Mute>No bloqueaste a nadie.</Mute>
              ) : (
                blocked.map((u) => (
                  <View key={u.id} style={styles.prefRow}>
                    <Text style={styles.prefLab}>{u.username ? `@${u.username}` : u.nombre || "Jugador"}</Text>
                    <Pressable
                      onPress={() => {
                        void desbloquearUsuario(u.id).then((res) => {
                          if (!res.ok) {
                            showNotice("No se pudo desbloquear", res.error);
                            return;
                          }
                          setBlocked((list) => (list ? list.filter((x) => x.id !== u.id) : list));
                        });
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.secA}>Desbloquear</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </Card>
        ) : null}

        {panel === "notifications" ? (
          <Card>
            <Mute>Avisos dentro de la app. Push (al celular) todavía no.</Mute>
            {prefs
              ? NOTIF_TIPOS.map((tipo) => (
                  <View key={tipo} style={styles.prefRow}>
                    <Text style={styles.prefLab}>{NOTIF_LABELS[tipo]}</Text>
                    <Switch
                      value={prefs[tipo]}
                      onValueChange={(v) => {
                        setPrefs((p) => (p ? { ...p, [tipo]: v } : p));
                        void setPreferenciaNotificacion(tipo, v).then((ok) => {
                          if (!ok) {
                            setPrefs((p) => (p ? { ...p, [tipo]: !v } : p));
                            showNotice("No se pudo guardar", "Probá de nuevo en un rato.");
                          }
                        });
                      }}
                      trackColor={{ false: colors.border, true: colors.sky }}
                      thumbColor={colors.white}
                      accessibilityLabel={NOTIF_LABELS[tipo]}
                    />
                  </View>
                ))
              : (
                <Mute>Cargando preferencias…</Mute>
              )}
          </Card>
        ) : null}

        {panel === "security" ? (
          <Card>
            <Row label="Cambiar contraseña" onPress={() => setPanel("password")} icon={<Lock color={colors.sky} size={18} strokeWidth={iconStroke} />} />
            <Row label="Cerrar sesión" onPress={() => setSheet(true)} icon={<LogOut color={colors.sky} size={18} strokeWidth={iconStroke} />} />
            <Pressable onPress={pedirBaja} style={styles.deleteRow} accessibilityRole="button">
              <Text style={styles.deleteT}>Eliminar mi cuenta</Text>
            </Pressable>
            <Mute>La baja es inmediata. No se puede deshacer. Los equipos donde sos el único miembro se cierran.</Mute>
          </Card>
        ) : null}

        {panel === "password" ? (
          <Card>
            <Text style={styles.lab}>Nueva contraseña</Text>
            <TextInput
              value={pass1}
              onChangeText={setPass1}
              secureTextEntry
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
            />
            <Text style={[styles.lab, { marginTop: space[12] }]}>Repetir contraseña</Text>
            <TextInput
              value={pass2}
              onChangeText={setPass2}
              secureTextEntry
              placeholder="Repetí la contraseña"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
            />
            {passErr ? <Text style={styles.err}>{passErr}</Text> : null}
            <View style={{ marginTop: space[16] }}>
              <Button label={passBusy ? "Guardando..." : "Actualizar contraseña"} onPress={() => void savePassword()} loading={passBusy} />
            </View>
          </Card>
        ) : null}
      </ScrollView>

      <Modal transparent visible={sheet} animationType="slide" onRequestClose={() => setSheet(false)}>
        <Pressable style={styles.dim} onPress={() => setSheet(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space[16] }]}>
          <Text style={styles.sheetH}>¿Querés cerrar sesión?</Text>
          <Text style={styles.sheetP}>Vas a poder seguir explorando desafíos como invitado.</Text>
          <Button label="Seguir conectado" variant="secondary" onPress={() => setSheet(false)} />
          <View style={{ height: space[8] }} />
          <Button label="Cerrar sesión" variant="danger" onPress={logout} />
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navyDark },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[8] },
  title: { ...typeStyle("h3", colors.white), flex: 1, textAlign: "center" },
  cardH: { flexDirection: "row", alignItems: "center", gap: space[8], marginBottom: space[8] },
  h: typeStyle("h3", colors.white),
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    paddingVertical: space[8],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lab: typeStyle("bodySmall", colors.textSecondary),
  val: typeStyle("body", colors.white),
  prefRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    paddingVertical: space[8],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  prefLab: { ...typeStyle("body", colors.white), flex: 1 },
  secA: typeStyle("bodySmall", colors.gold),
  logout: {
    marginTop: space[24],
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(239,68,68,0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[8],
  },
  logoutT: typeStyle("h3", colors.danger),
  deleteRow: { minHeight: 48, justifyContent: "center", marginTop: space[8] },
  deleteT: typeStyle("bodySmall", colors.danger),
  err: { ...typeStyle("caption", colors.danger), marginTop: space[8] },
  input: {
    minHeight: 48,
    backgroundColor: colors.navy,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    paddingHorizontal: space[16],
    color: colors.white,
    fontFamily: fontFamily.ui,
    fontSize: 16,
  },
  dim: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: colors.navyDark,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: space[20],
  },
  sheetH: typeStyle("h2", colors.white),
  sheetP: { ...typeStyle("bodySmall", colors.textSecondary), marginVertical: space[12] },
});
