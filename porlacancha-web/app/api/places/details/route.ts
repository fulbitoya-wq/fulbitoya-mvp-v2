import { NextResponse } from "next/server";

const KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY?.trim() ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
  "";

const FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "googleMapsUri",
  "photos",
  "rating",
  "userRatingCount",
  "regularOpeningHours",
  "nationalPhoneNumber",
  "websiteUri",
  "parkingOptions",
  "addressComponents",
].join(",");

export async function GET(req: Request) {
  const placeId = new URL(req.url).searchParams.get("placeId")?.trim() ?? "";
  if (!placeId) {
    return NextResponse.json({ ok: false, error: "placeId requerido" }, { status: 400 });
  }
  if (!KEY) {
    return NextResponse.json({ ok: false, error: "Falta la clave de Google Maps." }, { status: 500 });
  }

  const id = placeId.startsWith("places/") ? placeId : `places/${placeId}`;
  const res = await fetch(`https://places.googleapis.com/v1/${id}`, {
    headers: {
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { ok: false, error: "No se pudo cargar el lugar.", detail: text.slice(0, 200) },
      { status: 502 }
    );
  }

  const place = (await res.json()) as Record<string, unknown>;
  const displayName = place.displayName as { text?: string } | string | undefined;
  const nombre =
    typeof displayName === "string" ? displayName : displayName?.text ?? "";
  const location = place.location as { latitude?: number; longitude?: number } | undefined;
  const components = (place.addressComponents as { longText?: string; types?: string[] }[]) ?? [];
  const barrio =
    components.find((c) => c.types?.includes("neighborhood"))?.longText ||
    components.find((c) => c.types?.includes("sublocality_level_1"))?.longText ||
    components.find((c) => c.types?.includes("locality"))?.longText ||
    null;

  return NextResponse.json({
    ok: true,
    place: {
      placeId: String(place.id ?? placeId).replace(/^places\//, ""),
      nombre,
      direccion: place.formattedAddress ?? "",
      lat: location?.latitude ?? null,
      lng: location?.longitude ?? null,
      telefono: place.nationalPhoneNumber ?? null,
      googleMapsUri: place.googleMapsUri ?? null,
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
      websiteUri: place.websiteUri ?? null,
      regularOpeningHours: place.regularOpeningHours ?? null,
      parkingOptions: place.parkingOptions ?? null,
      photos: place.photos ?? null,
      barrio,
      attributions: "Información de Google",
    },
  });
}
