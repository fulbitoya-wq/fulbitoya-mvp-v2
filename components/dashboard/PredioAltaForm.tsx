"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlacesAutocompleteInput } from "@/components/maps/PlacesAutocompleteInput";
import { AddressPreviewMap } from "@/components/maps/AddressPreviewMap";
import { HorariosAperturaEditor } from "@/components/dashboard/HorariosAperturaEditor";
import {
  actualizarCanchaDelOwner,
  crearCancha,
  type Cancha,
  type HorariosApertura,
} from "@/lib/canchas";
import { parseHorariosApertura } from "@/lib/horarios-apertura";
import { fyEnviarRevision, etiquetaEstadoPredio, claseEstadoPredio } from "@/lib/predios";
import { regenerarTurnosPredio } from "@/lib/turnos";
import { supabase } from "@/lib/supabase";

const BUCKET_LOGOS = "predio-logos";
const BUCKET_FONDOS = "predio-fondos";
const BUCKET_GALERIA = "predio-galeria";
const MAX_MB = 4;

function fotosDe(cancha?: Cancha | null): string[] {
  const raw = cancha?.fotos;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string");
  }
  return [];
}

async function subir(bucket: string, userId: string, file: File): Promise<string> {
  const path = `${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;
}

export function PredioAltaForm({ cancha }: { cancha?: Cancha | null }) {
  const router = useRouter();
  const editando = Boolean(cancha?.id);
  const [paso, setPaso] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [responsableNombre, setResponsableNombre] = useState(cancha?.responsable_nombre ?? "");
  const [responsableEmail, setResponsableEmail] = useState(cancha?.responsable_email ?? "");
  const [responsableTelefono, setResponsableTelefono] = useState(cancha?.responsable_telefono ?? "");
  const [responsableDoc, setResponsableDoc] = useState(cancha?.responsable_doc ?? "");

  const [nombre, setNombre] = useState(cancha?.nombre ?? "");
  const [direccion, setDireccion] = useState(cancha?.direccion ?? "");
  const [barrio, setBarrio] = useState(cancha?.barrio ?? "");
  const [whatsapp, setWhatsapp] = useState(cancha?.whatsapp ?? "");
  const [lat, setLat] = useState<number | null>(cancha?.lat ?? null);
  const [lng, setLng] = useState<number | null>(cancha?.lng ?? null);
  const [placeId, setPlaceId] = useState<string | null>(cancha?.place_id ?? null);

  useEffect(() => {
    if (cancha?.place_id || placeId) return;
    const q = new URLSearchParams(window.location.search).get("place_id");
    if (q) setPlaceId(q);
  }, [cancha?.place_id, placeId]);
  const [estacionamiento, setEstacionamiento] = useState(Boolean(cancha?.estacionamiento));
  const [buffet, setBuffet] = useState(Boolean(cancha?.buffet));
  const [vestuarios, setVestuarios] = useState(Boolean(cancha?.vestuarios));
  const [parrilla, setParrilla] = useState(Boolean(cancha?.parrilla));
  const [ventanaDias, setVentanaDias] = useState(String(cancha?.ventana_dias || 60));
  const [horarios, setHorarios] = useState<HorariosApertura>(
    parseHorariosApertura(cancha?.horarios_apertura),
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(cancha?.logo_url ?? null);
  const [fondoUrl, setFondoUrl] = useState<string | null>(cancha?.fondo_url ?? null);
  const [fotos, setFotos] = useState<string[]>(fotosDe(cancha));
  const logoRef = useRef<HTMLInputElement>(null);
  const fondoRef = useRef<HTMLInputElement>(null);
  const fotosRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cancha) return;
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      if (!responsableEmail) setResponsableEmail(user.email ?? "");
      const { data } = await supabase
        .from("usuarios")
        .select("nombre, telefono, email")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.nombre && !responsableNombre) setResponsableNombre(data.nombre);
      if (data?.telefono && !responsableTelefono) setResponsableTelefono(data.telefono);
      if (data?.email && !responsableEmail) setResponsableEmail(data.email);
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar alta nueva
  }, [cancha]);

  const validarPaso1 = () => {
    if (!responsableNombre.trim()) return "Completá el nombre del responsable.";
    if (!responsableEmail.trim()) return "Completá el email.";
    if (!responsableTelefono.trim()) return "Completá el teléfono.";
    if (!responsableDoc.trim()) return "Completá DNI o CUIT.";
    return null;
  };

  const payload = () => ({
    nombre: nombre.trim() || "Predio sin nombre",
    direccion: direccion.trim() || null,
    barrio: barrio.trim() || null,
    whatsapp: whatsapp.trim() || null,
    lat,
    lng,
    place_id: placeId,
    estacionamiento,
    buffet,
    vestuarios,
    parrilla,
    logo_url: logoUrl,
    fondo_url: fondoUrl,
    fotos,
    foto_url: fotos[0] ?? fondoUrl,
    responsable_nombre: responsableNombre.trim(),
    responsable_email: responsableEmail.trim(),
    responsable_telefono: responsableTelefono.trim(),
    responsable_doc: responsableDoc.trim(),
    horarios_apertura: horarios,
    ventana_dias: Math.min(120, Math.max(7, Number(ventanaDias) || 60)),
  });

  const persistir = async (): Promise<string | null> => {
    let id: string | null = null;
    if (editando && cancha) {
      const res = await actualizarCanchaDelOwner(cancha.id, payload());
      if (!res.ok) throw new Error(res.error ?? "No se pudo guardar.");
      id = cancha.id;
    } else {
      const { data, error: err } = await crearCancha(payload());
      if (err || !data?.id) throw new Error(err ?? "No se pudo crear el predio.");
      id = data.id;
    }
    // Si venía de Places (no adherido), unificar historial por place_id.
    if (id && placeId) {
      await supabase.rpc("plc_unificar_predio_places", { p_cancha_adherida_id: id });
    }
    return id;
  };

  const onFile = async (file: File | undefined, kind: "logo" | "fondo" | "foto") => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`La imagen no puede superar ${MAX_MB} MB.`);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Debés estar logueado.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const bucket = kind === "logo" ? BUCKET_LOGOS : kind === "fondo" ? BUCKET_FONDOS : BUCKET_GALERIA;
      const url = await subir(bucket, user.id, file);
      if (kind === "logo") setLogoUrl(url);
      else if (kind === "fondo") setFondoUrl(url);
      else setFotos((prev) => [...prev, url].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setLoading(false);
    }
  };

  const guardar = async (enviar: boolean) => {
    setError(null);
    setOkMsg(null);
    const v1 = validarPaso1();
    if (v1) {
      setPaso(1);
      setError(v1);
      return;
    }
    if (enviar && (!direccion.trim() || lat == null || lng == null)) {
      setPaso(2);
      setError("Para mandarlo a revisión hace falta la dirección con el pin en el mapa.");
      return;
    }
    setLoading(true);
    try {
      const id = await persistir();
      if (!id) throw new Error("No se pudo guardar.");
      await regenerarTurnosPredio(id);
      if (enviar) {
        const rev = await fyEnviarRevision(id);
        if (!rev.ok) {
          setError(rev.error);
          if (!editando) router.replace(`/dashboard/canchas/${id}/editar`);
          return;
        }
        setOkMsg("Lo mandamos a revisión. Mientras tanto podés seguir configurando.");
      } else {
        setOkMsg("Borrador guardado.");
      }
      if (!editando) router.replace(`/dashboard/canchas/${id}/editar`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "mt-1 w-full rounded-lg border border-[#E0E0E0] px-4 py-2.5 text-base focus:border-[var(--fulbito-green)] focus:outline-none focus:ring-1 focus:ring-[var(--fulbito-green)]";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/dashboard/canchas" className="text-sm font-medium text-[#1A2E4A]/70 hover:underline">
        ← Mis predios
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-3xl uppercase tracking-wide text-[#1A2E4A]">
          {editando ? "Editar predio" : "Cargar predio"}
        </h1>
        {cancha?.estado ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${claseEstadoPredio(cancha.estado)}`}>
            {etiquetaEstadoPredio(cancha.estado)}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-[#1A2E4A]/70">
        Primero tus datos, después el predio. Podés guardar borrador y mandarlo a revisión cuando esté completo. En
        revisión también se puede seguir editando.
      </p>
      {cancha?.estado === "aprobado" ? (
        <p className="mt-2 text-sm text-[#2E7D32]">Este predio ya se ve en PorLaCancha.</p>
      ) : cancha?.estado === "suspendido" ? (
        <p className="mt-2 text-sm text-[#C62828]">Está suspendido: no aparece en PorLaCancha.</p>
      ) : (
        <p className="mt-2 text-sm text-[#1A2E4A]/70">Hasta que lo aprueben, no aparece en PorLaCancha.</p>
      )}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => setPaso(1)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
            paso === 1 ? "bg-[#1A2E4A] text-white" : "border border-[#E0E0E0] bg-white text-[#1A2E4A]"
          }`}
        >
          1. Responsable
        </button>
        <button
          type="button"
          onClick={() => setPaso(2)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
            paso === 2 ? "bg-[#1A2E4A] text-white" : "border border-[#E0E0E0] bg-white text-[#1A2E4A]"
          }`}
        >
          2. Predio
        </button>
      </div>

      {error ? <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {okMsg ? <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{okMsg}</div> : null}

      {paso === 1 ? (
        <div className="mt-6 space-y-4 rounded-xl border border-[#E0E0E0] bg-white p-4 shadow-sm sm:p-6">
          <div>
            <label className="block text-sm font-medium text-[#1A2E4A]">Nombre y apellido *</label>
            <input className={inputCls} value={responsableNombre} onChange={(e) => setResponsableNombre(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A2E4A]">Email *</label>
            <input
              type="email"
              className={inputCls}
              value={responsableEmail}
              onChange={(e) => setResponsableEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A2E4A]">Teléfono *</label>
            <input className={inputCls} value={responsableTelefono} onChange={(e) => setResponsableTelefono(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A2E4A]">DNI o CUIT *</label>
            <input
              className={inputCls}
              value={responsableDoc}
              onChange={(e) => setResponsableDoc(e.target.value)}
              placeholder="Ej. 30111222 o 20-30111222-3"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const v = validarPaso1();
              if (v) setError(v);
              else {
                setError(null);
                setPaso(2);
              }
            }}
            className="w-full rounded-lg bg-[var(--fulbito-green)] py-3 font-medium text-white sm:w-auto sm:px-6"
          >
            Seguir al predio
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-4 rounded-xl border border-[#E0E0E0] bg-white p-4 shadow-sm sm:p-6">
          <div>
            <label className="block text-sm font-medium text-[#1A2E4A]">Nombre comercial *</label>
            <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Predio Los Pinos" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A2E4A]">Dirección (Google) *</label>
            <PlacesAutocompleteInput
              value={direccion}
              onChange={setDireccion}
              placeholder="Buscá la dirección del predio"
              onPlaceSelected={(place) => {
                setDireccion(place.formattedAddress);
                setLat(place.lat);
                setLng(place.lng);
                setPlaceId(place.placeId);
                if (place.barrio) setBarrio(place.barrio);
              }}
            />
            {lat !== null && lng !== null ? (
              <AddressPreviewMap
                lat={lat}
                lng={lng}
                draggable
                onPinChange={(nlat, nlng) => {
                  setLat(nlat);
                  setLng(nlng);
                }}
              />
            ) : null}
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A2E4A]">Barrio / zona</label>
            <input className={inputCls} value={barrio} onChange={(e) => setBarrio(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A2E4A]">WhatsApp del predio</label>
            <input
              className={inputCls}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="Ej. 11 5555 5555"
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-[#1A2E4A]">Horarios de apertura</p>
            <HorariosAperturaEditor value={horarios} onChange={setHorarios} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A2E4A]">Turnos a generar hacia adelante (días)</label>
            <input
              type="number"
              min={7}
              max={120}
              className={inputCls}
              value={ventanaDias}
              onChange={(e) => setVentanaDias(e.target.value)}
            />
            <p className="mt-1 text-xs text-[#1A2E4A]/60">Por defecto 60. Si cambiás horarios, se regeneran los turnos libres.</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-[#1A2E4A]">Servicios</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["Vestuario", vestuarios, setVestuarios],
                  ["Bar", buffet, setBuffet],
                  ["Estacionamiento", estacionamiento, setEstacionamiento],
                  ["Parrilla", parrilla, setParrilla],
                ] as const
              ).map(([label, val, set]) => (
                <label
                  key={label}
                  className="flex items-center gap-2 rounded-lg border border-[#E0E0E0] px-3 py-3 text-sm font-medium text-[#1A2E4A]"
                >
                  <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A2E4A]">Logo</label>
            <input
              ref={logoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void onFile(e.target.files?.[0], "logo")}
              className="mt-1 block w-full text-sm"
            />
            {logoUrl ? <img src={logoUrl} alt="Logo" className="mt-2 h-16 w-16 rounded-lg object-contain" /> : null}
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A2E4A]">Foto de portada</label>
            <input
              ref={fondoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void onFile(e.target.files?.[0], "fondo")}
              className="mt-1 block w-full text-sm"
            />
            {fondoUrl ? (
              <img src={fondoUrl} alt="Portada" className="mt-2 h-28 w-full rounded-lg object-cover" />
            ) : null}
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1A2E4A]">Más fotos (hasta 8)</label>
            <input
              ref={fotosRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void onFile(e.target.files?.[0], "foto")}
              className="mt-1 block w-full text-sm"
            />
            {fotos.length ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {fotos.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFotos((prev) => prev.filter((x) => x !== f))}
                    className="relative overflow-hidden rounded-lg"
                  >
                    <img src={f} alt="" className="h-20 w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-black/50 text-center text-[10px] text-white">
                      Sacar
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="sticky bottom-0 mt-6 flex flex-col gap-2 bg-[#F5F5F5] py-3 sm:flex-row">
        <button
          type="button"
          disabled={loading}
          onClick={() => void guardar(false)}
          className="flex-1 rounded-lg border border-[#1A2E4A]/20 bg-white py-3 font-medium text-[#1A2E4A] disabled:opacity-70"
        >
          {loading ? "Guardando..." : "Guardar borrador"}
        </button>
        <button
          type="button"
          disabled={loading || cancha?.estado === "aprobado"}
          onClick={() => void guardar(true)}
          className="flex-1 rounded-lg bg-[var(--fulbito-green)] py-3 font-medium text-white disabled:opacity-70"
        >
          {cancha?.estado === "en_revision" ? "Actualizar revisión" : "Enviar a revisión"}
        </button>
      </div>
    </div>
  );
}
