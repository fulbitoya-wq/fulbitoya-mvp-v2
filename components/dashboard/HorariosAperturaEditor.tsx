"use client";

import { DIAS_APERTURA } from "@/lib/horarios-apertura";
import type { HorariosApertura } from "@/lib/canchas";

export function HorariosAperturaEditor({
  value,
  onChange,
}: {
  value: HorariosApertura;
  onChange: (next: HorariosApertura) => void;
}) {
  return (
    <div className="space-y-2">
      {DIAS_APERTURA.map((d) => {
        const row = value[d.key] ?? { abierto: false, desde: "08:00", hasta: "23:00" };
        return (
          <div
            key={d.key}
            className="flex flex-col gap-2 rounded-lg border border-[#E0E0E0] px-3 py-2 sm:flex-row sm:items-center"
          >
            <label className="flex min-w-[9rem] items-center gap-2 text-sm font-medium text-[#1A2E4A]">
              <input
                type="checkbox"
                checked={row.abierto}
                onChange={(e) =>
                  onChange({ ...value, [d.key]: { ...row, abierto: e.target.checked } })
                }
              />
              {d.label}
            </label>
            <div className="flex flex-1 items-center gap-2">
              <input
                type="time"
                disabled={!row.abierto}
                value={row.desde}
                onChange={(e) => onChange({ ...value, [d.key]: { ...row, desde: e.target.value } })}
                className="w-full rounded-lg border border-[#E0E0E0] px-2 py-1.5 text-sm disabled:opacity-50"
              />
              <span className="text-xs text-[#1A2E4A]/50">a</span>
              <input
                type="time"
                disabled={!row.abierto}
                value={row.hasta}
                onChange={(e) => onChange({ ...value, [d.key]: { ...row, hasta: e.target.value } })}
                className="w-full rounded-lg border border-[#E0E0E0] px-2 py-1.5 text-sm disabled:opacity-50"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
