import { NextResponse } from "next/server";

const KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY?.trim() ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
  "";

type PlacesSuggestion = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string } | string;
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    return NextResponse.json({ ok: true, suggestions: [] });
  }
  if (!KEY) {
    return NextResponse.json({ ok: false, error: "Falta la clave de Google Maps." }, { status: 500 });
  }

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
    },
    body: JSON.stringify({
      input: q,
      includedRegionCodes: ["ar"],
      languageCode: "es-AR",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { ok: false, error: "No se pudo buscar lugares.", detail: text.slice(0, 200) },
      { status: 502 }
    );
  }

  const body = (await res.json()) as { suggestions?: PlacesSuggestion[] };
  const suggestions = (body.suggestions ?? [])
    .map((s) => {
      const p = s.placePrediction;
      if (!p?.placeId) return null;
      const main =
        p.structuredFormat?.mainText?.text ||
        (typeof p.text === "string" ? p.text : p.text?.text) ||
        "";
      const secondary = p.structuredFormat?.secondaryText?.text || "";
      return {
        placeId: p.placeId,
        mainText: main,
        secondaryText: secondary,
        label: [main, secondary].filter(Boolean).join(" · "),
      };
    })
    .filter(Boolean);

  return NextResponse.json({ ok: true, suggestions });
}
