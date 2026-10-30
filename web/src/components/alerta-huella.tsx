"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dinero, entero } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";

// 🧬 Huella del cliente (Guatemala): cada guía nueva de una tienda, la haga el agente o una persona a mano en Effi, sale
// con el historial de su cliente (matriz hasta agosto 2026 + guías de todas las tiendas del país desde septiembre):
// pedidos anteriores, entregas, devoluciones, en camino y efectividad. AlertaHuella avisa en cualquier pantalla apenas
// llega la guía (la sincronización la trae en un minuto); HuellaGuias es la lista del día en el Agente.

export type GuiaHuella = {
  cuenta: string; id: number; guia: string; fecha: string; cliente: string | null; ciudad: string | null; recaudo: number | null;
  tel: string | null; hecha_por: "agente" | "persona"; pedidos: number; entregas: number; devueltos: number; en_camino: number;
  en_matriz: boolean; efectividad: number | null;
};

type Nivel = "riesgo" | "cuidado" | "bueno" | "nuevo";
// Riesgo: devuelve la mitad o más (con al menos 2 pedidos cerrados) o ya devolvió 3 y no llega al 70 %.
export function nivel(g: GuiaHuella): Nivel {
  const cerrados = g.entregas + g.devueltos;
  if (!cerrados) return "nuevo";
  const ef = g.efectividad ?? 0;
  if ((cerrados >= 2 && ef < 50) || (g.devueltos >= 3 && ef < 70)) return "riesgo";
  return ef < 80 ? "cuidado" : "bueno";
}
const COLOR: Record<Nivel, string> = { riesgo: "var(--red)", cuidado: "var(--amber)", bueno: "var(--green)", nuevo: "var(--muted)" };

// "10 pedidos · 0 entregas · 10 devueltos · efectividad 0 %" (o "Cliente nuevo: sin historial").
export function resumenHuella(g: GuiaHuella) {
  if (!g.pedidos) return "Cliente nuevo: sin historial";
  const partes = [`${entero(g.pedidos)} ${g.pedidos === 1 ? "pedido" : "pedidos"}`, `${entero(g.entregas)} ${g.entregas === 1 ? "entrega" : "entregas"}`,
    `${entero(g.devueltos)} ${g.devueltos === 1 ? "devuelto" : "devueltos"}`];
  if (g.en_camino) partes.push(`${entero(g.en_camino)} en camino`);
  if (g.efectividad != null) partes.push(`efectividad ${g.efectividad} %`);
  return partes.join(" · ");
}

const quien = (g: GuiaHuella) => (g.hecha_por === "agente" ? "🤖 la hizo el agente" : "👤 la hizo una persona");
const VISTAS = "torre.huella.vistas";

function leerVistas(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(VISTAS) ?? "{}"); } catch { return {}; }
}
function guardarVistas(v: Record<string, number>) {
  try {
    const limite = Date.now() - 3 * 86_400_000;
    localStorage.setItem(VISTAS, JSON.stringify(Object.fromEntries(Object.entries(v).filter(([, t]) => t > limite))));
  } catch { /* sin almacenamiento: solo se repetiría un aviso */ }
}

// Avisos emergentes en cualquier pantalla. Solo guías hechas desde que se abrió la Torre (10 min de margen); cada guía
// se avisa una vez. Las de riesgo se quedan hasta cerrarlas; las demás se van solas a los 15 s.
export function AlertaHuella() {
  const [avisos, setAvisos] = useState<(GuiaHuella & { clave: string; hasta: number | null })[]>([]);
  const inicio = useRef(Date.now() - 10 * 60_000);

  const revisar = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const { data } = await createClient().rpc("huella_guias", { p_desde: new Date(Date.now() - 6 * 3600_000).toISOString() });
    if (!Array.isArray(data)) return;
    const vistas = leerVistas();
    const nuevas = (data as GuiaHuella[])
      .filter((g) => !vistas[`${g.cuenta}-${g.id}`] && Date.parse(g.fecha) >= inicio.current)
      .reverse();
    for (const g of data as GuiaHuella[]) vistas[`${g.cuenta}-${g.id}`] ??= Date.now();
    guardarVistas(vistas);
    if (!nuevas.length) return;
    setAvisos((a) => [
      ...nuevas.map((g) => ({ ...g, clave: `${g.cuenta}-${g.id}`, hasta: nivel(g) === "riesgo" ? null : Date.now() + 15_000 })).reverse(),
      ...a,
    ].slice(0, 6));
  }, []);

  useEffect(() => {
    revisar();
    const t = setInterval(revisar, 30_000);
    const limpiar = setInterval(() => setAvisos((a) => a.filter((x) => x.hasta == null || x.hasta > Date.now())), 1000);
    return () => { clearInterval(t); clearInterval(limpiar); };
  }, [revisar]);

  if (!avisos.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {avisos.slice(0, 4).map((g) => {
        const n = nivel(g), c = infoCuenta(g.cuenta);
        return (
          <div key={g.clave} className="card relative p-3 pr-8 text-sm shadow-xl" style={{ borderLeft: `4px solid ${COLOR[n]}` }}>
            <button onClick={() => setAvisos((a) => a.filter((x) => x.clave !== g.clave))} className="absolute right-2 top-2 text-muted hover:text-text" aria-label="Cerrar">
              <X size={14} />
            </button>
            <div className="text-[11px] text-muted">🧬 Guía {g.guia} · {c.bandera} {c.nombre} · {quien(g)}</div>
            <div className="mt-0.5 font-semibold">{g.cliente ?? "Cliente"}{g.ciudad ? <span className="font-normal text-muted"> · {g.ciudad}</span> : null}</div>
            <div className="mt-1 font-semibold" style={{ color: COLOR[n] }}>
              {n === "riesgo" ? "⚠ " : ""}{resumenHuella(g)}
            </div>
            {n === "riesgo" && <div className="mt-0.5 text-[11px] text-muted">Revisa si sigue el envío: este cliente devuelve mucho.</div>}
          </div>
        );
      })}
    </div>
  );
}

// Lista del día en el Agente: las de riesgo primero, luego las demás de la más reciente a la más antigua.
export function HuellaGuias({ cuenta, zona }: { cuenta: string; zona: string }) {
  const [guias, setGuias] = useState<GuiaHuella[] | null>(null);
  const [todas, setTodas] = useState(false);
  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      // Desde la medianoche del país.
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date());
      const desde = new Date(Date.now() - 36 * 3600_000).toISOString();
      const { data } = await createClient().rpc("huella_guias", { p_desde: desde, p_cuenta: cuenta });
      if (!vivo || !Array.isArray(data)) return;
      setGuias((data as GuiaHuella[]).filter((g) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(g.fecha)) === hoy));
    };
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, [cuenta, zona]);

  if (!guias) return null;
  const orden = { riesgo: 0, cuidado: 1, nuevo: 2, bueno: 3 } as const;
  const lista = [...guias].sort((a, b) => orden[nivel(a)] - orden[nivel(b)] || Date.parse(b.fecha) - Date.parse(a.fecha));
  const riesgo = guias.filter((g) => nivel(g) === "riesgo").length;
  const hora = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: zona, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const visibles = todas ? lista : lista.slice(0, 15);
  return (
    <div className="card p-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="font-display text-lg font-semibold">🧬 Huella del cliente · guías de hoy</span>
        <span className="text-xs text-muted">Historial de cada cliente en Guatemala (todas las tiendas). {entero(guias.length)} guías{riesgo ? ` · ` : ""}</span>
        {riesgo > 0 && <span className="rounded-full bg-red/15 px-2 py-0.5 text-[11px] font-semibold text-red">{entero(riesgo)} de cliente que devuelve mucho</span>}
      </div>
      {!guias.length ? <p className="py-4 text-center text-sm text-muted">Todavía no hay guías hoy.</p> : (
        <div className="divide-y divide-line">
          {visibles.map((g) => {
            const n = nivel(g);
            return (
              <div key={`${g.cuenta}-${g.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR[n] }} />
                <span className="num w-12 text-xs text-muted">{hora(g.fecha)}</span>
                <span className="min-w-[10rem] font-semibold">{g.cliente ?? "—"}<span className="font-normal text-muted">{g.ciudad ? ` · ${g.ciudad}` : ""}</span></span>
                <span className="font-semibold" style={{ color: COLOR[n] }}>{resumenHuella(g)}</span>
                <span className="ml-auto text-[11px] text-muted">{g.guia} · {dinero(g.recaudo, cuenta)} · {g.hecha_por === "agente" ? "🤖 agente" : "👤 persona"}</span>
              </div>
            );
          })}
        </div>
      )}
      {lista.length > 15 && (
        <button onClick={() => setTodas((x) => !x)} className="mt-2 text-xs font-semibold text-blue-2 hover:underline">
          {todas ? "Ver menos" : `Ver las ${entero(lista.length)}`}
        </button>
      )}
    </div>
  );
}
