import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, space } from "@shared/design";
import type { Desafio } from "../lib/desafios";
import { cancelarInscripcion } from "../lib/inscripciones";
import { ChevronLeft, iconStroke } from "../lib/icons";
import { montoAPagar, pesos } from "../lib/plc";
import {
  esPartidoProximo,
  listMisPartidos,
  puedeCancelarInscripcion,
  puedeEditarConvocados,
  type MiPartido,
} from "../lib/mis-partidos";
import {
  esReservaProxima,
  etiquetaEstadoReserva,
  listarMisReservas,
  pesosReserva,
  type ReservaMia,
} from "../lib/reserva";
import {
  Button,
  Card,
  Chip,
  DesafioCard,
  EmptyState,
  FilterChip,
  Heading,
  IconBtn,
  Kicker,
  Mute,
  Screen,
  showConfirm,
  showNotice,
} from "../ui";
import { typeStyle } from "../ui/textStyle";

type Tab = "proximos" | "historial";

type Props = {
  guest: boolean;
  onRequestAuth: () => void;
  onOpenDesafio: (d: Desafio) => void;
  onEditarConvocados: (d: Desafio) => void;
  onOpenReserva?: (reserva: ReservaMia) => void;
  /** Si viene, es overlay de calendario: flecha arriba compacta, sin padding de tab bar */
  onBack?: () => void;
};

function rolLabel(p: MiPartido): string {
  if (p.miRol === "capitan") return "Capitán";
  if (p.miRol === "convocado") return "Convocado";
  return "Plantel";
}

function partidoSubtitle(p: MiPartido): string {
  return `${rolLabel(p)}${p.miEquipoNombre ? ` · ${p.miEquipoNombre}` : ""}${
    p.rivalNombre ? ` vs ${p.rivalNombre}` : p.inscritos.length < 2 ? " · buscando rival" : ""
  }`;
}

function ReservaRow({ r, onPress }: { r: ReservaMia; onPress?: () => void }) {
  const tone = r.convertida_a_plus
    ? "pending"
    : r.estado === "reservada"
      ? "open"
      : r.estado === "cancelada" || r.estado === "cancelada_predio"
        ? "cancelled"
        : "pending";
  const body = (
    <Card style={styles.reservaCard} onPress={onPress}>
      <Chip label={etiquetaEstadoReserva(r.estado, r.convertida_a_plus)} tone={tone} />
      <Text style={styles.resT}>
        {r.cancha_nombre} · {r.campo_nombre}
      </Text>
      <Mute>
        {`${r.fecha} · ${r.hora_inicio.slice(0, 5)}${
          r.canal === "whatsapp"
            ? " · por WhatsApp · se paga en el predio"
            : ` · ${pesosReserva(r.monto_total)}${r.tipo_cobro === "total" ? " · total" : " · seña"}`
        }`}
      </Mute>
      {r.tipo_cobro === "sena" && r.resta_en_predio > 0 && r.estado === "reservada" ? (
        <Mute>{`Restan ${pesosReserva(r.resta_en_predio)} en el predio`}</Mute>
      ) : null}
      {onPress ? <Text style={styles.link}>Ver detalle →</Text> : null}
    </Card>
  );
  return body;
}

export function MisPartidosScreen({
  guest,
  onRequestAuth,
  onOpenDesafio,
  onEditarConvocados,
  onOpenReserva,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("proximos");
  const [items, setItems] = useState<MiPartido[]>([]);
  const [reservas, setReservas] = useState<ReservaMia[]>([]);
  const [loading, setLoading] = useState(!guest);
  const [error, setError] = useState<string | null>(null);
  const embedded = Boolean(onBack);

  const load = useCallback(async () => {
    if (guest) {
      setItems([]);
      setReservas([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    const [partidos, mine] = await Promise.all([listMisPartidos(), listarMisReservas()]);
    if (!partidos.ok) {
      setError(partidos.error);
      setItems([]);
    } else {
      setError(null);
      setItems(partidos.items);
    }
    setReservas(mine.data);
    setLoading(false);
  }, [guest]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    if (tab === "proximos") {
      return items
        .filter(esPartidoProximo)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio));
    }
    return items
      .filter((p) => !esPartidoProximo(p))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.hora_inicio.localeCompare(a.hora_inicio));
  }, [items, tab]);

  const reservasTab = useMemo(() => {
    if (tab === "proximos") {
      return reservas
        .filter(esReservaProxima)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio));
    }
    return reservas
      .filter((r) => !esReservaProxima(r))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.hora_inicio.localeCompare(a.hora_inicio));
  }, [reservas, tab]);

  const pedirCancelar = (p: MiPartido) => {
    void (async () => {
      let body = "El lugar queda libre. Los convocados se enteran por el aviso.";
      if (p.inscripcionId && p.inscripcionEstado === "confirmada") {
        const m = await montoAPagar(p.inscripcionId);
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
          if (!p.inscripcionId) return;
          void cancelarInscripcion(p.inscripcionId).then((res) => {
            if (!res.ok) {
              showNotice("No se pudo cancelar", res.error);
              return;
            }
            showNotice("Inscripción cancelada", "Si correspondía, el reembolso de la cancha quedó registrado.");
            void load();
          });
        },
      });
    })();
  };

  const header = (
    <>
      {onBack ? (
        <View style={[styles.backRow, { paddingTop: Math.max(insets.top, space[8]) }]}>
          <IconBtn onPress={onBack} label="Volver">
            <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
          </IconBtn>
        </View>
      ) : null}
      <Kicker>Calendario</Kicker>
      <Heading>Mis partidos</Heading>
      <View style={styles.tabs}>
        <FilterChip label="Próximos" selected={tab === "proximos"} onPress={() => setTab("proximos")} />
        <FilterChip label="Historial" selected={tab === "historial"} onPress={() => setTab("historial")} />
      </View>
    </>
  );

  const list = (
    <>
      {error ? <Mute>{error}</Mute> : null}
      {reservasTab.length > 0 ? (
        <View style={{ gap: space[8], marginBottom: space[16] }}>
          <Text style={styles.sub}>Reservas</Text>
          {reservasTab.map((r) => (
            <ReservaRow key={r.id} r={r} onPress={onOpenReserva ? () => onOpenReserva(r) : undefined} />
          ))}
        </View>
      ) : null}
      {!loading && shown.length === 0 && reservasTab.length === 0 ? (
        <EmptyState
          title={tab === "proximos" ? "No tenés partidos próximos" : "Todavía no hay historial"}
          body={
            tab === "proximos"
              ? "Cuando reserves o tu equipo se inscriba, aparece acá."
              : "Acá van los que ya se jugaron, se cancelaron o ya pasó la hora."
          }
        />
      ) : (
        shown.map((p) => {
          const editar = puedeEditarConvocados(p);
          const cancelar = puedeCancelarInscripcion(p);
          const extraChips = (
            <>
              {p.inscripcionEstado === "cancelada" ? (
                <Chip label="Inscripción cancelada" tone="cancelled" />
              ) : null}
              {p.inscripcionEstado === "pendiente_pago" ? (
                <Chip label="Pendiente de pago" tone="payment" />
              ) : null}
            </>
          );
          const footer =
            editar || cancelar ? (
              <View style={styles.footerActions}>
                {editar ? (
                  <Pressable onPress={() => onEditarConvocados(p)} style={styles.linkHit}>
                    <Text style={styles.link}>Editar convocados</Text>
                  </Pressable>
                ) : null}
                {cancelar ? (
                  <Button label="Cancelar inscripción" variant="danger" onPress={() => pedirCancelar(p)} />
                ) : null}
              </View>
            ) : null;
          return (
            <DesafioCard
              key={`${p.id}-${p.inscripcionId ?? ""}`}
              desafio={p}
              onPress={() => onOpenDesafio(p)}
              extraChips={extraChips}
              subtitle={partidoSubtitle(p)}
              footer={footer}
            />
          );
        })
      )}
    </>
  );

  if (guest) {
    return (
      <Screen scroll tabBar={!embedded}>
        {header}
        <EmptyState
          title="Entrá para ver tus partidos"
          body="Cuando tu equipo se inscriba o te convoquen, aparecen acá."
          action={<Button label="Ingresar" onPress={onRequestAuth} />}
        />
      </Screen>
    );
  }

  // Overlay calendario: sin padding fantasma de tab bar (el tab está oculto).
  if (embedded) {
    return (
      <View style={styles.embed}>
        <View style={styles.embedPad}>
          {header}
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Math.max(insets.bottom, space[16]) + space[24], paddingHorizontal: space[20] },
          ]}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.gold} />}
        >
          {list}
        </ScrollView>
      </View>
    );
  }

  return (
    <Screen tabBar>
      {header}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.gold} />}
      >
        {list}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  embed: { flex: 1, backgroundColor: colors.navy },
  embedPad: { paddingHorizontal: space[20] },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: -space[12],
    marginBottom: space[4],
  },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: space[8], marginTop: space[12], marginBottom: space[8] },
  list: { paddingBottom: space[24], paddingTop: space[8] },
  footerActions: { gap: space[8] },
  linkHit: { minHeight: 44, justifyContent: "center" },
  link: typeStyle("bodySmall", colors.gold),
  sub: { ...typeStyle("h3", colors.white), marginBottom: space[8] },
  resT: typeStyle("body", colors.white),
  reservaCard: { gap: space[8], marginBottom: 0 },
});
