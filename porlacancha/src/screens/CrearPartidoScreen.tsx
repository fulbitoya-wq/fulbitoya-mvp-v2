import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { esErrorIdentidadDesafio } from "@shared/equipos";
import { colors, radius, space } from "@shared/design";
import type { EquipoListItem, MiembroPlantel } from "../lib/equipos";
import { getEquipoDetalle } from "../lib/equipos";
import { etiquetaTipo, formatFechaCorta, formatHora, minimoConvocados } from "../lib/desafios";
import {
  calcularCondiciones,
  crearPartidoPlc,
  etiquetaModalidadPlc,
  listarTurnosPublicos,
  pesos,
  type PlcModalidad,
  type PlcReglaEmpate,
  type TurnoPublico,
} from "../lib/plc";
import { ChevronLeft, iconStroke } from "../lib/icons";
import { Button, EmptyState, IconBtn, Mute, showNotice } from "../ui";
import { typeStyle } from "../ui/textStyle";
import { CompleteIdentidadDesafioScreen } from "./auth/CompleteIdentidadDesafioScreen";

type Props = {
  captainTeams: EquipoListItem[];
  onBack: () => void;
  onCreateTeam: () => void;
  onCreated: (desafioId: string, inscripcionId: string) => void;
};

export function CrearPartidoScreen({ captainTeams, onBack, onCreateTeam, onCreated }: Props) {
  const insets = useSafeAreaInsets();
  const [equipoId, setEquipoId] = useState(captainTeams[0]?.id ?? "");
  const [miembros, setMiembros] = useState<MiembroPlantel[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [modalidad, setModalidad] = useState<PlcModalidad>("por_la_cancha");
  const [regla, setRegla] = useState<PlcReglaEmpate>("penales");
  const [turnos, setTurnos] = useState<TurnoPublico[]>([]);
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const [cond, setCond] = useState<Record<string, unknown> | null>(null);
  const [condErr, setCondErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needIdentidad, setNeedIdentidad] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const equipo = captainTeams.find((t) => t.id === equipoId);
  const formato = (equipo?.formato_habitual ?? "f5").toLowerCase();
  const min = minimoConvocados(formato);

  useEffect(() => {
    void listarTurnosPublicos().then(({ data, error }) => {
      setTurnos(data);
      setLoadErr(error);
    });
  }, []);

  useEffect(() => {
    if (!equipoId) return;
    void getEquipoDetalle(equipoId).then((d) => {
      setMiembros(d.miembros);
      const cap = d.miembros.find((m) => m.rol === "capitan");
      setPicked(new Set(cap ? [cap.usuario_id] : []));
    });
  }, [equipoId]);

  const turnosFmt = useMemo(
    () => turnos.filter((t) => String(t.campo_tipo).toLowerCase() === formato),
    [turnos, formato]
  );

  useEffect(() => {
    if (!turnoId) {
      setCond(null);
      setCondErr(null);
      return;
    }
    let cancelled = false;
    void calcularCondiciones(turnoId, modalidad).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setCond(null);
        setCondErr(res.error);
        return;
      }
      setCond(res.cond);
      setCondErr(null);
    });
    return () => {
      cancelled = true;
    };
  }, [turnoId, modalidad]);

  const selected = useMemo(() => [...picked], [picked]);
  const turno = turnosFmt.find((t) => t.id === turnoId) ?? null;

  const toggle = (id: string) => {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const publicar = async () => {
    if (!turnoId) return;
    setBusy(true);
    const res = await crearPartidoPlc({
      disponibilidadId: turnoId,
      equipoId,
      convocados: selected,
      reglaEmpate: regla,
      modalidad,
    });
    setBusy(false);
    if (!res.ok) {
      if (modalidad === "por_la_cancha" && esErrorIdentidadDesafio(res.code)) {
        setNeedIdentidad(true);
        return;
      }
      showNotice("No se pudo publicar", res.error);
      return;
    }
    onCreated(res.desafioId, res.inscripcionId);
  };

  if (needIdentidad) {
    return (
      <CompleteIdentidadDesafioScreen
        onCancel={() => setNeedIdentidad(false)}
        onDone={() => {
          setNeedIdentidad(false);
          void publicar();
        }}
      />
    );
  }

  if (captainTeams.length === 0) {
    return (
      <View style={styles.fill}>
        <View style={[styles.bar, { paddingTop: Math.max(insets.top, space[8]) }]}>
          <IconBtn onPress={onBack} label="Volver">
            <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
          </IconBtn>
          <Text style={styles.title}>Publicar partido</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={{ padding: space[16] }}>
          <EmptyState
            title="Necesitás ser capitán"
            body="Solo el capitán publica el partido. Creá un equipo o pedí la capitanía."
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
        <Text style={styles.title}>Publicar partido</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[16], paddingBottom: insets.bottom + space[40] }}>
        <Text style={styles.h}>Modalidad</Text>
        <View style={styles.rowWrap}>
          {(["por_la_cancha", "amistoso"] as const).map((m) => (
            <Pressable key={m} onPress={() => setModalidad(m)} style={[styles.chip, modalidad === m && styles.chipOn]}>
              <Text style={styles.chipT}>{etiquetaModalidadPlc(m)}</Text>
            </Pressable>
          ))}
        </View>
        <Mute>
          {modalidad === "amistoso"
            ? "El rival puede ser un equipo o jugadores sueltos. Si se completa, te devolvemos la mitad de la cancha."
            : "Dos equipos. El monto lo calcula el predio: no lo edités vos."}
        </Mute>

        {captainTeams.length > 1 ? (
          <View style={{ marginTop: space[16], gap: space[8] }}>
            <Text style={styles.h}>Equipo</Text>
            {captainTeams.map((t) => (
              <Pressable key={t.id} onPress={() => setEquipoId(t.id)} style={[styles.card, equipoId === t.id && styles.cardOn]}>
                <Text style={styles.body}>{t.nombre}</Text>
                <Mute>{etiquetaTipo(t.formato_habitual ?? "f5")}</Mute>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={[styles.h, { marginTop: space[16] }]}>{equipo?.nombre}</Text>
        )}

        <Text style={[styles.h, { marginTop: space[16] }]}>Turno</Text>
        {loadErr ? <Mute>{loadErr}</Mute> : null}
        {turnosFmt.length === 0 ? (
          <Mute>No hay turnos libres para {etiquetaTipo(formato)}.</Mute>
        ) : (
          turnosFmt.slice(0, 40).map((t) => (
            <Pressable key={t.id} onPress={() => setTurnoId(t.id)} style={[styles.card, turnoId === t.id && styles.cardOn]}>
              <Text style={styles.body}>
                {t.cancha_nombre}
                {t.barrio ? ` · ${t.barrio}` : ""}
              </Text>
              <Mute>
                {t.campo_nombre} · {formatFechaCorta(t.fecha)} · {formatHora(t.hora_inicio)}
                {t.precio != null ? ` · ${pesos(t.precio)}` : ""}
              </Mute>
            </Pressable>
          ))
        )}

        {condErr ? <Text style={styles.err}>{condErr}</Text> : null}
        {cond && cond.ok !== false ? (
          <View style={{ marginTop: space[12], gap: space[4] }}>
            <Text style={styles.h}>Condiciones</Text>
            <Mute>{typeof cond.mensaje_tramo === "string" ? cond.mensaje_tramo : ""}</Mute>
            <Mute>Cancha {pesos(cond.precio_cancha)} · tu equipo {pesos(cond.monto_equipo_a)}</Mute>
            {modalidad === "amistoso" ? (
              <Mute>
                Rival equipo {pesos(cond.monto_rival_equipo)} · suelto {pesos(cond.monto_rival_jugador)}
              </Mute>
            ) : (
              <Mute>Rival {pesos(cond.monto_rival_equipo)}</Mute>
            )}
            <Mute>Si no hay rival, se retiene {pesos(cond.sena_sin_rival)}.</Mute>
          </View>
        ) : null}

        <Text style={[styles.h, { marginTop: space[16] }]}>Si empatan</Text>
        <View style={styles.rowWrap}>
          <Pressable onPress={() => setRegla("penales")} style={[styles.chip, regla === "penales" && styles.chipOn]}>
            <Text style={styles.chipT}>Penales</Text>
          </Pressable>
          <Pressable
            onPress={() => setRegla("mitad_cada_uno")}
            style={[styles.chip, regla === "mitad_cada_uno" && styles.chipOn]}
          >
            <Text style={styles.chipT}>Mitad de cancha cada uno</Text>
          </Pressable>
        </View>

        <Text style={[styles.h, { marginTop: space[16] }]}>
          Quiénes juegan ({selected.length}/{min})
        </Text>
        {miembros.map((m) => {
          const on = picked.has(m.usuario_id);
          return (
            <Pressable key={m.usuario_id} onPress={() => toggle(m.usuario_id)} style={styles.row}>
              <View style={[styles.box, on && styles.boxOn]} />
              <Text style={styles.body}>
                {m.nombre || (m.username ? `@${m.username}` : "Jugador")}
                {m.rol === "capitan" ? " · Capitán" : ""}
              </Text>
            </Pressable>
          );
        })}

        <View style={{ marginTop: space[24] }}>
          <Button
            label={busy ? "Publicando..." : "Publicar y continuar al pago"}
            onPress={() => void publicar()}
            disabled={!turno || selected.length < min || busy || miembros.length < min}
            loading={busy}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navy },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[8] },
  title: { ...typeStyle("h3", colors.white), flex: 1, textAlign: "center" },
  h: typeStyle("h3", colors.white),
  body: typeStyle("body", colors.white),
  err: { ...typeStyle("caption", colors.danger), marginTop: space[8] },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: space[8], marginVertical: space[8] },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space[12],
    paddingVertical: space[8],
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.gold },
  chipT: typeStyle("bodySmall", colors.white),
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
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space[12], paddingVertical: space[8] },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.gold },
  boxOn: { backgroundColor: colors.gold },
});
