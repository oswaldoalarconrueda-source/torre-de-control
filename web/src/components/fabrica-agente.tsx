"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { FileText, ShoppingCart, Truck } from "lucide-react";
import { entero } from "@/lib/formato";

// 🤖 Agente en vivo: el camino de hoy orden → remisión → guía en una franja compacta. Entre cada etapa va una doble
// hélice como la del ADN: una hebra es lo que hizo el Agente y la otra lo que hizo una persona (Humano); salen juntas
// de una etapa, se enredan girando y se vuelven a unir al llegar a la siguiente. La hebra más gruesa es la que más
// hizo y los paquetes que corren por cada una dicen cuánto volumen lleva. Datos de auto_fabrica: quién lo hizo sale de
// la bitácora del agente.
export type DatosFabrica = {
  ordenes_hoy: number; anuladas_hoy: number; sin_remision: number;
  rem_agente: number; rem_humano: number; sin_guia_agente: number; sin_guia_humano: number;
  guia_aa: number; guia_ah: number; guia_ha: number; guia_hh: number;
};

// Órdenes de hoy contadas del mismo listado que las tablas del agente: "sin remisión" son exactamente las filas de la
// lista "Órdenes sin remisión" (incluye las de días anteriores que siguen pendientes).
export type ConteoOrdenes = { total: number; remisionadas: number; sinRemision: number; sinRemisionAntes: number; anuladas: number };

// El humano siempre naranja; el agente azul hasta la remisión y verde hasta la guía.
const C = { orden: "34 211 238", agenteRem: "90 162 255", agenteGuia: "47 210 143", humano: "255 145 40" };
const pct = (a: number, b: number) => (a + b ? Math.round((a / (a + b)) * 100) : 0);

function Etapa({ Icono, titulo, valor, sub, color, activa }: { Icono: typeof Truck; titulo: string; valor: number; sub: ReactNode; color: string; activa?: boolean }) {
  return (
    <div className="relative flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 transition-shadow"
      style={{ borderColor: `rgb(${color} / ${activa ? 0.8 : 0.3})`, background: `linear-gradient(180deg, rgb(${color} / 0.10), rgb(${color} / 0.02))`, boxShadow: activa ? `0 0 28px -8px rgb(${color} / 0.8)` : undefined }}>
      {activa && <span className="absolute inset-0 rounded-xl border-2 onda" style={{ borderColor: `rgb(${color} / 0.6)` }} />}
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `rgb(${color} / 0.15)`, color: `rgb(${color})` }}>
        <Icono size={18} />
      </div>
      <div className="min-w-0">
        <div key={valor} className="sube num text-2xl font-bold leading-none tracking-tight" style={{ color: `rgb(${color})` }}>{entero(valor)}</div>
        <div className="mt-1 truncate text-[10px] uppercase tracking-widest font-mono text-text/80">{titulo}</div>
        {typeof sub === "string" ? <div className="text-[11px] leading-snug text-muted">{sub}</div> : sub}
      </div>
    </div>
  );
}

// Doble hélice dibujada en un lienzo de 200 × 44 que se estira al ancho del conector. Cada cuadro gira la fase: la hebra
// que pasa por delante se ve entera y la de atrás tenue, y los peldaños unen las dos (mitad de cada color).
const W = 200, H = 44, MEDIO = H / 2, AMPLITUD = 15, PERIODO = 64;
function Helice({ agente, humano, colorAgente, rapido }: { agente: number; humano: number; colorAgente: string; rapido?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const total = agente + humano;
  const grosor = (n: number) => (n ? 1.6 + (total ? (n / total) * 2.4 : 0) : 1.2);
  const paquetes = (n: number) => (n ? Math.min(3, Math.max(1, Math.ceil(n / 80))) : 0);
  const pa = paquetes(agente), ph = paquetes(humano);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const el = (k: string) => svg.querySelector<SVGPathElement>(`[data-k="${k}"]`);
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const giro = rapido ? 1.2 : 3.2; // segundos por vuelta
    const viaje = rapido ? 1.1 : 2.8; // segundos que tarda un paquete de una etapa a la otra
    // Las hebras salen juntas de una etapa y se vuelven a unir en la siguiente (la apertura sigue una campana).
    const abre = (x: number) => Math.pow(Math.sin((Math.PI * x) / W), 0.7);
    const y = (x: number, fase: number, signo: 1 | -1) => MEDIO + signo * AMPLITUD * abre(x) * Math.sin((2 * Math.PI * x) / PERIODO + fase);
    const p = (n: number) => n.toFixed(1);
    let raf = 0;
    const pintar = (t: number) => {
      const fase = quieto ? 0 : ((t / 1000) * 2 * Math.PI) / giro;
      // Hebras partidas en tramos de adelante y de atrás (cuando cos > 0 la hebra del agente va adelante).
      const tramos = { af: "", ab: "", hf: "", hb: "" };
      let previo: boolean | null = null;
      for (let x = 0; x <= W; x += 2) {
        const adelante = Math.cos((2 * Math.PI * x) / PERIODO + fase) > 0;
        const ya = y(x, fase, 1), yh = y(x, fase, -1);
        const cambio = adelante !== previo;
        if (cambio && previo !== null) {
          // Cierra el tramo anterior en este punto para que la hebra no quede cortada.
          tramos[previo ? "af" : "ab"] += ` L${p(x)} ${p(ya)}`;
          tramos[previo ? "hb" : "hf"] += ` L${p(x)} ${p(yh)}`;
        }
        const ka = adelante ? "af" : "ab", kh = adelante ? "hb" : "hf";
        tramos[ka] += `${cambio ? " M" : " L"}${p(x)} ${p(ya)}`;
        tramos[kh] += `${cambio ? " M" : " L"}${p(x)} ${p(yh)}`;
        previo = adelante;
      }
      // Peldaños: de la hebra del agente al centro en su color y del centro a la del humano en naranja.
      let pa1 = "", ph1 = "";
      for (let x = 6; x < W; x += 7) {
        const ya = y(x, fase, 1), yh = y(x, fase, -1);
        if (Math.abs(ya - yh) < 3) continue;
        pa1 += ` M${p(x)} ${p(ya)} L${p(x)} ${p(MEDIO)}`;
        ph1 += ` M${p(x)} ${p(MEDIO)} L${p(x)} ${p(yh)}`;
      }
      el("af")?.setAttribute("d", tramos.af); el("ab")?.setAttribute("d", tramos.ab);
      el("hf")?.setAttribute("d", tramos.hf); el("hb")?.setAttribute("d", tramos.hb);
      el("pa")?.setAttribute("d", pa1); el("ph")?.setAttribute("d", ph1);
      // Paquetes: un trazo corto y brillante que corre por cada hebra.
      const correr = (k: string, n: number, signo: 1 | -1, desfase: number) => {
        for (let i = 0; i < n; i++) {
          const x = quieto ? ((i + 1) * W) / (n + 1) : ((((t / 1000) / viaje + i / n + desfase) % 1) * W);
          const x2 = Math.min(W, x + 5);
          el(`${k}${i}`)?.setAttribute("d", `M${p(x)} ${p(y(x, fase, signo))} L${p(x2)} ${p(y(x2, fase, signo))}`);
        }
      };
      correr("qa", pa, 1, 0);
      correr("qh", ph, -1, 0.5);
      if (!quieto) raf = requestAnimationFrame(pintar);
    };
    raf = requestAnimationFrame(pintar);
    return () => cancelAnimationFrame(raf);
  }, [rapido, pa, ph]);

  const ca = `rgb(${colorAgente})`, ch = `rgb(${C.humano})`;
  const linea = { fill: "none", strokeLinecap: "round" as const, vectorEffect: "non-scaling-stroke" as const };
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-11 w-full overflow-visible" aria-hidden>
      <path data-k="pa" {...linea} stroke={ca} strokeOpacity={agente ? 0.28 : 0.1} strokeWidth={1} />
      <path data-k="ph" {...linea} stroke={ch} strokeOpacity={humano ? 0.28 : 0.1} strokeWidth={1} />
      <path data-k="ab" {...linea} stroke={ca} strokeOpacity={agente ? 0.35 : 0.12} strokeWidth={grosor(agente)} />
      <path data-k="hb" {...linea} stroke={ch} strokeOpacity={humano ? 0.35 : 0.12} strokeWidth={grosor(humano)} />
      <path data-k="af" {...linea} stroke={ca} strokeOpacity={agente ? 1 : 0.2} strokeWidth={grosor(agente)} style={{ filter: agente ? `drop-shadow(0 0 3px ${ca})` : undefined }} />
      <path data-k="hf" {...linea} stroke={ch} strokeOpacity={humano ? 1 : 0.2} strokeWidth={grosor(humano)} style={{ filter: humano ? `drop-shadow(0 0 3px ${ch})` : undefined }} />
      {Array.from({ length: pa }, (_, i) => <path key={`qa${i}`} data-k={`qa${i}`} {...linea} stroke="white" strokeWidth={3} style={{ filter: `drop-shadow(0 0 4px ${ca})` }} />)}
      {Array.from({ length: ph }, (_, i) => <path key={`qh${i}`} data-k={`qh${i}`} {...linea} stroke="white" strokeWidth={3} style={{ filter: `drop-shadow(0 0 4px ${ch})` }} />)}
    </svg>
  );
}

// Conector entre dos etapas: arriba cuántas hizo el agente, la hélice en medio y abajo cuántas hizo una persona.
function Conector({ agente, humano, colorAgente, rapido, detalle }: { agente: number; humano: number; colorAgente: string; rapido?: boolean; detalle?: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-center px-1" title={detalle}>
      <div className="whitespace-nowrap text-center text-[11px] font-semibold" style={{ color: `rgb(${colorAgente})` }}>
        🤖 Agente <span className="num text-text">{entero(agente)}</span>
      </div>
      <Helice agente={agente} humano={humano} colorAgente={colorAgente} rapido={rapido} />
      <div className="whitespace-nowrap text-center text-[11px] font-semibold" style={{ color: `rgb(${C.humano})` }}>
        👤 Humano <span className="num text-text">{entero(humano)}</span>
      </div>
    </div>
  );
}

// `estado`: lo que está haciendo el agente ahora o su próxima corrida; `paso`: la etapa que está creando en este momento.
// `periodo`: con el calendario en otros días, cómo se llaman ("Ayer · 29 oct"); sin periodo es hoy.
export function FabricaAgente({ d, ordenes, estado, paso, enVivo = false, periodo }: {
  d: DatosFabrica; ordenes?: ConteoOrdenes; estado?: ReactNode; paso?: string | null; enVivo?: boolean; periodo?: string;
}) {
  const o = ordenes ?? { total: d.ordenes_hoy + d.anuladas_hoy, remisionadas: Math.max(0, d.ordenes_hoy - d.sin_remision), sinRemision: d.sin_remision, sinRemisionAntes: 0, anuladas: d.anuladas_hoy };
  const rem = d.rem_agente + d.rem_humano;
  const guiaAgente = d.guia_aa + d.guia_ha, guiaHumano = d.guia_ah + d.guia_hh, guias = guiaAgente + guiaHumano;
  const sinGuia = d.sin_guia_agente + d.sin_guia_humano;
  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full onda ${enVivo ? "bg-blue-2" : "bg-green/60"}`} />
            <span className={`relative inline-flex size-2.5 rounded-full ${enVivo ? "bg-blue-2" : "bg-green"}`} />
          </span>
          <span className="font-display font-semibold">{periodo ? "Agente" : "Agente en vivo"}</span>
          <span className="text-xs text-muted">· {periodo ?? "hoy"} · hecho por el agente:</span>
          <span className="text-xs font-semibold" style={{ color: `rgb(${C.agenteRem})` }}>{pct(d.rem_agente, d.rem_humano)} % remisiones</span>
          <span className="text-xs font-semibold" style={{ color: `rgb(${C.agenteGuia})` }}>{pct(guiaAgente, guiaHumano)} % guías</span>
        </div>
        {estado && <div className="text-xs text-muted">{estado}</div>}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)] md:gap-2">
        <Etapa Icono={ShoppingCart} titulo={periodo ? "Órdenes del periodo" : "Órdenes de hoy"} valor={o.total} color={C.orden} sub={
          <div className="mt-0.5 space-y-px text-[11px] leading-snug">
            <div className="text-muted"><span className="num font-semibold text-text">{entero(o.remisionadas)}</span> remisionadas</div>
            {/* Las que palpitan son las que están en la lista "Órdenes sin remisión", una por una. */}
            <div className="flex items-center gap-1.5" style={{ color: o.sinRemision ? "rgb(255 181 71)" : "var(--muted)" }}
              title={o.sinRemisionAntes ? `${entero(o.sinRemisionAntes)} son de días anteriores` : undefined}>
              {o.sinRemision > 0 && (
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full rounded-full onda" style={{ background: "rgb(255 181 71)" }} />
                  <span className="relative inline-flex size-2 rounded-full" style={{ background: "rgb(255 181 71)" }} />
                </span>
              )}
              <span><span className="num font-bold">{entero(o.sinRemision)}</span> sin remisión{o.sinRemisionAntes ? ` (${entero(o.sinRemisionAntes)} de antes)` : ""}</span>
            </div>
            <div className={o.anuladas ? "text-red" : "text-muted"}><span className="num font-semibold">{entero(o.anuladas)}</span> anuladas</div>
          </div>
        } />
        <Conector agente={d.rem_agente} humano={d.rem_humano} colorAgente={C.agenteRem} rapido={paso === "remision"} />
        <Etapa Icono={FileText} titulo="Remisiones" valor={rem} color={C.agenteRem} activa={paso === "remision"}
          sub={sinGuia ? `${entero(sinGuia)} esperando guía` : "todas con guía"} />
        <Conector agente={guiaAgente} humano={guiaHumano} colorAgente={C.agenteGuia} rapido={paso === "guia"}
          detalle={`Guías del agente: ${entero(d.guia_aa)} de remisiones del agente y ${entero(d.guia_ha)} de remisiones de humano. ` +
            `Guías de humano: ${entero(d.guia_ah)} de remisiones del agente y ${entero(d.guia_hh)} de remisiones de humano.`} />
        <Etapa Icono={Truck} titulo="Guías" valor={guias} color={C.agenteGuia} activa={paso === "guia"} sub="listas para despacho" />
      </div>
    </div>
  );
}
