import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { equiposDondeEsCapitan, type EquipoListItem } from "../../lib/equipos";
import { emptyFootball, loadFootballProfile, type FootballProfile } from "../../lib/perfil";
import type { SearchPlayer } from "../../lib/player-search";
import { ConfiguracionScreen } from "./ConfiguracionScreen";
import { DatosPersonalesScreen } from "./DatosPersonalesScreen";
import { EditarPerfilScreen } from "./EditarPerfilScreen";
import { MiPerfilScreen } from "./MiPerfilScreen";
import { PerfilPublicoScreen } from "./PerfilPublicoScreen";
import { PlayerPublicProfileScreen } from "../jugadores/PlayerPublicProfileScreen";
import { PlayersSearchScreen } from "../jugadores/PlayersSearchScreen";

type ViewName = "home" | "edit" | "settings" | "datos" | "public" | "search" | "player";

type Props = {
  guest: boolean;
  equipos: EquipoListItem[];
  onRequestAuth: () => void;
  onSignOut: () => void;
  onOpenTeam: (id: string) => void;
  onOpenExplore: () => void;
  onCreateTeam: () => void;
  onJoinTeam: () => void;
  onHideNav?: (hide: boolean) => void;
  unreadNotifs?: number;
  onOpenNotifs?: () => void;
};

export function PerfilHub({
  guest,
  equipos,
  onRequestAuth,
  onSignOut,
  onOpenTeam,
  onOpenExplore,
  onCreateTeam,
  onJoinTeam,
  onHideNav,
  unreadNotifs,
  onOpenNotifs,
}: Props) {
  const { profile, session, mergeProfile, refreshProfile } = useAuth();
  const [view, setView] = useState<ViewName>("home");
  const [football, setFootball] = useState<FootballProfile>(emptyFootball());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openPlayer, setOpenPlayer] = useState<SearchPlayer | null>(null);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const loadGen = useRef(0);
  const load = useCallback(async () => {
    if (!profile?.id) {
      setFootball(emptyFootball());
      setLoadError(null);
      return;
    }
    const gen = ++loadGen.current;
    try {
      const fp = await loadFootballProfile(profile.id);
      if (gen !== loadGen.current) return;
      setFootball(fp);
      setLoadError(null);
    } catch {
      if (gen !== loadGen.current) return;
      setLoadError("No pudimos cargar tu perfil");
    }
  }, [profile?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onHideNav?.(view !== "home");
    return () => onHideNav?.(false);
  }, [view, onHideNav]);

  useEffect(() => {
    if (guest) setView("home");
  }, [guest]);

  if (view === "edit" && profile) {
    return (
      <EditarPerfilScreen
        profile={profile}
        football={football}
        onBack={() => setView("home")}
        onSaved={(nombre, username, avatar, fp, telefono) => {
          loadGen.current += 1;
          mergeProfile({ nombre, username, avatar_url: avatar, telefono });
          setFootball(fp);
          setView("home");
        }}
      />
    );
  }

  if (view === "datos" && profile) {
    return (
      <DatosPersonalesScreen
        profile={profile}
        football={football}
        onBack={() => setView("settings")}
        onUpdated={({ fechaNacimiento, tieneDni }) => {
          if (fechaNacimiento !== undefined) {
            setFootball((prev) => ({ ...prev, fechaNacimiento: fechaNacimiento ?? null }));
          }
          if (tieneDni) mergeProfile({ tiene_dni: true });
        }}
      />
    );
  }

  if (view === "settings" && profile) {
    return (
      <ConfiguracionScreen
        profile={profile}
        football={football}
        email={session?.user.email ?? profile.email}
        onBack={() => setView("home")}
        onEdit={() => setView("edit")}
        onDatosPersonales={() => setView("datos")}
        onPublic={() => setView("public")}
        onSignOut={onSignOut}
      />
    );
  }

  if (view === "player" && openPlayer) {
    return (
      <PlayerPublicProfileScreen
        player={openPlayer}
        myUserId={profile?.id}
        captainTeams={equiposDondeEsCapitan(equipos)}
        onBack={() => {
          setView("search");
        }}
        onBlocked={() => setView("search")}
        onCreateTeam={onCreateTeam}
        onRequestAuth={onRequestAuth}
      />
    );
  }

  if (view === "search") {
    return (
      <PlayersSearchScreen
        onBack={() => setView("home")}
        onOpenPlayer={(p) => {
          setOpenPlayer(p);
          setView("player");
        }}
        onRequestAuth={onRequestAuth}
      />
    );
  }
  if (view === "public" && profile) {
    return (
      <PerfilPublicoScreen
        user={{
          nombre: profile.nombre,
          username: profile.username,
          avatar_url: profile.avatar_url,
          created_at: profile.created_at,
        }}
        football={football}
        equipos={equipos}
        onBack={() => setView("settings")}
        onOpenTeam={onOpenTeam}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MiPerfilScreen
        guest={guest}
        profile={profile}
        football={football}
        equipos={equipos}
        loadError={loadError}
        onRetry={() => void load()}
        onRequestAuth={onRequestAuth}
        onOpenSettings={() => setView("settings")}
        onOpenEdit={() => setView("edit")}
        onOpenTeam={onOpenTeam}
        onOpenExplore={onOpenExplore}
        onCreateTeam={onCreateTeam}
        onJoinTeam={onJoinTeam}
        onSearchPlayers={() => setView("search")}
        onSignOut={onSignOut}
        email={session?.user.email ?? profile?.email ?? null}
        unreadNotifs={unreadNotifs}
        onOpenNotifs={onOpenNotifs}
      />
    </View>
  );
}

export function profileHidesNav(view: ViewName) {
  return view !== "home";
}
