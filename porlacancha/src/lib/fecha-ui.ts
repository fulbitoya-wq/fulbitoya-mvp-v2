/** Fechas ISO (YYYY-MM-DD) y horas HH:MM en zona local, formato AR. */

export const TZ_AR = "America/Argentina/Buenos_Aires";

/** Día calendario en Argentina (YYYY-MM-DD), con offset opcional. */
export function arIsoDate(offsetDays = 0): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_AR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayAr = fmt.format(new Date());
  if (offsetDays === 0) return todayAr;
  const [y, m, d] = todayAr.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + offsetDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIsoDateLocal(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

/** "jueves 16/10" */
export function formatFechaAr(isoDate: string): string {
  const dt = parseIsoDateLocal(isoDate);
  if (!dt) return isoDate;
  const weekday = dt.toLocaleDateString("es-AR", { weekday: "long" });
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  return `${weekday} ${day}/${month}`;
}

export function formatHora24(hora: string): string {
  return hora.slice(0, 5);
}

export function addDaysLocal(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function birthdateBounds(): { min: Date; max: Date } {
  const today = new Date();
  const max = addDaysLocal(today, 0);
  max.setFullYear(max.getFullYear() - 13);
  const min = addDaysLocal(today, 0);
  min.setFullYear(min.getFullYear() - 100);
  return { min, max };
}

export function partidoDateBounds(): { min: Date; max: Date } {
  const min = addDaysLocal(new Date(), 0);
  const max = addDaysLocal(new Date(), 60);
  return { min, max };
}

/** Lista 00:00 … 23:00 cada 1 h (sin medias). */
export function hourSlots(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
  }
  return out;
}

/** @deprecated Preferí hourSlots(); se mantiene por compatibilidad. */
export function halfHourSlots(): string[] {
  return hourSlots();
}
