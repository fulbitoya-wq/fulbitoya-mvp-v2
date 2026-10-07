import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors } from "@shared/design";
import { useAuth } from "../auth/AuthProvider";
import { getDesafioPorId, getDesafiosPublicos, type Desafio } from "../lib/desafios";
import { listInvitacionesRecibidas, listMisEquipos, equiposDondeEsCapitan, type EquipoListItem } from "../lib/equipos";
import { toggleFavorito } from "../lib/favoritos";
import { getInscripcionMia, type InscripcionMia } from "../lib/inscripciones";
import {
  countUnreadNotificaciones,
  listNotificaciones,
  type DestinoNotif,
  type Notificacion,
} from "../lib/notificaciones";
import {
  clearPendingAction,
  peekPendingAction,
  profileNeedsBirthdate,
  profileNeedsPhone,
  profileNeedsUsername,
  profileReadyForActions,
  setPendingAction,
  type PendingAction,
} from "../lib/pending-action";
import { supabase } from "../lib/supabase";
import { mensajeErrorEquipo, rpcPredioPublico, rpcResponderSolicitud } from "@shared/equipos";
import { listarMisReservas } from "../lib/reserva";
import { IconBtn, showNotice } from "../ui";
import { PorLaCanchaBottomTabBar } from "../ui/PorLaCanchaBottomTabBar";
import { CompleteBirthdateScreen } from "./auth/CompleteBirthdateScreen";
import { CompletePhoneScreen } from "./auth/CompletePhoneScreen";
import { CompleteUsernameScreen } from "./auth/CompleteUsernameScreen";
import { ExplorarScreen } from "./ExplorarScreen";
import { DesafioDetalleScreen } from "./DesafioDetalleScreen";
import { InscribirEquipoScreen } from "./InscribirEquipoScreen";
import { MisPartidosScreen } from "./MisPartidosScreen";
import { NotificacionesScreen } from "./NotificacionesScreen";
import { PlusActionsSheet } from "./PlusActionsSheet";
import { UnirseEnlaceSheet } from "./UnirseEnlaceSheet";
import { PerfilHub } from "./perfil/PerfilHub";
import { CrearEquipoScreen } from "./equipos/CrearEquipoScreen";
import { EquipoDetalleScreen } from "./equipos/EquipoDetalleScreen";
import { EquiposListScreen } from "./equipos/EquiposListScreen";
import { InvitacionesScreen } from "./equipos/InvitacionesScreen";
import { PlayersSearchScreen } from "./jugadores/PlayersSearchScreen";
import { PlayerPublicProfileScreen } from "./jugadores/PlayerPublicProfileScreen";
import { CrearPartidoScreen } from "./CrearPartidoScreen";
import { InicioScreen } from "./inicio/InicioScreen";
import { PredioDetalleScreen } from "./predio/PredioDetalleScreen";
import { ReservarCanchaScreen } from "./ReservarCanchaScreen";
import { ReservaListaScreen } from "./ReservaListaScreen";
import { ChevronLeft, iconStroke } from "../lib/icons";
import type { SearchPlayer } from "../lib/player-search";

type Tab = "explore" | "matches" | "teams" | "profile";
type ExploreView = "hub" | "partidos" | "reservar" | "predio";
type TeamsView =
  | { name: "list" }
  | { name: "create" }
  | { name: "detail"; id: string }
  | { name: "inbox" }
  | { name: "search"; fromEquipoId: string }
  | { name: "player"; player: SearchPlayer; fromEquipoId: string };

type Props = {
  onRequestAuth: () => void;
};

export function MainTabs({ onRequestAuth }: Props) {
  const { session, signOut, profile } = useAuth();
  const loggedIn = Boolean(session?.user);
  const [tab, setTab] = useState<Tab>("explore");
  const [exploreView, setExploreView] = useState<ExploreView>("hub");
  const [preferMap, setPreferMap] = useState(false);
  const [detalle, setDetalle] = useState<Desafio | null>(null);
  const [teamsView, setTeamsView] = useState<TeamsView>({ name: "list" });
  const [items, setItems] = useState<Desafio[]>([]);
  const [equipos, setEquipos] = useState<EquipoListItem[]>([]);
  const [inbox, setInbox] = useState<Awaited<ReturnType<typeof listInvitacionesRecibidas>>>([]);
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hideProfileNav, setHideProfileNav] = useState(false);
  const [profileGate, setProfileGate] = useState<null | "username" | "phone" | "birthdate">(null);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notificacion[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [plusOpen, setPlusOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [plusSearch, setPlusSearch] = useState(false);
  const [plusPlayer, setPlusPlayer] = useState<SearchPlayer | null>(null);
  const [crearPartidoOpen, setCrearPartidoOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [listaReservaId, setListaReservaId] = useState<string | null>(null);
  const [completarReservaId, setCompletarReservaId] = useState<string | null>(null);
  const [reservePrefill, setReservePrefill] = useState<{
    canchaId?: string;
    turnoId?: string;
    tipoCobro?: "sena" | "total";
    acepto?: boolean;
  } | null>(null);
  const [inscribir, setInscribir] = useState<{ desafio: Desafio; existing: InscripcionMia | null } | null>(null);
  const [mia, setMia] = useState<InscripcionMia | null>(null);
  const resumedKey = useRef<string | null>(null);

  const refreshTeams = useCallback(async () => {
    if (!profile) {
      setEquipos([]);
      setInbox([]);
      setTeamsLoading(false);
      return;
    }
    setTeamsLoading(true);
    const [mine, invites] = await Promise.all([
      listMisEquipos(profile.id),
      listInvitacionesRecibidas(profile.id),
    ]);
    setEquipos(mine);
    setInbox(invites);
    setTeamsLoading(false);
  }, [profile]);

  const refreshNotifs = useCallback(async () => {
    if (!profile) {
      setNotifs([]);
      setUnreadNotifs(0);
      setNotifsLoading(false);
      return;
    }
    setNotifsLoading(true);
    const [list, unread] = await Promise.all([listNotificaciones(), countUnreadNotificaciones()]);
    setNotifs(list);
    setUnreadNotifs(unread);
    setNotifsLoading(false);
  }, [profile]);

  useEffect(() => {
    void refreshNotifs();
  }, [refreshNotifs]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshNotifs();
    });
    return () => sub.remove();
  }, [refreshNotifs]);

  const refreshDesafios = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await getDesafiosPublicos();
    setItems(data);
    setError(loadError);
    setSelectedId((prev) => prev ?? data[0]?.id ?? null);
    setLoading(false);
    return data;
  }, []);

  useEffect(() => {
    void refreshDesafios();
  }, [refreshDesafios]);

  useEffect(() => {
    refreshTeams();
  }, [refreshTeams]);

  useEffect(() => {
    if (!loggedIn && tab === "profile") setTab("explore");
    if (!loggedIn) setNotifsOpen(false);
  }, [loggedIn, tab]);

  useEffect(() => {
    if (!detalle || !profile) {
      setMia(null);
      return;
    }
    const ids = equipos.map((e) => e.id);
    void getInscripcionMia(detalle.id, ids, profile.id).then(setMia);
  }, [detalle, equipos, profile]);

  const openMap = (id?: string) => {
    if (id) setSelectedId(id);
    setDetalle(null);
    setPreferMap(true);
    setTab("matches");
  };

  const openDesafio = (d: Desafio) => {
    setSelectedId(d.id);
    setDetalle(d);
  };

  const openNotifs = () => {
    if (!loggedIn) {
      onRequestAuth();
      return;
    }
    setNotifsOpen(true);
    void refreshNotifs();
  };

  const startInscribir = async (d: Desafio) => {
    const caps = equiposDondeEsCapitan(equipos);
    const existing = await getInscripcionMia(
      d.id,
      caps.map((e) => e.id),
      profile?.id
    );
    setInscribir({ desafio: d, existing });
  };

  const openFromNotif = (destino: DestinoNotif, equipoId: string | null, desafioId?: string | null) => {
    setNotifsOpen(false);
    void refreshNotifs();
    void refreshTeams();
    if (destino === "desafio" && desafioId) {
      const d = items.find((x) => x.id === desafioId);
      if (d) {
        setSelectedId(d.id);
        setDetalle(d);
      } else {
        void refreshDesafios().then((list) => {
          const found = list.find((x) => x.id === desafioId);
          if (found) {
            setSelectedId(found.id);
            setDetalle(found);
          }
        });
      }
      return;
    }
    if (destino === "inbox") {
      setTab("teams");
      void refreshTeams().then(() => setTeamsView({ name: "inbox" }));
      return;
    }
    if (destino === "equipo" && equipoId) {
      setTab("teams");
      setTeamsView({ name: "detail", id: equipoId });
      return;
    }
    setTab("teams");
    setTeamsView({ name: "list" });
  };

  const needAuth = () => {
    if (loggedIn) return false;
    onRequestAuth();
    return true;
  };

  const queueOrRun = async (action: PendingAction, run: () => void | Promise<void>) => {
    await setPendingAction(action);
    if (!loggedIn) {
      onRequestAuth();
      return;
    }
    if (profileNeedsUsername(profile)) {
      setProfileGate("username");
      return;
    }
    if (profileNeedsPhone(profile)) {
      setProfileGate("phone");
      return;
    }
    if (profileNeedsBirthdate(profile)) {
      setProfileGate("birthdate");
      return;
    }
    await clearPendingAction();
    await run();
  };

  useEffect(() => {
    if (!profileGate) return;
    if (profileNeedsUsername(profile)) {
      setProfileGate("username");
      return;
    }
    if (profileNeedsPhone(profile)) {
      setProfileGate("phone");
      return;
    }
    if (profileNeedsBirthdate(profile)) {
      setProfileGate("birthdate");
      return;
    }
    setProfileGate(null);
  }, [profile, profileGate]);

  useEffect(() => {
    if (!loggedIn || loading) return;
    let cancelled = false;
    const go = async () => {
      const action = await peekPendingAction();
      if (cancelled || !action || action.kind === "join_token" || action.kind === "claim_reserva") return;
      if (action.kind === "open_desafio" || action.kind === "open_predio") return;
      if (action.kind === "inscribir" && teamsLoading) return;
      if (action.kind !== "open_inbox" && action.kind !== "favorite" && !profileReadyForActions(profile)) return;
      const key = JSON.stringify(action);
      if (resumedKey.current === key) return;
      resumedKey.current = key;
      await clearPendingAction();
      setProfileGate(null);
      if (action.kind === "create_team") {
        setTab("teams");
        setTeamsView({ name: "create" });
        return;
      }
      if (action.kind === "open_inbox") {
        setTab("teams");
        await refreshTeams();
        setTeamsView({ name: "inbox" });
        return;
      }
      if (action.kind === "accept_invite") {
        setTab("teams");
        setTeamsView({ name: "inbox" });
        const res = await rpcResponderSolicitud(supabase, action.solicitudId, true);
        void refreshTeams();
        if (!res.ok) {
          showNotice("Invitación", mensajeErrorEquipo(res.error));
        }
        return;
      }
      if (action.kind === "favorite") {
        await toggleFavorito(action.jugadorId);
        setTab("profile");
        return;
      }
      if (action.kind === "inscribir") {
        const d = items.find((x) => x.id === action.desafioId);
        if (d) {
          setSelectedId(d.id);
          setDetalle(d);
          void startInscribir(d);
        }
        return;
      }
      if (action.kind === "reservar") {
        setReservePrefill({
          canchaId: action.canchaId,
          turnoId: action.turnoId,
          tipoCobro: action.tipoCobro,
          acepto: action.acepto,
        });
        setExploreView(action.canchaId ? "predio" : "reservar");
        setTab("explore");
        return;
      }
      if (action.kind === "crear_partido") {
        setCrearPartidoOpen(true);
        return;
      }
      if (action.kind === "lista_reserva") {
        setListaReservaId(action.reservaId);
      }
    };
    void go();
    return () => {
      cancelled = true;
    };
  }, [loggedIn, profile, loading, teamsLoading, items, refreshTeams, equipos]);

  useEffect(() => {
    let cancelled = false;
    const openLaunch = async () => {
      const action = await peekPendingAction();
      if (cancelled || !action) return;
      if (action.kind !== "open_desafio" && action.kind !== "open_predio") return;
      const key = JSON.stringify(action);
      if (resumedKey.current === key) return;
      resumedKey.current = key;
      await clearPendingAction();
      if (action.kind === "open_desafio") {
        const d = await getDesafioPorId(action.desafioId);
        if (cancelled || !d) return;
        setTab("explore");
        setExploreView("partidos");
        setSelectedId(d.id);
        setDetalle(d);
        return;
      }
      const predio = await rpcPredioPublico(supabase, action.slug);
      if (cancelled || !predio.ok) return;
      const canchaId = typeof predio.id === "string" ? predio.id : "";
      if (!canchaId) return;
      setTab("explore");
      setReservePrefill({ canchaId });
      setExploreView("predio");
    };
    void openLaunch();
    return () => {
      cancelled = true;
    };
  }, []);

  const crearPartido = () => {
    setPlusOpen(true);
  };

  useEffect(() => {
    if (!loggedIn) {
      setCompletarReservaId(null);
      return;
    }
    void listarMisReservas().then((r) => {
      setCompletarReservaId(r.data.find((x) => x.estado === "reservada")?.id ?? null);
    });
  }, [loggedIn, plusOpen]);

  const teamsBody = () => {
    if (teamsView.name === "create") {
      return (
        <CrearEquipoScreen
          onBack={() => setTeamsView({ name: "list" })}
          onCreated={(id) => {
            refreshTeams();
            setTeamsView({ name: "detail", id });
          }}
        />
      );
    }
    if (teamsView.name === "search") {
      return (
        <PlayersSearchScreen
          onBack={() => setTeamsView({ name: "detail", id: teamsView.fromEquipoId })}
          onOpenPlayer={(p) => setTeamsView({ name: "player", player: p, fromEquipoId: teamsView.fromEquipoId })}
          onRequestAuth={onRequestAuth}
        />
      );
    }
    if (teamsView.name === "player") {
      return (
        <PlayerPublicProfileScreen
          player={teamsView.player}
          myUserId={profile?.id}
          captainTeams={equiposDondeEsCapitan(equipos)}
          preferredEquipoId={teamsView.fromEquipoId}
          onBack={() => setTeamsView({ name: "search", fromEquipoId: teamsView.fromEquipoId })}
          onBlocked={() => setTeamsView({ name: "search", fromEquipoId: teamsView.fromEquipoId })}
          onCreateTeam={() => setTeamsView({ name: "create" })}
          onRequestAuth={onRequestAuth}
        />
      );
    }
    if (teamsView.name === "detail") {
      return (
        <EquipoDetalleScreen
          equipoId={teamsView.id}
          onBack={() => {
            refreshTeams();
            setTeamsView({ name: "list" });
          }}
          onLeft={() => {
            refreshTeams();
            setTeamsView({ name: "list" });
          }}
          onBuscarJugadores={() => setTeamsView({ name: "search", fromEquipoId: teamsView.id })}
        />
      );
    }
    if (teamsView.name === "inbox") {
      return (
        <InvitacionesScreen
          items={inbox}
          onBack={() => setTeamsView({ name: "list" })}
          onChanged={refreshTeams}
          onAccept={(solicitudId, run) => {
            void queueOrRun({ kind: "accept_invite", solicitudId }, run);
          }}
        />
      );
    }
    return (
      <EquiposListScreen
        items={equipos}
        loading={teamsLoading}
        inboxCount={inbox.length}
        onCreate={() => {
          void queueOrRun({ kind: "create_team" }, () => setTeamsView({ name: "create" }));
        }}
        onInbox={() => {
          void queueOrRun({ kind: "open_inbox" }, () => {
            void refreshTeams().then(() => setTeamsView({ name: "inbox" }));
          });
        }}
        onOpen={(id) => setTeamsView({ name: "detail", id })}
      />
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {profile?.rol === "owner" ? (
        <Text style={styles.ownerHint}>En PorLaCancha estás como jugador.</Text>
      ) : null}
      <View style={styles.body}>
        {loggedIn && profileGate === "username" ? (
          <CompleteUsernameScreen />
        ) : loggedIn && profileGate === "phone" ? (
          <CompletePhoneScreen />
        ) : loggedIn && profileGate === "birthdate" ? (
          <CompleteBirthdateScreen />
        ) : inscribir ? (
          <InscribirEquipoScreen
            desafio={inscribir.desafio}
            captainTeams={equiposDondeEsCapitan(equipos)}
            existing={inscribir.existing}
            onBack={() => setInscribir(null)}
            onCreateTeam={() => {
              setInscribir(null);
              void queueOrRun({ kind: "create_team" }, () => {
                setTeamsView({ name: "create" });
                setTab("teams");
              });
            }}
            onDone={() => {
              const id = inscribir.desafio.id;
              setInscribir(null);
              void refreshNotifs();
              void refreshDesafios().then((list) => {
                const d = list.find((x) => x.id === id);
                if (d) {
                  setDetalle(d);
                  setSelectedId(d.id);
                }
              });
            }}
          />
        ) : crearPartidoOpen ? (
          <CrearPartidoScreen
            captainTeams={equiposDondeEsCapitan(equipos)}
            onBack={() => setCrearPartidoOpen(false)}
            onCreateTeam={() => {
              setCrearPartidoOpen(false);
              void queueOrRun({ kind: "create_team" }, () => {
                setTeamsView({ name: "create" });
                setTab("teams");
              });
            }}
            onCreated={(desafioId) => {
              setCrearPartidoOpen(false);
              void refreshDesafios().then(async (list) => {
                const d = list.find((x) => x.id === desafioId) ?? (await getDesafioPorId(desafioId));
                if (d) {
                  setDetalle(d);
                  setSelectedId(d.id);
                }
              });
            }}
          />
        ) : plusPlayer ? (
          <PlayerPublicProfileScreen
            player={plusPlayer}
            myUserId={profile?.id}
            captainTeams={equiposDondeEsCapitan(equipos)}
            onBack={() => setPlusPlayer(null)}
            onBlocked={() => setPlusPlayer(null)}
            onCreateTeam={() => {
              setPlusPlayer(null);
              setPlusSearch(false);
              void queueOrRun({ kind: "create_team" }, () => {
                setTeamsView({ name: "create" });
                setTab("teams");
              });
            }}
            onRequestAuth={onRequestAuth}
          />
        ) : plusSearch ? (
          <PlayersSearchScreen
            onBack={() => setPlusSearch(false)}
            onOpenPlayer={(p) => setPlusPlayer(p)}
            onRequestAuth={onRequestAuth}
          />
        ) : notifsOpen ? (
          <NotificacionesScreen
            items={notifs}
            loading={notifsLoading}
            onBack={() => {
              setNotifsOpen(false);
              void refreshNotifs();
            }}
            onRefresh={() => void refreshNotifs()}
            onOpen={openFromNotif}
          />
        ) : detalle ? (
          <DesafioDetalleScreen
            desafio={detalle}
            guest={!loggedIn}
            inscriptoComo={
              mia
                ? mia.equipoId && equiposDondeEsCapitan(equipos).some((e) => e.id === mia.equipoId)
                  ? "capitan"
                  : "miembro"
                : null
            }
            inscripcionId={mia?.id}
            estadoInscripcion={mia?.estado}
            onBack={() => setDetalle(null)}
            onInscribir={() => {
              void queueOrRun({ kind: "inscribir", desafioId: detalle.id }, () => startInscribir(detalle));
            }}
            onOpenMap={() => openMap(detalle.id)}
            onPaid={() => {
              void refreshDesafios().then((list) => {
                const d = list.find((x) => x.id === detalle.id);
                if (d) setDetalle(d);
              });
              const ids = equipos.map((e) => e.id);
              void getInscripcionMia(detalle.id, ids, profile?.id).then(setMia);
            }}
          />
        ) : listaReservaId ? (
          <ReservaListaScreen reservaId={listaReservaId} onBack={() => setListaReservaId(null)} />
        ) : calendarOpen ? (
          <View style={styles.body}>
            <View style={{ paddingTop: 48, paddingHorizontal: 8 }}>
              <IconBtn onPress={() => setCalendarOpen(false)} label="Volver">
                <ChevronLeft color={colors.gold} size={22} strokeWidth={iconStroke} />
              </IconBtn>
            </View>
            <MisPartidosScreen
              guest={!loggedIn}
              onRequestAuth={onRequestAuth}
              onOpenDesafio={(d) => {
                setCalendarOpen(false);
                openDesafio(d);
              }}
              onEditarConvocados={(d) => {
                setCalendarOpen(false);
                void startInscribir(d);
              }}
            />
          </View>
        ) : tab === "matches" ? (
          <ExplorarScreen
            items={items}
            loading={loading}
            error={error}
            guest={!loggedIn}
            selectedId={selectedId}
            preferMap={preferMap}
            onSelectId={setSelectedId}
            onOpenDesafio={openDesafio}
            unreadNotifs={unreadNotifs}
            onOpenNotifs={openNotifs}
          />
        ) : tab === "profile" && loggedIn ? (
          <PerfilHub
            guest={false}
            equipos={equipos}
            onRequestAuth={onRequestAuth}
            onSignOut={async () => {
              await signOut();
              setTab("explore");
            }}
            onOpenTeam={(id) => {
              setTeamsView({ name: "detail", id });
              setTab("teams");
            }}
            onOpenExplore={() => {
              setPreferMap(false);
              setExploreView("hub");
              setTab("explore");
            }}
            onCreateTeam={() => {
              void queueOrRun({ kind: "create_team" }, () => {
                setTeamsView({ name: "create" });
                setTab("teams");
              });
            }}
            onJoinTeam={() => {
              if (needAuth()) return;
              setTeamsView({ name: "list" });
              setTab("teams");
            }}
            onHideNav={setHideProfileNav}
            unreadNotifs={unreadNotifs}
            onOpenNotifs={openNotifs}
          />
        ) : tab === "teams" ? (
          teamsBody()
        ) : exploreView === "predio" && reservePrefill?.canchaId ? (
          <PredioDetalleScreen
            canchaId={reservePrefill.canchaId}
            initialTurnoId={reservePrefill.turnoId ?? null}
            initialTipoCobro={reservePrefill.tipoCobro ?? null}
            initialAcepto={reservePrefill.acepto ?? false}
            partidos={items}
            onBack={() => {
              setReservePrefill(null);
              setExploreView("hub");
            }}
            onRequestAuth={onRequestAuth}
            onOpenDesafio={openDesafio}
            onArmarPlus={(turnoId) => {
              setReservePrefill((prev) => (prev ? { ...prev, turnoId } : prev));
              setCrearPartidoOpen(true);
            }}
            onDone={() => {
              setReservePrefill(null);
              setExploreView("hub");
              setTab("explore");
            }}
          />
        ) : exploreView === "reservar" ? (
          <ReservarCanchaScreen
            onBack={() => {
              setReservePrefill(null);
              setExploreView("hub");
            }}
            onRequestAuth={onRequestAuth}
            initialCanchaId={reservePrefill?.canchaId ?? null}
            initialTurnoId={reservePrefill?.turnoId ?? null}
            initialTipoCobro={reservePrefill?.tipoCobro ?? null}
            initialAcepto={reservePrefill?.acepto ?? false}
            onDone={() => {
              setReservePrefill(null);
              setExploreView("hub");
              setTab("explore");
            }}
          />
        ) : (
          <InicioScreen
            guest={!loggedIn}
            items={items}
            loading={loading}
            error={error}
            unreadNotifs={unreadNotifs}
            onOpenNotifs={loggedIn ? openNotifs : undefined}
            onRefresh={refreshDesafios}
            onReservar={() => {
              setReservePrefill(null);
              setExploreView("reservar");
            }}
            onArmar={() => {
              void queueOrRun({ kind: "crear_partido" }, () => setCrearPartidoOpen(true));
            }}
            onOpenDesafio={openDesafio}
            onVerPartidos={() => {
              setPreferMap(false);
              setTab("matches");
            }}
            onVerProximos={() => {
              if (needAuth()) return;
              setCalendarOpen(true);
            }}
            onOpenPredio={(canchaId) => {
              setReservePrefill({ canchaId });
              setExploreView("predio");
            }}
            onReservarTurno={(canchaId, turnoId) => {
              setReservePrefill({ canchaId, turnoId });
              setExploreView("predio");
            }}
            onRequestAuth={onRequestAuth}
            onOpenZona={() => {
              if (needAuth()) return;
              setTab("profile");
            }}
          />
        )}
      </View>
      {!detalle &&
      !notifsOpen &&
      !inscribir &&
      !calendarOpen &&
      !listaReservaId &&
      !crearPartidoOpen &&
      exploreView !== "reservar" &&
      exploreView !== "predio" &&
      !plusSearch &&
      !plusPlayer &&
      !hideProfileNav &&
      !profileGate &&
      !(tab === "teams" && (teamsView.name === "search" || teamsView.name === "player")) ? (
        <PorLaCanchaBottomTabBar
          activeTab={tab}
          teamsBadge={inbox.length}
          onTabPress={(next) => {
            if (next === "explore") {
              setPreferMap(false);
              setExploreView("hub");
              setTab("explore");
              return;
            }
            if (next === "matches") {
              setPreferMap(false);
              setTab("matches");
              return;
            }
            if (next === "teams") {
              if (needAuth()) return;
              setTab("teams");
              refreshTeams();
              return;
            }
            if (!loggedIn) {
              onRequestAuth();
              return;
            }
            setTab("profile");
          }}
          onPlusPress={crearPartido}
        />
      ) : null}
      <PlusActionsSheet
        visible={plusOpen}
        onClose={() => setPlusOpen(false)}
        onReservarCancha={() => {
          setPlusOpen(false);
          setReservePrefill(null);
          setExploreView("reservar");
          setTab("explore");
        }}
        onArmarPartido={() => {
          setPlusOpen(false);
          void queueOrRun({ kind: "crear_partido" }, () => setCrearPartidoOpen(true));
        }}
        onCompletarPartido={
          completarReservaId
            ? () => {
                const id = completarReservaId;
                setPlusOpen(false);
                void queueOrRun({ kind: "lista_reserva", reservaId: id }, () => setListaReservaId(id));
              }
            : undefined
        }
      />
      <UnirseEnlaceSheet
        visible={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={() => void refreshTeams()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  ownerHint: {
    textAlign: "center",
    paddingTop: 48,
    paddingBottom: 4,
    fontSize: 11,
    color: colors.textSecondary,
  },
  body: { flex: 1 },
});
