export {
  crearEquipoSchema,
  invitarJugadorSchema,
  matchFormatoSchema,
  tokenEnlaceSchema,
  normalizeUsername,
  usernameSchema,
  type CrearEquipoInput,
  type InvitarJugadorInput,
  type MatchFormato,
} from "../validation/equipos";
export { EQUIPOS_RPC_ERRORS, mensajeErrorEquipo } from "./errors";
export {
  rpcCrearEquipo,
  rpcExpulsarJugador,
  rpcGenerarEnlaceEquipo,
  rpcGetEquipoPorToken,
  rpcInscribirEquipo,
  rpcCancelarInscripcion,
  rpcEditarConvocados,
  rpcInvitarJugador,
  rpcResponderSolicitud,
  rpcSalirDelEquipo,
  rpcSolicitarIngresoPorToken,
  rpcTransferirCapitania,
  rpcCrearPartido,
  rpcCotizarReservaPlus,
  rpcPasarAPlus,
  rpcInscribirJugadorAmistoso,
  rpcConfirmarPagoPrueba,
  rpcMontoAPagarInscripcion,
  rpcCalcularCondiciones,
  rpcCondicionesDeDesafio,
  rpcOpcionesSinRival,
  rpcDecidirSinRival,
  rpcListarTurnosPublicos,
  rpcGetRelojPlc,
  rpcSetRelojSimulacion,
  rpcCorrerTareaPeriodicaPlc,
  rpcListarPrediosPublicos,
  rpcCotizarReserva,
  rpcOpcionesCobroReserva,
  rpcIniciarCheckoutReserva,
  rpcConfirmarPagoReservaPrueba,
  rpcCancelarReservaPlc,
  rpcListarMisReservasPlc,
  rpcCargarReservaWhatsapp,
  rpcAgendaReservasDia,
  rpcVerReclamo,
  rpcEmitirOtpReclamo,
  rpcVerificarOtpReclamo,
  rpcCrearEnlacePago,
  rpcCargarReservaManual,
  rpcVerEnlacePago,
  rpcCotizarEnlacePago,
  rpcIniciarCheckoutEnlace,
  rpcPredioPublico,
  rpcDetallePredio,
  rpcSlugDeCancha,
  rpcGuardarListaReserva,
  rpcListarListaReserva,
  rpcAbrirBuscaGente,
  rpcMiEstadoEdad,
  rpcGuardarFechaNacimiento,
  rpcGuardarIdentidadDesafio,
  esErrorIdentidadDesafio,
  esErrorFaltaNacimiento,
  type EquiposRpcClient,
  type RpcResult,
} from "./rpc";

export function enlaceReclamoWeb(webBaseUrl: string, token: string): string {
  const base = webBaseUrl.replace(/\/$/, "");
  return `${base}/r/${token}`;
}

export function enlacePredioWeb(webBaseUrl: string, slug: string): string {
  const base = webBaseUrl.replace(/\/$/, "");
  return `${base}/p/${slug}`;
}

export function mensajeWhatsappReserva(input: {
  nombre: string;
  fecha: string;
  hora: string;
  predio: string;
  campo?: string;
  link: string;
  sena?: number;
}): string {
  const sena =
    input.sena != null
      ? `$${Math.round(input.sena).toLocaleString("es-AR")}`
      : "la seña";
  return `Hola ${input.nombre}, te dejo el ${input.fecha} a las ${input.hora} en ${input.predio}. Pagá la seña de ${sena} acá para confirmar: ${input.link}. Desde la app podés ver tu partido, compartirlo con tus amigos, sumar jugadores o abrir el partido si te falta gente.`;
}
export {
  guardarUsername,
  interpretarErrorUsername,
  USERNAME_EN_USO,
} from "./username";

export function enlaceUnirseMobile(token: string): string {
  return `porlacancha://equipo/unirse/${token}`;
}

/** Vista web clickeable en WhatsApp: https://porlacancha.com/e/{token} */
export function enlaceUnirseWeb(appBaseUrl: string, token: string): string {
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}/e/${token}`;
}

/** Prefiere HTTPS si hay sitio; si no, el scheme de la app (no clickeable en WhatsApp). */
export function enlaceCompartirEquipo(token: string, webBaseUrl?: string | null): string {
  const base = webBaseUrl?.trim();
  if (base) return enlaceUnirseWeb(base, token);
  return enlaceUnirseMobile(token);
}
