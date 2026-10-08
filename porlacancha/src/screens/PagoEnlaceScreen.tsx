import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { colors, space } from "@shared/design";
import { useAuth } from "../auth/AuthProvider";
import {
  abrirBuscaGente,
  cotizarEnlacePago,
  pagarEnlacePago,
  pesosReserva,
  verEnlacePago,
  type AlternativaTurno,
  type CotizacionReserva,
  type EnlacePagoVista,
} from "../lib/reserva";
import { formatFechaCorta, formatHora } from "../lib/desafios";
import { compartirTexto } from "../lib/share-text";
import { BrandLogo, Button, ErrorText, Heading, Lead, Mute, Screen, showNotice } from "../ui";
import { PagoQrCard } from "../ui/PagoQrCard";
import { typeStyle } from "../ui/textStyle";
import { AuthBackBar } from "./auth/AuthBackBar";
import { ReservaListaScreen } from "./ReservaListaScreen";

type Props = {
  token: string;
  onDone: () => void;
  onCancel: () => void;
};

export function PagoEnlaceScreen({ token, onDone, onCancel }: Props) {
  const { session } = useAuth();
  const [vista, setVista] = useState<EnlacePagoVista | null>(null);
  const [tomado, setTomado] = useState(false);
  const [alts, setAlts] = useState<AlternativaTurno[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"sena" | "total">("sena");
  const [cot, setCot] = useState<CotizacionReserva | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reservaId, setReservaId] = useState<string | null>(null);
  const [lista, setLista] = useState(false);
  const [qr, setQr] = useState<{ initPoint: string; holdId: string } | null>(null);

  useEffect(() => {
    void verEnlacePago(token).then((r) => {
      if (!r.ok) {
        setTomado(true);
        setAlts(r.alternativas);
        setError(r.error);
        return;
      }
      setVista(r.data);
    });
  }, [token]);

  useEffect(() => {
    if (tomado) return;
    void cotizarEnlacePago(token, tipo).then((res) => {
      if (!res.ok) {
        setCot(null);
        return;
      }
      setCot(res.cot);
    });
  }, [token, tipo, tomado]);

  const pagar = async () => {
    if (!acepto || !session?.access_token) return;
    setBusy(true);
    const res = await pagarEnlacePago(token, tipo, session.access_token);
    setBusy(false);
    if (!res.ok) {
      showNotice("No se pudo pagar", res.error);
      return;
    }
    if ("reservaId" in res) {
      setReservaId(res.reservaId);
      return;
    }
    if (res.canal === "qr") {
      setQr({ initPoint: res.initPoint, holdId: res.holdId });
      return;
    }
    showNotice("Mercado Pago", "Te llevamos a pagar. El turno se confirma cuando se aprueba el pago.");
    onDone();
  };

  if (lista && reservaId) {
    return <ReservaListaScreen reservaId={reservaId} onBack={() => setLista(false)} />;
  }

  if (reservaId) {
    return (
      <Screen scroll>
        <AuthBackBar onBack={onDone} label="Ir a mis partidos" />
        <BrandLogo size="sm" />
        <Heading>El turno es tuyo</Heading>
        <Lead>Compartilo, cargá quién juega o abrí el partido si te falta gente.</Lead>
        <Button
          label="Compartir con amigos"
          onPress={() => {
            void compartirTexto(
              `Jugamos el ${vista?.fecha ?? ""} a las ${vista?.hora_inicio ?? ""} en ${vista?.cancha_nombre ?? ""}. Sumate en PorLaCancha.`,
            );
          }}
        />
        <View style={{ height: space[8] }} />
        <Button label="Cargar lista de jugadores" variant="secondary" onPress={() => setLista(true)} />
        <View style={{ height: space[8] }} />
        <Button
          label="Abrir el partido si falta gente"
          variant="secondary"
          onPress={() => {
            void abrirBuscaGente(reservaId, true).then((r) => {
              if (!r.ok) {
                showNotice("No se pudo abrir", r.error);
                return;
              }
              showNotice("Partido abierto", "Quien tenga el enlace puede saber que buscás gente.");
            });
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AuthBackBar onBack={onCancel} label="Ahora no" />
      <BrandLogo size="sm" />
      <Heading>{tomado ? "Este horario ya fue reservado" : "Pagá para confirmar"}</Heading>
      {error && tomado ? <ErrorText>{error}</ErrorText> : null}
      {vista && !tomado ? (
        <Lead>
          {vista.titular_nombre}
          {"\n"}
          {vista.cancha_nombre} · {vista.campo_nombre}
          {"\n"}
          {formatFechaCorta(vista.fecha)} {formatHora(vista.hora_inicio)}
          {"\n"}
          Seña {pesosReserva(vista.sena)}
        </Lead>
      ) : null}
      {tomado && alts.length > 0 ? (
        <View style={{ gap: space[6], marginTop: space[12] }}>
          <Mute>Horarios libres más cercanos</Mute>
          {alts.map((a) => (
            <Text key={a.id} style={typeStyle("bodySmall", colors.white)}>
              {formatFechaCorta(a.fecha)} · {formatHora(a.hora_inicio)}
            </Text>
          ))}
        </View>
      ) : null}
      {!tomado && cot ? (
        <>
          <View style={{ flexDirection: "row", gap: 8, marginTop: space[16] }}>
            <Pressable onPress={() => setTipo("sena")} style={{ opacity: tipo === "sena" ? 1 : 0.5 }}>
              <Text style={typeStyle("body", colors.gold)}>Seña {pesosReserva(cot.sena)}</Text>
            </Pressable>
            <Pressable onPress={() => setTipo("total")} style={{ opacity: tipo === "total" ? 1 : 0.5 }}>
              <Text style={typeStyle("body", colors.gold)}>Total {pesosReserva(cot.monto_pagar)}</Text>
            </Pressable>
          </View>
          {tipo === "total" && cot.descuento > 0 ? (
            <Mute>Descuento por pagar el total: {pesosReserva(cot.descuento)}</Mute>
          ) : null}
          <Mute>{cot.texto_reglas}</Mute>
          <Pressable onPress={() => setAcepto((v) => !v)} style={{ marginVertical: space[12] }}>
            <Text style={typeStyle("bodySmall", colors.white)}>
              {acepto ? "✓" : "○"} Acepto las reglas del predio
            </Text>
          </Pressable>
          {qr && session?.access_token ? (
            <PagoQrCard
              initPoint={qr.initPoint}
              holdId={qr.holdId}
              accessToken={session.access_token}
              onConfirmada={(id) => setReservaId(id)}
              onVencida={() => {
                setQr(null);
                showNotice("Pago", "Se venció el tiempo para pagar. El turno volvió a quedar libre.");
              }}
            />
          ) : (
            <Button
              label={busy ? "Procesando..." : `Pagar ${pesosReserva(cot.monto_pagar)}`}
              onPress={() => void pagar()}
              loading={busy}
              disabled={!acepto || busy}
            />
          )}
        </>
      ) : null}
    </Screen>
  );
}
