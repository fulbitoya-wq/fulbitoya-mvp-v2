import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, space } from "@shared/design";
import type { Desafio } from "../lib/desafios";
import { etiquetaEstado, chipToneEstado } from "../lib/desafios";
import { cancelarInscripcion } from "../lib/inscripciones";
import {
  esPartidoProximo,
  listMisPartidos,
  puedeCancelarInscripcion,
  puedeEditarConvocados,
  type MiPartido,
} from "../lib/mis-partidos";
import {
  cancelarReservaMia,
  etiquetaEstadoReserva,
  listarMisReservas,
  pesosReserva,
  type ReservaMia,
} from "../lib/reserva";
import {
  Button,
  Chip,
  DesafioCard,
  EmptyState,
  FilterChip,
  Heading,
  Kicker,
  Mute,
  Screen,
  showConfirm,
  showNotice,
} from "../ui";
import { typeStyle } from "../ui/textStyle";

const fondoAzul2 = require("../../assets/fondo-azul-2.jpeg");

type Tab = "proximos" | "historial";

type Props = {
  guest: boolean;
  onRequestAuth: () => void;
  onOpenDesafio: (d: Desafio) => void;
  onEditarConvocados: (d: Desafio) => void;
  /** Fase 3: pasar una reserva simple a Plus. */
  onPasarAPlus?: (reservaId: string) => void;
};

function rolLabel(p: MiPartido): string {
  if (p.miRol === "capitan") return "Capitán";
  if (p.miRol === "convocado") return "Convocado";
  return "Plantel";
}

export function MisPartidosScreen({
  guest,
  onRequestAuth,
  onOpenDesafio,
  onEditarConvocados,
  onPasarAPlus,
}: Props) {
  const [tab, setTab] = useState<Tab>("proximos");
  const [items, setItems] = useState<MiPartido[]>([]);
  const [reservas, setReservas] = useState<ReservaMia[]>([]);
  const [loading, setLoading] = useState(!guest);
  const [error, setError] = useState<string | null>(null);

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

  const pedirCancelar = (p: MiPartido) => {
    showConfirm({
      title: "Cancelar inscripción",
      body: "El lugar queda libre. Los convocados se enteran por el aviso.",
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
          void load();
        });
      },
    });
  };

  if (guest) {
    return (
      <Screen scroll background={fondoAzul2} tabBar>
        <Kicker>Calendario</Kicker>
        <Heading>Mis partidos</Heading>
        <EmptyState
          title="Entrá para ver tus partidos"
          body="Cuando tu equipo se inscriba o te convoquen, aparecen acá."
          action={<Button label="Ingresar" onPress={onRequestAuth} />}
        />
      </Screen>
    );
  }

  return (
    <Screen background={fondoAzul2} tabBar>
      <Kicker>Calendario</Kicker>
      <Heading>Mis partidos</Heading>
      <View style={styles.tabs}>
        <FilterChip label="Próximos" selected={tab === "proximos"} onPress={() => setTab("proximos")} />
        <FilterChip label="Historial" selected={tab === "historial"} onPress={() => setTab("historial")} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.gold} />}
      >
        {error ? <Mute>{error}</Mute> : null}
        {tab === "proximos" && reservas.filter((r) => r.estado === "reservada").length > 0 ? (
          <View style={{ gap: space[8] }}>
            <Text style={styles.sub}>Reservas</Text>
            {reservas
              .filter((r) => r.estado === "reservada")
              .map((r) => (
                <View key={r.id} style={styles.block}>
                  <Chip label={etiquetaEstadoReserva(r.estado)} tone="open" />
                  <Text style={styles.resT}>
                    {r.cancha_nombre} · {r.campo_nombre}
                  </Text>
                  <Mute>
                    {r.fecha} · {r.hora_inicio.slice(0, 5)}
                    {r.canal === "whatsapp"
                      ? " · por WhatsApp · se paga en el predio"
                      : ` · ${pesosReserva(r.monto_total)}${r.tipo_cobro === "total" ? " · total" : " · seña"}`}
                  </Mute>
                  <View style={styles.actions}>
                    {onPasarAPlus && r.canal !== "whatsapp" ? (
                      <Pressable onPress={() => onPasarAPlus(r.id)} style={styles.linkHit}>
                        <Text style={styles.link}>Pasar a Plus</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => {
                        showConfirm({
                          title: "Cancelar reserva",
                          body: "Se aplica la regla de cancelación del predio (congelada al pagar).",
                          cancelLabel: "Volver",
                          confirmLabel: "Cancelar reserva",
                          danger: true,
                          onConfirm: () => {
                            void cancelarReservaMia(r.id).then((res) => {
                              if (!res.ok) {
                                showNotice("No se pudo cancelar", res.error);
                                return;
                              }
                              void load();
                            });
                          },
                        });
                      }}
                      style={styles.linkHit}
                    >
                      <Text style={styles.danger}>Cancelar reserva</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
          </View>
        ) : null}
        {!loading && shown.length === 0 && reservas.filter((r) => r.estado === "reservada").length === 0 ? (
          <EmptyState
            title={tab === "proximos" ? "No tenés partidos próximos" : "Todavía no hay historial"}
            body={
              tab === "proximos"
                ? "Cuando alguno de tus equipos se inscriba o te convoquen, el desafío queda acá."
                : "Acá van los que ya se jugaron, se cancelaron o ya pasó la hora."
            }
          />
        ) : (
          shown.map((p) => {
            const editar = puedeEditarConvocados(p);
            const cancelar = puedeCancelarInscripcion(p);
            return (
              <View key={`${p.id}-${p.inscripcionId ?? ""}`} style={styles.block}>
                <View style={styles.chips}>
                  <Chip label={etiquetaEstado(p.estado)} tone={chipToneEstado(p.estado)} />
                  {p.inscripcionEstado === "cancelada" ? <Chip label="Inscripción cancelada" tone="cancelled" /> : null}
                  {p.inscripcionEstado === "pendiente_pago" ? <Chip label="Pendiente de pago" tone="payment" /> : null}
                </View>
                <DesafioCard desafio={p} onPress={() => onOpenDesafio(p)} />
                <Mute>
                  {rolLabel(p)}
                  {p.miEquipoNombre ? ` · ${p.miEquipoNombre}` : ""}
                  {p.rivalNombre ? ` vs ${p.rivalNombre}` : p.inscritos.length < 2 ? " · buscando rival" : ""}
                </Mute>
                {editar || cancelar ? (
                  <View style={styles.actions}>
                    {editar ? (
                      <Pressable onPress={() => onEditarConvocados(p)} style={styles.linkHit}>
                        <Text style={styles.link}>Editar convocados</Text>
                      </Pressable>
                    ) : null}
                    {cancelar ? (
                      <Pressable onPress={() => pedirCancelar(p)} style={styles.linkHit}>
                        <Text style={styles.danger}>Cancelar inscripción</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: space[8], marginTop: space[12], marginBottom: space[8] },
  list: { paddingBottom: space[40], paddingTop: space[8] },
  block: { marginBottom: space[16] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[8], marginBottom: space[8] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[16], marginTop: space[8] },
  linkHit: { minHeight: 44, justifyContent: "center" },
  link: typeStyle("bodySmall", colors.gold),
  danger: typeStyle("bodySmall", colors.danger),
  sub: { ...typeStyle("h3", colors.white), marginBottom: space[8] },
  resT: typeStyle("body", colors.white),
});
