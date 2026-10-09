export type EquiposRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type RpcResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; quienes?: string; minimo?: number; alternativas?: unknown };

function parseRpc(data: unknown, fallbackError: string): RpcResult<Record<string, unknown>> {
  if (!data || typeof data !== "object") {
    return { ok: false, error: fallbackError };
  }
  const row = data as { ok?: boolean; error?: string; quienes?: string; minimo?: number } & Record<string, unknown>;
  if (row.ok === true) {
    const { ok: _ok, error: _e, ...rest } = row;
    return { ok: true, ...rest };
  }
  return {
    ok: false,
    error: typeof row.error === "string" ? row.error : fallbackError,
    quienes: typeof row.quienes === "string" ? row.quienes : undefined,
    minimo: typeof row.minimo === "number" ? row.minimo : undefined,
    alternativas: row.alternativas,
  };
}

async function call(
  client: EquiposRpcClient,
  fn: string,
  args: Record<string, unknown>
): Promise<RpcResult<Record<string, unknown>>> {
  const { data, error } = await client.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  return parseRpc(data, "rpc_error");
}

export async function rpcCrearEquipo(
  client: EquiposRpcClient,
  input: {
    nombre: string;
    escudo_url?: string | null;
    formato_habitual: "f5" | "f7" | "f9" | "f11";
    provincia_id?: string | null;
    partido_id?: string | null;
    localidad_id?: string | null;
  }
): Promise<RpcResult<{ equipo_id: string }>> {
  const res = await call(client, "crear_equipo", {
    p_nombre: input.nombre,
    p_escudo_url: input.escudo_url ?? null,
    p_formato: input.formato_habitual,
    p_provincia_id: input.provincia_id ?? null,
    p_partido_id: input.partido_id ?? null,
    p_localidad_id: input.localidad_id ?? null,
  });
  if (!res.ok) return res;
  const equipo_id = String(res.equipo_id ?? "");
  if (!equipo_id) return { ok: false, error: "rpc_error" };
  return { ok: true, equipo_id };
}

export async function rpcGenerarEnlaceEquipo(
  client: EquiposRpcClient,
  equipoId: string
): Promise<RpcResult<{ token: string }>> {
  const res = await call(client, "generar_enlace_equipo", { p_equipo_id: equipoId });
  if (!res.ok) return res;
  const token = String(res.token ?? "");
  if (!token) return { ok: false, error: "rpc_error" };
  return { ok: true, token };
}

export async function rpcSolicitarIngresoPorToken(
  client: EquiposRpcClient,
  token: string
): Promise<RpcResult<{ equipo_id: string }>> {
  const res = await call(client, "solicitar_ingreso_por_token", { p_token: token });
  if (!res.ok) return res;
  return { ok: true, equipo_id: String(res.equipo_id ?? "") };
}

export async function rpcInvitarJugador(
  client: EquiposRpcClient,
  equipoId: string,
  identificador: string
): Promise<RpcResult<{ usuario_id: string }>> {
  const res = await call(client, "invitar_jugador", {
    p_equipo_id: equipoId,
    p_identificador: identificador,
  });
  if (!res.ok) return res;
  return { ok: true, usuario_id: String(res.usuario_id ?? "") };
}

export async function rpcResponderSolicitud(
  client: EquiposRpcClient,
  solicitudId: string,
  aceptar: boolean
): Promise<RpcResult<{ estado: string }>> {
  const res = await call(client, "responder_solicitud", {
    p_solicitud_id: solicitudId,
    p_aceptar: aceptar,
  });
  if (!res.ok) return res;
  return { ok: true, estado: String(res.estado ?? "") };
}

export async function rpcSalirDelEquipo(
  client: EquiposRpcClient,
  equipoId: string
): Promise<RpcResult> {
  const res = await call(client, "salir_del_equipo", { p_equipo_id: equipoId });
  if (!res.ok) return res;
  return { ok: true };
}

export async function rpcTransferirCapitania(
  client: EquiposRpcClient,
  equipoId: string,
  nuevoCapitanId: string
): Promise<RpcResult> {
  const res = await call(client, "transferir_capitania", {
    p_equipo_id: equipoId,
    p_nuevo_capitan_id: nuevoCapitanId,
  });
  if (!res.ok) return res;
  return { ok: true };
}

export async function rpcExpulsarJugador(
  client: EquiposRpcClient,
  equipoId: string,
  usuarioId: string
): Promise<RpcResult> {
  const res = await call(client, "expulsar_jugador", {
    p_equipo_id: equipoId,
    p_usuario_id: usuarioId,
  });
  if (!res.ok) return res;
  return { ok: true };
}

export async function rpcGetEquipoPorToken(
  client: EquiposRpcClient,
  token: string
): Promise<
  RpcResult<{
    nombre: string;
    escudo_url: string | null;
    formato: string | null;
    zona: string | null;
    miembros: number;
  }>
> {
  const res = await call(client, "get_equipo_por_token", { p_token: token });
  if (!res.ok) return res;
  return {
    ok: true,
    nombre: String(res.nombre ?? ""),
    escudo_url: (res.escudo_url as string | null) ?? null,
    formato: (res.formato as string | null) ?? null,
    zona: (res.zona as string | null) ?? null,
    miembros: Number(res.miembros ?? 0),
  };
}

export async function rpcInscribirEquipo(
  client: EquiposRpcClient,
  desafioId: string,
  equipoId: string,
  convocados: string[]
): Promise<RpcResult<{ inscripcion_id: string; estado: string }>> {
  const res = await call(client, "inscribir_equipo", {
    p_desafio_id: desafioId,
    p_equipo_id: equipoId,
    p_convocados: convocados,
  });
  if (!res.ok) return res;
  return {
    ok: true,
    inscripcion_id: String(res.inscripcion_id ?? ""),
    estado: String(res.estado ?? ""),
  };
}

export async function rpcCancelarInscripcion(
  client: EquiposRpcClient,
  inscripcionId: string
): Promise<RpcResult> {
  const res = await call(client, "cancelar_inscripcion", { p_inscripcion_id: inscripcionId });
  if (!res.ok) return res;
  return { ok: true };
}

export async function rpcEditarConvocados(
  client: EquiposRpcClient,
  inscripcionId: string,
  convocados: string[]
): Promise<RpcResult> {
  const res = await call(client, "editar_convocados", {
    p_inscripcion_id: inscripcionId,
    p_convocados: convocados,
  });
  if (!res.ok) return res;
  return { ok: true };
}

export async function rpcCrearPartido(
  client: EquiposRpcClient,
  input: {
    disponibilidadId: string;
    equipoId: string;
    convocados: string[];
    reglaEmpate: "penales" | "mitad_cada_uno";
    modalidad: "por_la_cancha" | "amistoso" | "competitivo";
    libres?: number;
    busca?: string;
  }
): Promise<RpcResult<{ desafio_id: string; inscripcion_id: string; monto_total?: number; tarifa_plus?: number }>> {
  const res = await call(client, "crear_partido", {
    p_disponibilidad_id: input.disponibilidadId,
    p_equipo_id: input.equipoId,
    p_convocados: input.convocados,
    p_regla_empate: input.reglaEmpate,
    p_modalidad: input.modalidad,
    p_libres: input.libres ?? null,
    p_busca: input.busca ?? null,
  });
  if (!res.ok) return res;
  return {
    ok: true,
    desafio_id: String(res.desafio_id ?? ""),
    inscripcion_id: String(res.inscripcion_id ?? ""),
    monto_total: typeof res.monto_total === "number" ? res.monto_total : Number(res.monto_total ?? 0),
    tarifa_plus: typeof res.tarifa_plus === "number" ? res.tarifa_plus : Number(res.tarifa_plus ?? 0),
  };
}

export async function rpcCotizarReservaPlus(
  client: EquiposRpcClient,
  input: {
    disponibilidadId: string;
    modalidad: string;
    libres: number;
    busca: string;
    tipoCobro?: "sena" | "total";
  }
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_cotizar_reserva_plus", {
    p_disponibilidad_id: input.disponibilidadId,
    p_modalidad: input.modalidad,
    p_libres: input.libres,
    p_busca: input.busca,
    p_tipo_cobro: input.tipoCobro ?? "total",
  });
}

export async function rpcPasarAPlus(
  client: EquiposRpcClient,
  input: {
    reservaId: string;
    equipoId: string;
    convocados: string[];
    modalidad: string;
    reglaEmpate: "penales" | "mitad_cada_uno";
    libres?: number;
    busca?: string;
  }
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_pasar_a_plus", {
    p_reserva_id: input.reservaId,
    p_equipo_id: input.equipoId,
    p_convocados: input.convocados,
    p_modalidad: input.modalidad,
    p_regla_empate: input.reglaEmpate,
    p_libres: input.libres ?? 0,
    p_busca: input.busca ?? "ambos",
  });
}

export async function rpcInscribirJugadorAmistoso(
  client: EquiposRpcClient,
  desafioId: string
): Promise<RpcResult<{ inscripcion_id: string; estado: string }>> {
  const res = await call(client, "inscribir_jugador_amistoso", { p_desafio_id: desafioId });
  if (!res.ok) return res;
  return {
    ok: true,
    inscripcion_id: String(res.inscripcion_id ?? ""),
    estado: String(res.estado ?? ""),
  };
}

export async function rpcConfirmarPagoPrueba(
  client: EquiposRpcClient,
  inscripcionId: string
): Promise<RpcResult> {
  const res = await call(client, "confirmar_pago_prueba", { p_inscripcion_id: inscripcionId });
  if (!res.ok) return res;
  return { ok: true };
}

export async function rpcMontoAPagarInscripcion(
  client: EquiposRpcClient,
  inscripcionId: string
): Promise<RpcResult<{ monto_total: number; monto_cancha: number; monto_servicio: number }>> {
  const res = await call(client, "monto_a_pagar_inscripcion", { p_inscripcion_id: inscripcionId });
  if (!res.ok) return res;
  return {
    ok: true,
    monto_total: Number(res.monto_total ?? 0),
    monto_cancha: Number(res.monto_cancha ?? 0),
    monto_servicio: Number(res.monto_servicio ?? 0),
  };
}

export async function rpcCalcularCondiciones(
  client: EquiposRpcClient,
  disponibilidadId: string,
  tipoDesafio: "por_la_cancha" | "amistoso"
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "calcular_condiciones", {
    p_disponibilidad_id: disponibilidadId,
    p_tipo_desafio: tipoDesafio,
  });
}

export async function rpcCondicionesDeDesafio(
  client: EquiposRpcClient,
  desafioId: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "condiciones_de_desafio", { p_desafio_id: desafioId });
}

export async function rpcOpcionesSinRival(
  client: EquiposRpcClient,
  desafioId: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "opciones_sin_rival", { p_desafio_id: desafioId });
}

export async function rpcDecidirSinRival(
  client: EquiposRpcClient,
  desafioId: string,
  opcion: string,
  aceptaRiesgo = false
): Promise<RpcResult> {
  const res = await call(client, "decidir_sin_rival", {
    p_desafio_id: desafioId,
    p_opcion: opcion,
    p_acepta_riesgo: aceptaRiesgo,
  });
  if (!res.ok) return res;
  return { ok: true };
}

export async function rpcListarTurnosPublicos(
  client: EquiposRpcClient
): Promise<RpcResult<{ turnos: Record<string, unknown>[] }>> {
  const res = await call(client, "listar_turnos_publicos", {});
  if (!res.ok) return res;
  const raw = res.turnos;
  const turnos = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  return { ok: true, turnos };
}

export async function rpcGetRelojPlc(
  client: EquiposRpcClient
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "get_reloj_plc", {});
}

export async function rpcSetRelojSimulacion(
  client: EquiposRpcClient,
  ahora: string | null
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "set_reloj_simulacion", { p_ahora: ahora });
}

export async function rpcCorrerTareaPeriodicaPlc(
  client: EquiposRpcClient
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "correr_tarea_periodica_plc", {});
}

export async function rpcListarPrediosPublicos(
  client: EquiposRpcClient
): Promise<RpcResult<{ predios: Record<string, unknown>[] }>> {
  const res = await call(client, "listar_predios_publicos", {});
  if (!res.ok) return res;
  const raw = res.predios;
  return { ok: true, predios: Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [] };
}

export async function rpcDetallePredio(
  client: EquiposRpcClient,
  canchaId: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_detalle_predio", { p_cancha_id: canchaId });
}

export async function rpcCotizarReserva(
  client: EquiposRpcClient,
  disponibilidadId: string,
  tipoCobro: "sena" | "total"
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_cotizar_reserva", {
    p_disponibilidad_id: disponibilidadId,
    p_tipo_cobro: tipoCobro,
  });
}

export async function rpcOpcionesCobroReserva(
  client: EquiposRpcClient,
  disponibilidadId: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_opciones_cobro_reserva", {
    p_disponibilidad_id: disponibilidadId,
  });
}

export async function rpcIniciarCheckoutReserva(
  client: EquiposRpcClient,
  disponibilidadId: string,
  tipoCobro: "sena" | "total",
  aceptaReglas: boolean
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_iniciar_checkout_reserva", {
    p_disponibilidad_id: disponibilidadId,
    p_tipo_cobro: tipoCobro,
    p_acepta_reglas: aceptaReglas,
  });
}

/** Beta: reserva sin seña del predio → gratis en la app. */
export async function rpcReservarTurnoGratis(
  client: EquiposRpcClient,
  disponibilidadId: string,
  aceptaReglas: boolean
): Promise<RpcResult<{ reserva_id?: string; gratis?: boolean }>> {
  const res = await call(client, "plc_reservar_turno_gratis", {
    p_disponibilidad_id: disponibilidadId,
    p_acepta_reglas: aceptaReglas,
  });
  if (!res.ok) return res;
  return {
    ok: true,
    reserva_id: res.reserva_id ? String(res.reserva_id) : undefined,
    gratis: res.gratis === true || res.gratis === "true",
  };
}

export async function rpcConfirmarPagoReservaPrueba(
  client: EquiposRpcClient,
  holdId: string
): Promise<RpcResult<{ reserva_id?: string }>> {
  const res = await call(client, "plc_confirmar_pago_reserva_prueba", { p_hold_id: holdId });
  if (!res.ok) return res;
  return { ok: true, reserva_id: res.reserva_id ? String(res.reserva_id) : undefined };
}

export async function rpcCancelarReservaPlc(
  client: EquiposRpcClient,
  reservaId: string
): Promise<RpcResult<{ reembolso?: number; mercadopago_payment_id?: string }>> {
  const res = await call(client, "plc_cancelar_reserva", { p_reserva_id: reservaId });
  if (!res.ok) return res;
  return {
    ok: true,
    reembolso: Number(res.reembolso ?? 0),
    mercadopago_payment_id:
      res.mercadopago_payment_id == null || res.mercadopago_payment_id === ""
        ? undefined
        : String(res.mercadopago_payment_id),
  };
}

export async function rpcSetCheckoutPrueba(
  client: EquiposRpcClient,
  activo: boolean
): Promise<RpcResult<{ checkout_prueba?: boolean }>> {
  const res = await call(client, "plc_set_checkout_prueba", { p_activo: activo });
  if (!res.ok) return res;
  return {
    ok: true,
    checkout_prueba: res.checkout_prueba === true || res.checkout_prueba === "true",
  };
}

export async function rpcListarMisReservasPlc(
  client: EquiposRpcClient
): Promise<RpcResult<{ reservas: Record<string, unknown>[] }>> {
  const res = await call(client, "listar_mis_reservas_plc", {});
  if (!res.ok) return res;
  const raw = res.reservas;
  return { ok: true, reservas: Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [] };
}

export async function rpcCargarReservaWhatsapp(
  client: EquiposRpcClient,
  disponibilidadId: string,
  nombre: string,
  telefono: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_cargar_reserva_whatsapp", {
    p_disponibilidad_id: disponibilidadId,
    p_nombre: nombre,
    p_telefono: telefono,
  });
}

export async function rpcAgendaReservasDia(
  client: EquiposRpcClient,
  campoId: string,
  fecha: string
): Promise<RpcResult<{ reservas: Record<string, unknown>[]; enlaces: Record<string, unknown>[] }>> {
  const res = await call(client, "plc_agenda_reservas_dia", {
    p_campo_id: campoId,
    p_fecha: fecha,
  });
  if (!res.ok) return res;
  const raw = res.reservas;
  const enlaces = res.enlaces;
  return {
    ok: true,
    reservas: Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [],
    enlaces: Array.isArray(enlaces) ? (enlaces as Record<string, unknown>[]) : [],
  };
}

export async function rpcVerReclamo(
  client: EquiposRpcClient,
  token: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_ver_reclamo", { p_token: token });
}

export async function rpcEmitirOtpReclamo(
  client: EquiposRpcClient,
  token: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_emitir_otp_reclamo", { p_token: token });
}

export async function rpcVerificarOtpReclamo(
  client: EquiposRpcClient,
  token: string,
  codigo: string
): Promise<RpcResult<{ reserva_id?: string }>> {
  const res = await call(client, "plc_verificar_otp_reclamo", {
    p_token: token,
    p_codigo: codigo,
  });
  if (!res.ok) return res;
  return { ok: true, reserva_id: res.reserva_id ? String(res.reserva_id) : undefined };
}

export async function rpcCrearEnlacePago(
  client: EquiposRpcClient,
  input: {
    disponibilidadId: string;
    nombre: string;
    telefono: string;
    montoSena: number;
    mensaje?: string | null;
  }
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_crear_enlace_pago", {
    p_disponibilidad_id: input.disponibilidadId,
    p_nombre: input.nombre,
    p_telefono: input.telefono,
    p_monto_sena: input.montoSena,
    p_mensaje: input.mensaje ?? null,
  });
}

export async function rpcCargarReservaManual(
  client: EquiposRpcClient,
  disponibilidadId: string,
  nombre: string,
  telefono: string,
  cobroExterno: "sena_fuera" | "a_cobrar_predio"
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_cargar_reserva_manual", {
    p_disponibilidad_id: disponibilidadId,
    p_nombre: nombre,
    p_telefono: telefono,
    p_cobro_externo: cobroExterno,
  });
}

export async function rpcVerEnlacePago(
  client: EquiposRpcClient,
  token: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_ver_enlace", { p_token: token });
}

export async function rpcCotizarEnlacePago(
  client: EquiposRpcClient,
  token: string,
  tipoCobro: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_cotizar_enlace", { p_token: token, p_tipo_cobro: tipoCobro });
}

export async function rpcIniciarCheckoutEnlace(
  client: EquiposRpcClient,
  token: string,
  tipoCobro: string,
  aceptaReglas: boolean
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_iniciar_checkout_enlace", {
    p_token: token,
    p_tipo_cobro: tipoCobro,
    p_acepta_reglas: aceptaReglas,
  });
}

export async function rpcPredioPublico(
  client: EquiposRpcClient,
  slug: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_predio_publico", { p_slug: slug });
}

export async function rpcSlugDeCancha(
  client: EquiposRpcClient,
  canchaId: string
): Promise<RpcResult<{ slug?: string }>> {
  const res = await call(client, "plc_slug_de_cancha", { p_cancha_id: canchaId });
  if (!res.ok) return res;
  return { ok: true, slug: res.slug ? String(res.slug) : undefined };
}

export async function rpcGuardarListaReserva(
  client: EquiposRpcClient,
  reservaId: string,
  nombres: string[]
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_guardar_lista_reserva", { p_reserva_id: reservaId, p_nombres: nombres });
}

export async function rpcListarListaReserva(
  client: EquiposRpcClient,
  reservaId: string
): Promise<RpcResult<{ nombres: string[] }>> {
  const res = await call(client, "plc_listar_lista_reserva", { p_reserva_id: reservaId });
  if (!res.ok) return res;
  const raw = res.nombres;
  const nombres = Array.isArray(raw) ? raw.map((x) => String(x)) : [];
  return { ok: true, nombres };
}

export async function rpcAbrirBuscaGente(
  client: EquiposRpcClient,
  reservaId: string,
  abrir: boolean
): Promise<RpcResult<{ busca_gente?: boolean }>> {
  const res = await call(client, "plc_abrir_busca_gente", { p_reserva_id: reservaId, p_abrir: abrir });
  if (!res.ok) return res;
  return { ok: true, busca_gente: Boolean(res.busca_gente) };
}

export async function rpcMiEstadoEdad(
  client: EquiposRpcClient
): Promise<
  RpcResult<{
    fecha_nacimiento?: string | null;
    tiene_dni?: boolean;
    mayor_13?: boolean;
    mayor_18?: boolean;
    puede_desafio_cancha?: boolean;
  }>
> {
  return call(client, "plc_mi_estado_edad", {});
}

export async function rpcGuardarFechaNacimiento(
  client: EquiposRpcClient,
  fechaNacimiento: string
): Promise<RpcResult<{ fecha_nacimiento?: string }>> {
  return call(client, "plc_guardar_fecha_nacimiento", { p_fecha_nacimiento: fechaNacimiento });
}

export async function rpcGuardarIdentidadDesafio(
  client: EquiposRpcClient,
  dni: string,
  fechaNacimiento: string
): Promise<RpcResult<{ puede_desafio_cancha?: boolean }>> {
  return call(client, "plc_guardar_identidad_desafio", {
    p_dni: dni,
    p_fecha_nacimiento: fechaNacimiento,
  });
}

/** Errores que piden cargar DNI/fecha y reintentar la acción de desafío por la cancha. */
export function esErrorIdentidadDesafio(code: string | null | undefined): boolean {
  return code === "falta_dni" || code === "falta_nacimiento" || code === "dni_invalido";
}

/** Errores que piden solo fecha de nacimiento (reserva / amistoso / registro). */
export function esErrorFaltaNacimiento(code: string | null | undefined): boolean {
  return code === "falta_nacimiento";
}

export async function rpcUpsertPredioPlaces(
  client: EquiposRpcClient,
  input: {
    placeId: string;
    nombre: string;
    direccion: string;
    lat: number;
    lng: number;
    barrio?: string | null;
    telefono?: string | null;
  }
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_upsert_predio_places", {
    p_place_id: input.placeId,
    p_nombre: input.nombre,
    p_direccion: input.direccion,
    p_lat: input.lat,
    p_lng: input.lng,
    p_barrio: input.barrio ?? null,
    p_telefono: input.telefono ?? null,
  });
}

export async function rpcRegistrarAporteCancha(
  client: EquiposRpcClient,
  input: {
    canchaId: string;
    superficie?: string | null;
    techada?: boolean | null;
    iluminacion?: boolean | null;
  }
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_registrar_aporte_cancha", {
    p_cancha_id: input.canchaId,
    p_superficie: input.superficie ?? null,
    p_techada: input.techada ?? null,
    p_iluminacion: input.iluminacion ?? null,
  });
}

export async function rpcCrearPartidoLibre(
  client: EquiposRpcClient,
  input: {
    canchaId: string;
    fecha: string;
    horaInicio: string;
    formato: string;
    precioCancha: number;
    modalidad: "amistoso" | "competitivo";
    equipoId?: string | null;
    convocados?: string[] | null;
    reglaEmpate?: "penales" | "mitad_cada_uno";
    superficie?: string | null;
    techada?: boolean | null;
    iluminacion?: boolean | null;
    duracionMin?: number;
  }
): Promise<RpcResult<{ desafio_id: string; inscripcion_id: string }>> {
  const res = await call(client, "crear_partido_libre", {
    p_cancha_id: input.canchaId,
    p_fecha: input.fecha,
    p_hora_inicio: input.horaInicio,
    p_formato: input.formato,
    p_precio_cancha: input.precioCancha,
    p_modalidad: input.modalidad,
    p_equipo_id: input.equipoId ?? null,
    p_convocados: input.convocados ?? null,
    p_regla_empate: input.reglaEmpate ?? "penales",
    p_superficie: input.superficie ?? null,
    p_techada: input.techada ?? null,
    p_iluminacion: input.iluminacion ?? null,
    p_duracion_min: input.duracionMin ?? 60,
  });
  if (!res.ok) return res;
  return {
    ok: true,
    desafio_id: String(res.desafio_id ?? ""),
    inscripcion_id: String(res.inscripcion_id ?? ""),
  };
}

export async function rpcBuscarPredios(
  client: EquiposRpcClient,
  q?: string | null,
  soloAdheridos = false
): Promise<RpcResult<{ predios: Record<string, unknown>[] }>> {
  const res = await call(client, "plc_buscar_predios", {
    p_q: q ?? null,
    p_solo_adheridos: soloAdheridos,
  });
  if (!res.ok) return res;
  const raw = res.predios;
  return {
    ok: true,
    predios: Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [],
  };
}

export async function rpcCrearEquipoRapido(
  client: EquiposRpcClient,
  nombre: string,
  formato = "f5"
): Promise<RpcResult<{ equipo_id: string }>> {
  const res = await call(client, "plc_crear_equipo_rapido", {
    p_nombre: nombre,
    p_formato: formato,
  });
  if (!res.ok) return res;
  return { ok: true, equipo_id: String(res.equipo_id ?? "") };
}

export async function rpcInvitarSinCuenta(
  client: EquiposRpcClient,
  equipoId: string,
  nombre: string,
  telefono?: string | null
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_invitar_sin_cuenta", {
    p_equipo_id: equipoId,
    p_nombre: nombre,
    p_telefono: telefono ?? null,
  });
}

export async function rpcReclamarInvitado(
  client: EquiposRpcClient,
  claimToken: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_reclamar_invitado", { p_claim_token: claimToken });
}

export async function rpcCotizarDeposito(
  client: EquiposRpcClient,
  precioCancha: number,
  formato: string,
  jugadoresLado?: number | null
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_cotizar_deposito", {
    p_precio_cancha: precioCancha,
    p_formato: formato,
    p_jugadores_lado: jugadoresLado ?? null,
  });
}

export async function rpcCrearPartidoDeposito(
  client: EquiposRpcClient,
  input: {
    precioCancha: number;
    formato: string;
    equipoId: string;
    convocados: string[];
    reglaEmpate: "penales" | "mitad_cada_uno";
    aceptaTarifaNoReembolsable: boolean;
    disponibilidadId?: string | null;
    canchaId?: string | null;
    fecha?: string | null;
    horaInicio?: string | null;
    jugadoresLado?: number | null;
    duracionMin?: number;
  }
): Promise<RpcResult<{ desafio_id: string; inscripcion_id: string; monto_total?: number }>> {
  const res = await call(client, "crear_partido_deposito", {
    p_precio_cancha: input.precioCancha,
    p_formato: input.formato,
    p_equipo_id: input.equipoId,
    p_convocados: input.convocados,
    p_regla_empate: input.reglaEmpate,
    p_acepta_tarifa_no_reembolsable: input.aceptaTarifaNoReembolsable,
    p_disponibilidad_id: input.disponibilidadId ?? null,
    p_cancha_id: input.canchaId ?? null,
    p_fecha: input.fecha ?? null,
    p_hora_inicio: input.horaInicio ?? null,
    p_jugadores_lado: input.jugadoresLado ?? null,
    p_duracion_min: input.duracionMin ?? 60,
  });
  if (!res.ok) return res;
  return {
    ok: true,
    desafio_id: String(res.desafio_id ?? ""),
    inscripcion_id: String(res.inscripcion_id ?? ""),
    monto_total: typeof res.monto_total === "number" ? res.monto_total : Number(res.monto_total ?? 0),
  };
}

export async function rpcCargarValidacionPredio(
  client: EquiposRpcClient,
  input: { desafioId: string; aliasCbu: string; telefonoPredio: string; monto: number }
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_cargar_validacion_predio", {
    p_desafio_id: input.desafioId,
    p_alias_cbu: input.aliasCbu,
    p_telefono_predio: input.telefonoPredio,
    p_monto: input.monto,
  });
}

export async function rpcVerValidacionPredio(
  client: EquiposRpcClient,
  token: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_ver_validacion_predio", { p_token: token });
}

export async function rpcResponderValidacionPredio(
  client: EquiposRpcClient,
  token: string,
  confirma: boolean
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_responder_validacion_predio", {
    p_token: token,
    p_confirma: confirma,
  });
}

export async function rpcPredioPorPlaceId(
  client: EquiposRpcClient,
  placeId: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_predio_por_place_id", { p_place_id: placeId });
}

export async function rpcAdminListarNoAdheridos(
  client: EquiposRpcClient
): Promise<RpcResult<{ predios: Record<string, unknown>[] }>> {
  const res = await call(client, "plc_admin_listar_no_adheridos", {});
  if (!res.ok) return res;
  return { ok: true, predios: Array.isArray(res.predios) ? (res.predios as Record<string, unknown>[]) : [] };
}

export async function rpcAdminListarValidacionesPendientes(
  client: EquiposRpcClient
): Promise<RpcResult<{ validaciones: Record<string, unknown>[] }>> {
  const res = await call(client, "plc_admin_listar_validaciones_pendientes", {});
  if (!res.ok) return res;
  return {
    ok: true,
    validaciones: Array.isArray(res.validaciones) ? (res.validaciones as Record<string, unknown>[]) : [],
  };
}

export async function rpcAdminListarAliasConflicto(
  client: EquiposRpcClient
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_admin_listar_alias_conflicto", {});
}

export async function rpcAdminListarTransferenciasPendientes(
  client: EquiposRpcClient
): Promise<RpcResult<{ transferencias: Record<string, unknown>[] }>> {
  const res = await call(client, "plc_admin_listar_transferencias_pendientes", {});
  if (!res.ok) return res;
  return {
    ok: true,
    transferencias: Array.isArray(res.transferencias)
      ? (res.transferencias as Record<string, unknown>[])
      : [],
  };
}

export async function rpcAdminListarDesafiosMarcados(
  client: EquiposRpcClient
): Promise<RpcResult<{ desafios: Record<string, unknown>[] }>> {
  const res = await call(client, "plc_admin_listar_desafios_marcados", {});
  if (!res.ok) return res;
  return {
    ok: true,
    desafios: Array.isArray(res.desafios) ? (res.desafios as Record<string, unknown>[]) : [],
  };
}

export async function rpcAdminEnlaceValidacion(
  client: EquiposRpcClient,
  validacionId: string
): Promise<RpcResult<Record<string, unknown>>> {
  return call(client, "plc_admin_enlace_validacion", { p_validacion_id: validacionId });
}
