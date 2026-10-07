import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space } from "@shared/design";
import { useAuth } from "../../auth/AuthProvider";
import { formatFechaCorta, formatHora } from "../../lib/desafios";
import { ChevronLeft, iconStroke } from "../../lib/icons";
import {
  abrirBuscaGente,
  cancelarReservaMia,
  etiquetaEstadoReserva,
  listarListaReserva,
  listarMisReservas,
  pesosReserva,
  type ReservaMia,
} from "../../lib/reserva";
import { compartirTexto } from "../../lib/share-text";
import { Button, Chip, IconBtn, Mute, showConfirm, showNotice } from "../../ui";
import { typeStyle } from "../../ui/textStyle";
import { ReservaListaScreen } from "../ReservaListaScreen";

type Props = {
  reservaId: string;
  initial?: ReservaMia | null;
  onBack: () => void;
  onPasarAPlus: (reservaId: string) => void;
  onOpenPredio: (canchaId: string) => void;
  onChanged?: () => void;
};

export function ReservaDetalleScreen({
  reservaId,
  initial = null,
  onBack,
  onPasarAPlus,
  onOpenPredio,
  onChanged,
}: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [reserva, setReserva] = useState<ReservaMia | null>(initial);
  const [listaCount, setListaCount] = useState(0);
  const [listaOpen, setListaOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const reload = async () => {
    const [mine, lista] = await Promise.all([listarMisReservas(), listarListaReserva(reservaId)]);
    if (mine.error) setLoadErr(mine.error);
    else setLoadErr(null);
    const found = mine.data.find((r) => r.id === reservaId) ?? null;
    setReserva(found);
    setListaCount(lista.ok ? lista.nombres.length : 0);
  };

  useEffect(() => {
    void reload();
  }, [reservaId]);

  if (listaOpen) {
    return (
      <ReservaListaScreen
        reservaId={reservaId}
        onBack={() => {
          setListaOpen(false);
          void reload();
        }}
      />
    );
  }

  if (!reserva) {
    return (
      <View style={[styles.fill, { paddingTop: insets.top + 8, paddingHorizontal: 16 }]}>
        <IconBtn onPress={onBack} label="Volver">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </IconBtn>
        <Text style={[styles.h, { marginTop: 16 }]}>{loadErr ?? "No encontramos esa reserva."}</Text>
      </View>
    );
  }

  const activa = reserva.estado === "reservada";
  const tone = reserva.convertida_a_plus
    ? "pending"
    : reserva.estado === "reservada"
      ? "open"
      : reserva.estado === "cancelada" || reserva.estado === "cancelada_predio"
        ? "cancelled"
        : "pending";
  const lugar = [reserva.direccion, reserva.barrio].filter(Boolean).join(" · ");

  const toggleBusca = () => {
    const abrir = !reserva.busca_gente;
    setBusy(true);
    void abrirBuscaGente(reserva.id, abrir).then((res) => {
      setBusy(false);
      if (!res.ok) {
        showNotice("No se pudo actualizar", res.error);
        return;
      }
      setReserva((prev) => (prev ? { ...prev, busca_gente: abrir } : prev));
      showNotice(
        abrir ? "Partido abierto" : "Partido cerrado",
        abrir ? "Quien tenga el enlace puede saber que buscás gente." : "Ya no figurás buscando gente."
      );
      onChanged?.();
    });
  };

  const cancelar = () => {
    showConfirm({
      title: "Cancelar reserva",
      body: reserva.texto_cancelacion || "Se aplica la regla de cancelación del predio (congelada al pagar).",
      cancelLabel: "Volver",
      confirmLabel: "Cancelar reserva",
      danger: true,
      onConfirm: () => {
        setBusy(true);
        void cancelarReservaMia(reserva.id, session?.access_token).then((res) => {
          setBusy(false);
          if (!res.ok) {
            showNotice("No se pudo cancelar", res.error);
            return;
          }
          const reemb = res.reembolso ?? 0;
          showNotice(
            "Reserva cancelada",
            reemb > 0
              ? `Reembolso estimado: ${pesosReserva(reemb)}. Si el pago fue por Mercado Pago, ya pedimos la devolución.`
              : "La reserva quedó cancelada."
          );
          onChanged?.();
          void reload();
        });
      },
    });
  };

  return (
    <View style={styles.fill}>
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, space[8]) }]}>
        <IconBtn onPress={onBack} label="Volver">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </IconBtn>
        <Text style={styles.title}>Mi reserva</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[16], paddingBottom: insets.bottom + space[40], gap: space[12] }}>
        <Chip label={etiquetaEstadoReserva(reserva.estado, reserva.convertida_a_plus)} tone={tone} />
        <Text style={styles.h}>{reserva.cancha_nombre}</Text>
        <Mute>
          {`${reserva.campo_nombre} · ${formatFechaCorta(reserva.fecha)} · ${formatHora(reserva.hora_inicio)}`}
        </Mute>
        {lugar ? <Mute>{lugar}</Mute> : null}
        {reserva.canal === "whatsapp" ? <Mute>Reservada por WhatsApp · se paga en el predio</Mute> : null}

        <View style={styles.box}>
          <Text style={styles.sub}>Pago</Text>
          <Text style={styles.body}>
            {reserva.tipo_cobro === "total"
              ? `Pagaste el total: ${pesosReserva(reserva.monto_total)}`
              : reserva.tipo_cobro === "sena"
                ? `Seña pagada: ${pesosReserva(reserva.monto_total)}`
                : `Pagado: ${pesosReserva(reserva.monto_total)}`}
          </Text>
          {reserva.tipo_cobro === "sena" && reserva.resta_en_predio > 0 ? (
            <Mute>{`Restan ${pesosReserva(reserva.resta_en_predio)} en el predio`}</Mute>
          ) : null}
          {reserva.monto_cancha != null ? (
            <Mute>{`Cancha ${pesosReserva(reserva.monto_cancha)}`}</Mute>
          ) : null}
        </View>

        {reserva.texto_cancelacion ? (
          <View style={styles.box}>
            <Text style={styles.sub}>Cancelación</Text>
            <Mute>{reserva.texto_cancelacion}</Mute>
          </View>
        ) : null}

        {activa ? (
          <View style={{ gap: space[12], marginTop: space[8] }}>
            <Button
              label="Compartir con amigos"
              variant="secondary"
              onPress={() => {
                void compartirTexto(
                  `Jugamos el ${formatFechaCorta(reserva.fecha)} a las ${formatHora(reserva.hora_inicio)} en ${reserva.cancha_nombre}. Sumate en PorLaCancha.`
                );
              }}
            />
            <Button
              label={listaCount > 0 ? `Quién juega (${listaCount})` : "Cargar lista de jugadores"}
              variant="secondary"
              onPress={() => setListaOpen(true)}
            />
            <Button
              label={reserva.busca_gente ? "Dejar de buscar gente" : "Abrir si me falta gente"}
              variant="secondary"
              onPress={toggleBusca}
              loading={busy}
              disabled={busy}
            />
            {reserva.canal !== "whatsapp" ? (
              <Button
                label="Pasar a Plus"
                onPress={() => onPasarAPlus(reserva.id)}
                disabled={busy}
              />
            ) : null}
            {reserva.cancha_id ? (
              <Button
                label="Ver predio"
                variant="secondary"
                onPress={() => onOpenPredio(reserva.cancha_id!)}
              />
            ) : null}
            <Pressable onPress={cancelar} style={styles.dangerHit} disabled={busy}>
              <Text style={styles.danger}>Cancelar reserva</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: space[12], marginTop: space[8] }}>
            {reserva.convertida_a_plus ? (
              <Mute>Esta reserva se convirtió en un partido Plus. Buscalo en Mis partidos.</Mute>
            ) : null}
            {reserva.cancha_id ? (
              <Button label="Ver predio" variant="secondary" onPress={() => onOpenPredio(reserva.cancha_id!)} />
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navy },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[8] },
  title: { ...typeStyle("h3", colors.white), flex: 1, textAlign: "center" },
  h: typeStyle("h3", colors.white),
  sub: typeStyle("bodySmall", colors.gold),
  body: typeStyle("body", colors.white),
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: space[12],
    gap: space[4],
  },
  dangerHit: { minHeight: 48, justifyContent: "center", alignItems: "center" },
  danger: typeStyle("bodySmall", colors.danger),
});
