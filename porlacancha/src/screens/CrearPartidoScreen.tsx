import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { esErrorIdentidadDesafio } from "@shared/equipos";
import { colors, radius, space } from "@shared/design";
import { rpcInvitarSinCuenta } from "@shared/equipos";
import type { EquipoListItem, MiembroPlantel } from "../lib/equipos";
import { getEquipoDetalle } from "../lib/equipos";
import { etiquetaTipo, formatFechaCorta, formatHora, minimoConvocados } from "../lib/desafios";
import {
  calcularCondiciones,
  cotizarDepositoPlc,
  crearEquipoRapidoPlc,
  crearPartidoDepositoPlc,
  crearPartidoLibrePlc,
  crearPartidoPlc,
  etiquetaModalidadPlc,
  listarTurnosPublicos,
  pesos,
  upsertPredioPlaces,
  type PlcModalidad,
  type PlcReglaEmpate,
  type TurnoPublico,
} from "../lib/plc";
import { supabase } from "../lib/supabase";
import { ChevronLeft, iconStroke } from "../lib/icons";
import { Button, EmptyState, IconBtn, Mute, PlacesSearch, showNotice, type PlacePick } from "../ui";
import { typeStyle } from "../ui/textStyle";
import { CompleteIdentidadDesafioScreen } from "./auth/CompleteIdentidadDesafioScreen";

type Props = {
  captainTeams: EquipoListItem[];
  onBack: () => void;
  onCreateTeam: () => void;
  onCreated: (desafioId: string, inscripcionId: string) => void;
  onTeamsChanged?: () => void;
};

type OrigenCancha = "fulbitoya" | "places";
type EquipoModo = "equipo" | "nuevo" | "sin_equipo";
type Superficie = "cesped_natural" | "cesped_sintetico" | "tierra" | "cemento";

export function CrearPartidoScreen({
  captainTeams,
  onBack,
  onCreateTeam,
  onCreated,
  onTeamsChanged,
}: Props) {
  const insets = useSafeAreaInsets();
  const [equipoModo, setEquipoModo] = useState<EquipoModo>(captainTeams.length ? "equipo" : "nuevo");
  const [equipoId, setEquipoId] = useState(captainTeams[0]?.id ?? "");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [miembros, setMiembros] = useState<MiembroPlantel[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [modalidad, setModalidad] = useState<PlcModalidad>("amistoso");
  const [regla, setRegla] = useState<PlcReglaEmpate>("penales");
  const [origen, setOrigen] = useState<OrigenCancha>("fulbitoya");
  const [turnos, setTurnos] = useState<TurnoPublico[]>([]);
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const [placeCanchaId, setPlaceCanchaId] = useState<string | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [placeAdherido, setPlaceAdherido] = useState(false);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [formatoLibre, setFormatoLibre] = useState<"f5" | "f7" | "f9" | "f11">("f5");
  const [precioCancha, setPrecioCancha] = useState("");
  const [superficie, setSuperficie] = useState<Superficie | null>(null);
  const [techada, setTechada] = useState<boolean | null>(null);
  const [iluminacion, setIluminacion] = useState<boolean | null>(null);
  const [aceptaTarifa, setAceptaTarifa] = useState(false);
  const [cotDep, setCotDep] = useState<Record<string, unknown> | null>(null);
  const [cond, setCond] = useState<Record<string, unknown> | null>(null);
  const [condErr, setCondErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needIdentidad, setNeedIdentidad] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [invitadoNombre, setInvitadoNombre] = useState("");
  const [invitando, setInvitando] = useState(false);

  const equipo = captainTeams.find((t) => t.id === equipoId);
  const formato =
    origen === "places"
      ? formatoLibre
      : ((equipo?.formato_habitual ?? formatoLibre).toLowerCase() as "f5" | "f7" | "f9" | "f11");
  const min = minimoConvocados(formato);
  const conCuenta = useMemo(() => miembros.filter((m) => m.usuario_id && !m.es_invitado), [miembros]);
  const invitados = useMemo(() => miembros.filter((m) => m.es_invitado), [miembros]);
  const esLibrePlaces =
    origen === "places" && !placeAdherido && (modalidad === "amistoso" || modalidad === "competitivo");
  const esDeposito =
    modalidad === "por_la_cancha" &&
    ((origen === "fulbitoya" && !!turnoId) || (origen === "places" && !!placeCanchaId));

  useEffect(() => {
    void listarTurnosPublicos().then(({ data, error }) => {
      setTurnos(data);
      setLoadErr(error);
    });
  }, []);

  useEffect(() => {
    if (equipoModo !== "equipo" || !equipoId) {
      setMiembros([]);
      setPicked(new Set());
      return;
    }
    void getEquipoDetalle(equipoId).then((d) => {
      setMiembros(d.miembros);
      const cap = d.miembros.find((m) => m.rol === "capitan" && m.usuario_id);
      setPicked(new Set(cap?.usuario_id ? [cap.usuario_id] : []));
    });
  }, [equipoId, equipoModo]);

  const reloadMiembros = async (id: string) => {
    const d = await getEquipoDetalle(id);
    setMiembros(d.miembros);
  };

  const turnosFmt = useMemo(
    () => turnos.filter((t) => String(t.campo_tipo).toLowerCase() === formato),
    [turnos, formato]
  );

  useEffect(() => {
    if (!turnoId || origen !== "fulbitoya" || modalidad === "por_la_cancha") {
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
  }, [turnoId, modalidad, origen]);

  useEffect(() => {
    if (!esDeposito) {
      setCotDep(null);
      return;
    }
    const precio =
      origen === "fulbitoya"
        ? (turnosFmt.find((t) => t.id === turnoId)?.precio ?? Number(precioCancha))
        : Number(precioCancha);
    if (!precio || !Number.isFinite(precio) || precio <= 0) {
      setCotDep(null);
      return;
    }
    let cancelled = false;
    void cotizarDepositoPlc(precio, formato).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setCotDep(null);
        setCondErr(res.error);
        return;
      }
      setCotDep(res.cot);
      setCondErr(null);
    });
    return () => {
      cancelled = true;
    };
  }, [esDeposito, origen, turnoId, precioCancha, formato, turnosFmt]);

  const selected = useMemo(() => [...picked], [picked]);
  const cuposLibres = Math.max(0, min - selected.length - invitados.length);
  const turno = turnosFmt.find((t) => t.id === turnoId) ?? null;

  const toggle = (id: string) => {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        // El capitán siempre queda convocado.
        const cap = miembros.find((m) => m.rol === "capitan" && m.usuario_id);
        if (cap?.usuario_id === id) return prev;
        n.delete(id);
      } else n.add(id);
      return n;
    });
  };

  const onPlaceConfirmed = async (place: PlacePick) => {
    setBusy(true);
    const res = await upsertPredioPlaces({
      placeId: place.placeId,
      nombre: place.nombre,
      direccion: place.direccion,
      lat: place.lat,
      lng: place.lng,
      barrio: place.barrio,
      telefono: place.telefono,
    });
    setBusy(false);
    if (!res.ok) {
      showNotice("No se pudo guardar el lugar", res.error);
      return;
    }
    setPlaceCanchaId(res.canchaId);
    setPlaceLabel(res.nombre);
    setPlaceAdherido(res.adherido);
    if (res.aporte_superficie) setSuperficie(res.aporte_superficie as Superficie);
    if (res.aporte_techada != null) setTechada(res.aporte_techada);
    if (res.aporte_iluminacion != null) setIluminacion(res.aporte_iluminacion);
  };

  const asegurarEquipo = async (): Promise<string | null> => {
    if (equipoModo === "sin_equipo") return null;
    if (equipoModo === "equipo") return equipoId || null;
    const nombre = nuevoNombre.trim();
    if (!nombre) {
      showNotice("Nombre del equipo", "Poné un nombre para crear el equipo.");
      return null;
    }
    const res = await crearEquipoRapidoPlc(nombre, formato);
    if (!res.ok) {
      showNotice("No se pudo crear el equipo", res.error);
      return null;
    }
    onTeamsChanged?.();
    setEquipoId(res.equipoId);
    setEquipoModo("equipo");
    return res.equipoId;
  };

  const agregarInvitado = async () => {
    const nombre = invitadoNombre.trim();
    if (!nombre) {
      showNotice("Invitado", "Poné solo el nombre.");
      return;
    }
    if (equipoModo === "sin_equipo") {
      showNotice("Equipo", "Para sumar invitados elegí o creá un equipo.");
      return;
    }
    setInvitando(true);
    try {
      const eq = await asegurarEquipo();
      if (!eq) return;
      const res = await rpcInvitarSinCuenta(supabase, eq, nombre);
      if (!res.ok) {
        showNotice("No se pudo agregar", res.error);
        return;
      }
      setInvitadoNombre("");
      await reloadMiembros(eq);
      showNotice("Listo", `${nombre} quedó como invitado. Podés seguir con lugares libres.`);
    } finally {
      setInvitando(false);
    }
  };

  const publicar = async () => {
    setBusy(true);
    try {
      if (esLibrePlaces) {
        if (!placeCanchaId || !fecha || !hora) {
          showNotice("Faltan datos", "Confirmá el lugar, el día y la hora.");
          return;
        }
        const eq = await asegurarEquipo();
        if (equipoModo !== "sin_equipo" && !eq) return;
        const res = await crearPartidoLibrePlc({
          canchaId: placeCanchaId,
          fecha,
          horaInicio: hora.length === 5 ? `${hora}:00` : hora,
          formato,
          precioCancha: Number(precioCancha) || 0,
          modalidad: modalidad === "competitivo" ? "competitivo" : "amistoso",
          equipoId: eq,
          convocados: eq ? selected : undefined,
          reglaEmpate: regla,
          superficie,
          techada,
          iluminacion,
        });
        if (!res.ok) {
          showNotice("No se pudo publicar", res.error);
          return;
        }
        onCreated(res.desafioId, res.inscripcionId);
        return;
      }

      if (esDeposito) {
        const eq = await asegurarEquipo();
        if (!eq) {
          showNotice("Equipo", "Para por la cancha con depósito necesitás un equipo.");
          return;
        }
        if (!aceptaTarifa) {
          showNotice("Tarifa", "Tenés que aceptar que la tarifa no se reembolsa.");
          return;
        }
        const precio =
          origen === "fulbitoya"
            ? Number(precioCancha) || turno?.precio || 0
            : Number(precioCancha) || 0;
        const res = await crearPartidoDepositoPlc({
          precioCancha: precio,
          formato,
          equipoId: eq,
          convocados: selected,
          reglaEmpate: regla,
          aceptaTarifaNoReembolsable: aceptaTarifa,
          disponibilidadId: origen === "fulbitoya" ? turnoId : null,
          canchaId: origen === "places" ? placeCanchaId : null,
          fecha: origen === "places" ? fecha : null,
          horaInicio: origen === "places" ? (hora.length === 5 ? `${hora}:00` : hora) : null,
        });
        if (!res.ok) {
          if (esErrorIdentidadDesafio(res.code)) {
            setNeedIdentidad(true);
            return;
          }
          showNotice("No se pudo publicar", res.error);
          return;
        }
        onCreated(res.desafioId, res.inscripcionId);
        return;
      }

      // Fallback: flujo Plus adherido (amistoso con turno)
      if (!turnoId || !equipoId) return;
      const res = await crearPartidoPlc({
        disponibilidadId: turnoId,
        equipoId,
        convocados: selected,
        reglaEmpate: regla,
        modalidad,
      });
      if (!res.ok) {
        if (modalidad === "por_la_cancha" && esErrorIdentidadDesafio(res.code)) {
          setNeedIdentidad(true);
          return;
        }
        showNotice("No se pudo publicar", res.error);
        return;
      }
      onCreated(res.desafioId, res.inscripcionId);
    } finally {
      setBusy(false);
    }
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

  const equipoListo =
    equipoModo === "sin_equipo" ||
    (equipoModo === "nuevo" && nuevoNombre.trim().length > 0) ||
    (equipoModo === "equipo" && !!equipoId);

  const canPublishLibre =
    esLibrePlaces && !!placeCanchaId && !!fecha && !!hora && equipoListo;

  // Alcanza con el capitán (u otro convocado con cuenta). Plantel completo = a la hora del partido.
  const canPublishDeposito =
    esDeposito &&
    aceptaTarifa &&
    equipoModo !== "sin_equipo" &&
    equipoListo &&
    (origen === "fulbitoya" ? !!turnoId : !!placeCanchaId && !!fecha && !!hora) &&
    (selected.length >= 1 || equipoModo === "nuevo");

  const canPublishPlus =
    !esLibrePlaces &&
    !esDeposito &&
    !!turnoId &&
    equipoModo === "equipo" &&
    !!equipoId &&
    selected.length >= 1;

  return (
    <View style={styles.fill}>
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, space[8]) }]}>
        <IconBtn onPress={onBack} label="Volver">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </IconBtn>
        <Text style={styles.title}>Armar partido</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space[16], paddingBottom: insets.bottom + space[40] }}>
        <Text style={styles.h}>Tu equipo</Text>
        <View style={styles.rowWrap}>
          {(
            [
              ["equipo", "Elegir equipo"],
              ["nuevo", "Crear equipo"],
              ["sin_equipo", "Sin equipo"],
            ] as const
          ).map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => setEquipoModo(k)}
              style={[styles.chip, equipoModo === k && styles.chipOn]}
            >
              <Text style={styles.chipT}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {equipoModo === "equipo" ? (
          captainTeams.length === 0 ? (
            <EmptyState
              title="Todavía no sos capitán"
              body="Creá un equipo con un nombre o jugá sin equipo."
              action={<Button label="Crear equipo" onPress={() => setEquipoModo("nuevo")} />}
            />
          ) : (
            captainTeams.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setEquipoId(t.id)}
                style={[styles.card, equipoId === t.id && styles.cardOn]}
              >
                <Text style={styles.body}>{t.nombre}</Text>
                <Mute>{etiquetaTipo(t.formato_habitual ?? "f5")}</Mute>
              </Pressable>
            ))
          )
        ) : null}
        {equipoModo === "nuevo" ? (
          <TextInput
            value={nuevoNombre}
            onChangeText={setNuevoNombre}
            placeholder="Nombre del equipo"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />
        ) : null}
        {equipoModo === "sin_equipo" ? (
          <Mute>Jugás sin equipo. Podés sumar gente después; en cancha no adherida el partido es gratis.</Mute>
        ) : null}

        <Text style={[styles.h, { marginTop: space[16] }]}>Modalidad</Text>
        <View style={styles.rowWrap}>
          {(["amistoso", "competitivo", "por_la_cancha"] as const).map((m) => (
            <Pressable key={m} onPress={() => setModalidad(m)} style={[styles.chip, modalidad === m && styles.chipOn]}>
              <Text style={styles.chipT}>{etiquetaModalidadPlc(m)}</Text>
            </Pressable>
          ))}
        </View>
        <Mute>
          {modalidad === "por_la_cancha"
            ? "Cada lado deposita el valor de la cancha más la tarifa. Al ganador se le devuelve el depósito."
            : origen === "places" && !placeAdherido
              ? "Gratis en la app. Los que se suman pagan en el lugar. Etiqueta: Cancha no adherida."
              : "Partido abierto. En predio adherido puede haber tarifa Plus según el turno."}
        </Mute>

        <Text style={[styles.h, { marginTop: space[16] }]}>¿Dónde juegan?</Text>
        <View style={styles.origenRow}>
          <Pressable
            onPress={() => setOrigen("fulbitoya")}
            style={[styles.origenCard, origen === "fulbitoya" && styles.origenCardOn]}
          >
            <Text style={styles.origenTitle}>Nuestras canchas</Text>
            <Text style={styles.origenSub}>Reservá y pagá en la app</Text>
          </Pressable>
          <Pressable
            onPress={() => setOrigen("places")}
            style={[styles.origenCard, origen === "places" && styles.origenCardOn]}
          >
            <Text style={styles.origenTitle}>Agregar cancha</Text>
            <Text style={styles.origenSub}>Una cancha que ya tenés alquilada</Text>
          </Pressable>
        </View>

        {origen === "fulbitoya" ? (
          <>
            {loadErr ? <Mute>{loadErr}</Mute> : null}
            {turnosFmt.length === 0 ? (
              <Mute>No hay turnos libres para {etiquetaTipo(formato)}. Probá agregar una cancha.</Mute>
            ) : (
              turnosFmt.slice(0, 40).map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    setTurnoId(t.id);
                    if (t.precio != null) setPrecioCancha(String(Math.round(t.precio)));
                  }}
                  style={[styles.card, turnoId === t.id && styles.cardOn]}
                >
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
          </>
        ) : (
          <>
            {placeCanchaId ? (
              <View style={styles.cardOn}>
                <Text style={styles.body}>{placeLabel}</Text>
                <Mute>{placeAdherido ? "Cancha en la app" : "Cancha no adherida"}</Mute>
                <Pressable
                  onPress={() => {
                    setPlaceCanchaId(null);
                    setPlaceLabel(null);
                  }}
                >
                  <Mute>Cambiar lugar</Mute>
                </Pressable>
              </View>
            ) : (
              <PlacesSearch onConfirmed={(p) => void onPlaceConfirmed(p)} />
            )}
            {placeCanchaId ? (
              <>
                <Text style={[styles.h, { marginTop: space[16] }]}>Día y hora</Text>
                <TextInput
                  value={fecha}
                  onChangeText={setFecha}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.input}
                />
                <TextInput
                  value={hora}
                  onChangeText={setHora}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { marginTop: space[8] }]}
                />
                <Text style={[styles.h, { marginTop: space[16] }]}>Formato</Text>
                <View style={styles.rowWrap}>
                  {(["f5", "f7", "f9", "f11"] as const).map((f) => (
                    <Pressable
                      key={f}
                      onPress={() => setFormatoLibre(f)}
                      style={[styles.chip, formatoLibre === f && styles.chipOn]}
                    >
                      <Text style={styles.chipT}>{etiquetaTipo(f)}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.h, { marginTop: space[16] }]}>Precio de la cancha (en el lugar)</Text>
                <TextInput
                  value={precioCancha}
                  onChangeText={setPrecioCancha}
                  keyboardType="numeric"
                  placeholder="Ej: 40000"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.input}
                />
                <Text style={[styles.h, { marginTop: space[16] }]}>Superficie</Text>
                <View style={styles.rowWrap}>
                  {(
                    [
                      ["cesped_sintetico", "Sintético"],
                      ["cesped_natural", "Natural"],
                      ["tierra", "Tierra"],
                      ["cemento", "Cemento"],
                    ] as const
                  ).map(([k, label]) => (
                    <Pressable
                      key={k}
                      onPress={() => setSuperficie(k)}
                      style={[styles.chip, superficie === k && styles.chipOn]}
                    >
                      <Text style={styles.chipT}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.h, { marginTop: space[12] }]}>Techada</Text>
                <View style={styles.rowWrap}>
                  <Pressable onPress={() => setTechada(true)} style={[styles.chip, techada === true && styles.chipOn]}>
                    <Text style={styles.chipT}>Sí</Text>
                  </Pressable>
                  <Pressable onPress={() => setTechada(false)} style={[styles.chip, techada === false && styles.chipOn]}>
                    <Text style={styles.chipT}>No</Text>
                  </Pressable>
                </View>
                <Text style={[styles.h, { marginTop: space[12] }]}>Iluminación</Text>
                <View style={styles.rowWrap}>
                  <Pressable
                    onPress={() => setIluminacion(true)}
                    style={[styles.chip, iluminacion === true && styles.chipOn]}
                  >
                    <Text style={styles.chipT}>Sí</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setIluminacion(false)}
                    style={[styles.chip, iluminacion === false && styles.chipOn]}
                  >
                    <Text style={styles.chipT}>No</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </>
        )}

        {modalidad === "por_la_cancha" && origen === "fulbitoya" && turno ? (
          <>
            <Text style={[styles.h, { marginTop: space[16] }]}>Valor de la cancha</Text>
            <TextInput
              value={precioCancha}
              onChangeText={setPrecioCancha}
              keyboardType="numeric"
              placeholder={turno.precio != null ? String(Math.round(turno.precio)) : "Monto"}
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
            />
          </>
        ) : null}

        {condErr ? <Text style={styles.err}>{condErr}</Text> : null}
        {cotDep && cotDep.ok !== false ? (
          <View style={{ marginTop: space[12], gap: space[4] }}>
            <Text style={styles.h}>Desglose</Text>
            <Mute>
              Cancha {pesos(cotDep.precio_cancha)} · Tarifa {pesos(cotDep.tarifa)} · Total por equipo{" "}
              {pesos(cotDep.total_equipo)}
            </Mute>
            <Pressable onPress={() => setAceptaTarifa((v) => !v)} style={styles.row}>
              <View style={[styles.box, aceptaTarifa && styles.boxOn]} />
              <Text style={styles.body}>
                {typeof cotDep.texto_tarifa === "string"
                  ? cotDep.texto_tarifa
                  : "La tarifa cubre el procesamiento del pago y no se reembolsa en ningún caso."}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {cond && cond.ok !== false && !esDeposito ? (
          <View style={{ marginTop: space[12], gap: space[4] }}>
            <Text style={styles.h}>Condiciones</Text>
            <Mute>{typeof cond.mensaje_tramo === "string" ? cond.mensaje_tramo : ""}</Mute>
            <Mute>Cancha {pesos(cond.precio_cancha)} · tu equipo {pesos(cond.monto_equipo_a)}</Mute>
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

        {equipoModo !== "sin_equipo" ? (
          <>
            <Text style={[styles.h, { marginTop: space[16] }]}>Tu lado</Text>
            <Mute>
              Para publicar alcanza con el capitán. Sumá jugadores con cuenta, invitados por nombre o dejá
              lugares libres ({min} cupos). En por la cancha, si un lado está incompleto a la hora del partido,
              cuenta como walkover.
            </Mute>
            {conCuenta.length > 0 ? (
              <>
                <Text style={[styles.h, { marginTop: space[12] }]}>
                  Convocados ({selected.length}/{min})
                </Text>
                {conCuenta.map((m) => {
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
              </>
            ) : null}
            {invitados.map((m) => (
              <View key={m.miembro_id} style={styles.row}>
                <View style={[styles.box, styles.boxOn]} />
                <Text style={styles.body}>{m.invitado_nombre || m.nombre || "Invitado"} · Sin cuenta</Text>
              </View>
            ))}
            {cuposLibres > 0 ? (
              <View style={{ marginTop: space[8] }}>
                <Mute>{cuposLibres === 1 ? "1 lugar libre" : `${cuposLibres} lugares libres`}</Mute>
              </View>
            ) : null}
            <Text style={[styles.h, { marginTop: space[12] }]}>Invitado (solo nombre)</Text>
            <TextInput
              value={invitadoNombre}
              onChangeText={setInvitadoNombre}
              placeholder="Ej: Nico"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
            />
            <View style={{ marginTop: space[8] }}>
              <Button
                label={invitando ? "Agregando..." : "Agregar invitado"}
                onPress={() => void agregarInvitado()}
                variant="ghost"
                disabled={invitando || busy}
                loading={invitando}
              />
            </View>
          </>
        ) : null}

        {equipoModo === "equipo" && equipoId ? (
          <View style={{ marginTop: space[12] }}>
            <Button label="Ir a la sección Equipos" onPress={onCreateTeam} variant="ghost" />
          </View>
        ) : null}

        <View style={{ marginTop: space[24] }}>
          <Button
            label={
              busy
                ? "Publicando..."
                : esLibrePlaces
                  ? "Publicar partido gratis"
                  : esDeposito
                    ? "Publicar y continuar al pago"
                    : "Publicar y continuar al pago"
            }
            onPress={() => void publicar()}
            disabled={
              busy ||
              (esLibrePlaces ? !canPublishLibre : esDeposito ? !canPublishDeposito : !canPublishPlus)
            }
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
  origenRow: {
    flexDirection: "row",
    gap: space[8],
    marginVertical: space[8],
  },
  origenCard: {
    flex: 1,
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space[12],
    backgroundColor: colors.surface,
    justifyContent: "center",
    gap: space[4],
  },
  origenCardOn: { borderColor: colors.gold },
  origenTitle: typeStyle("body", colors.white),
  origenSub: typeStyle("caption", colors.textSecondary),
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
  cardOn: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    padding: space[12],
    backgroundColor: colors.surface,
    marginTop: space[8],
  },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space[12], paddingVertical: space[8] },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.gold },
  boxOn: { backgroundColor: colors.gold },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space[12],
    color: colors.white,
    backgroundColor: colors.surface,
    marginTop: space[8],
    ...typeStyle("body", colors.white),
  },
});
