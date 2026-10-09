import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "@shared/design";
import { useAuth } from "../auth/AuthProvider";
import { formatFechaCorta, formatHora, etiquetaTipo } from "../lib/desafios";
import { setPendingAction } from "../lib/pending-action";
import type { TurnoPublico } from "../lib/plc";
import {
  listarPrediosPublicos,
  listarTurnosDePredio,
  opcionesCobroReserva,
  pagarReserva,
  pesosReserva,
  type OpcionesCobroReserva,
  type PredioPublico,
} from "../lib/reserva";
import { ChevronLeft, iconStroke } from "../lib/icons";
import { Button, EmptyState, IconBtn, Mute, showNotice } from "../ui";
import { PagoQrCard } from "../ui/PagoQrCard";
import { typeStyle } from "../ui/textStyle";
import { ReservaPagoBlock } from "./reserva/ReservaPagoBlock";

type TipoCobro = "sena" | "total";

type Props = {
  onBack: () => void;
  onRequestAuth: () => void;
  onDone: () => void;
  initialCanchaId?: string | null;
  initialTurnoId?: string | null;
  initialTipoCobro?: TipoCobro | null;
  initialAcepto?: boolean;
};

function onlyAvailable(op: OpcionesCobroReserva): TipoCobro | null {
  const s = op.acepta_sena && op.opcion_sena.disponible;
  const t = op.acepta_total && op.opcion_total.disponible;
  if (s && !t) return "sena";
  if (t && !s) return "total";
  return null;
}

export function ReservarCanchaScreen({
  onBack,
  onRequestAuth,
  onDone,
  initialCanchaId = null,
  initialTurnoId = null,
  initialTipoCobro = null,
  initialAcepto = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [predios, setPredios] = useState<PredioPublico[]>([]);
  const [canchaId, setCanchaId] = useState<string | null>(initialCanchaId);
  const [turnos, setTurnos] = useState<TurnoPublico[]>([]);
  const [turnoId, setTurnoId] = useState<string | null>(initialTurnoId);
  const [tipo, setTipo] = useState<TipoCobro | null>(initialTipoCobro);
  const [opciones, setOpciones] = useState<OpcionesCobroReserva | null>(null);
  const [opcionesLoading, setOpcionesLoading] = useState(false);
  const [acepto, setAcepto] = useState(initialAcepto);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [qr, setQr] = useState<{ initPoint: string; holdId: string } | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const tipoRef = useRef<TipoCobro | null>(tipo);
  tipoRef.current = tipo;

  useEffect(() => {
    void listarPrediosPublicos().then(({ data, error }) => {
      setPredios(data);
      setLoadErr(error);
    });
  }, []);

  useEffect(() => {
    if (!canchaId) {
      setTurnos([]);
      setTurnoId(null);
      setFecha(null);
      return;
    }
    void listarTurnosDePredio(canchaId).then(setTurnos);
  }, [canchaId]);

  useEffect(() => {
    if (!initialTurnoId) return;
    const t = turnos.find((x) => x.id === initialTurnoId);
    if (t) {
      setCanchaId(t.cancha_id);
      setFecha(t.fecha);
      setTurnoId(t.id);
    }
  }, [turnos, initialTurnoId]);

  const loadOpciones = useCallback(async (id: string, keepTipo: TipoCobro | null) => {
    setOpcionesLoading(true);
    const res = await opcionesCobroReserva(id);
    setOpcionesLoading(false);
    if (!res.ok) {
      setOpciones(null);
      showNotice("No se pudo cotizar", res.error);
      return;
    }
    setOpciones(res.data);
    const only = onlyAvailable(res.data);
    if (only) {
      setTipo(only);
      return;
    }
    if (keepTipo === "sena" && res.data.opcion_sena.disponible) {
      setTipo("sena");
      return;
    }
    if (keepTipo === "total" && res.data.opcion_total.disponible) {
      setTipo("total");
      return;
    }
    setTipo(null);
  }, []);

  useEffect(() => {
    if (!turnoId) {
      setOpciones(null);
      setTipo(null);
      setAcepto(false);
      setQr(null);
      return;
    }
    void loadOpciones(turnoId, tipoRef.current ?? initialTipoCobro);
  }, [turnoId, loadOpciones, initialTipoCobro]);

  const fechas = useMemo(() => [...new Set(turnos.map((t) => t.fecha))], [turnos]);
  const turnosDia = turnos.filter((t) => !fecha || t.fecha === fecha);

  const canContinue = Boolean(turnoId && tipo && acepto && opciones && !busy && !qr);

  const selectFecha = (f: string) => {
    setFecha(f);
    setTurnoId(null);
    setQr(null);
  };

  const selectTurno = (id: string) => {
    setTurnoId(id);
    setQr(null);
  };

  const montoSeleccionado = useMemo(() => {
    if (!opciones || !tipo) return null;
    const opt = tipo === "sena" ? opciones.opcion_sena : opciones.opcion_total;
    return opt.disponible ? opt.monto_pagar : null;
  }, [opciones, tipo]);

  const [confirmPago, setConfirmPago] = useState(false);

  const continuar = async () => {
    if (!turnoId || !tipo || !acepto) return;
    if (!session?.access_token) {
      await setPendingAction({
        kind: "reservar",
        canchaId: canchaId ?? undefined,
        turnoId,
        tipoCobro: tipo,
        acepto: true,
      });
      onRequestAuth();
      return;
    }
    setConfirmPago(false);
    setBusy(true);
    const res = await pagarReserva(turnoId, tipo, session.access_token);
    setBusy(false);
    if (!res.ok) {
      showNotice("No se pudo reservar", res.error);
      return;
    }
    if ("reservaId" in res) {
      showNotice("Reserva", "El turno quedó reservado.");
      onDone();
      return;
    }
    if (res.canal === "qr") {
      setQr({ initPoint: res.initPoint, holdId: res.holdId });
      return;
    }
    showNotice("Mercado Pago", "Te llevamos a pagar. Tenés 10 minutos para confirmar el turno.");
    onDone();
  };

  const ctaLabel = (() => {
    if (busy) return "Continuando...";
    if (montoSeleccionado != null) return `Reservar y pagar ${pesosReserva(montoSeleccionado)}`;
    return "Reservar y pagar";
  })();

  const footerH = 72 + Math.max(insets.bottom, space[8]);

  return (
    <View style={styles.fill}>
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, space[8]) }]}>
        <IconBtn onPress={onBack} label="Volver">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </IconBtn>
        <Text style={styles.title}>Reservar cancha</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: space[16],
          paddingBottom: footerH + space[16],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.h}>Predio</Text>
        {loadErr ? <Mute>{loadErr}</Mute> : null}
        {predios.length === 0 ? (
          <EmptyState title="No hay turnos" body="Todavía no hay predios con horarios libres." />
        ) : null}
        {predios.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => {
              setCanchaId(p.id);
              setFecha(null);
              setTurnoId(null);
              setQr(null);
            }}
            style={[styles.card, canchaId === p.id && styles.cardOn]}
          >
            <Text style={styles.body}>{p.nombre}</Text>
            <Mute>{p.barrio || p.direccion || ""}</Mute>
          </Pressable>
        ))}

        {canchaId ? (
          <>
            <Text style={[styles.h, { marginTop: space[16] }]}>Día</Text>
            <View style={styles.wrap}>
              {fechas.slice(0, 14).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => selectFecha(f)}
                  style={[styles.chip, fecha === f && styles.chipOn]}
                >
                  <Text style={styles.chipT}>{formatFechaCorta(f)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.h, { marginTop: space[16] }]}>Horario</Text>
            {turnosDia.length === 0 ? <Mute>Elegí un día para ver horarios.</Mute> : null}
            {turnosDia.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => selectTurno(t.id)}
                style={[styles.card, turnoId === t.id && styles.cardOn]}
              >
                <Text style={styles.body}>
                  {t.campo_nombre} · {etiquetaTipo(t.campo_tipo)} · {formatHora(t.hora_inicio)}
                </Text>
                <Mute>{t.precio != null ? pesosReserva(t.precio) : formatFechaCorta(t.fecha)}</Mute>
              </Pressable>
            ))}
          </>
        ) : null}

        {turnoId && opcionesLoading ? <Mute>Calculando formas de pago…</Mute> : null}
        {turnoId && opciones && !opcionesLoading ? (
          <ReservaPagoBlock
            opciones={opciones}
            tipo={tipo}
            acepto={acepto}
            onSelectTipo={(t) => {
              setTipo(t);
              setQr(null);
            }}
            onToggleAcepto={() => setAcepto((v) => !v)}
          />
        ) : null}

        {qr && session?.access_token ? (
          <View style={{ marginTop: space[16] }}>
            <PagoQrCard
              initPoint={qr.initPoint}
              holdId={qr.holdId}
              accessToken={session.access_token}
              onConfirmada={() => {
                showNotice("Reserva", "El pago se confirmó. El turno quedó reservado.");
                onDone();
              }}
              onVencida={() => {
                setQr(null);
                showNotice("Pago", "Se venció el tiempo para pagar. El turno volvió a quedar libre.");
              }}
            />
          </View>
        ) : null}
      </ScrollView>

      {!qr ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[8]) }]}>
          <Button
            label={ctaLabel}
            onPress={() => {
              if (!canContinue) return;
              setConfirmPago(true);
            }}
            disabled={!canContinue}
            loading={busy}
          />
        </View>
      ) : null}

      <Modal visible={confirmPago} transparent animationType="slide" onRequestClose={() => setConfirmPago(false)}>
        <Pressable style={styles.modalBg} onPress={() => setConfirmPago(false)}>
          <Pressable
            style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, space[16]) + space[8] }]}
            onPress={() => undefined}
          >
            <Text style={styles.modalH}>Confirmá el pago</Text>
            <Mute>
              {tipo === "sena"
                ? "Vas a pagar la seña ahora. El resto se abona en el predio."
                : "Vas a pagar el total del turno ahora."}
            </Mute>
            <Text style={[styles.modalKicker, { marginTop: space[16] }]}>Total a pagar</Text>
            <Text style={styles.modalTotal}>
              {montoSeleccionado != null ? pesosReserva(montoSeleccionado) : "—"}
            </Text>
            <View style={{ gap: space[8], marginTop: space[16] }}>
              <Button
                label={busy ? "Abriendo pago..." : "Ir a Mercado Pago"}
                onPress={() => void continuar()}
                loading={busy}
                disabled={busy}
              />
              <Button label="Volver" variant="secondary" onPress={() => setConfirmPago(false)} disabled={busy} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navy },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[8] },
  title: { ...typeStyle("h3", colors.white), flex: 1, textAlign: "center" },
  h: typeStyle("h3", colors.white),
  body: typeStyle("body", colors.white),
  card: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space[12],
    backgroundColor: colors.surface,
    marginTop: space[8],
  },
  cardOn: { borderColor: colors.gold },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[8], marginTop: space[8] },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space[12],
    paddingVertical: space[8],
  },
  chipOn: { borderColor: colors.gold },
  chipT: typeStyle("bodySmall", colors.white),
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space[16],
    paddingTop: space[8],
    backgroundColor: colors.navy,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.navyDark,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space[20],
    paddingTop: space[20],
  },
  modalH: typeStyle("h3", colors.white),
  modalKicker: typeStyle("caption", colors.textSecondary),
  modalTotal: typeStyle("numL", colors.gold),
});
