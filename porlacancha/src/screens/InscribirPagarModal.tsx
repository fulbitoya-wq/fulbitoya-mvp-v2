import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { esErrorIdentidadDesafio } from "@shared/equipos";
import { colors, radius, space } from "@shared/design";
import { useAuth } from "../auth/AuthProvider";
import { formatPremio, type Desafio } from "../lib/desafios";
import type { EquipoListItem } from "../lib/equipos";
import { inscribirEquipo } from "../lib/inscripciones";
import { confirmarPagoPrueba, crearEquipoRapidoPlc, montoAPagar, pesos } from "../lib/plc";
import { Button, Mute, showNotice } from "../ui";
import { typeStyle } from "../ui/textStyle";
import { CompleteIdentidadDesafioScreen } from "./auth/CompleteIdentidadDesafioScreen";

type Props = {
  visible: boolean;
  desafio: Desafio;
  captainTeams: EquipoListItem[];
  existingInscripcionId?: string | null;
  onClose: () => void;
  onTeamsChanged?: () => void;
  onDone: () => void;
};

export function InscribirPagarModal({
  visible,
  desafio,
  captainTeams,
  existingInscripcionId,
  onClose,
  onTeamsChanged,
  onDone,
}: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [equipoId, setEquipoId] = useState(captainTeams[0]?.id ?? "");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [busy, setBusy] = useState(false);
  const [needIdentidad, setNeedIdentidad] = useState(false);
  const [totalOverride, setTotalOverride] = useState<number | null>(null);

  const rival =
    desafio.inscritos?.find((e) => e.nombre)?.nombre?.trim() ||
    desafio.titulo.replace(/^Por la cancha en /i, "").trim() ||
    "ellos";

  const cancha = Number(desafio.precio_cancha ?? 0);
  const servicio = Number(desafio.tarifa_servicio ?? 0);
  const total = totalOverride ?? cancha + servicio;

  useEffect(() => {
    if (!visible) return;
    setEquipoId(captainTeams[0]?.id ?? "");
    setNuevoNombre("");
    setNeedIdentidad(false);
  }, [visible, captainTeams]);

  useEffect(() => {
    if (!visible || !existingInscripcionId) {
      setTotalOverride(null);
      return;
    }
    void montoAPagar(existingInscripcionId).then((m) => {
      if (m.ok) setTotalOverride(m.montoTotal);
    });
  }, [visible, existingInscripcionId]);

  const crearEquipo = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) {
      showNotice("Nombre del equipo", "Poné un nombre para crear el equipo.");
      return;
    }
    setBusy(true);
    const res = await crearEquipoRapidoPlc(nombre, desafio.tipo || "f5");
    setBusy(false);
    if (!res.ok) {
      showNotice("No se pudo crear el equipo", res.error);
      return;
    }
    setEquipoId(res.equipoId);
    setNuevoNombre("");
    onTeamsChanged?.();
  };

  const pagar = async () => {
    const uid = profile?.id;
    if (!uid) {
      showNotice("Sesión", "Tenés que iniciar sesión para anotarte.");
      return;
    }

    setBusy(true);

    if (existingInscripcionId) {
      const pay = await confirmarPagoPrueba(existingInscripcionId);
      setBusy(false);
      if (!pay.ok) {
        if (esErrorIdentidadDesafio(pay.code)) {
          setNeedIdentidad(true);
          return;
        }
        showNotice("No se pudo confirmar el pago", pay.error);
        return;
      }
      showNotice(
        "Listo",
        "Quedaste anotado. Si ganan, el depósito de la cancha se le reembolsa al capitán."
      );
      onDone();
      return;
    }

    if (!equipoId) {
      setBusy(false);
      showNotice("Equipo", "Elegí o creá un equipo para competir por la cancha.");
      return;
    }

    const insc = await inscribirEquipo(desafio.id, equipoId, [uid]);
    if (!insc.ok) {
      setBusy(false);
      if (esErrorIdentidadDesafio(insc.code)) {
        setNeedIdentidad(true);
        return;
      }
      showNotice("No se pudo anotar", insc.error);
      return;
    }

    if (insc.estado === "pendiente_pago" && insc.inscripcionId) {
      const pay = await confirmarPagoPrueba(insc.inscripcionId);
      setBusy(false);
      if (!pay.ok) {
        if (esErrorIdentidadDesafio(pay.code)) {
          setNeedIdentidad(true);
          return;
        }
        showNotice("Equipo anotado", "Quedó pendiente de pago. Reintentá pagar desde el partido.");
        onDone();
        return;
      }
    } else {
      setBusy(false);
    }

    showNotice(
      "Listo",
      "Quedaste anotado. Si ganan, el depósito de la cancha se le reembolsa al capitán."
    );
    onDone();
  };

  if (needIdentidad) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setNeedIdentidad(false)}>
        <CompleteIdentidadDesafioScreen
          onCancel={() => setNeedIdentidad(false)}
          onDone={() => {
            setNeedIdentidad(false);
            void pagar();
          }}
        />
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.bg} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space[16]) + space[8] }]}
          onPress={() => undefined}
        >
          <Text style={styles.title}>{`Jugarle a ${rival}`}</Text>
          <Mute>Elegí tu equipo, revisá el total y pagá. Después podés completar el plantel.</Mute>

          {existingInscripcionId ? (
            <Text style={[styles.section, { marginTop: space[16] }]}>Tu inscripción quedó pendiente de pago.</Text>
          ) : captainTeams.length === 0 ? (
            <View style={{ marginTop: space[16], gap: space[8] }}>
              <Text style={styles.section}>Creá tu equipo</Text>
              <TextInput
                value={nuevoNombre}
                onChangeText={setNuevoNombre}
                placeholder="Nombre del equipo"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                autoCapitalize="words"
              />
              <Button label={busy ? "Creando..." : "Crear equipo"} onPress={() => void crearEquipo()} disabled={busy} />
            </View>
          ) : (
            <View style={{ marginTop: space[16], gap: space[8] }}>
              <Text style={styles.section}>Tu equipo</Text>
              {captainTeams.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setEquipoId(t.id)}
                  style={[styles.team, equipoId === t.id && styles.teamOn]}
                >
                  <Text style={styles.teamT}>{t.nombre}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.totalBox}>
            <Text style={styles.totalKicker}>Total a pagar</Text>
            <Text style={styles.total}>{pesos(total) || formatPremio(total)}</Text>
            <Mute>
              {servicio > 0
                ? `Cancha ${pesos(cancha)} + tarifa ${pesos(servicio)}. Mismo monto que el organizador.`
                : "Mismo monto que el organizador del partido."}
            </Mute>
          </View>

          <View style={{ gap: space[8], marginTop: space[8] }}>
            <Button
              label={busy ? "Confirmando..." : `Pagar ${pesos(total) || formatPremio(total)}`}
              onPress={() => void pagar()}
              disabled={busy || (!existingInscripcionId && !equipoId)}
              loading={busy}
            />
            <Button label="Cancelar" variant="secondary" onPress={onClose} disabled={busy} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.navyDark,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space[20],
    paddingTop: space[20],
    gap: space[4],
  },
  title: typeStyle("h3", colors.white),
  section: typeStyle("body", colors.white),
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: space[14],
    paddingVertical: space[12],
    color: colors.white,
    ...typeStyle("body", colors.white),
  },
  team: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: space[14],
    paddingVertical: space[12],
  },
  teamOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(217,169,40,0.12)",
  },
  teamT: typeStyle("body", colors.white),
  totalBox: {
    marginTop: space[20],
    marginBottom: space[8],
    gap: space[4],
  },
  totalKicker: typeStyle("caption", colors.textSecondary),
  total: typeStyle("numL", colors.gold),
});
