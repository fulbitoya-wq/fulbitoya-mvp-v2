import { supabase } from "@/lib/supabase";

export interface Campo {
  id: string;
  cancha_id: string;
  nombre: string;
  tipo: string | null;
  superficie: string | null;
  valor_hora: number | null;
  valor_reserva: number | null;
  luz: boolean | null;
  camaras: boolean | null;
  minutero: boolean | null;
  marcador_gol: boolean | null;
  techada: boolean | null;
  duracion_min: number | null;
  sena_tipo: "fija" | "porcentaje" | null;
  sena_valor: number | null;
  fotos: string[] | null;
  observaciones: string | null;
  foto_url: string | null;
  created_at: string;
}

export async function getCamposByCancha(canchaId: string): Promise<Campo[]> {
  const { data, error } = await supabase
    .from("campos")
    .select("*")
    .eq("cancha_id", canchaId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as Campo[];
}

export async function contarCamposPorCancha(canchaIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!canchaIds.length) return out;
  const { data, error } = await supabase.from("campos").select("id, cancha_id").in("cancha_id", canchaIds);
  if (error) return out;
  for (const row of data ?? []) {
    const id = row.cancha_id as string;
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

export interface CrearCampoInput {
  cancha_id: string;
  nombre: string;
  tipo: string; // '5' | '7' | '9' | '11'
  superficie: string;
  valor_hora: number;
  valor_reserva: number;
  luz?: boolean | null;
  camaras?: boolean | null;
  minutero?: boolean | null;
  marcador_gol?: boolean | null;
  observaciones?: string | null;
  foto_url?: string | null;
  techada?: boolean | null;
  duracion_min?: number | null;
  sena_tipo?: "fija" | "porcentaje" | null;
  sena_valor?: number | null;
  fotos?: string[] | null;
}

export async function crearCampo(input: CrearCampoInput): Promise<{ data: { id: string } | null; error: string | null }> {
  const { data, error } = await supabase
    .from("campos")
    .insert({
      cancha_id: input.cancha_id,
      nombre: input.nombre,
      tipo: input.tipo,
      superficie: input.superficie,
      valor_hora: input.valor_hora,
      valor_reserva: input.valor_reserva,
      luz: input.luz ?? null,
      camaras: input.camaras ?? null,
      minutero: input.minutero ?? null,
      marcador_gol: input.marcador_gol ?? null,
      observaciones: input.observaciones ?? null,
      foto_url: input.foto_url ?? null,
      techada: input.techada ?? false,
      duracion_min: input.duracion_min ?? 60,
      sena_tipo: input.sena_tipo ?? "fija",
      sena_valor: input.sena_valor ?? 0,
      fotos: input.fotos ?? [],
    })
    .select("id")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as { id: string }, error: null };
}

export async function actualizarCampo(
  campoId: string,
  input: Partial<CrearCampoInput>
): Promise<{ ok: boolean; error: string | null }> {
  const payload: Record<string, unknown> = {};
  if (input.nombre !== undefined) payload.nombre = input.nombre;
  if (input.tipo !== undefined) payload.tipo = input.tipo;
  if (input.superficie !== undefined) payload.superficie = input.superficie;
  if (input.valor_hora !== undefined) payload.valor_hora = input.valor_hora;
  if (input.valor_reserva !== undefined) payload.valor_reserva = input.valor_reserva;
  if (input.luz !== undefined) payload.luz = input.luz;
  if (input.camaras !== undefined) payload.camaras = input.camaras;
  if (input.minutero !== undefined) payload.minutero = input.minutero;
  if (input.marcador_gol !== undefined) payload.marcador_gol = input.marcador_gol;
  if (input.observaciones !== undefined) payload.observaciones = input.observaciones;
  if (input.foto_url !== undefined) payload.foto_url = input.foto_url;
  if (input.techada !== undefined) payload.techada = input.techada;
  if (input.duracion_min !== undefined) payload.duracion_min = input.duracion_min;
  if (input.sena_tipo !== undefined) payload.sena_tipo = input.sena_tipo;
  if (input.sena_valor !== undefined) payload.sena_valor = input.sena_valor;
  if (input.fotos !== undefined) payload.fotos = input.fotos;

  const { error } = await supabase.from("campos").update(payload).eq("id", campoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

