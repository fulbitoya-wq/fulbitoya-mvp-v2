import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { esErrorIdentidadDesafio } from "@shared/equipos";
import { colors, featureFlags, radius, space } from "@shared/design";
import { useAuth } from "../auth/AuthProvider";
import {
  etiquetaEmpiezaEn,
  etiquetaEstado,
  etiquetaModalidad,
  etiquetaTipo,
  esSoloCancha,
  formatDiaSemana,
  formatFechaCorta,
  formatHora,
  formatPremio,
  formatPremioArriba,
  type Desafio,
} from "../lib/desafios";
import { cancelarInscripcion } from "../lib/inscripciones";
import {
  confirmarPagoPrueba,
  inscribirJugadorAmistoso,
  montoAPagar,
  pesos,
} from "../lib/plc";
import { ChevronLeft, MapPin, Share2, iconStroke } from "../lib/icons";
import { compartirTexto } from "../lib/share-text";
import { Button, Chip, Mute, showConfirm, showNotice } from "../ui";
import { CanchaMap } from "../ui/maps/CanchaMap";
import { EquipoCupos } from "../ui/EquipoCupos";
import { PitchCover } from "../ui/PitchCover";
import { typeStyle } from "../ui/textStyle";
import { CompleteIdentidadDesafioScreen } from "./auth/CompleteIdentidadDesafioScreen";

type Props = {
  desafio: Desafio;
  guest: boolean;
  inscriptoComo?: "capitan" | "miembro" | null;
  inscripcionId?: string | null;
  estadoInscripcion?: string | null;
  onBack: () => void;
  onInscribir: () => void;
  onOpenMap: () => void;
  onPaid?: () => void;
  onCancelled?: () => void;
};

export function DesafioDetalleScreen({
  desafio,
  guest,
  inscriptoComo,
  inscripcionId,
  estadoInscripcion,
  onBack,
  onInscribir,
  onOpenMap,
  onPaid,
  onCancelled,
}: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const solo = esSoloCancha(Number(desafio.premio));
  const amistoso = desafio.modalidad === "amistoso";
  const lugar = desafio.barrio?.trim()
    ? `${desafio.direccion} · ${desafio.barrio}`
    : desafio.direccion;
  const copyVisible =
    desafio.descripcion && !desafio.descripcion.includes("[seed:porlacancha-test]")
      ? desafio.descripcion
      : null;
  const empieza = etiquetaEmpiezaEn(desafio.fecha, desafio.hora_inicio);
  const lat = Number(desafio.lat);
  const lng = Number(desafio.lng);

  const [pago, setPago] = useState<{ total: number; cancha: number; servicio: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [needIdentidad, setNeedIdentidad] = useState(false);
  const porLaCancha = desafio.modalidad === "por_la_cancha";

  const load = async () => {
    if (inscripcionId && estadoInscripcion === "pendiente_pago") {
      const m = await montoAPagar(inscripcionId);
      if (m.ok) setPago({ total: m.montoTotal, cancha: m.montoCancha, servicio: m.montoServicio });
      else setPago(null);
    } else {
      setPago(null);
    }
  };

  useEffect(() => {
    void load();
  }, [desafio.id, inscripcionId, estadoInscripcion, profile?.id]);

  const cupoLleno = (desafio.inscritos?.length ?? 0) >= (desafio.cupos || 2);
  const rivalNombre =
    desafio.inscritos?.find((e) => e.nombre)?.nombre?.trim() ||
    desafio.titulo.replace(/^Por la cancha en /i, "").trim() ||
    null;
  const totalPlc = Number(desafio.precio_cancha ?? 0) + Number(desafio.tarifa_servicio ?? 0);
  const inscribir = () => {
    onInscribir();
  };
  // Beta: solo por la cancha cobra. Amistoso/competitivo/Plus no muestran pagar.
  const mostrarPago =
    estadoInscripcion === "pendiente_pago" &&
    (porLaCancha || featureFlags.reserva_plus_habilitada);
  const ctaLabel = guest
    ? "Ingresá para inscribir"
    : mostrarPago
      ? porLaCancha
        ? totalPlc > 0
          ? `Pagar ${pesos(totalPlc)}`
          : "Pagar"
        : "Pagar seña de prueba"
      : estadoInscripcion === "pendiente_pago" && !porLaCancha
        ? "Ver partido"
        : inscriptoComo === "capitan"
          ? "Editar convocados"
          : inscriptoComo === "miembro"
            ? "Tu equipo ya está"
            : cupoLleno && !amistoso
              ? "Sin lugar"
              : porLaCancha
                ? rivalNombre
                  ? `Jugarle a ${rivalNombre}`
                  : "Jugarle"
                : amistoso && !inscriptoComo
                  ? "Inscribir equipo o anotarme"
                  : "Inscribir mi equipo";
  const ctaOff = Boolean(
    !guest &&
      !mostrarPago &&
      estadoInscripcion !== "pendiente_pago" &&
      (inscriptoComo === "miembro" || (!inscriptoComo && cupoLleno && !amistoso))
  );

  const compartir = () => {
    void compartirTexto(`${desafio.titulo} · ${etiquetaModalidad(Number(desafio.premio), desafio.modalidad)}`);
  };

  const pagar = async () => {
    if (!inscripcionId) return;
    setBusy(true);
    const res = await confirmarPagoPrueba(inscripcionId);
    setBusy(false);
    if (!res.ok) {
      if (porLaCancha && esErrorIdentidadDesafio(res.code)) {
        setNeedIdentidad(true);
        return;
      }
      showNotice("No se pudo confirmar el pago", res.error);
      return;
    }
    showNotice(
      porLaCancha ? "Cancha pagada de anticipado" : "Pago de prueba",
      porLaCancha
        ? "Quedó confirmado el depósito de la cancha (modo prueba, sin Mercado Pago). Si tu equipo gana, ese dinero se le reembolsa al capitán."
        : "La inscripción quedó confirmada. No se cobró con Mercado Pago."
    );
    onPaid?.();
    void load();
  };

  const pedirCancelar = () => {
    if (!inscripcionId) return;
    void (async () => {
      let body = "El lugar queda libre. Los convocados se enteran por el aviso.";
      if (estadoInscripcion === "confirmada") {
        const m = await montoAPagar(inscripcionId);
        if (m.ok && m.montoCancha > 0) {
          body =
            `Pagaste ${pesos(m.montoTotal)} (cancha ${pesos(m.montoCancha)}` +
            (m.montoServicio > 0 ? ` + tarifa app ${pesos(m.montoServicio)}` : "") +
            `).\n\nSe retiene la tarifa de uso de la app (${pesos(m.montoServicio)}).\n` +
            `Te devolvemos ${pesos(m.montoCancha)} (la cancha).`;
        }
      }
      showConfirm({
        title: "Cancelar inscripción",
        body,
        cancelLabel: "Volver",
        confirmLabel: "Cancelar inscripción",
        danger: true,
        onConfirm: () => {
          setBusy(true);
          void cancelarInscripcion(inscripcionId).then((res) => {
            setBusy(false);
            if (!res.ok) {
              showNotice("No se pudo cancelar", res.error);
              return;
            }
            showNotice("Inscripción cancelada", "Si correspondía, el reembolso de la cancha quedó registrado.");
            onCancelled?.();
          });
        },
      });
    })();
  };

  if (needIdentidad) {
    return (
      <CompleteIdentidadDesafioScreen
        onCancel={() => setNeedIdentidad(false)}
        onDone={() => {
          setNeedIdentidad(false);
          void pagar();
        }}
      />
    );
  }

  const suelto = async () => {
    setBusy(true);
    const res = await inscribirJugadorAmistoso(desafio.id);
    setBusy(false);
    if (!res.ok) {
      showNotice("No te pudimos anotar", res.error);
      return;
    }
    if (res.estado === "pendiente_pago") {
      showNotice("Reservamos tu lugar", "Confirmá el pago de prueba para quedar anotado.");
    } else {
      showNotice("Anotado", "Quedaste en el amistoso.");
    }
    onPaid?.();
  };

  const stickyLabel =
    mostrarPago && pago
      ? pesos(pago.total)
      : porLaCancha && !inscriptoComo && totalPlc > 0
        ? pesos(totalPlc)
        : solo
          ? etiquetaModalidad(Number(desafio.premio), desafio.modalidad)
          : formatPremio(Number(desafio.premio));

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View>
          <PitchCover height={220} variant="flush">
            <View style={[styles.heroNav, { paddingTop: Math.max(insets.top, space[12]) }]}>
              <Pressable onPress={onBack} style={styles.iconBtn} accessibilityRole="button">
                <ChevronLeft color={colors.white} size={22} strokeWidth={iconStroke} />
              </Pressable>
              <Pressable onPress={compartir} style={styles.iconBtn} accessibilityRole="button">
                <Share2 color={colors.white} size={20} strokeWidth={iconStroke} />
              </Pressable>
            </View>
            <View style={styles.heroChips}>
              <Chip
                label={etiquetaEstado(desafio.estado)}
                tone={desafio.estado === "completo" ? "complete" : "open"}
              />
              {empieza ? (
                <View style={styles.cd}>
                  <Text style={styles.cdTxt}>{empieza.replace("Empieza", "Cierra")}</Text>
                </View>
              ) : null}
            </View>
          </PitchCover>
        </View>

        <View style={styles.pad}>
          <View style={styles.hero}>
            <View style={styles.when}>
              <Text style={styles.dia}>{formatDiaSemana(desafio.fecha)}</Text>
              <Text style={styles.hora}>{formatHora(desafio.hora_inicio)}</Text>
              <Text style={styles.fecha}>{formatFechaCorta(desafio.fecha)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.mod}>{etiquetaModalidad(Number(desafio.premio), desafio.modalidad)}</Text>
              {solo ? null : <Text style={styles.prize}>{formatPremioArriba(Number(desafio.premio))}</Text>}
            </View>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.meta}>{etiquetaTipo(desafio.tipo)}</Text>
            <Text style={styles.sep}>|</Text>
            <Text style={styles.meta}>{desafio.duracion_min} min</Text>
          </View>

          <View style={styles.venue}>
            <View style={{ flex: 1, gap: space[8] }}>
              <View style={styles.loc}>
                <MapPin color={colors.sky} size={16} strokeWidth={iconStroke} />
                <Text style={styles.venueTxt}>{lugar}</Text>
              </View>
              <Button label="Ver en mapa" variant="secondary" onPress={onOpenMap} />
            </View>
            {Number.isFinite(lat) && Number.isFinite(lng) ? (
              <CanchaMap
                style={styles.miniMap}
                scrollEnabled={false}
                region={{
                  latitude: lat,
                  longitude: lng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                pins={[{ id: desafio.id, latitude: lat, longitude: lng }]}
              />
            ) : null}
          </View>

          <Text style={styles.h2}>Equipos</Text>
          <EquipoCupos desafio={desafio} />
          {(desafio.inscritos ?? []).map((eq) => (
            <Text key={eq.id} style={styles.eqName}>
              {eq.nombre}
            </Text>
          ))}
          {(desafio.inscritos?.length ?? 0) < (desafio.cupos || 2) ? (
            <Mute>{amistoso ? "Falta gente o un rival." : "Buscando rival."}</Mute>
          ) : null}

          <Text style={styles.h2}>¿Cómo funciona?</Text>
          <Mute>
            {porLaCancha
              ? "Por la cancha: cada equipo paga la cancha de anticipado más la tarifa de la app. Si ganan, el depósito de la cancha se le reembolsa al capitán."
              : amistoso
                ? "Amistoso: gratis en la app. Sumate con equipo o suelto. La cancha se arregla aparte."
                : "Competitivo: gratis en la app. Inscribí tu equipo y jugá."}
          </Mute>
          {porLaCancha ? (
            <Mute>
              En este entorno el pago es de prueba: elegís tu equipo, ves el total y pagás en un solo paso (sin Mercado
              Pago real).
            </Mute>
          ) : null}
          {copyVisible ? <Text style={styles.body}>{copyVisible}</Text> : null}

          {amistoso && !guest && !inscriptoComo ? (
            <View style={{ marginTop: space[16] }}>
              <Button label="Anotarme suelto" variant="secondary" onPress={() => void suelto()} loading={busy} />
            </View>
          ) : null}

          {inscriptoComo === "capitan" &&
          inscripcionId &&
          (estadoInscripcion === "confirmada" || estadoInscripcion === "pendiente_pago") &&
          desafio.estado !== "cancelado" &&
          desafio.estado !== "finalizado" ? (
            <View style={{ marginTop: space[16] }}>
              <Button
                label="Cancelar inscripción"
                variant="danger"
                onPress={pedirCancelar}
                disabled={busy}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + space[12] }]}>
        <View style={{ flexShrink: 0 }}>
          <Text style={styles.ctaKicker}>
            {mostrarPago
              ? "A pagar"
              : porLaCancha && !inscriptoComo
                ? "Tu parte"
                : solo
                  ? "Modalidad"
                  : "Premio"}
          </Text>
          <Text style={styles.ctaPrize}>{stickyLabel}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={ctaLabel}
            onPress={() => {
              if (mostrarPago && !porLaCancha) {
                void pagar();
                return;
              }
              // pendiente_pago de modalidades gratis: no cobrar, solo navegar/inscribir
              if (estadoInscripcion === "pendiente_pago" && !porLaCancha && !featureFlags.reserva_plus_habilitada) {
                return;
              }
              inscribir();
            }}
            disabled={ctaOff || busy}
            loading={busy && mostrarPago && !porLaCancha}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.navy },
  heroNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: space[8],
  },
  iconBtn: {
    minHeight: 48,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  heroChips: {
    position: "absolute",
    left: space[16],
    right: space[16],
    bottom: space[12],
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cd: {
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: space[12],
    paddingVertical: space[4],
    backgroundColor: "rgba(0,27,68,0.55)",
  },
  cdTxt: typeStyle("caption", colors.goldLight),
  pad: { paddingHorizontal: space[16], paddingTop: space[16] },
  hero: { flexDirection: "row", gap: space[16] },
  when: { minWidth: 80 },
  dia: typeStyle("label", colors.white),
  hora: typeStyle("numXL", colors.white),
  fecha: typeStyle("caption", colors.textSecondary),
  mod: typeStyle("bodySmall", colors.white),
  prize: typeStyle("numL", colors.gold),
  metaRow: { flexDirection: "row", alignItems: "center", gap: space[8], marginTop: space[12] },
  meta: typeStyle("caption", colors.textSecondary),
  sep: { color: colors.borderStrong },
  venue: {
    marginTop: space[24],
    flexDirection: "row",
    gap: space[12],
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space[16],
  },
  loc: { flexDirection: "row", alignItems: "flex-start", gap: space[8] },
  venueTxt: { flex: 1, ...typeStyle("body", colors.white) },
  miniMap: { width: 96, height: 96, borderRadius: radius.md, overflow: "hidden" },
  h2: { ...typeStyle("h3", colors.white), marginTop: space[32], marginBottom: space[8] },
  eqName: { ...typeStyle("body", colors.white), marginTop: space[8] },
  body: { ...typeStyle("body", colors.textSecondary), marginTop: space[12] },
  sticky: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.navy,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: space[16],
    paddingTop: space[12],
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
  },
  ctaKicker: typeStyle("caption", colors.textSecondary),
  ctaPrize: typeStyle("numM", colors.gold),
});
