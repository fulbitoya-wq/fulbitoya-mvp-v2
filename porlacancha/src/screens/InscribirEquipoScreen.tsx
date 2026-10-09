import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { esErrorIdentidadDesafio } from "@shared/equipos";
import { colors, radius, space } from "@shared/design";
import type { EquipoListItem, MiembroPlantel } from "../lib/equipos";
import { getEquipoDetalle } from "../lib/equipos";
import { etiquetaTipo, minimoConvocados, type Desafio } from "../lib/desafios";
import {
  cancelarInscripcion,
  guardarConvocados,
  inscribirEquipo,
  type InscripcionMia,
} from "../lib/inscripciones";
import { montoAPagar, pesos } from "../lib/plc";
import { ChevronLeft, iconStroke } from "../lib/icons";
import { Button, EmptyState, IconBtn, Mute, showConfirm, showNotice } from "../ui";
import { typeStyle } from "../ui/textStyle";
import { CompleteIdentidadDesafioScreen } from "./auth/CompleteIdentidadDesafioScreen";

type Props = {
  desafio: Desafio;
  captainTeams: EquipoListItem[];
  existing: InscripcionMia | null;
  onBack: () => void;
  onDone: () => void;
  onCreateTeam: () => void;
};

export function InscribirEquipoScreen({ desafio, captainTeams, existing, onBack, onDone, onCreateTeam }: Props) {
  const insets = useSafeAreaInsets();
  const min = minimoConvocados(desafio.tipo);
  const [equipoId, setEquipoId] = useState(existing?.equipoId ?? captainTeams[0]?.id ?? "");
  const [miembros, setMiembros] = useState<MiembroPlantel[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set(existing?.convocados ?? []));
  const [busy, setBusy] = useState(false);
  const [needIdentidad, setNeedIdentidad] = useState(false);
  const premio = Number(desafio.premio) > 0;
  const porLaCancha = desafio.modalidad === "por_la_cancha";

  useEffect(() => {
    if (!equipoId) return;
    void getEquipoDetalle(equipoId).then((d) => {
      setMiembros(d.miembros);
      if (!existing) {
        const cap = d.miembros.find((m) => m.rol === "capitan" && m.usuario_id);
        setPicked(new Set(cap?.usuario_id ? [cap.usuario_id] : []));
      } else if (existing.equipoId === equipoId) {
        setPicked(new Set(existing.convocados));
      }
    });
  }, [equipoId, existing]);

  const selected = useMemo(() => [...picked], [picked]);
  // Alcanza con el capitán; el plantel se completa después (y después paga).
  const canSave = !!equipoId && selected.length >= 1 && !busy;

  const toggle = (id: string) => {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        const cap = miembros.find((m) => m.rol === "capitan" && m.usuario_id);
        if (cap?.usuario_id === id) return prev;
        n.delete(id);
      } else n.add(id);
      return n;
    });
  };

  const confirmar = async () => {
    setBusy(true);
    const res = existing
      ? await guardarConvocados(existing.id, selected)
      : await inscribirEquipo(desafio.id, equipoId, selected);
    setBusy(false);
    if (!res.ok) {
      if (!existing && porLaCancha && "code" in res && esErrorIdentidadDesafio(res.code)) {
        setNeedIdentidad(true);
        return;
      }
      showNotice("No se pudo guardar", res.error);
      return;
    }
    showNotice(
      existing ? "Convocados actualizados" : "Equipo inscripto",
      existing
        ? "Quedó la nueva lista. Podés seguir sumando jugadores."
        : res.ok && "estado" in res && res.estado === "pendiente_pago"
          ? porLaCancha
            ? "Tu equipo quedó anotado. Completá el plantel cuando quieras y pagá la cancha de anticipado antes del cierre."
            : "Reservamos el lugar 15 minutos. Confirmá el pago de prueba en el partido."
          : "La inscripción quedó confirmada. Podés completar el plantel después."
    );
    onDone();
  };

  if (needIdentidad) {
    return (
      <CompleteIdentidadDesafioScreen
        onCancel={() => setNeedIdentidad(false)}
        onDone={() => {
          setNeedIdentidad(false);
          void confirmar();
        }}
      />
    );
  }

  const cancelar = () => {
    if (!existing) return;
    void (async () => {
      let body = "El lugar queda libre. Los convocados se enteran por el aviso.";
      if (porLaCancha && existing.estado === "confirmada") {
        const m = await montoAPagar(existing.id);
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
          void cancelarInscripcion(existing.id).then((res) => {
            if (!res.ok) {
              showNotice("No se pudo cancelar", res.error);
              return;
            }
            showNotice("Inscripción cancelada", "Si correspondía, el reembolso de la cancha quedó registrado.");
            onDone();
          });
        },
      });
    })();
  };

  if (captainTeams.length === 0) {
    return (
      <View style={styles.fill}>
        <View style={[styles.bar, { paddingTop: Math.max(insets.top, space[8]) }]}>
          <IconBtn onPress={onBack} label="Volver">
            <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
          </IconBtn>
          <Text style={styles.title}>Inscribir equipo</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={{ padding: space[16] }}>
          <EmptyState
            title="Necesitás ser capitán"
            body="Solo el capitán inscribe al equipo. Creá uno o pedile la capitanía al que ya tenés."
            action={<Button label="Crear equipo" onPress={onCreateTeam} />}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, space[8]) }]}>
        <IconBtn onPress={onBack} label="Volver">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </IconBtn>
        <Text style={styles.title}>{existing ? "Convocados" : "Inscribir equipo"}</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[16], paddingBottom: insets.bottom + space[40] }}>
        <Mute>
          {`${etiquetaTipo(desafio.tipo)} · para anotar alcanza con el capitán (${min} cupos al horario del partido)${
            porLaCancha || premio
              ? " · por la cancha / premio: mayores de 18; el capitán que paga también carga DNI"
              : " · desde 13 años, con fecha de nacimiento en el perfil"
          }`}
        </Mute>

        {captainTeams.length > 1 && !existing ? (
          <View style={{ marginTop: space[16], gap: space[8] }}>
            <Text style={styles.h}>Equipo</Text>
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
        ) : (
          <Text style={[styles.h, { marginTop: space[16] }]}>
            {captainTeams.find((t) => t.id === equipoId)?.nombre ?? "Equipo"}
          </Text>
        )}

        {miembros.filter((m) => m.usuario_id && !m.es_invitado).length < min ? (
          <Mute>
            {`Tenés ${miembros.filter((m) => m.usuario_id && !m.es_invitado).length} con cuenta de ${min} cupos. Podés inscribirte igual y completar el plantel después; el pago lo hace el capitán.`}
          </Mute>
        ) : null}

        <Text style={[styles.h, { marginTop: space[16] }]}>
          {`Quiénes juegan (${selected.length}/${min})`}
        </Text>
        {miembros
          .filter((m) => m.usuario_id && !m.es_invitado)
          .map((m) => {
            const uid = m.usuario_id!;
            const on = picked.has(uid);
            return (
              <Pressable key={m.miembro_id} onPress={() => toggle(uid)} style={styles.row}>
                <View style={[styles.box, on && styles.boxOn]} />
                <Text style={styles.name}>
                  {m.nombre || (m.username ? `@${m.username}` : "Jugador")}
                  {m.rol === "capitan" ? " · Capitán" : ""}
                </Text>
              </Pressable>
            );
          })}
        {miembros
          .filter((m) => m.es_invitado)
          .map((m) => (
            <View key={m.miembro_id} style={styles.row}>
              <View style={[styles.box, styles.boxOn]} />
              <Text style={styles.name}>{m.invitado_nombre || m.nombre || "Invitado"} · Sin cuenta</Text>
            </View>
          ))}

        <View style={{ marginTop: space[24] }}>
          <Button
            label={busy ? "Guardando..." : existing ? "Guardar convocados" : "Confirmar inscripción"}
            onPress={() => void confirmar()}
            disabled={!canSave}
            loading={busy}
          />
        </View>
        {existing ? (
          <View style={{ marginTop: space[12] }}>
            <Button label="Cancelar inscripción" variant="danger" onPress={cancelar} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navy },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[8] },
  title: { ...typeStyle("h3", colors.white), flex: 1, textAlign: "center" },
  h: typeStyle("h3", colors.white),
  team: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space[12],
    backgroundColor: colors.surface,
  },
  teamOn: { borderColor: colors.gold },
  teamT: typeStyle("body", colors.white),
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space[12], paddingVertical: space[8] },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.gold },
  boxOn: { backgroundColor: colors.gold },
  name: typeStyle("body", colors.white),
});
