import type { Metadata } from "next";
import Link from "next/link";
import { OpenInApp } from "@/components/OpenInApp";
import { SiteShell } from "@/components/SiteShell";
import { siteUrl } from "@/lib/site";
import { getSupabase } from "@/lib/supabase";
import { rpcPredioPorPlaceId } from "@shared/equipos";

type Props = { params: Promise<{ placeId: string }> };

const KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY?.trim() ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
  "";

async function googleDetails(placeId: string) {
  if (!KEY) return null;
  const id = placeId.startsWith("places/") ? placeId : `places/${placeId}`;
  const res = await fetch(`https://places.googleapis.com/v1/${id}`, {
    headers: {
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask":
        "displayName,formattedAddress,location,googleMapsUri,photos,rating,userRatingCount,regularOpeningHours,nationalPhoneNumber,websiteUri,parkingOptions",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

async function load(placeId: string) {
  const supabase = getSupabase();
  if (!supabase) return { db: null, google: null };
  const [db, google] = await Promise.all([
    rpcPredioPorPlaceId(supabase, placeId),
    googleDetails(placeId),
  ]);
  return { db: db.ok ? db : null, google };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { placeId } = await params;
  const { db, google } = await load(placeId);
  const name =
    (db && String(db.nombre)) ||
    (typeof (google?.displayName as { text?: string } | undefined)?.text === "string"
      ? (google?.displayName as { text: string }).text
      : "Predio");
  return {
    title: name,
    description: `Partidos en ${name}.`,
    openGraph: { url: `${siteUrl}/lugar/${placeId}` },
  };
}

export default async function LugarPlacesPage({ params }: Props) {
  const { placeId } = await params;
  const { db, google } = await load(placeId);

  if (!db && !google) {
    return (
      <SiteShell>
        <h1 className="font-display text-5xl text-plc-white">No encontramos ese lugar</h1>
      </SiteShell>
    );
  }

  const nombre =
    String(db?.nombre ?? "") ||
    (typeof (google?.displayName as { text?: string } | undefined)?.text === "string"
      ? (google?.displayName as { text: string }).text
      : "Predio");
  const segun = (db?.segun_jugadores as Record<string, unknown> | undefined) ?? {};
  const partidos = Array.isArray(db?.partidos_abiertos)
    ? (db!.partidos_abiertos as Record<string, unknown>[])
    : [];
  const altaPath = String(db?.alta_predio_path ?? "/dashboard/canchas");
  const fyUrl = process.env.NEXT_PUBLIC_FULBITOYA_URL?.replace(/\/$/, "") || "";

  return (
    <SiteShell>
      <p className="mt-2 text-xs uppercase tracking-wide text-plc-gold">
        {db?.adherido ? "Predio adherido" : "Cancha no adherida"}
      </p>
      <h1 className="font-display mt-2 text-5xl leading-none text-plc-white">{nombre}</h1>
      <p className="mt-2 text-sm text-plc-text-secondary">
        {[db?.barrio, db?.direccion || google?.formattedAddress].filter(Boolean).map(String).join(" · ")}
      </p>

      {google ? (
        <section className="mt-8">
          <h2 className="font-subheading text-xl text-plc-white">Información de Google</h2>
          <div className="card-plc mt-3 space-y-2 px-4 py-3 text-sm text-plc-text-secondary">
            {google.rating != null ? (
              <p>
                Rating {String(google.rating)}
                {google.userRatingCount != null ? ` (${String(google.userRatingCount)} opiniones)` : ""}
              </p>
            ) : null}
            {google.nationalPhoneNumber ? <p>Tel. {String(google.nationalPhoneNumber)}</p> : null}
            {google.websiteUri ? (
              <p>
                <a className="underline" href={String(google.websiteUri)} rel="noreferrer" target="_blank">
                  Sitio web
                </a>
              </p>
            ) : null}
            {google.googleMapsUri ? (
              <p>
                <a className="underline" href={String(google.googleMapsUri)} rel="noreferrer" target="_blank">
                  Ver en Google Maps
                </a>
              </p>
            ) : null}
            <p className="text-xs opacity-70">Información de Google</p>
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="font-subheading text-xl text-plc-white">Según los jugadores</h2>
        <div className="card-plc mt-3 space-y-1 px-4 py-3 text-sm text-plc-text-secondary">
          <p>Superficie: {segun.superficie ? String(segun.superficie) : "Sin aportes todavía"}</p>
          <p>
            Techada:{" "}
            {segun.techada == null ? "—" : segun.techada ? "Sí" : "No"}
            {segun.techada_confirmada ? " (confirmada)" : ""}
          </p>
          <p>
            Iluminación:{" "}
            {segun.iluminacion == null ? "—" : segun.iluminacion ? "Sí" : "No"}
            {segun.iluminacion_confirmada ? " (confirmada)" : ""}
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-subheading text-xl text-plc-white">Partidos abiertos</h2>
        <div className="card-plc mt-3 space-y-2 px-4 py-3 text-sm text-plc-text-secondary">
          {partidos.length === 0 ? <p>No hay partidos abiertos por ahora.</p> : null}
          {partidos.map((p) => (
            <p key={String(p.id)}>
              {String(p.fecha ?? "")} · {String(p.hora_inicio ?? "").slice(0, 5)} · {String(p.modalidad ?? "")}
              {p.etiqueta ? ` · ${String(p.etiqueta)}` : ""}
            </p>
          ))}
        </div>
      </section>

      <div className="mt-8 space-y-3">
        {fyUrl ? (
          <Link
            href={`${fyUrl}${altaPath}`}
            className="inline-block rounded-md bg-plc-gold px-4 py-2 text-sm font-medium text-plc-navy"
          >
            ¿Sos el dueño? Sumá tu predio a FulbitoYa
          </Link>
        ) : (
          <p className="text-sm text-plc-text-secondary">
            ¿Sos el dueño? Sumá tu predio a FulbitoYa desde el panel.
          </p>
        )}
        <OpenInApp path="explorar" label="Abrir en PorLaCancha" />
      </div>
    </SiteShell>
  );
}
