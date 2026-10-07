"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actualizarCampo, crearCampo, type Campo } from "@/lib/campos";
import { DIAS_FRANJA, listarFranjas, regenerarTurnosCampo, reemplazarFranjas, type CampoFranja } from "@/lib/turnos";
import { supabase } from "@/lib/supabase";
import { validarPrecioYSena } from "@/lib/politica";

const BUCKET = "campo-fotos";

function fotosDe(c?: Campo | null): string[] {
  const raw = c?.fotos;
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (c?.foto_url) return [c.foto_url];
  return [];
}

const inputCls =
  "mt-1 w-full rounded-lg border border-[#E0E0E0] px-4 py-2.5 text-base focus:border-[var(--fulbito-green)] focus:outline-none focus:ring-1 focus:ring-[var(--fulbito-green)]";

export function CampoForm({
  canchaId,
  campo,
}: {
  canchaId: string;
  campo?: Campo | null;
}) {
  const router = useRouter();
  const editando = Boolean(campo?.id);
  const [nombre, setNombre] = useState(campo?.nombre ?? "");
  const [tipo, setTipo] = useState(campo?.tipo ?? "5");
  const [superficie, setSuperficie] = useState(campo?.superficie ?? "cesped_sintetico");
  const [techada, setTechada] = useState(Boolean(campo?.techada));
  const [luz, setLuz] = useState(Boolean(campo?.luz));
  const [duracion, setDuracion] = useState(String(campo?.duracion_min || 60));
  const [senaTipo, setSenaTipo] = useState<"fija" | "porcentaje">(campo?.sena_tipo === "porcentaje" ? "porcentaje" : "fija");
  const [senaValor, setSenaValor] = useState(campo?.sena_valor != null ? String(campo.sena_valor) : "");
  const [fotos, setFotos] = useState<string[]>(fotosDe(campo));
  const [franjas, setFranjas] = useState<CampoFranja[]>([
    { dias: ["lun", "mar", "mie", "jue", "vie"], hora_desde: "10:00", hora_hasta: "18:00", precio: 40000 },
    { dias: ["lun", "mar", "mie", "jue", "vie"], hora_desde: "18:00", hora_hasta: "24:00", precio: 50000 },
    { dias: ["sab", "dom"], hora_desde: "08:00", hora_hasta: "24:00", precio: 50000 },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campo?.id) return;
    void listarFranjas(campo.id).then((rows) => {
      if (rows.length) setFranjas(rows);
    });
  }, [campo?.id]);

  const minPrecio = () => {
    const nums = franjas.map((f) => Number(f.precio)).filter((n) => Number.isFinite(n) && n > 0);
    return nums.length ? Math.min(...nums) : 0;
  };

  const senaPesos = () => {
    const v = Number(senaValor);
    const p = minPrecio();
    if (senaTipo === "porcentaje") return Math.round((p * v) / 100);
    return v;
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError("Poné un nombre de cancha.");
      return;
    }
    if (franjas.length === 0 || franjas.some((f) => !f.dias.length || !f.precio)) {
      setError("Cargá al menos una franja de precio con días y monto.");
      return;
    }
    const precio = minPrecio();
    const sena = senaPesos();
    const montoErr = validarPrecioYSena(precio, sena);
    if (montoErr) {
      setError(montoErr);
      return;
    }
    setLoading(true);
    const payload = {
      cancha_id: canchaId,
      nombre: nombre.trim(),
      tipo,
      superficie,
      valor_hora: precio,
      valor_reserva: sena,
      luz,
      techada,
      duracion_min: Number(duracion) || 60,
      sena_tipo: senaTipo,
      sena_valor: Number(senaValor) || 0,
      fotos,
      foto_url: fotos[0] ?? null,
    };
    try {
      let id = campo?.id;
      if (editando && id) {
        const res = await actualizarCampo(id, payload);
        if (!res.ok) throw new Error(res.error ?? "No se pudo guardar.");
      } else {
        const res = await crearCampo(payload);
        if (res.error || !res.data?.id) throw new Error(res.error ?? "No se pudo crear.");
        id = res.data.id;
      }
      const fr = await reemplazarFranjas(id!, franjas);
      if (!fr.ok) throw new Error(fr.error ?? "No se pudieron guardar las franjas.");
      const gen = await regenerarTurnosCampo(id!);
      if (!gen.ok) throw new Error(gen.error ?? "No se pudieron armar los turnos.");
      router.push(`/dashboard/canchas/${canchaId}/campos`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setLoading(false);
    }
  };

  const subirFoto = async (file?: File) => {
    if (!file) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const path = `${user.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    setFotos((prev) => [...prev, url].slice(0, 8));
  };

  return (
    <form onSubmit={(e) => void guardar(e)} className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
      <Link href={`/dashboard/canchas/${canchaId}/campos`} className="text-sm text-[#1A2E4A]/70 hover:underline">
        ← Canchas del predio
      </Link>
      <h1 className="font-heading text-3xl uppercase text-[#1A2E4A]">{editando ? "Editar cancha" : "Nueva cancha"}</h1>
      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="space-y-4 rounded-xl border border-[#E0E0E0] bg-white p-4 sm:p-6">
        <div>
          <label className="text-sm font-medium text-[#1A2E4A]">Nombre *</label>
          <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Cancha 1" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-[#1A2E4A]">Formato</label>
            <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="5">F5</option>
              <option value="7">F7</option>
              <option value="9">F9</option>
              <option value="11">F11</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-[#1A2E4A]">Superficie</label>
            <select className={inputCls} value={superficie} onChange={(e) => setSuperficie(e.target.value)}>
              <option value="cesped_sintetico">Césped sintético</option>
              <option value="cesped_natural">Césped natural</option>
              <option value="tierra">Tierra</option>
              <option value="cemento">Cemento</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-[#E0E0E0] px-3 py-3 text-sm">
            <input type="checkbox" checked={techada} onChange={(e) => setTechada(e.target.checked)} />
            Techada
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-[#E0E0E0] px-3 py-3 text-sm">
            <input type="checkbox" checked={luz} onChange={(e) => setLuz(e.target.checked)} />
            Iluminación
          </label>
        </div>
        <div>
          <label className="text-sm font-medium text-[#1A2E4A]">Duración del turno</label>
          <select className={inputCls} value={duracion} onChange={(e) => setDuracion(e.target.value)}>
            <option value="60">60 minutos</option>
            <option value="90">90 minutos</option>
            <option value="120">120 minutos</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-[#1A2E4A]">Fotos</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-1 block w-full text-sm"
            onChange={(e) => void subirFoto(e.target.files?.[0])}
          />
          {fotos.length ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {fotos.map((f) => (
                <button key={f} type="button" onClick={() => setFotos((p) => p.filter((x) => x !== f))}>
                  <img src={f} alt="" className="h-20 w-full rounded-lg object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-[#E0E0E0] bg-white p-4 sm:p-6">
        <p className="font-medium text-[#1A2E4A]">Precios por franja</p>
        <p className="text-sm text-[#1A2E4A]/70">Ejemplo: lun a vie 10–18 un precio, 18–24 otro, finde todo el día.</p>
        {franjas.map((f, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-[#E0E0E0] p-3">
            <div className="flex flex-wrap gap-2">
              {DIAS_FRANJA.map((d) => {
                const on = f.dias.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => {
                      const next = [...franjas];
                      next[i] = {
                        ...f,
                        dias: on ? f.dias.filter((x) => x !== d.key) : [...f.dias, d.key],
                      };
                      setFranjas(next);
                    }}
                    className={`rounded-full px-2.5 py-1 text-xs ${on ? "bg-[#1A2E4A] text-white" : "border border-[#E0E0E0]"}`}
                  >
                    {d.label.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="time"
                className={inputCls}
                value={f.hora_desde}
                onChange={(e) => {
                  const next = [...franjas];
                  next[i] = { ...f, hora_desde: e.target.value };
                  setFranjas(next);
                }}
              />
              <input
                type="time"
                className={inputCls}
                value={f.hora_hasta === "24:00" ? "23:59" : f.hora_hasta}
                onChange={(e) => {
                  const next = [...franjas];
                  next[i] = { ...f, hora_hasta: e.target.value === "23:59" ? "24:00" : e.target.value };
                  setFranjas(next);
                }}
              />
              <input
                type="number"
                min={1}
                className={inputCls}
                placeholder="Precio"
                value={f.precio || ""}
                onChange={(e) => {
                  const next = [...franjas];
                  next[i] = { ...f, precio: Number(e.target.value) };
                  setFranjas(next);
                }}
              />
            </div>
            <button
              type="button"
              className="text-xs text-red-700"
              onClick={() => setFranjas(franjas.filter((_, j) => j !== i))}
            >
              Sacar franja
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-sm font-medium text-[var(--fulbito-green)]"
          onClick={() =>
            setFranjas([...franjas, { dias: ["lun", "mar", "mie", "jue", "vie"], hora_desde: "08:00", hora_hasta: "23:00", precio: 0 }])
          }
        >
          + Otra franja
        </button>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-[#1A2E4A]">Seña</label>
            <select className={inputCls} value={senaTipo} onChange={(e) => setSenaTipo(e.target.value as "fija" | "porcentaje")}>
              <option value="fija">Monto fijo (ARS)</option>
              <option value="porcentaje">Porcentaje del turno</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-[#1A2E4A]">{senaTipo === "fija" ? "Seña en pesos" : "Seña %"}</label>
            <input className={inputCls} type="number" min={1} value={senaValor} onChange={(e) => setSenaValor(e.target.value)} />
            <p className="mt-1 text-xs text-[#1A2E4A]/60">Máximo 50% del precio más bajo de las franjas.</p>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[var(--fulbito-green)] py-3 font-medium text-white disabled:opacity-70"
      >
        {loading ? "Guardando y armando turnos…" : "Guardar y generar turnos"}
      </button>
    </form>
  );
}
