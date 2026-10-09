import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { esErrorIdentidadDesafio } from "@shared/equipos";
import { colors, featureFlags, radius, space } from "@shared/design";
import { rpcInvitarSinCuenta } from "@shared/equipos";
import type { EquipoListItem, MiembroPlantel } from "../lib/equipos";
import { getEquipoDetalle } from "../lib/equipos";
import { etiquetaTipo, formatHora, minimoConvocados, normalizarTipo } from "../lib/desafios";
import {
  calcularCondiciones,
  confirmarPagoPrueba,
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
import {
  Button,
  DateField,
  EmptyState,
  IconBtn,
  Mute,
  PlacesSearch,
  TimeField,
  showNotice,
  type PlacePick,
} from "../ui";
import { partidoDateBounds } from "../lib/fecha-ui";
import { formatDistanciaKm, getUserLocation, haversineKm, type LatLng } from "../lib/geo";
import { etiquetaDiaCorto, fechasProximos } from "../lib/predio-detalle";
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
  const [predioId, setPredioId] = useState<string | null>(null);
  const [diaId, setDiaId] = useState<string | null>(null);
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
  const [pagoCrear, setPagoCrear] = useState<{
    desafioId: string;
    inscripcionId: string;
    cancha: number;
    servicio: number;
    total: number;
  } | null>(null);
  const [pagando, setPagando] = useState(false);
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);

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
  /** Beta: amistoso/competitivo siempre gratis (sin Plus). Por la cancha = depósito. */
  const esPartidoGratis =
    (modalidad === "amistoso" || modalidad === "competitivo") && !featureFlags.reserva_plus_habilitada;
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
    let live = true;
    void getUserLocation().then((loc) => {
      if (live) setUserLoc(loc);
    });
    return () => {
      live = false;
    };
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
    () => turnos.filter((t) => normalizarTipo(t.campo_tipo) === normalizarTipo(formato)),
    [turnos, formato]
  );

  // Lista completa de predios de la plataforma (como Pista), cercanos primero.
  const prediosFy = useMemo(() => {
    const by: Record<
      string,
      {
        id: string;
        nombre: string;
        barrio: string | null;
        nTurnos: number;
        nTurnosFmt: number;
        lat: number | null;
        lng: number | null;
        km: number | null;
        distancia: string | null;
      }
    > = {};
    const fmtNorm = normalizarTipo(formato);
    for (const t of turnos) {
      const cur = by[t.cancha_id] ?? {
        id: t.cancha_id,
        nombre: t.cancha_nombre,
        barrio: t.barrio,
        nTurnos: 0,
        nTurnosFmt: 0,
        lat: t.lat,
        lng: t.lng,
        km: null,
        distancia: null,
      };
      if (!cur.barrio && t.barrio) cur.barrio = t.barrio;
      if (cur.lat == null && t.lat != null) cur.lat = t.lat;
      if (cur.lng == null && t.lng != null) cur.lng = t.lng;
      cur.nTurnos += 1;
      if (normalizarTipo(t.campo_tipo) === fmtNorm) cur.nTurnosFmt += 1;
      by[t.cancha_id] = cur;
    }
    return Object.values(by)
      .map((p) => {
        const km =
          userLoc && p.lat != null && p.lng != null
            ? haversineKm(userLoc, { lat: p.lat, lng: p.lng })
            : null;
        return { ...p, km, distancia: formatDistanciaKm(km) };
      })
      .sort((a, b) => {
        if (a.km != null && b.km != null) return a.km - b.km;
        if (a.km != null) return -1;
        if (b.km != null) return 1;
        return a.nombre.localeCompare(b.nombre, "es");
      });
  }, [turnos, formato, userLoc]);

  const diasAgenda = useMemo(() => fechasProximos(14), []);

  const diasConLibres = useMemo(() => {
    const set = new Set<string>();
    if (!predioId) return set;
    for (const t of turnosFmt) {
      if (t.cancha_id === predioId) set.add(t.fecha);
    }
    return set;
  }, [turnosFmt, predioId]);

  const horasFy = useMemo(() => {
    if (!predioId || !diaId) return [] as TurnoPublico[];
    return turnosFmt
      .filter((t) => t.cancha_id === predioId && t.fecha === diaId)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  }, [turnosFmt, predioId, diaId]);

  useEffect(() => {
    // Si cambia el formato, reseteamos la cascada de predio/día/hora.
    setPredioId(null);
    setDiaId(null);
    setTurnoId(null);
  }, [formato]);

  useEffect(() => {
    if (!predioId) return;
    if (diaId && diasConLibres.has(diaId)) return;
    const first = diasAgenda.find((f) => diasConLibres.has(f)) ?? null;
    setDiaId(first);
    setTurnoId(null);
  }, [predioId, diasConLibres, diasAgenda, diaId]);

  useEffect(() => {
    // Beta: no cotizamos Plus / condiciones de pago para amistoso-competitivo.
    if (!turnoId || origen !== "fulbitoya" || modalidad === "por_la_cancha" || esPartidoGratis) {
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
  }, [turnoId, modalidad, origen, esPartidoGratis]);

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
      // Amistoso / competitivo: gratis en beta (también si eligió turno de la app).
      if (esLibrePlaces || (esPartidoGratis && !esDeposito)) {
        const canchaLibre =
          origen === "places"
            ? placeCanchaId
            : turno?.cancha_id ?? predioId;
        const fechaLibre = origen === "places" ? fecha : turno?.fecha ?? diaId;
        const horaLibre =
          origen === "places"
            ? hora.length === 5
              ? `${hora}:00`
              : hora
            : turno?.hora_inicio ?? "";
        if (!canchaLibre || !fechaLibre || !horaLibre) {
          showNotice("Faltan datos", "Confirmá el lugar, el día y la hora.");
          return;
        }
        const eq = await asegurarEquipo();
        if (equipoModo !== "sin_equipo" && !eq) return;
        const res = await crearPartidoLibrePlc({
          canchaId: canchaLibre,
          fecha: fechaLibre,
          horaInicio: horaLibre,
          formato,
          precioCancha: Number(precioCancha) || turno?.precio || 0,
          modalidad: modalidad === "competitivo" ? "competitivo" : "amistoso",
          equipoId: eq,
          convocados: eq ? selected : undefined,
          reglaEmpate: regla,
          superficie: origen === "places" ? superficie : null,
          techada: origen === "places" ? techada : null,
          iluminacion: origen === "places" ? iluminacion : null,
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
        const cancha = Number(cotDep?.deposito ?? precio) || 0;
        const servicio = Number(cotDep?.tarifa ?? 0) || 0;
        const total = Number(cotDep?.total_equipo ?? res.montoTotal) || cancha + servicio;
        setPagoCrear({
          desafioId: res.desafioId,
          inscripcionId: res.inscripcionId,
          cancha,
          servicio,
          total,
        });
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
    (esLibrePlaces || (esPartidoGratis && !esDeposito)) &&
    equipoListo &&
    (origen === "fulbitoya"
      ? !!turnoId
      : !!placeCanchaId && !!fecha && !!hora);

  // Alcanza con el capitán (u otro convocado con cuenta). Plantel completo = a la hora del partido.
  const canPublishDeposito =
    esDeposito &&
    aceptaTarifa &&
    equipoModo !== "sin_equipo" &&
    equipoListo &&
    (origen === "fulbitoya" ? !!turnoId : !!placeCanchaId && !!fecha && !!hora) &&
    (selected.length >= 1 || equipoModo === "nuevo");

  const canPublishPlus =
    featureFlags.reserva_plus_habilitada &&
    !esLibrePlaces &&
    !esDeposito &&
    !esPartidoGratis &&
    !!turnoId &&
    equipoModo === "equipo" &&
    !!equipoId &&
    selected.length >= 1;

  const lugarListo =
    origen === "fulbitoya" ? !!turnoId : !!placeCanchaId && !!fecha && !!hora;

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
        <Text style={styles.h}>Modalidad</Text>
        <View style={styles.rowWrap}>
          {(["amistoso", "competitivo", "por_la_cancha"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                setModalidad(m);
                if (m === "por_la_cancha" && equipoModo === "sin_equipo") {
                  setEquipoModo(captainTeams.length ? "equipo" : "nuevo");
                }
              }}
              style={[styles.chip, modalidad === m && styles.chipOn]}
            >
              <Text style={styles.chipT}>{etiquetaModalidadPlc(m)}</Text>
            </Pressable>
          ))}
        </View>
        {modalidad === "por_la_cancha" ? (
          <Mute>Cada lado deja la cancha. Gana = se le reembolsa al capitán.</Mute>
        ) : null}

        <Text style={[styles.h, { marginTop: space[16] }]}>¿Dónde juegan?</Text>
        <View style={styles.origenRow}>
          <Pressable
            onPress={() => {
              setOrigen("fulbitoya");
              setPredioId(null);
              setDiaId(null);
              setTurnoId(null);
            }}
            style={[styles.origenCard, origen === "fulbitoya" && styles.origenCardOn]}
          >
            <Text style={styles.origenTitle}>Canchas sugeridas</Text>
            <Text style={styles.origenSub}>Predios cerca tuyo</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setOrigen("places");
              setPredioId(null);
              setDiaId(null);
              setTurnoId(null);
            }}
            style={[styles.origenCard, origen === "places" && styles.origenCardOn]}
          >
            <Text style={styles.origenTitle}>Ya la reservé</Text>
            <Text style={styles.origenSub}>Tenés cancha afuera de la app</Text>
          </Pressable>
        </View>

        {origen === "fulbitoya" ? (
          <>
            {loadErr ? <Mute>{loadErr}</Mute> : null}
            {prediosFy.length === 0 ? (
              <Mute>No hay predios con turnos libres. Probá “Ya la reservé”.</Mute>
            ) : !predioId ? (
              <>
                <Text style={[styles.h, { marginTop: space[12] }]}>Canchas sugeridas para ti</Text>
                <Mute>
                  {userLoc
                    ? "Todas las canchas de la app, primero las más cerca."
                    : "Todas las canchas de la app. Activá ubicación para ordenar por cercanía."}
                </Mute>
                {prediosFy.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setPredioId(p.id);
                      setDiaId(null);
                      setTurnoId(null);
                    }}
                    style={styles.card}
                  >
                    <Text style={styles.body}>{p.nombre}</Text>
                    <Mute>
                      {[
                        p.distancia,
                        p.barrio,
                        p.nTurnosFmt > 0
                          ? `${p.nTurnosFmt} turno${p.nTurnosFmt === 1 ? "" : "s"} ${etiquetaTipo(formato)}`
                          : `${p.nTurnos} turno${p.nTurnos === 1 ? "" : "s"} libre${p.nTurnos === 1 ? "" : "s"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Mute>
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                <Pressable
                  onPress={() => {
                    setPredioId(null);
                    setDiaId(null);
                    setTurnoId(null);
                  }}
                  style={{ marginTop: space[8] }}
                >
                  <Mute>
                    {`← ${prediosFy.find((p) => p.id === predioId)?.nombre ?? "Predio"} · cambiar`}
                  </Mute>
                </Pressable>

                <Text style={[styles.h, { marginTop: space[8] }]}>Día</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayRow}
                >
                  {diasAgenda.map((f) => {
                    const has = diasConLibres.has(f);
                    const on = diaId === f;
                    return (
                      <Pressable
                        key={f}
                        onPress={() => {
                          setDiaId(f);
                          setTurnoId(null);
                        }}
                        style={[styles.dayChip, on && styles.dayOn, !has && styles.dayEmpty]}
                      >
                        <Text style={[styles.dayT, on && styles.dayTOn]}>
                          {etiquetaDiaCorto(f, diasAgenda[0]!, diasAgenda[1]!)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={[styles.h, { marginTop: space[12] }]}>Hora</Text>
                {horasFy.length === 0 ? (
                  <Mute>Sin horarios este día. Probá otro.</Mute>
                ) : (
                  <View style={styles.hoursGrid}>
                    {horasFy.map((t) => {
                      const on = turnoId === t.id;
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => {
                            setTurnoId(t.id);
                            if (t.precio != null) setPrecioCancha(String(Math.round(t.precio)));
                          }}
                          style={[styles.hourChip, on && styles.hourOn]}
                          accessibilityRole="button"
                          accessibilityLabel={`${formatHora(t.hora_inicio)}${
                            t.precio != null ? ` ${pesos(t.precio)}` : ""
                          }`}
                        >
                          <Text style={styles.hourH}>{formatHora(t.hora_inicio)}</Text>
                          {t.precio != null ? <Text style={styles.hourP}>{pesos(t.precio)}</Text> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {placeCanchaId ? (
              <View style={[styles.cardOn, { marginTop: space[12] }]}>
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
              <View style={{ marginTop: space[12] }}>
                <PlacesSearch onConfirmed={(p) => void onPlaceConfirmed(p)} />
              </View>
            )}
            {placeCanchaId ? (
              <>
                <Text style={[styles.h, { marginTop: space[16] }]}>Día y hora</Text>
                <DateField
                  value={fecha}
                  onChange={setFecha}
                  minimumDate={partidoDateBounds().min}
                  maximumDate={partidoDateBounds().max}
                  placeholder="Elegí el día"
                />
                <TimeField value={hora} onChange={setHora} placeholder="Elegí la hora" />
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
                <Text style={[styles.h, { marginTop: space[16] }]}>Precio (en el lugar)</Text>
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
            <Mute>
              {`Cancha ${pesos(cotDep.precio_cancha)} · Tarifa ${pesos(cotDep.tarifa)} · Total ${pesos(
                cotDep.total_equipo
              )}`}
            </Mute>
            <Pressable onPress={() => setAceptaTarifa((v) => !v)} style={styles.row}>
              <View style={[styles.box, aceptaTarifa && styles.boxOn]} />
              <Text style={styles.body}>
                {typeof cotDep.texto_tarifa === "string"
                  ? cotDep.texto_tarifa
                  : "La tarifa no se reembolsa."}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {cond && cond.ok !== false && !esDeposito && !esPartidoGratis ? (
          <View style={{ marginTop: space[12], gap: space[4] }}>
            <Mute>{typeof cond.mensaje_tramo === "string" ? cond.mensaje_tramo : ""}</Mute>
            <Mute>{`Cancha ${pesos(cond.precio_cancha)} · tu equipo ${pesos(cond.monto_equipo_a)}`}</Mute>
          </View>
        ) : null}

        {lugarListo ? (
          <>
            <Text style={[styles.h, { marginTop: space[20] }]}>Tu equipo</Text>
            <View style={styles.rowWrap}>
              {(
                [
                  ["equipo", "Elegir equipo"],
                  ["nuevo", "Crear equipo"],
                  ...(modalidad === "por_la_cancha" ? [] : [["sin_equipo", "Sin equipo"] as const]),
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
                  body={
                    modalidad === "por_la_cancha"
                      ? "Creá un equipo con un nombre."
                      : "Creá un equipo o jugá sin equipo."
                  }
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

            {modalidad === "por_la_cancha" ? (
              <>
                <Text style={[styles.h, { marginTop: space[16] }]}>Si empatan</Text>
                <View style={styles.rowWrap}>
                  <Pressable
                    onPress={() => setRegla("penales")}
                    style={[styles.chip, regla === "penales" && styles.chipOn]}
                  >
                    <Text style={styles.chipT}>Penales</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setRegla("mitad_cada_uno")}
                    style={[styles.chip, regla === "mitad_cada_uno" && styles.chipOn]}
                  >
                    <Text style={styles.chipT}>Mitad cada uno</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {equipoModo !== "sin_equipo" ? (
              <>
                <Text style={[styles.h, { marginTop: space[16] }]}>
                  Convocados ({selected.length}/{min})
                </Text>
                <Mute>Con el capitán alcanza para publicar.</Mute>
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
                {invitados.map((m) => (
                  <View key={m.miembro_id} style={styles.row}>
                    <View style={[styles.box, styles.boxOn]} />
                    <Text style={styles.body}>{m.invitado_nombre || m.nombre || "Invitado"} · Sin cuenta</Text>
                  </View>
                ))}
                {cuposLibres > 0 ? (
                  <Mute>{cuposLibres === 1 ? "1 lugar libre" : `${cuposLibres} lugares libres`}</Mute>
                ) : null}
                <TextInput
                  value={invitadoNombre}
                  onChangeText={setInvitadoNombre}
                  placeholder="Invitado (solo nombre)"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { marginTop: space[8] }]}
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
              <View style={{ marginTop: space[8] }}>
                <Button label="Ir a Equipos" onPress={onCreateTeam} variant="ghost" />
              </View>
            ) : null}

            <View style={{ marginTop: space[24] }}>
              <Button
                label={
                  busy
                    ? "Publicando..."
                    : esDeposito
                      ? "Publicar y pagar"
                      : esLibrePlaces || esPartidoGratis
                        ? "Publicar partido gratis"
                        : "Publicar y continuar al pago"
                }
                onPress={() => void publicar()}
                disabled={
                  busy ||
                  (esDeposito
                    ? !canPublishDeposito
                    : esLibrePlaces || esPartidoGratis
                      ? !canPublishLibre
                      : !canPublishPlus)
                }
                loading={busy}
              />
            </View>
          </>
        ) : null}
      </ScrollView>

      {pagoCrear ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => undefined}>
          <Pressable style={styles.pagoBg} onPress={() => undefined}>
            <Pressable
              style={[styles.pagoSheet, { paddingBottom: Math.max(insets.bottom, space[16]) + space[8] }]}
              onPress={() => undefined}
            >
              <Text style={styles.h}>Pagar cancha de anticipado</Text>
              <Mute>Confirmá el total para publicar el partido. En modo prueba no se abre Mercado Pago.</Mute>
              <Text style={[styles.pagoTotalKicker, { marginTop: space[16] }]}>Total a pagar</Text>
              <Text style={styles.pagoTotal}>{pesos(pagoCrear.total)}</Text>
              <Mute>
                {pagoCrear.servicio > 0
                  ? `Cancha ${pesos(pagoCrear.cancha)} + tarifa ${pesos(pagoCrear.servicio)}.`
                  : "Depósito de la cancha."}
              </Mute>
              <View style={{ gap: space[8], marginTop: space[16] }}>
                <Button
                  label={pagando ? "Confirmando..." : `Pagar ${pesos(pagoCrear.total)}`}
                  loading={pagando}
                  disabled={pagando}
                  onPress={() => {
                    void (async () => {
                      setPagando(true);
                      const pay = await confirmarPagoPrueba(pagoCrear.inscripcionId);
                      setPagando(false);
                      if (!pay.ok) {
                        if (esErrorIdentidadDesafio(pay.code)) {
                          setNeedIdentidad(true);
                          return;
                        }
                        showNotice("No se pudo confirmar el pago", pay.error);
                        return;
                      }
                      const done = pagoCrear;
                      setPagoCrear(null);
                      showNotice("Listo", "Partido publicado y cancha pagada de anticipado.");
                      onCreated(done.desafioId, done.inscripcionId);
                    })();
                  }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navy },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space[8] },
  title: { ...typeStyle("h3", colors.white), flex: 1, textAlign: "center" },
  h: typeStyle("h3", colors.white),
  body: typeStyle("body", colors.white),
  pagoBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  pagoSheet: {
    backgroundColor: colors.navyDark,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space[20],
    paddingTop: space[20],
  },
  pagoTotalKicker: typeStyle("caption", colors.textSecondary),
  pagoTotal: typeStyle("numL", colors.gold),
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
  dayRow: { gap: space[8], paddingVertical: space[4] },
  dayChip: {
    minWidth: 72,
    paddingHorizontal: space[12],
    paddingVertical: space[10],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  dayOn: { borderColor: colors.gold, backgroundColor: colors.surfaceHover },
  dayEmpty: { opacity: 0.55 },
  dayT: typeStyle("bodySmall", colors.white),
  dayTOn: { color: colors.gold },
  hoursGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space[8],
    marginTop: space[4],
  },
  hourChip: {
    minWidth: 88,
    minHeight: 56,
    paddingHorizontal: space[12],
    paddingVertical: space[8],
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.45)",
    backgroundColor: colors.navyDark,
    alignItems: "center",
    justifyContent: "center",
  },
  hourOn: { borderColor: colors.gold, borderWidth: 2, backgroundColor: colors.surfaceHover },
  hourH: typeStyle("body", colors.white),
  hourP: typeStyle("caption", colors.textSecondary),
});
