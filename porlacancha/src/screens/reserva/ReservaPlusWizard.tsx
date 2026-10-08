import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { esErrorIdentidadDesafio } from "@shared/equipos";
import { colors, radius, space } from "@shared/design";
import type { EquipoListItem, MiembroPlantel } from "../../lib/equipos";
import { getEquipoDetalle } from "../../lib/equipos";
import { etiquetaTipo, formatFechaCorta, formatHora, minimoConvocados } from "../../lib/desafios";
import {
  cotizarReservaPlus,
  crearPartidoPlc,
  etiquetaModalidadPlc,
  listarTurnosPublicos,
  pasarAPlusPlc,
  pesos,
  type CotizacionPlus,
  type PlcModalidad,
  type PlcReglaEmpate,
  type TurnoPublico,
} from "../../lib/plc";
import {
  clearReservaDraft,
  patchReservaDraft,
  type ReservaBusca,
  type ReservaDraft,
} from "../../lib/reserva-draft";
import { ChevronLeft, iconStroke } from "../../lib/icons";
import { Button, EmptyState, IconBtn, Mute, showNotice } from "../../ui";
import { typeStyle } from "../../ui/textStyle";
import { CompleteIdentidadDesafioScreen } from "../auth/CompleteIdentidadDesafioScreen";

type Step = "modo" | "turno" | "equipo" | "libres" | "regla" | "resumen";

type Props = {
  captainTeams: EquipoListItem[];
  initial?: Partial<ReservaDraft> | null;
  onBack: () => void;
  onCreateTeam: () => void;
  onRequestAuth: () => void;
  loggedIn: boolean;
  onCreated: (desafioId: string, inscripcionId: string) => void;
};

const MODALIDADES: PlcModalidad[] = ["por_la_cancha", "amistoso", "competitivo"];
const BUSCAS: { id: ReservaBusca; label: string; hint: string }[] = [
  { id: "sueltos", label: "Jugadores sueltos", hint: "Sumás gente de a una" },
  { id: "equipo", label: "Un equipo rival", hint: "Buscás un equipo completo" },
  { id: "ambos", label: "Ambos", hint: "Equipo o sueltos" },
];

export function ReservaPlusWizard({
  captainTeams,
  initial = null,
  onBack,
  onCreateTeam,
  onRequestAuth,
  loggedIn,
  onCreated,
}: Props) {
  const insets = useSafeAreaInsets();
  const fromReserva = Boolean(initial?.fromReservaId);
  const hasTurnoInicial = Boolean(initial?.turnoId);

  const [step, setStep] = useState<Step>(() => {
    if (fromReserva || hasTurnoInicial) return "modo";
    return "turno";
  });
  const [modalidad, setModalidad] = useState<PlcModalidad>(initial?.modalidad ?? "amistoso");
  const [equipoId, setEquipoId] = useState(initial?.equipoId ?? captainTeams[0]?.id ?? "");
  const [miembros, setMiembros] = useState<MiembroPlantel[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set(initial?.convocados ?? []));
  const [turnos, setTurnos] = useState<TurnoPublico[]>([]);
  const [turnoId, setTurnoId] = useState<string | null>(initial?.turnoId ?? null);
  const [libres, setLibres] = useState(initial?.libres ?? 2);
  const [busca, setBusca] = useState<ReservaBusca>(initial?.busca ?? "ambos");
  const [regla, setRegla] = useState<PlcReglaEmpate>(initial?.reglaEmpate ?? "penales");
  const [cot, setCot] = useState<CotizacionPlus | null>(null);
  const [cotErr, setCotErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needIdentidad, setNeedIdentidad] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const equipo = captainTeams.find((t) => t.id === equipoId);
  const formato = (equipo?.formato_habitual ?? "f5").toLowerCase();
  const min = minimoConvocados(formato);
  const selected = useMemo(() => [...picked], [picked]);

  useEffect(() => {
    void patchReservaDraft({
      kind: "plus",
      canchaId: initial?.canchaId,
      turnoId: turnoId ?? undefined,
      fromReservaId: initial?.fromReservaId,
      modalidad,
      equipoId: equipoId || undefined,
      convocados: selected,
      libres,
      busca,
      reglaEmpate: regla,
    });
  }, [turnoId, modalidad, equipoId, selected, libres, busca, regla, initial?.canchaId, initial?.fromReservaId]);

  useEffect(() => {
    if (fromReserva || hasTurnoInicial) return;
    void listarTurnosPublicos().then(({ data, error }) => {
      setTurnos(data);
      setLoadErr(error);
    });
  }, [fromReserva, hasTurnoInicial]);

  useEffect(() => {
    if (!equipoId) return;
    void getEquipoDetalle(equipoId).then((d) => {
      setMiembros(d.miembros);
      setPicked((prev) => {
        if (prev.size > 0) return prev;
        const cap = d.miembros.find((m) => m.rol === "capitan" && m.usuario_id);
        return new Set(cap?.usuario_id ? [cap.usuario_id] : []);
      });
    });
  }, [equipoId]);

  const turnosFmt = useMemo(() => {
    let list = turnos.filter((t) => String(t.campo_tipo).toLowerCase() === formato);
    if (initial?.canchaId) list = list.filter((t) => t.cancha_id === initial.canchaId);
    return list;
  }, [turnos, formato, initial?.canchaId]);

  const turnoLabel = useMemo(() => {
    if (!turnoId) return fromReserva ? "Turno de tu reserva" : null;
    const t = turnosFmt.find((x) => x.id === turnoId);
    if (!t && cot) {
      return `${cot.cancha_nombre} · ${formatFechaCorta(cot.fecha)} · ${formatHora(cot.hora_inicio)}`;
    }
    if (!t) return null;
    return `${t.cancha_nombre} · ${formatFechaCorta(t.fecha)} · ${formatHora(t.hora_inicio)}`;
  }, [turnoId, turnosFmt, cot, fromReserva]);

  useEffect(() => {
    if (step !== "resumen" || !turnoId || fromReserva) {
      if (fromReserva && step === "resumen") {
        // cotización preview no aplica igual; se muestra upgrade al publicar
        setCot(null);
        setCotErr(null);
      }
      return;
    }
    let cancelled = false;
    setCotErr(null);
    void cotizarReservaPlus({
      disponibilidadId: turnoId,
      modalidad,
      libres,
      busca,
      tipoCobro: "total",
    }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setCot(null);
        setCotErr(res.error);
        return;
      }
      setCot(res.cot);
    });
    return () => {
      cancelled = true;
    };
  }, [step, turnoId, modalidad, libres, busca, fromReserva]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const goNext = () => {
    if (step === "turno") {
      if (!turnoId) {
        showNotice("Turno", "Elegí un horario libre.");
        return;
      }
      setStep("modo");
      return;
    }
    if (step === "modo") {
      setStep("equipo");
      return;
    }
    if (step === "equipo") {
      if (!equipoId) {
        showNotice("Equipo", "Elegí el equipo con el que publicás.");
        return;
      }
      if (selected.length < min) {
        showNotice("Convocados", `Marcá al menos ${min} jugadores.`);
        return;
      }
      setStep("libres");
      return;
    }
    if (step === "libres") {
      setStep("regla");
      return;
    }
    if (step === "regla") {
      setStep("resumen");
    }
  };

  const goBackStep = () => {
    if (step === "resumen") {
      setStep("regla");
      return;
    }
    if (step === "regla") {
      setStep("libres");
      return;
    }
    if (step === "libres") {
      setStep("equipo");
      return;
    }
    if (step === "equipo") {
      setStep("modo");
      return;
    }
    if (step === "modo") {
      if (fromReserva || hasTurnoInicial) {
        onBack();
        return;
      }
      setStep("turno");
      return;
    }
    onBack();
  };

  const publicar = async () => {
    if (!loggedIn) {
      onRequestAuth();
      return;
    }
    if (!equipoId) return;
    setBusy(true);
    const common = {
      equipoId,
      convocados: selected,
      reglaEmpate: regla,
      modalidad,
      libres,
      busca,
    };
    const res = fromReserva && initial?.fromReservaId
      ? await pasarAPlusPlc({ ...common, reservaId: initial.fromReservaId })
      : turnoId
        ? await crearPartidoPlc({ ...common, disponibilidadId: turnoId })
        : { ok: false as const, error: "Elegí un turno.", code: "turno_no_existe" };
    setBusy(false);
    if (!res.ok) {
      if (modalidad === "por_la_cancha" && esErrorIdentidadDesafio(res.code)) {
        setNeedIdentidad(true);
        return;
      }
      showNotice("No se pudo publicar", res.error);
      return;
    }
    await clearReservaDraft();
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
          <Text style={styles.title}>Reserva Plus</Text>
          <View style={{ width: 48 }} />
        </View>
        <View style={{ padding: space[16] }}>
          <EmptyState
            title="Necesitás ser capitán"
            body="Solo el capitán arma el partido Plus. Creá un equipo o pedí la capitanía."
            action={<Button label="Crear equipo" onPress={onCreateTeam} />}
          />
        </View>
      </View>
    );
  }

  const stepTitle =
    step === "turno"
      ? "Elegí el turno"
      : step === "modo"
        ? "¿Cómo lo jugás?"
        : step === "equipo"
          ? "Equipo y convocados"
          : step === "libres"
            ? "¿Qué buscás?"
            : step === "regla"
              ? "Si empatan"
              : "Resumen y pago";

  return (
    <View style={styles.fill}>
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, space[8]) }]}>
        <IconBtn onPress={goBackStep} label="Volver">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </IconBtn>
        <Text style={styles.title}>Reserva Plus</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[16], paddingBottom: insets.bottom + space[40] }}>
        <Text style={styles.h}>{stepTitle}</Text>
        {fromReserva ? (
          <Mute>Pasás tu reserva simple a Plus. Solo cobramos el upgrade (tarifa y, si hace falta, el resto de cancha).</Mute>
        ) : (
          <Mute>Armá el partido en la app. La tarifa Plus la calcula el servidor.</Mute>
        )}

        {step === "turno" ? (
          <View style={{ marginTop: space[12] }}>
            {loadErr ? <Mute>{loadErr}</Mute> : null}
            {turnosFmt.length === 0 ? (
              <Mute>{`No hay turnos libres para ${etiquetaTipo(formato)}.`}</Mute>
            ) : (
              turnosFmt.slice(0, 50).map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setTurnoId(t.id)}
                  style={[styles.card, turnoId === t.id && styles.cardOn]}
                >
                  <Text style={styles.body}>
                    {t.cancha_nombre}
                    {t.barrio ? ` · ${t.barrio}` : ""}
                  </Text>
                  <Mute>
                    {`${t.campo_nombre} · ${formatFechaCorta(t.fecha)} · ${formatHora(t.hora_inicio)}${
                      t.precio != null ? ` · ${pesos(t.precio)}` : ""
                    }`}
                  </Mute>
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        {step === "modo" ? (
          <View style={{ marginTop: space[12], gap: space[8] }}>
            {MODALIDADES.map((m) => (
              <Pressable key={m} onPress={() => setModalidad(m)} style={[styles.card, modalidad === m && styles.cardOn]}>
                <Text style={styles.body}>{etiquetaModalidadPlc(m)}</Text>
                <Mute>
                  {m === "por_la_cancha"
                    ? "18+, con DNI. Dos equipos. Cancha completa."
                    : m === "competitivo"
                      ? "Desde 13 años. Formato serio, sin DNI."
                      : "Desde 13 años. Rival equipo o sueltos."}
                </Mute>
              </Pressable>
            ))}
          </View>
        ) : null}

        {step === "equipo" ? (
          <View style={{ marginTop: space[12] }}>
            {captainTeams.length > 1 ? (
              <View style={{ gap: space[8], marginBottom: space[12] }}>
                {captainTeams.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => setEquipoId(t.id)}
                    style={[styles.card, equipoId === t.id && styles.cardOn]}
                  >
                    <Text style={styles.body}>{t.nombre}</Text>
                    <Mute>{etiquetaTipo(t.formato_habitual ?? "f5")}</Mute>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[styles.body, { marginBottom: space[8] }]}>{equipo?.nombre}</Text>
            )}
            <Text style={styles.h}>
              Quiénes juegan ({selected.length}/{min})
            </Text>
            {miembros
              .filter((m) => m.usuario_id && !m.es_invitado)
              .map((m) => {
                const uid = m.usuario_id!;
                const on = picked.has(uid);
                return (
                  <Pressable key={m.miembro_id} onPress={() => toggle(uid)} style={styles.row}>
                    <View style={[styles.box, on && styles.boxOn]} />
                    <Text style={styles.body}>
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
                  <Text style={styles.body}>{m.invitado_nombre || m.nombre || "Invitado"} · Sin cuenta</Text>
                </View>
              ))}
          </View>
        ) : null}

        {step === "libres" ? (
          <View style={{ marginTop: space[12], gap: space[12] }}>
            <Text style={styles.sub}>Buscás</Text>
            {BUSCAS.map((b) => (
              <Pressable key={b.id} onPress={() => setBusca(b.id)} style={[styles.card, busca === b.id && styles.cardOn]}>
                <Text style={styles.body}>{b.label}</Text>
                <Mute>{b.hint}</Mute>
              </Pressable>
            ))}
            {busca !== "equipo" ? (
              <View>
                <Text style={[styles.sub, { marginTop: space[8] }]}>Lugares libres: {libres}</Text>
                <View style={styles.rowWrap}>
                  {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => setLibres(n)}
                      style={[styles.chip, libres === n && styles.chipOn]}
                    >
                      <Text style={styles.chipT}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
                <Mute>1–2 libres: tarifa más baja. 3 o más (o rival equipo): tarifa alta.</Mute>
              </View>
            ) : null}
          </View>
        ) : null}

        {step === "regla" ? (
          <View style={{ marginTop: space[12], gap: space[8] }}>
            <Pressable onPress={() => setRegla("penales")} style={[styles.card, regla === "penales" && styles.cardOn]}>
              <Text style={styles.body}>Penales</Text>
            </Pressable>
            <Pressable
              onPress={() => setRegla("mitad_cada_uno")}
              style={[styles.card, regla === "mitad_cada_uno" && styles.cardOn]}
            >
              <Text style={styles.body}>Mitad de cancha cada uno</Text>
            </Pressable>
          </View>
        ) : null}

        {step === "resumen" ? (
          <View style={{ marginTop: space[12], gap: space[8] }}>
            <Text style={styles.body}>{etiquetaModalidadPlc(modalidad)}</Text>
            {turnoLabel ? <Mute>{turnoLabel}</Mute> : null}
            <Mute>
              {`${equipo?.nombre ?? "Equipo"} · ${selected.length} convocados · buscás ${busca}${
                busca !== "equipo" ? ` · ${libres} libres` : ""
              }`}
            </Mute>
            <Mute>{`Empate: ${regla === "penales" ? "penales" : "mitad de cancha cada uno"}`}</Mute>
            {cotErr ? <Text style={styles.err}>{cotErr}</Text> : null}
            {cot ? (
              <View style={styles.summaryBox}>
                <Text style={styles.body}>Cancha {pesos(cot.monto_cancha)}</Text>
                <Text style={styles.body}>Tarifa Plus {pesos(cot.tarifa_plus)}</Text>
                <Text style={styles.h}>Pagás ahora {pesos(cot.monto_pagar_ahora)}</Text>
                <Mute>{cot.aclaracion_tarifa}</Mute>
              </View>
            ) : null}
            {fromReserva ? (
              <View style={styles.summaryBox}>
                <Text style={styles.body}>Upgrade desde tu reserva</Text>
                <Mute>Al confirmar, el servidor calcula solo lo que falta (tarifa Plus y, si pagaste seña en por la cancha, el resto de cancha).</Mute>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ marginTop: space[24] }}>
          {step === "resumen" ? (
            <Button
              label={busy ? "Publicando..." : loggedIn ? "Publicar y continuar al pago" : "Ingresá para publicar"}
              onPress={() => void publicar()}
              disabled={busy || (!fromReserva && !turnoId) || selected.length < min}
              loading={busy}
            />
          ) : (
            <Button label="Continuar" onPress={goNext} />
          )}
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
  sub: typeStyle("bodySmall", colors.gold),
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
    minWidth: 44,
    alignItems: "center",
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
    marginTop: space[4],
  },
  cardOn: { borderColor: colors.gold },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space[12], paddingVertical: space[8] },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.gold },
  boxOn: { backgroundColor: colors.gold },
  summaryBox: {
    marginTop: space[8],
    padding: space[12],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: space[4],
  },
});
