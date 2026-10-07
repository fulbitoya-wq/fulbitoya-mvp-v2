import type { HorarioDia, HorariosApertura } from "@/lib/canchas";

export const DIAS_APERTURA: { key: string; label: string }[] = [
  { key: "lun", label: "Lunes" },
  { key: "mar", label: "Martes" },
  { key: "mie", label: "Miércoles" },
  { key: "jue", label: "Jueves" },
  { key: "vie", label: "Viernes" },
  { key: "sab", label: "Sábado" },
  { key: "dom", label: "Domingo" },
];

export function horariosAperturaDefault(): HorariosApertura {
  const dia = (): HorarioDia => ({ abierto: true, desde: "08:00", hasta: "23:00" });
  return {
    lun: dia(),
    mar: dia(),
    mie: dia(),
    jue: dia(),
    vie: dia(),
    sab: dia(),
    dom: dia(),
  };
}

export function parseHorariosApertura(raw: unknown): HorariosApertura {
  const base = horariosAperturaDefault();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const { key } of DIAS_APERTURA) {
    const v = obj[key];
    if (v && typeof v === "object") {
      const d = v as Record<string, unknown>;
      base[key] = {
        abierto: Boolean(d.abierto),
        desde: typeof d.desde === "string" ? d.desde.slice(0, 5) : "08:00",
        hasta: typeof d.hasta === "string" ? d.hasta.slice(0, 5) : "23:00",
      };
    }
  }
  return base;
}
