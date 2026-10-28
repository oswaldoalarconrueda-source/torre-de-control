import type { ReactNode } from "react";
import { FileText, ShoppingCart, Truck } from "lucide-react";
import { entero } from "@/lib/formato";

// 🤖 Agente en vivo: el camino de hoy orden → remisión → guía en una franja compacta. Entre cada etapa van dos carriles
// rectos, arriba lo que hizo el Agente y abajo lo que hizo una persona (Humano), con paquetes que corren (más paquetes,
// más volumen). Datos de auto_fabrica: quién lo hizo sale de la bitácora del agente.
export type DatosFabrica = {
  ordenes_hoy: number; anuladas_hoy: number; sin_remision: number;
  rem_agente: number; rem_humano: number; sin_guia_agente: number; sin_guia_humano: number;
  guia_aa: number; guia_ah: number; guia_ha: number; guia_hh: number;
};

const C = { orden: "34 211 238", agenteRem: "90 162 255", humanoRem: "245 166 35", agenteGuia: "47 210 143", humanoGuia: "180 140 255" };
const pct = (a: number, b: number) => (a + b ? Math.round((a / (a + b)) * 100) : 0);

function Etapa({ Icono, titulo, valor, sub, color, activa }: { Icono: typeof Truck; titulo: string; valor: number; sub: string; color: string; activa?: boolean }) {
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
        <div className="text-[11px] leading-snug text-muted">{sub}</div>
      </div>
    </div>
  );
}

// Un carril recto con su etiqueta encima (quién y cuántos); el detalle va en el globo al pasar el mouse.
function Carril({ quien, n, color, detalle, rapido }: { quien: "Agente" | "Humano"; n: number; color: string; detalle?: string; rapido?: boolean }) {
  const paquetes = n ? Math.min(4, Math.max(1, Math.ceil(n / 60))) : 0;
  return (
    <div className="flex items-center gap-2" title={detalle}>
      <span className="w-[5.5rem] shrink-0 whitespace-nowrap text-[11px] font-semibold" style={{ color: `rgb(${color})` }}>
        {quien === "Agente" ? "🤖" : "👤"} {quien} <span className="num text-text">{entero(n)}</span>
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: `rgb(${color} / ${n ? 0.3 : 0.1})` }}>
        {Array.from({ length: paquetes }, (_, k) => (
          <span key={k} className={`corre size-1.5 rounded-full ${rapido ? "corre-rapido" : ""}`}
            style={{ animationDelay: `${(k * (rapido ? 0.85 : 2.6)) / paquetes}s`, background: `rgb(${color})`, boxShadow: `0 0 8px rgb(${color})` }} />
        ))}
      </div>
    </div>
  );
}

function Conector({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col justify-center gap-2 px-1">{children}</div>;
}

// `estado`: lo que está haciendo el agente ahora o su próxima corrida; `paso`: la etapa que está creando en este momento.
export function FabricaAgente({ d, estado, paso, enVivo = false }: { d: DatosFabrica; estado?: ReactNode; paso?: string | null; enVivo?: boolean }) {
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
          <span className="font-display font-semibold">Agente en vivo</span>
          <span className="text-xs text-muted">· hoy · hecho por el agente:</span>
          <span className="text-xs font-semibold" style={{ color: `rgb(${C.agenteRem})` }}>{pct(d.rem_agente, d.rem_humano)} % remisiones</span>
          <span className="text-xs font-semibold" style={{ color: `rgb(${C.agenteGuia})` }}>{pct(guiaAgente, guiaHumano)} % guías</span>
        </div>
        {estado && <div className="text-xs text-muted">{estado}</div>}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)] md:gap-2">
        <Etapa Icono={ShoppingCart} titulo="Órdenes" valor={d.ordenes_hoy} color={C.orden}
          sub={`${entero(d.sin_remision)} sin remisión${d.anuladas_hoy ? ` · ${entero(d.anuladas_hoy)} anuladas` : ""}`} />
        <Conector>
          <Carril quien="Agente" n={d.rem_agente} color={C.agenteRem} rapido={paso === "remision"} />
          <Carril quien="Humano" n={d.rem_humano} color={C.humanoRem} />
        </Conector>
        <Etapa Icono={FileText} titulo="Remisiones" valor={rem} color={C.agenteRem} activa={paso === "remision"}
          sub={sinGuia ? `${entero(sinGuia)} esperando guía` : "todas con guía"} />
        <Conector>
          <Carril quien="Agente" n={guiaAgente} color={C.agenteGuia} rapido={paso === "guia"}
            detalle={`${entero(d.guia_aa)} de remisiones del agente · ${entero(d.guia_ha)} de remisiones de humano`} />
          <Carril quien="Humano" n={guiaHumano} color={C.humanoGuia}
            detalle={`${entero(d.guia_ah)} de remisiones del agente · ${entero(d.guia_hh)} de remisiones de humano`} />
        </Conector>
        <Etapa Icono={Truck} titulo="Guías" valor={guias} color={C.agenteGuia} activa={paso === "guia"} sub="listas para despacho" />
      </div>
    </div>
  );
}
