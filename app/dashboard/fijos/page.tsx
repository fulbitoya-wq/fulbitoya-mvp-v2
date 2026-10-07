"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCanchasDelOwner, type Cancha } from "@/lib/canchas";
import { getCamposByCancha, type Campo } from "@/lib/campos";
import { hoyArgentina } from "@/lib/agenda";
import {
  cobrosDeFijo,
  crearTurnoFijo,
  DIAS_FIJO,
  fyBajaTurnoFijo,
  listarTurnosFijos,
  type CobroFijo,
  type TurnoFijo,
} from "@/lib/fijos";

function minutosAHora(hhmm: string, min: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + min;
  const hh = String(Math.floor(t / 60) % 24).padStart(2, "0");
  const mm = String(t % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function TurnosFijosPage() {
  const [canchas, setCanchas] = useState<Cancha[]>([]);
  const [canchaId, setCanchaId] = useState("");
  const [campos, setCampos] = useState<Campo[]>([]);
  const [rows, setRows] = useState<TurnoFijo[]>([]);
  const [cobros, setCobros] = useState<Record<string, CobroFijo[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    campo_id: "",
    cliente_nombre: "",
    cliente_telefono: "",
    dia_semana: "lun",
    hora_inicio: "20:00",
    fecha_desde: hoyArgentina(),
    fecha_hasta: "",
    precio: "",
    sin_fin: true,
  });

  const load = async (id: string) => {
    setRows(await listarTurnosFijos(id));
    setCampos(await getCamposByCancha(id));
  };

  useEffect(() => {
    const boot = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Debés estar logueado.");
        return;
      }
      const cs = await getCanchasDelOwner(user.id);
      setCanchas(cs);
      if (cs[0]) {
        setCanchaId(cs[0].id);
        await load(cs[0].id);
      }
    };
    void boot();
  }, []);

  useEffect(() => {
    if (canchaId) void load(canchaId);
  }, [canchaId]);

  useEffect(() => {
    const run = async () => {
      const map: Record<string, CobroFijo[]> = {};
      for (const r of rows.filter((x) => x.activo)) {
        map[r.id] = await cobrosDeFijo(r.id);
      }
      setCobros(map);
    };
    if (rows.length) void run();
  }, [rows]);

  const duracion = useMemo(() => {
    const c = campos.find((x) => x.id === form.campo_id);
    return c?.duracion_min || 60;
  }, [campos, form.campo_id]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.campo_id || !form.cliente_nombre.trim() || !form.precio) {
      setError("Completá cliente, cancha y precio.");
      return;
    }
    setBusy(true);
    const res = await crearTurnoFijo({
      cancha_id: canchaId,
      campo_id: form.campo_id,
      cliente_nombre: form.cliente_nombre.trim(),
      cliente_telefono: form.cliente_telefono.trim() || null,
      dia_semana: form.dia_semana,
      hora_inicio: form.hora_inicio,
      hora_fin: minutosAHora(form.hora_inicio, duracion),
      fecha_desde: form.fecha_desde,
      fecha_hasta: form.sin_fin ? null : form.fecha_hasta || null,
      precio: Number(form.precio),
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setForm({ ...form, cliente_nombre: "", cliente_telefono: "", precio: "" });
      await load(canchaId);
    }
  };

  const diaLabel = (k: string) => DIAS_FIJO.find((d) => d.key === k)?.label ?? k;

  return (
    <div className="p-4 sm:p-8">
      <h1 className="font-subheading text-2xl font-semibold text-[#1A2E4A]">Turnos fijos</h1>
      <p className="mt-1 text-sm text-[#1A2E4A]/70">
        Se ocupan solas en la agenda cada semana. Podés liberar una fecha o dar de baja el fijo.
      </p>

      <select
        className="mt-4 rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-sm"
        value={canchaId}
        onChange={(e) => setCanchaId(e.target.value)}
      >
        {canchas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <form onSubmit={(e) => void crear(e)} className="mt-6 space-y-3 rounded-xl border border-[#E0E0E0] bg-white p-4">
        <p className="font-medium text-[#1A2E4A]">Nuevo fijo</p>
        <input
          className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2.5"
          placeholder="Cliente *"
          value={form.cliente_nombre}
          onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })}
        />
        <input
          className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2.5"
          placeholder="Teléfono"
          value={form.cliente_telefono}
          onChange={(e) => setForm({ ...form, cliente_telefono: e.target.value })}
        />
        <select
          className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2.5"
          value={form.campo_id}
          onChange={(e) => setForm({ ...form, campo_id: e.target.value })}
        >
          <option value="">Cancha *</option>
          {campos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="rounded-lg border border-[#E0E0E0] px-3 py-2.5"
            value={form.dia_semana}
            onChange={(e) => setForm({ ...form, dia_semana: e.target.value })}
          >
            {DIAS_FIJO.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
          <input
            type="time"
            className="rounded-lg border border-[#E0E0E0] px-3 py-2.5"
            value={form.hora_inicio}
            onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })}
          />
        </div>
        <input
          type="number"
          className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2.5"
          placeholder="Precio *"
          value={form.precio}
          onChange={(e) => setForm({ ...form, precio: e.target.value })}
        />
        <input
          type="date"
          className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2.5"
          value={form.fecha_desde}
          onChange={(e) => setForm({ ...form, fecha_desde: e.target.value })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.sin_fin} onChange={(e) => setForm({ ...form, sin_fin: e.target.checked })} />
          Sin fecha de fin
        </label>
        {!form.sin_fin ? (
          <input
            type="date"
            className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2.5"
            value={form.fecha_hasta}
            onChange={(e) => setForm({ ...form, fecha_hasta: e.target.value })}
          />
        ) : null}
        <button disabled={busy} className="w-full rounded-lg bg-[var(--fulbito-green)] py-3 font-medium text-white">
          {busy ? "Creando…" : "Crear y ocupar la agenda"}
        </button>
      </form>

      <ul className="mt-6 space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-[#E0E0E0] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-[#1A2E4A]">
                  {r.cliente_nombre} {r.activo ? "" : "(baja)"}
                </p>
                <p className="text-sm text-[#1A2E4A]/70">
                  {diaLabel(r.dia_semana)} {r.hora_inicio} · ${r.precio.toLocaleString("es-AR")} · desde {r.fecha_desde}
                  {r.fecha_hasta ? ` hasta ${r.fecha_hasta}` : " · sin fin"}
                </p>
              </div>
              {r.activo ? (
                <button
                  type="button"
                  className="text-sm text-red-700"
                  onClick={async () => {
                    if (!confirm("¿Dar de baja este fijo? Las fechas futuras libres se sueltan.")) return;
                    await fyBajaTurnoFijo(r.id);
                    await load(canchaId);
                  }}
                >
                  Dar de baja
                </button>
              ) : null}
            </div>
            {r.activo && cobros[r.id]?.length ? (
              <ul className="mt-3 space-y-1 text-sm">
                {cobros[r.id].slice(0, 12).map((c) => (
                  <li key={c.fecha} className="flex justify-between text-[#1A2E4A]/80">
                    <span>
                      {c.fecha} {c.hora}
                    </span>
                    <span>{c.cobrado ? `Cobrado${c.medio ? ` (${c.medio})` : ""}` : "Pendiente"}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
