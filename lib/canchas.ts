import { supabase } from "@/lib/supabase";

export type PredioEstado = "borrador" | "en_revision" | "aprobado" | "suspendido";

export interface HorarioDia {
  abierto: boolean;
  desde: string;
  hasta: string;
}

export type HorariosApertura = Record<string, HorarioDia>;

export interface Cancha {
  id: string;
  owner_id: string | null;
  nombre: string;
  direccion: string | null;
  barrio: string | null;
  descripcion: string | null;
  foto_url: string | null;
  fondo_url: string | null;
  logo_url: string | null;
  activa: boolean;
  estado: PredioEstado;
  estacionamiento: boolean | null;
  buffet: boolean | null;
  vestuarios: boolean | null;
  parrilla: boolean | null;
  whatsapp: string | null;
  responsable_nombre: string | null;
  responsable_email: string | null;
  responsable_telefono: string | null;
  responsable_doc: string | null;
  horarios_apertura: HorariosApertura | null;
  fotos: string[] | null;
  revision_nota: string | null;
  provincia_id: string | null;
  partido_id: string | null;
  localidad_id: string | null;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
  valor_hora: number | null;
  valor_reserva: number | null;
  ventana_dias: number | null;
  created_at: string;
}

export interface CrearCanchaInput {
  nombre: string;
  direccion?: string | null;
  barrio?: string | null;
  descripcion?: string | null;
  foto_url?: string | null;
  fondo_url?: string | null;
  logo_url?: string | null;
  estacionamiento?: boolean | null;
  buffet?: boolean | null;
  vestuarios?: boolean | null;
  parrilla?: boolean | null;
  whatsapp?: string | null;
  responsable_nombre?: string | null;
  responsable_email?: string | null;
  responsable_telefono?: string | null;
  responsable_doc?: string | null;
  horarios_apertura?: HorariosApertura | null;
  fotos?: string[] | null;
  provincia_id?: string | null;
  partido_id?: string | null;
  localidad_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
  valor_hora?: number | null;
  valor_reserva?: number | null;
  ventana_dias?: number | null;
}

export async function crearCancha(input: CrearCanchaInput): Promise<{ data: { id: string } | null; error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  const ownerId = user?.id;
  if (!ownerId) return { data: null, error: "Debés estar logueado." };

  const { data, error } = await supabase
    .from("canchas")
    .insert({
      owner_id: ownerId,
      nombre: input.nombre,
      direccion: input.direccion ?? null,
      barrio: input.barrio ?? null,
      descripcion: input.descripcion ?? null,
      foto_url: input.foto_url ?? null,
      fondo_url: input.fondo_url ?? null,
      logo_url: input.logo_url ?? null,
      estacionamiento: input.estacionamiento ?? false,
      buffet: input.buffet ?? false,
      vestuarios: input.vestuarios ?? false,
      parrilla: input.parrilla ?? false,
      whatsapp: input.whatsapp ?? null,
      responsable_nombre: input.responsable_nombre ?? null,
      responsable_email: input.responsable_email ?? null,
      responsable_telefono: input.responsable_telefono ?? null,
      responsable_doc: input.responsable_doc ?? null,
      horarios_apertura: input.horarios_apertura ?? null,
      fotos: input.fotos ?? [],
      estado: "borrador",
      provincia_id: input.provincia_id ?? null,
      partido_id: input.partido_id ?? null,
      localidad_id: input.localidad_id ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      place_id: input.place_id ?? null,
      valor_hora: input.valor_hora ?? 0,
      valor_reserva: input.valor_reserva ?? 0,
      ventana_dias: input.ventana_dias ?? 60,
    })
    .select("id")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as { id: string }, error: null };
}

export async function getCanchasDelOwner(ownerId: string): Promise<Cancha[]> {
  const { data, error } = await supabase
    .from("canchas")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  const owned = error ? [] : ((data ?? []) as Cancha[]);

  const { data: staff } = await supabase
    .from("predio_encargados")
    .select("cancha_id")
    .eq("usuario_id", ownerId)
    .eq("estado", "activo");
  const ids = (staff ?? []).map((r) => r.cancha_id as string).filter((id) => !owned.some((c) => c.id === id));
  if (!ids.length) return owned;

  const { data: extra } = await supabase.from("canchas").select("*").in("id", ids);
  return [...owned, ...((extra ?? []) as Cancha[])];
}

export interface ActualizarCanchaInput {
  nombre?: string;
  direccion?: string | null;
  barrio?: string | null;
  descripcion?: string | null;
  logo_url?: string | null;
  fondo_url?: string | null;
  foto_url?: string | null;
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
  valor_hora?: number | null;
  valor_reserva?: number | null;
  estacionamiento?: boolean | null;
  buffet?: boolean | null;
  vestuarios?: boolean | null;
  parrilla?: boolean | null;
  whatsapp?: string | null;
  responsable_nombre?: string | null;
  responsable_email?: string | null;
  responsable_telefono?: string | null;
  responsable_doc?: string | null;
  horarios_apertura?: HorariosApertura | null;
  fotos?: string[] | null;
  ventana_dias?: number | null;
}

export async function getCanchaDelOwnerById(canchaId: string): Promise<Cancha | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ownerId = user?.id;
  if (!ownerId) return null;

  const { data, error } = await supabase
    .from("canchas")
    .select("*")
    .eq("id", canchaId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) return null;
  return (data as Cancha) ?? null;
}

export async function actualizarCanchaDelOwner(
  canchaId: string,
  input: ActualizarCanchaInput
): Promise<{ ok: boolean; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ownerId = user?.id;
  if (!ownerId) return { ok: false, error: "Debés estar logueado." };

  const payload: Record<string, unknown> = {};
  if (input.nombre !== undefined) payload.nombre = input.nombre;
  if (input.direccion !== undefined) payload.direccion = input.direccion;
  if (input.barrio !== undefined) payload.barrio = input.barrio;
  if (input.descripcion !== undefined) payload.descripcion = input.descripcion;
  if (input.logo_url !== undefined) payload.logo_url = input.logo_url;
  if (input.fondo_url !== undefined) payload.fondo_url = input.fondo_url;
  if (input.lat !== undefined) payload.lat = input.lat;
  if (input.lng !== undefined) payload.lng = input.lng;
  if (input.place_id !== undefined) payload.place_id = input.place_id;
  if (input.valor_hora !== undefined) payload.valor_hora = input.valor_hora;
  if (input.valor_reserva !== undefined) payload.valor_reserva = input.valor_reserva;
  if (input.estacionamiento !== undefined) payload.estacionamiento = input.estacionamiento;
  if (input.buffet !== undefined) payload.buffet = input.buffet;
  if (input.vestuarios !== undefined) payload.vestuarios = input.vestuarios;
  if (input.parrilla !== undefined) payload.parrilla = input.parrilla;
  if (input.whatsapp !== undefined) payload.whatsapp = input.whatsapp;
  if (input.responsable_nombre !== undefined) payload.responsable_nombre = input.responsable_nombre;
  if (input.responsable_email !== undefined) payload.responsable_email = input.responsable_email;
  if (input.responsable_telefono !== undefined) payload.responsable_telefono = input.responsable_telefono;
  if (input.responsable_doc !== undefined) payload.responsable_doc = input.responsable_doc;
  if (input.horarios_apertura !== undefined) payload.horarios_apertura = input.horarios_apertura;
  if (input.fotos !== undefined) payload.fotos = input.fotos;
  if (input.foto_url !== undefined) payload.foto_url = input.foto_url;
  if (input.ventana_dias !== undefined) payload.ventana_dias = input.ventana_dias;

  const { error } = await supabase
    .from("canchas")
    .update(payload)
    .eq("id", canchaId)
    .eq("owner_id", ownerId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export interface CanchaDisponibilidadCard {
  canchaId: string;
  canchaNombre: string;
  direccion: string;
  provinciaId: string | null;
  partidoId: string | null;
  localidadId: string | null;
  logoUrl: string | null;
  estacionamiento: boolean;
  buffet: boolean;
  vestuarios: boolean;

  campoId: string;
  campoNombre: string;
  tipo: string | null;
  superficie: string | null;
  fotoUrl: string | null;
  valorHora: number | null;
  valorReserva: number | null;

  precioDesde: number;
  disponible: boolean;
  disponibilidadIds: string[];
  horas: { hora_inicio: string; hora_fin: string }[];
}

export interface BuscarCanchasInput {
  provinciaId?: string | null;
  partidoId?: string | null;
  localidadId?: string | null;
  zonaTexto?: string | null;
  tipo?: string | null; // campos.tipo ('5','7','9','11')
  fechaISO: string; // YYYY-MM-DD
  horaInicio?: string | null; // HH:MM
}

export async function buscarCanchasConDisponibilidad(
  input: BuscarCanchasInput
): Promise<CanchaDisponibilidadCard[]> {
  const { provinciaId, partidoId, localidadId, zonaTexto, tipo, fechaISO, horaInicio } = input;

  const normalizeHHMM = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v);
    // Ejemplos típicos: "18:00:00" o "18:00"
    const maybe = s.length >= 5 ? s.slice(0, 5) : s;
    if (!maybe.includes(":")) return null;
    const [hh, mm] = maybe.split(":");
    const hn = Number(hh);
    const mn = Number(mm);
    if (!Number.isFinite(hn) || !Number.isFinite(mn)) return null;
    return `${String(hn).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
  };

  const hhmmToMinutes = (hhmm: string): number => {
    const [hh, mm] = hhmm.split(":");
    return Number(hh) * 60 + Number(mm);
  };

  const horaInicioNorm = normalizeHHMM(horaInicio);

  // 1) Canchas activas por ubicación
  let canchasQuery = supabase
    .from("canchas")
    .select("id, nombre, direccion, barrio, logo_url, estacionamiento, buffet, vestuarios, activa, provincia_id, partido_id, localidad_id")
    .eq("activa", true)
    .eq("estado", "aprobado");

  // Resolución por ubicación:
  // - Si vienen ids (localidad/partido/provincia), filtramos exacto por esos ids.
  // - Si viene `zonaTexto`, intentamos resolverlo a ids de `localidades`/`partidos`
  //   usando el último segmento (ej. "Monte Grande" o "Buenos Aires · ... · San Román").
  const zonaTrim = (zonaTexto ?? "").trim();

  const normalizeForCompare = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  if (localidadId) {
    canchasQuery = canchasQuery.eq("localidad_id", localidadId);
  } else if (partidoId) {
    canchasQuery = canchasQuery.eq("partido_id", partidoId);
  } else if (provinciaId) {
    canchasQuery = canchasQuery.eq("provincia_id", provinciaId);
  } else if (zonaTrim) {
    const cleaned = zonaTrim.replace(/direcci[oó]n/i, "").trim();
    const parts = cleaned.split(/[·,|-]/g).map((s) => s.trim()).filter(Boolean);
    const localidadCandidate = parts.length ? parts[parts.length - 1] : cleaned;
    const localidadNorm = normalizeForCompare(localidadCandidate);

    let resolvedLocalidadIds: string[] = [];
    let resolvedPartidoIds: string[] = [];

    // 1) Localidades: intentar match por nombre.
    const { data: locCandidates } = await supabase
      .from("localidades")
      .select("id, nombre, partido_id")
      .ilike("nombre", `%${localidadCandidate}%`)
      .limit(25);

    const locMatches = (locCandidates ?? []).filter((l: any) => normalizeForCompare(l.nombre ?? "") === localidadNorm);
    if (locMatches.length) {
      resolvedLocalidadIds = locMatches.map((l: any) => l.id as string).filter(Boolean);
    } else {
      // 2) Si no matchea exacto, intentamos por tokens (reduce falsos positivos).
      const tokens = localidadNorm.split(" ").filter(Boolean);
      const lastToken = tokens[tokens.length - 1] ?? "";
      if (lastToken) {
        const { data: locCandidates2 } = await supabase
          .from("localidades")
          .select("id, nombre, partido_id")
          .ilike("nombre", `%${lastToken}%`)
          .limit(25);

        const locMatches2 = (locCandidates2 ?? [])
          .map((l: any) => ({ row: l, norm: normalizeForCompare(l.nombre ?? "") }))
          .filter((x: any) => {
            if (x.norm === localidadNorm) return true;
            // Require all tokens to be present (AND) to avoid broad matches like "... Grande".
            return tokens.every((t) => x.norm.includes(t));
          })
          .slice(0, 8);

        if (locMatches2.length) {
          resolvedLocalidadIds = locMatches2.map((x: any) => x.row.id as string).filter(Boolean);
        }
      }
    }

    // 3) Si no resolvimos localidad, intentamos partido por el segmento anterior.
    if (!resolvedLocalidadIds.length) {
      const partidoCandidateDirect = localidadCandidate; // ej: "Coronel Dorrego" escrito directo
      const partidoCandidateSegment = parts.length >= 2 ? parts[parts.length - 2] : ""; // ej: "Provincia · Partido · Localidad"
      const partidoCandidate = (partidoCandidateSegment || partidoCandidateDirect).trim();
      const partidoNorm = normalizeForCompare(partidoCandidate);

      if (partidoCandidate && partidoNorm) {
        const { data: partCandidates } = await supabase
          .from("partidos")
          .select("id, nombre")
          .ilike("nombre", `%${partidoCandidate}%`)
          .limit(25);

        let partMatches = (partCandidates ?? []).filter(
          (p: any) => normalizeForCompare(p.nombre ?? "") === partidoNorm
        );

        // Fallback tolerante: si no hay match exacto del texto completo,
        // intentamos por token final (ej. "Dorrego") para soportar entrada no seleccionada.
        if (!partMatches.length) {
          const tokens = partidoNorm.split(" ").filter(Boolean);
          const lastToken = tokens[tokens.length - 1] ?? "";
          if (lastToken) {
            const { data: partCandidates2 } = await supabase
              .from("partidos")
              .select("id, nombre")
              .ilike("nombre", `%${lastToken}%`)
              .limit(25);

            partMatches = (partCandidates2 ?? []).filter((p: any) => {
              const norm = normalizeForCompare(p.nombre ?? "");
              return tokens.every((t) => norm.includes(t)) || norm.includes(lastToken);
            });
          }
        }

        if (partMatches.length) {
          resolvedPartidoIds = partMatches.map((p: any) => p.id as string).filter(Boolean);
        }
      }
    }

    if (resolvedLocalidadIds.length) {
      canchasQuery = canchasQuery.in("localidad_id", resolvedLocalidadIds);
    } else if (resolvedPartidoIds.length) {
      canchasQuery = canchasQuery.in("partido_id", resolvedPartidoIds);
    } else {
      // Si no se resolvió a ids, no mostramos resultados (evita "todas las canchas").
      return [];
    }
  } else {
    canchasQuery = canchasQuery.limit(200);
  }

  const { data: canchas, error: canchasErr } = await canchasQuery;
  if (canchasErr) return [];
  const canchaRows = canchas ?? [];
  const canchaIds = canchaRows.map((c: any) => c.id as string);
  if (canchaIds.length === 0) return [];

  // 2) Campos dentro de esas canchas (y por tipo si aplica)
  let camposQuery = supabase
    .from("campos")
    .select("id, cancha_id, nombre, tipo, superficie, foto_url, valor_hora, valor_reserva")
    .in("cancha_id", canchaIds);

  if (tipo) camposQuery = camposQuery.eq("tipo", tipo);

  const { data: campos, error: camposErr } = await camposQuery;
  if (camposErr) return [];
  const campoRows = campos ?? [];
  const campoIds = campoRows.map((c: any) => c.id as string);
  if (campoIds.length === 0) return [];

  // 3) Disponibilidades del día
  const { data: disp, error: dispErr } = await supabase
    .from("disponibilidades")
    .select("id, campo_id, fecha, hora_inicio, hora_fin, precio, estado")
    .eq("fecha", fechaISO)
    .eq("estado", "disponible")
    .in("campo_id", campoIds);

  if (dispErr) return [];
  const dispRows = disp ?? [];

  const filteredDispRows =
    horaInicioNorm
      ? dispRows.filter((d: any) => {
          const dHora = normalizeHHMM(d.hora_inicio);
          if (!dHora) return false;
          // Interpretamos `horaInicio` como hora exacta de arranque del turno.
          // Esto hace que el buscador sea consistente con el comportamiento tipo Booking.
          return dHora === horaInicioNorm;
        })
      : dispRows;

  // Agrupar por campo
  const dispByCampo = new Map<string, any[]>();
  for (const d of filteredDispRows) {
    const cid = d.campo_id as string;
    if (!dispByCampo.has(cid)) dispByCampo.set(cid, []);
    dispByCampo.get(cid)!.push(d as any);
  }

  const canchasById = new Map<string, any>(canchaRows.map((c: any) => [c.id, c]));

  // 4) Construir cards: solo campos con disponibilidad
  const cards: CanchaDisponibilidadCard[] = [];
  for (const campo of campoRows as any[]) {
    const campoId = campo.id as string;
    const campoDisp = dispByCampo.get(campoId) ?? [];

    const precios = campoDisp
      .map((d: any) => (d.precio === null || d.precio === undefined ? Infinity : Number(d.precio)))
      .filter((p: number) => Number.isFinite(p));
    const precioDesde = precios.length > 0 ? Math.min(...precios) : 0;
    const disponibilidadIds = campoDisp.map((d: any) => d.id as string);
    const horas = campoDisp
      .slice()
      .sort((a: any, b: any) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)))
      .slice(0, 6)
      .map((d: any) => ({ hora_inicio: d.hora_inicio as string, hora_fin: d.hora_fin as string }));
    const disponible = campoDisp.length > 0;

    const cancha = canchasById.get(campo.cancha_id as string);
    if (!cancha) continue;

    cards.push({
      canchaId: cancha.id,
      canchaNombre: cancha.nombre,
      direccion: cancha.direccion ?? cancha.barrio ?? "",
      provinciaId: cancha.provincia_id ?? null,
      partidoId: cancha.partido_id ?? null,
      localidadId: cancha.localidad_id ?? null,
      logoUrl: cancha.logo_url ?? null,
      estacionamiento: !!cancha.estacionamiento,
      buffet: !!cancha.buffet,
      vestuarios: !!cancha.vestuarios,

      campoId,
      campoNombre: campo.nombre,
      tipo: campo.tipo ?? null,
      superficie: campo.superficie ?? null,
      fotoUrl: campo.foto_url ?? null,
      valorHora: campo.valor_hora === null || campo.valor_hora === undefined ? null : Number(campo.valor_hora),
      valorReserva:
        campo.valor_reserva === null || campo.valor_reserva === undefined ? null : Number(campo.valor_reserva),

      precioDesde,
      disponible,
      disponibilidadIds,
      horas,
    });
  }

  return cards
    .sort((a, b) => a.precioDesde - b.precioDesde)
    .slice(0, 12);
}

