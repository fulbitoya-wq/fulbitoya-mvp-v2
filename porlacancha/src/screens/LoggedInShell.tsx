import { useEffect, useRef, useState } from "react";
import * as Linking from "expo-linking";
import { useAuth } from "../auth/AuthProvider";
import { rememberClaimTokenFromUrl } from "../lib/claim-token";
import { aplicarTokenUnirse } from "../lib/join-flow";
import { rememberJoinTokenFromUrl } from "../lib/join-token";
import {
  clearPendingAction,
  peekPendingAction,
  profileNeedsBirthdate,
  profileNeedsPhone,
  profileNeedsUsername,
} from "../lib/pending-action";
import { CompleteBirthdateScreen } from "./auth/CompleteBirthdateScreen";
import { CompletePhoneScreen } from "./auth/CompletePhoneScreen";
import { CompleteUsernameScreen } from "./auth/CompleteUsernameScreen";
import { MainTabs } from "./MainTabs";
import { PagoEnlaceScreen } from "./PagoEnlaceScreen";

type Props = {
  onRequestAuth: () => void;
};

export function LoggedInShell({ onRequestAuth }: Props) {
  const { session, profile } = useAuth();
  const [gate, setGate] = useState<null | "username" | "phone" | "birthdate">(null);
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const triedJoin = useRef<string | null>(null);
  const askedAuthForClaim = useRef(false);
  const requestAuthRef = useRef(onRequestAuth);
  requestAuthRef.current = onRequestAuth;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const action = await peekPendingAction();
      if (cancelled) return;

      if (!session) {
        setGate(null);
        if (action?.kind === "claim_reserva") {
          setClaimToken(action.token);
          if (!askedAuthForClaim.current) {
            askedAuthForClaim.current = true;
            requestAuthRef.current();
          }
        } else {
          setClaimToken(null);
        }
        return;
      }

      if (action?.kind === "claim_reserva") {
        setClaimToken(action.token);
        setGate(null);
        return;
      }

      setClaimToken(null);
      if (!action) {
        setGate(null);
        return;
      }
      const mustComplete =
        action.kind === "join_token" ||
        action.kind === "create_team" ||
        action.kind === "accept_invite" ||
        action.kind === "inscribir" ||
        action.kind === "reservar" ||
        action.kind === "crear_partido" ||
        action.kind === "lista_reserva";
      if (mustComplete && profileNeedsUsername(profile)) {
        setGate("username");
        return;
      }
      if (mustComplete && profileNeedsPhone(profile)) {
        setGate("phone");
        return;
      }
      if (mustComplete && profileNeedsBirthdate(profile)) {
        setGate("birthdate");
        return;
      }
      setGate(null);
      if (action.kind !== "join_token") return;
      if (triedJoin.current === action.token) return;
      triedJoin.current = action.token;
      const ok = await aplicarTokenUnirse(action.token);
      if (ok) await clearPendingAction();
    };

    void run();

    const sub = Linking.addEventListener("url", ({ url }) => {
      Promise.all([rememberJoinTokenFromUrl(url), rememberClaimTokenFromUrl(url)]).then(() => {
        void run();
      });
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [session, profile, profile?.username, profile?.telefono, profile?.fecha_nacimiento]);

  if (session && claimToken) {
    return (
      <PagoEnlaceScreen
        token={claimToken}
        onDone={async () => {
          await clearPendingAction();
          setClaimToken(null);
        }}
        onCancel={async () => {
          await clearPendingAction();
          setClaimToken(null);
        }}
      />
    );
  }

  if (session && gate === "username") {
    return <CompleteUsernameScreen />;
  }
  if (session && gate === "phone") {
    return <CompletePhoneScreen />;
  }
  if (session && gate === "birthdate") {
    return <CompleteBirthdateScreen />;
  }

  return <MainTabs onRequestAuth={onRequestAuth} />;
}
