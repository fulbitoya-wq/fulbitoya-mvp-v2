import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  Image,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, gradientRn, radius, space } from "@shared/design";
import { useAuth } from "../../auth/AuthProvider";
import {
  etiquetaTipoCorta,
  formatHora,
  type Desafio,
} from "../../lib/desafios";
import { formatDistanciaKm, getUserLocation, haversineKm, type LatLng } from "../../lib/geo";
import {
  abrirComoLlegar,
  abrirWhatsappPredio,
  estadoAperturaAhora,
  etiquetaDiaCorto,
  fechasProximos,
  listFavoritosPredio,
  loadPredioDetalle,
  toggleFavoritoPredio,
  type PredioCampo,
  type PredioDetalle,
  type PredioTurno,
} from "../../lib/predio-detalle";
import { setPendingAction } from "../../lib/pending-action";
import {
  opcionesCobroReserva,
  pagarReserva,
  pesosReserva,
  reglasPredioUrl,
  type OpcionesCobroReserva,
} from "../../lib/reserva";
import { compartirTexto } from "../../lib/share-text";
import {
  Car,
  ChevronLeft,
  Flame,
  Heart,
  Lightbulb,
  MapPin,
  MessageCircle,
  Navigation,
  Share2,
  Shirt,
  Utensils,
  Warehouse,
  iconStroke,
} from "../../lib/icons";
import { Button, FilterChip, Mute, showNotice } from "../../ui";
import { CanchaMap } from "../../ui/maps/CanchaMap";
import { PagoQrCard } from "../../ui/PagoQrCard";
import { typeStyle } from "../../ui/textStyle";
import { InicioOpenMatchCard } from "../inicio/InicioOpenMatchCard";
import { ReservaPagoBlock } from "../reserva/ReservaPagoBlock";

type TipoCobro = "sena" | "total";
type ModoReserva = "simple" | "plus";

/** Tarifa Plus mínima (display). El cobro real lo calcula el servidor en Fase 3. */
const PLUS_TARIFA_DESDE = 1500;

type Props = {
  canchaId: string;
  initialTurnoId?: string | null;
  initialTipoCobro?: TipoCobro | null;
  initialAcepto?: boolean;
  partidos?: Desafio[];
  onBack: () => void;
  onRequestAuth: () => void;
  onDone: () => void;
  onOpenDesafio?: (d: Desafio) => void;
  /** Fase 3: entrada temporal a armar partido (Plus) sin borrar el flujo viejo. */
  onArmarPlus?: (turnoId: string) => void;
};

function onlyAvailable(op: OpcionesCobroReserva): TipoCobro | null {
  const s = op.acepta_sena && op.opcion_sena.disponible;
  const t = op.acepta_total && op.opcion_total.disponible;
  if (s && !t) return "sena";
  if (t && !s) return "total";
  return null;
}

function Skel({ h, w, style }: { h: number; w?: number | string; style?: object }) {
  return <View style={[{ height: h, width: w ?? "100%", borderRadius: radius.md, backgroundColor: colors.surface }, style]} />;
}

export function PredioDetalleScreen({
  canchaId,
  initialTurnoId = null,
  initialTipoCobro = null,
  initialAcepto = false,
  partidos = [],
  onBack,
  onRequestAuth,
  onDone,
  onOpenDesafio,
  onArmarPlus,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const queHacerY = useRef(0);
  const pagoY = useRef(0);
  const tipoRef = useRef<TipoCobro | null>(initialTipoCobro);

  const [predio, setPredio] = useState<PredioDetalle | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [fav, setFav] = useState(false);

  const dias = useMemo(() => fechasProximos(14), []);
  const [fecha, setFecha] = useState<string>(dias[0] ?? "");
  const [campoId, setCampoId] = useState<string | "todos">("todos");
  const [turnoId, setTurnoId] = useState<string | null>(initialTurnoId);
  const [modo, setModo] = useState<ModoReserva | null>(initialTurnoId ? "simple" : null);
  const [tipo, setTipo] = useState<TipoCobro | null>(initialTipoCobro);
  const [opciones, setOpciones] = useState<OpcionesCobroReserva | null>(null);
  const [opcionesLoading, setOpcionesLoading] = useState(false);
  const [acepto, setAcepto] = useState(initialAcepto);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<{ initPoint: string; holdId: string } | null>(null);

  tipoRef.current = tipo;

  const reload = useCallback(async () => {
    setLoading(true);
    const [det, loc, favs] = await Promise.all([
      loadPredioDetalle(canchaId),
      getUserLocation(),
      listFavoritosPredio(),
    ]);
    setUserLoc(loc);
    setFav(favs.includes(canchaId));
    if (!det.ok) {
      setLoadErr(det.error);
      setPredio(null);
    } else {
      setLoadErr(null);
      setPredio(det.data);
      if (initialTurnoId) {
        const t = det.data.turnos.find((x) => x.id === initialTurnoId);
        if (t) {
          setFecha(t.fecha);
          setCampoId(t.campo_id);
          setTurnoId(t.id);
        }
      }
    }
    setLoading(false);
  }, [canchaId, initialTurnoId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadOpciones = useCallback(async (id: string, keep: TipoCobro | null) => {
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
    if (keep === "sena" && res.data.opcion_sena.disponible) {
      setTipo("sena");
      return;
    }
    if (keep === "total" && res.data.opcion_total.disponible) {
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
      setModo(null);
      return;
    }
    if (modo !== "simple") {
      setOpciones(null);
      return;
    }
    void loadOpciones(turnoId, tipoRef.current ?? initialTipoCobro);
  }, [turnoId, modo, loadOpciones, initialTipoCobro]);

  const distancia = useMemo(() => {
    if (!userLoc || predio?.lat == null || predio?.lng == null) return null;
    return formatDistanciaKm(haversineKm(userLoc, { lat: predio.lat, lng: predio.lng }));
  }, [userLoc, predio]);

  const partidosPredio = useMemo(
    () => partidos.filter((d) => d.estado === "abierto" && d.cancha_id === canchaId),
    [partidos, canchaId]
  );

  const turnosDia = useMemo(() => {
    if (!predio) return [] as PredioTurno[];
    return predio.turnos.filter((t) => {
      if (t.fecha !== fecha) return false;
      if (campoId !== "todos" && t.campo_id !== campoId) return false;
      return true;
    });
  }, [predio, fecha, campoId]);

  const libresDia = turnosDia.filter((t) => t.estado === "disponible");
  const diasConLibres = useMemo(() => {
    if (!predio) return new Set<string>();
    const s = new Set<string>();
    for (const t of predio.turnos) {
      if (t.estado !== "disponible") continue;
      if (campoId !== "todos" && t.campo_id !== campoId) continue;
      s.add(t.fecha);
    }
    return s;
  }, [predio, campoId]);

  const ctaLabel = (() => {
    if (busy) return "Continuando...";
    if (!turnoId) return "Elegí un horario";
    if (!modo) return "Elegí una opción";
    return "Continuar →";
  })();

  const scrollToQueHacer = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(queHacerY.current - 24, 0), animated: true });
    });
  };

  const selectTurno = (t: PredioTurno) => {
    if (t.estado !== "disponible") return;
    setTurnoId(t.id);
    setModo(null);
    setQr(null);
    scrollToQueHacer();
  };

  const continuar = async () => {
    if (!turnoId) {
      showNotice("Horario", "Elegí un horario libre para continuar.");
      return;
    }
    if (!modo) {
      showNotice("Reserva", "Elegí si querés reserva simple o Plus.");
      scrollToQueHacer();
      return;
    }
    if (modo === "plus") {
      if (onArmarPlus) {
        onArmarPlus(turnoId);
        return;
      }
      showNotice(
        "Reserva Plus",
        "La configuración completa del partido Plus llega en la próxima fase. Por ahora usá Armar partido desde el botón +."
      );
      return;
    }
    if (!tipo || !acepto) {
      showNotice("Pago", "Elegí cómo pagar y aceptá las condiciones.");
      scrollRef.current?.scrollTo({ y: Math.max(pagoY.current - 24, 0), animated: true });
      return;
    }
    if (!session?.access_token) {
      await setPendingAction({
        kind: "reservar",
        canchaId,
        turnoId,
        tipoCobro: tipo,
        acepto: true,
      });
      onRequestAuth();
      return;
    }
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

  const onShare = () => {
    if (!predio) return;
    const url = predio.slug ? `https://porlacancha.com/p/${predio.slug}` : "https://porlacancha.com";
    void compartirTexto(`${predio.nombre} en PorLaCancha. Reservá acá: ${url}`);
  };

  const footerH = 72 + Math.max(insets.bottom, space[8]);
  const coverH = Math.round(width * 0.62);

  if (loading) {
    return (
      <View style={styles.fill}>
        <Skel h={coverH} style={{ borderRadius: 0 }} />
        <View style={{ padding: space[16], gap: 12 }}>
          <Skel h={28} w="70%" />
          <Skel h={18} w="40%" />
          <Skel h={48} />
          <Skel h={36} />
          <Skel h={120} />
        </View>
      </View>
    );
  }

  if (!predio) {
    return (
      <View style={[styles.fill, { paddingTop: insets.top + 8, paddingHorizontal: 16 }]}>
        <Pressable onPress={onBack} style={styles.roundBtn} accessibilityRole="button">
          <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
        </Pressable>
        <Text style={[styles.h, { marginTop: 24 }]}>{loadErr || "No encontramos el predio."}</Text>
        <View style={{ height: 16 }} />
        <Button label="Volver" onPress={onBack} variant="secondary" />
      </View>
    );
  }

  const fotos = predio.fotos;
  const servicios: { key: string; label: string; icon: ReactNode }[] = [];
  if (predio.vestuarios) {
    servicios.push({ key: "vest", label: "Vestuario", icon: <Shirt color={colors.sky} size={16} strokeWidth={iconStroke} /> });
  }
  if (predio.buffet) {
    servicios.push({ key: "bar", label: "Bar", icon: <Utensils color={colors.sky} size={16} strokeWidth={iconStroke} /> });
  }
  if (predio.estacionamiento) {
    servicios.push({
      key: "est",
      label: "Estacionamiento",
      icon: <Car color={colors.sky} size={16} strokeWidth={iconStroke} />,
    });
  }
  if (predio.parrilla) {
    servicios.push({ key: "par", label: "Parrilla", icon: <Flame color={colors.sky} size={16} strokeWidth={iconStroke} /> });
  }
  const hasLuz = predio.campos.some((c) => c.luz) || predio.turnos.some((t) => t.campo_luz);
  const hasTechada = predio.campos.some((c) => c.techada) || predio.turnos.some((t) => t.campo_techada);
  if (hasLuz) {
    servicios.push({
      key: "luz",
      label: "Iluminación",
      icon: <Lightbulb color={colors.sky} size={16} strokeWidth={iconStroke} />,
    });
  }
  if (hasTechada) {
    servicios.push({
      key: "tec",
      label: "Techada",
      icon: <Warehouse color={colors.sky} size={16} strokeWidth={iconStroke} />,
    });
  }

  const reglasUrl = reglasPredioUrl(predio.slug);
  const apertura = estadoAperturaAhora(predio.horarios_apertura);
  const cardW = Math.min(240, Math.max(210, width - 32 - 40));

  return (
    <View style={styles.fill}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: footerH + space[24] }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Portada */}
        <View style={{ height: coverH }}>
          {fotos.length > 0 ? (
            <FlatList
              horizontal
              pagingEnabled
              data={fotos}
              keyExtractor={(u, i) => `${u}-${i}`}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const i = Math.round(e.nativeEvent.contentOffset.x / width);
                setPhotoIdx(i);
              }}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={{ width, height: coverH }} resizeMode="cover" />
              )}
            />
          ) : (
            <LinearGradient colors={[...gradientRn.hero]} style={{ width, height: coverH, alignItems: "center", justifyContent: "center" }}>
              {predio.logo_url ? (
                <Image source={{ uri: predio.logo_url }} style={styles.logoBig} resizeMode="contain" />
              ) : (
                <Text style={styles.logoFallback}>{predio.nombre.slice(0, 1)}</Text>
              )}
            </LinearGradient>
          )}
          <LinearGradient
            colors={["rgba(0,27,68,0.55)", "transparent", "rgba(0,27,68,0.75)"]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.coverBar, { paddingTop: Math.max(insets.top, space[8]) }]}>
            <Pressable onPress={onBack} style={styles.roundBtn} accessibilityRole="button" accessibilityLabel="Volver">
              <ChevronLeft color={colors.white} size={22} strokeWidth={iconStroke} />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={onShare} style={styles.roundBtn} accessibilityRole="button" accessibilityLabel="Compartir">
                <Share2 color={colors.white} size={18} strokeWidth={iconStroke} />
              </Pressable>
              <Pressable
                onPress={() => {
                  void toggleFavoritoPredio(canchaId).then(setFav);
                }}
                style={styles.roundBtn}
                accessibilityRole="button"
                accessibilityLabel={fav ? "Quitar de favoritos" : "Favorito"}
              >
                <Heart
                  color={fav ? colors.gold : colors.white}
                  fill={fav ? colors.gold : "transparent"}
                  size={18}
                  strokeWidth={iconStroke}
                />
              </Pressable>
            </View>
          </View>
          {fotos.length > 1 ? (
            <View style={styles.dots}>
              {fotos.map((_, i) => (
                <View key={i} style={[styles.dot, i === photoIdx && styles.dotOn]} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          {/* 2. Datos principales */}
          <Text style={styles.name}>{predio.nombre}</Text>
          <View style={styles.metaRow}>
            <MapPin color={colors.sky} size={14} strokeWidth={iconStroke} />
            <Text style={styles.meta} numberOfLines={2}>
              {[predio.barrio, distancia].filter(Boolean).join(" · ") || predio.direccion || "Ubicación a confirmar"}
            </Text>
          </View>
          <Text style={styles.open}>{apertura}</Text>

          {/* 3. Accesos rápidos */}
          <View style={styles.quickRow}>
            <Quick
              label="Cómo llegar"
              icon={<Navigation color={colors.gold} size={18} strokeWidth={iconStroke} />}
              onPress={() => void abrirComoLlegar(predio.lat, predio.lng, predio.direccion)}
            />
            <Quick
              label="WhatsApp"
              icon={<MessageCircle color={colors.gold} size={18} strokeWidth={iconStroke} />}
              disabled={!predio.whatsapp}
              onPress={() => {
                if (predio.whatsapp) void abrirWhatsappPredio(predio.whatsapp);
                else showNotice("WhatsApp", "Este predio todavía no cargó su WhatsApp.");
              }}
            />
            <Quick
              label="Compartir"
              icon={<Share2 color={colors.gold} size={18} strokeWidth={iconStroke} />}
              onPress={onShare}
            />
          </View>

          {/* 4. Servicios */}
          {servicios.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {servicios.map((s) => (
                <View key={s.key} style={styles.service}>
                  {s.icon}
                  <Text style={styles.serviceT}>{s.label}</Text>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {/* 5. Formato / cancha */}
          <Text style={styles.section}>Formato</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <FilterChip
              accent="sky"
              label="Todos"
              selected={campoId === "todos"}
              onPress={() => setCampoId("todos")}
            />
            {predio.campos.map((c: PredioCampo) => {
              const label = `${etiquetaTipoCorta(c.tipo)}${c.precio_desde != null ? ` · desde ${pesosReserva(c.precio_desde)}` : ""}`;
              return (
                <FilterChip
                  key={c.id}
                  accent="sky"
                  label={label}
                  selected={campoId === c.id}
                  onPress={() => {
                    setCampoId(c.id);
                    setTurnoId(null);
                  }}
                />
              );
            })}
          </ScrollView>

          {/* 6. Día */}
          <Text style={styles.section}>Día</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {dias.map((f) => {
              const label = etiquetaDiaCorto(f, dias[0]!, dias[1]!);
              const has = diasConLibres.has(f);
              return (
                <Pressable
                  key={f}
                  onPress={() => {
                    setFecha(f);
                    setTurnoId(null);
                  }}
                  style={[styles.dayChip, fecha === f && styles.dayOn, !has && styles.dayEmpty]}
                >
                  <Text style={[styles.dayT, fecha === f && styles.dayTOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 7. Horarios */}
          <Text style={styles.section}>Horarios</Text>
          {libresDia.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyT}>Probá otro día</Text>
              <Mute>No hay horarios libres este día. Te dejo los próximos con lugar.</Mute>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { marginTop: 8 }]}>
                {dias.filter((f) => diasConLibres.has(f)).slice(0, 8).map((f) => (
                  <FilterChip
                    key={f}
                    accent="gold"
                    label={etiquetaDiaCorto(f, dias[0]!, dias[1]!)}
                    selected={false}
                    onPress={() => {
                      setFecha(f);
                      setTurnoId(null);
                      setModo(null);
                    }}
                  />
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.hoursGrid}>
              {turnosDia.map((t) => {
                const libre = t.estado === "disponible";
                const sel = turnoId === t.id;
                return (
                  <Pressable
                    key={t.id}
                    disabled={!libre}
                    onPress={() => selectTurno(t)}
                    style={[styles.hourChip, sel && styles.hourOn, !libre && styles.hourBusy]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !libre, selected: sel }}
                    accessibilityLabel={`${formatHora(t.hora_inicio)}${t.precio != null ? ` ${pesosReserva(t.precio)}` : ""}${libre ? "" : " ocupado"}`}
                  >
                    <Text style={[styles.hourH, !libre && styles.hourBusyT]}>{formatHora(t.hora_inicio)}</Text>
                    {t.precio != null ? (
                      <Text style={[styles.hourP, !libre && styles.hourBusyT]}>{pesosReserva(t.precio)}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* 8. ¿Qué querés hacer? (entrada a Fase 3) */}
          <View
            onLayout={(e) => {
              // y relativo al body + portada + padding del body
              queHacerY.current = coverH + space[16] + e.nativeEvent.layout.y;
            }}
            style={{ marginTop: space[8] }}
          >
            <Text style={styles.section}>¿Qué querés hacer?</Text>
            {!turnoId ? (
              <Mute>Primero elegí un horario libre.</Mute>
            ) : (
              <View style={styles.modoRow}>
                <Pressable
                  onPress={() => {
                    setModo("simple");
                    setQr(null);
                  }}
                  style={[styles.modoCard, modo === "simple" && styles.modoCardOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: modo === "simple" }}
                >
                  {modo === "simple" ? <Text style={styles.modoCheck}>✓</Text> : null}
                  <Text style={styles.modoTitle}>Reserva simple</Text>
                  <Text style={styles.modoSub}>Ya tenemos los jugadores</Text>
                  <Text style={styles.modoMeta}>Gratis para el jugador</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setModo("plus");
                    setTipo(null);
                    setAcepto(false);
                    setOpciones(null);
                    setQr(null);
                  }}
                  style={[styles.modoCard, modo === "plus" && styles.modoCardOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: modo === "plus" }}
                >
                  {modo === "plus" ? <Text style={styles.modoCheck}>✓</Text> : null}
                  <Text style={styles.modoTitle}>Reserva Plus</Text>
                  <Text style={styles.modoSub}>Armá tu partido en la app</Text>
                  <Text style={styles.modoMeta}>Desde {pesosReserva(PLUS_TARIFA_DESDE)}</Text>
                </Pressable>
              </View>
            )}

            {modo === "plus" && turnoId ? (
              <View style={[styles.emptyBox, { marginTop: space[12] }]}>
                <Text style={styles.emptyT}>Configurás el partido en el próximo paso</Text>
                <Mute>
                  Modo, categoría, equipo, lugares libres y cómo pagan los que se suman. Tocá Continuar para seguir
                  (por ahora abrimos el armado de partido con este turno).
                </Mute>
              </View>
            ) : null}

            <View
              onLayout={(e) => {
                pagoY.current = queHacerY.current + e.nativeEvent.layout.y;
              }}
            >
              {modo === "simple" && turnoId && opcionesLoading ? (
                <Mute>Calculando formas de pago…</Mute>
              ) : null}
              {modo === "simple" && turnoId && opciones && !opcionesLoading ? (
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
            </View>
          </View>

          {/* 9. Partidos abiertos */}
          {partidosPredio.length > 0 ? (
            <View style={{ marginTop: space[24] }}>
              <Text style={styles.section}>Partidos abiertos en este predio</Text>
              <FlatList
                horizontal
                data={partidosPredio}
                keyExtractor={(d) => d.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingRight: 8 }}
                renderItem={({ item }) => (
                  <InicioOpenMatchCard
                    desafio={item}
                    width={cardW}
                    onPress={() => onOpenDesafio?.(item)}
                  />
                )}
              />
            </View>
          ) : null}

          {/* 10. Ubicación */}
          <Text style={[styles.section, { marginTop: space[24] }]}>Ubicación</Text>
          {predio.direccion ? <Text style={styles.meta}>{predio.direccion}</Text> : null}
          {predio.lat != null && predio.lng != null ? (
            <View style={styles.mapBox}>
              <CanchaMap
                style={StyleSheet.absoluteFill}
                scrollEnabled={false}
                region={{
                  latitude: predio.lat,
                  longitude: predio.lng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                pins={[{ id: predio.id, latitude: predio.lat, longitude: predio.lng, active: true }]}
              />
            </View>
          ) : (
            <Mute>Todavía no hay pin en el mapa.</Mute>
          )}

          {/* 11. Políticas */}
          <Text style={[styles.section, { marginTop: space[24] }]}>Políticas del predio</Text>
          <View style={styles.policy}>
            <Text style={styles.policyT}>
              {opciones?.texto_cancelacion ||
                "La seña asegura el turno. Si cancelás con anticipación te devolvemos según las reglas del predio. Lo máximo que se retiene es la seña."}
            </Text>
            {reglasUrl ? (
              <Pressable onPress={() => void Linking.openURL(reglasUrl)} accessibilityRole="link">
                <Text style={styles.link}>Ver reglas completas</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {!qr ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[8]) }]}>
          <Button
            label={ctaLabel}
            onPress={() => void continuar()}
            disabled={busy}
            loading={busy}
          />
        </View>
      ) : null}
    </View>
  );
}

function Quick({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.quick, disabled && { opacity: 0.4 }]}
      accessibilityRole="button"
    >
      {icon}
      <Text style={styles.quickT}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navy },
  body: { padding: space[16], gap: 8 },
  coverBar: {
    position: "absolute",
    left: space[12],
    right: space[12],
    top: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,27,68,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(247,245,239,0.35)" },
  dotOn: { backgroundColor: colors.gold, width: 16 },
  logoBig: { width: 120, height: 120 },
  logoFallback: { ...typeStyle("h1", colors.gold), fontSize: 64 },
  name: typeStyle("h1", colors.white),
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { flex: 1, ...typeStyle("caption", colors.textSecondary) },
  open: typeStyle("bodySmall", colors.sky),
  quickRow: { flexDirection: "row", gap: 8, marginTop: space[12] },
  quick: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 8,
  },
  quickT: typeStyle("caption", colors.white),
  chips: { gap: 8, paddingVertical: 4 },
  service: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
  },
  serviceT: typeStyle("caption", colors.white),
  section: { ...typeStyle("h3", colors.white), marginTop: space[16] },
  dayChip: {
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  hoursGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  hourChip: {
    minWidth: 88,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.45)",
    backgroundColor: colors.navyDark,
    alignItems: "center",
    justifyContent: "center",
  },
  hourOn: { borderColor: colors.gold, borderWidth: 2, backgroundColor: colors.surfaceHover },
  hourBusy: { opacity: 0.38, borderColor: "rgba(184,196,214,0.25)" },
  hourH: typeStyle("body", colors.white),
  hourP: typeStyle("caption", colors.textSecondary),
  hourBusyT: { color: colors.textSecondary },
  modoRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  modoCard: {
    flex: 1,
    minHeight: 132,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.35)",
    backgroundColor: colors.navyDark,
    padding: space[12],
    gap: 4,
  },
  modoCardOn: {
    borderColor: colors.gold,
    borderWidth: 2,
    backgroundColor: colors.surfaceHover,
  },
  modoCheck: { ...typeStyle("caption", colors.gold), alignSelf: "flex-end" },
  modoTitle: typeStyle("h3", colors.white),
  modoSub: typeStyle("bodySmall", colors.sky),
  modoMeta: typeStyle("caption", colors.textSecondary),
  emptyBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space[12],
    backgroundColor: colors.surface,
    gap: 4,
  },
  emptyT: typeStyle("body", colors.white),
  mapBox: {
    height: 160,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(139,201,235,0.30)",
    marginTop: 8,
  },
  policy: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space[12],
    backgroundColor: colors.surface,
    gap: 8,
  },
  policyT: typeStyle("bodySmall", colors.white),
  link: { ...typeStyle("bodySmall", colors.sky), textDecorationLine: "underline" },
  h: typeStyle("h3", colors.white),
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
});
