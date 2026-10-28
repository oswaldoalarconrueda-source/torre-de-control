"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dinero, entero } from "@/lib/formato";
import { Panel, TablaScroll } from "./ui";

// 🏪 Seguimiento comercial de las tiendas de la proveeduría (pedido de Distrilatam): cada tienda con sus despachos de
// las últimas 4 semanas, filtrable por centro de costos (ahí se separa mayor y drop). Arriba van las que dejaron de
// despachar esta semana, para llamarlas en caliente.
type Tienda = {
  tienda: string; tipo: "drop" | "mayor" | "drop y mayor"; centros: string | null; semanas: [number, number, number, number];
  valor_semana: number; valor_3_semanas: number; dias_sin: number; n90: number; estado: Estado;
};
type Estado = "dejo" | "bajando" | "nueva" | "activa" | "inactiva";
type Datos = { hoy: string; centros: { id: number; nombre: string; remisiones: number }[]; sin_centro: number; tiendas: Tienda[] };

const ESTADOS: Record<Estado, { label: string; cls: string }> = {
  dejo: { label: "Dejó de despachar", cls: "bg-red/15 text-red border-red/40" },
  bajando: { label: "Viene bajando", cls: "bg-amber/15 text-amber border-amber/40" },
  nueva: { label: "Nueva", cls: "bg-blue/15 text-blue-2 border-blue/40" },
  activa: { label: "Activa", cls: "bg-green/15 text-green border-green/40" },
  inactiva: { label: "Sin despachos en 4 semanas", cls: "border-line text-muted" },
};
const FILTROS: { id: Estado | "todas"; label: string }[] = [
  { id: "todas", label: "Todas" }, { id: "dejo", label: "Dejaron de despachar" }, { id: "bajando", label: "Vienen bajando" },
  { id: "nueva", label: "Nuevas" }, { id: "activa", label: "Activas" }, { id: "inactiva", label: "Sin despachos en 4 semanas" },
];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corto = (d: Date) => `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
const semana = (hoy: string, i: number) => {
  const fin = new Date(Date.parse(`${hoy}T12:00:00Z`) - i * 7 * 86_400_000), ini = new Date(fin.getTime() - 6 * 86_400_000);
  return `${corto(ini)} – ${corto(fin)}`;
};

export function SeguimientoTiendas({ cuenta }: { cuenta: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [centro, setCentro] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<Estado | "todas">("todas");
  const [buscar, setBuscar] = useState("");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    supabase.rpc("prov_tiendas", { p_cuenta: cuenta, p_centro: centro }).then(({ data }) => {
      if (!vivo) return;
      setDatos((data ?? null) as Datos | null);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [supabase, cuenta, centro]);

  const tiendas = datos?.tiendas ?? [];
  const cuenta_ = (e: Estado) => tiendas.filter((t) => t.estado === e).length;
  const q = buscar.trim().toLowerCase();
  const vista = tiendas.filter((t) => (filtro === "todas" || t.estado === filtro) && (!q || t.tienda.toLowerCase().includes(q)));
  const tope = Math.max(1, ...tiendas.map((t) => Math.max(...t.semanas)));
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${on ? "border-blue/50 bg-blue/15 text-text" : "border-line text-muted hover:text-text"}`;

  return (
    <Panel titulo="🏪 Seguimiento de tiendas" detalle="Despachos (remisiones) de cada tienda en las últimas 4 semanas. Arriba, las que dejaron de despachar esta semana.">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted">Centro de costos</span>
          <button onClick={() => setCentro(null)} className={chip(centro === null)}>Todos</button>
          {(datos?.centros ?? []).map((c) => (
            <button key={c.id} onClick={() => setCentro(c.id)} className={chip(centro === c.id)}>{c.nombre} <span className="text-muted font-normal">· {entero(c.remisiones)}</span></button>
          ))}
          {!!datos?.sin_centro && (
            <span className="text-[11px] text-muted">{entero(datos.sin_centro)} remisiones aún sin centro de costos (se está trayendo el historial)</span>
          )}
        </div>

        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          {(["dejo", "bajando", "nueva", "activa"] as Estado[]).map((e) => (
            <button key={e} onClick={() => setFiltro(filtro === e ? "todas" : e)} className={`card p-3 text-left ${filtro === e ? "ring-1 ring-blue/50" : ""}`}>
              <div className="text-[11px] uppercase tracking-widest font-mono text-muted">{ESTADOS[e].label}</div>
              <div className={`num text-2xl font-semibold mt-1 ${e === "dejo" ? "text-red" : e === "bajando" ? "text-amber" : e === "nueva" ? "text-blue-2" : "text-green"}`}>{entero(cuenta_(e))}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map((f) => <button key={f.id} onClick={() => setFiltro(f.id)} className={chip(filtro === f.id)}>{f.label}</button>)}
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar tienda"
            className="ml-auto h-8 w-56 rounded-md border border-line bg-tinte/[0.03] px-2 text-xs text-text placeholder:text-muted/60" />
        </div>

        {cargando && !datos ? <p className="text-sm text-muted">Cargando…</p> : (
          <TablaScroll>
            <thead>
              <tr>
                <th>Tienda</th><th>Tipo</th><th>Centro de costos</th>
                {[0, 1, 2, 3].map((i) => <th key={i} className="text-right">{i === 0 ? "Últimos 7 días" : semana(datos?.hoy ?? "", i)}</th>)}
                <th className="text-right">Valor 7 días</th><th className="text-right">Días sin despachar</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {vista.slice(0, 300).map((t) => (
                <tr key={t.tienda}>
                  <td className="max-w-[16rem] truncate font-medium" title={t.tienda}>{t.tienda}</td>
                  <td className="text-muted">{t.tipo}</td>
                  <td className="max-w-[12rem] truncate text-muted" title={t.centros ?? ""}>{t.centros ?? "—"}</td>
                  {t.semanas.map((n, i) => (
                    <td key={i} className="text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 rounded-full bg-blue/60" style={{ width: `${Math.round((n / tope) * 48)}px` }} />
                        <span className={`num ${n ? "" : "text-muted"}`}>{entero(n)}</span>
                      </div>
                    </td>
                  ))}
                  <td className="text-right num">{dinero(t.valor_semana, cuenta)}</td>
                  <td className={`text-right num ${t.dias_sin >= 7 ? "text-red" : t.dias_sin >= 3 ? "text-amber" : "text-muted"}`}>{entero(t.dias_sin)}</td>
                  <td><span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ESTADOS[t.estado].cls}`}>{ESTADOS[t.estado].label}</span></td>
                </tr>
              ))}
              {!vista.length && <tr><td colSpan={10} className="text-center text-muted py-6">Nada con ese filtro.</td></tr>}
            </tbody>
          </TablaScroll>
        )}
        {vista.length > 300 && <p className="text-xs text-muted">Se muestran 300 de {entero(vista.length)}; usa el buscador o los filtros.</p>}
        <p className="text-[11px] text-muted">
          "Dejó de despachar": tuvo despachos en las 3 semanas anteriores y ninguno en los últimos 7 días. "Viene bajando": esta semana despachó menos de la mitad de su promedio semanal.
        </p>
      </div>
    </Panel>
  );
}
