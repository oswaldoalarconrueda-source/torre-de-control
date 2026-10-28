import { entero } from "@/lib/formato";

// 🏭 Fábrica del agente: el camino de hoy orden → remisión → guía, con cada etapa partida en lo que hizo el Agente y lo
// que hizo una persona (Humano). Las bandas son más gruesas cuanto más pasa por ellas y los paquetes corren por cada
// banda (más paquetes, más volumen). Datos de auto_fabrica: quién lo hizo sale de la bitácora del agente.
export type DatosFabrica = {
  ordenes_hoy: number; anuladas_hoy: number; sin_remision: number;
  rem_agente: number; rem_humano: number; sin_guia_agente: number; sin_guia_humano: number;
  guia_aa: number; guia_ah: number; guia_ha: number; guia_hh: number;
};

const C = { agenteRem: "var(--blue-2)", humanoRem: "var(--amber)", agenteGuia: "var(--green)", humanoGuia: "#b48cff" };
const pct = (a: number, b: number) => (a + b ? Math.round((a / (a + b)) * 100) : 0);

// Una banda transportadora entre dos estaciones: base, rodillos que avanzan y paquetes viajando.
function Banda({ id, d, n, total, color, invertir = false }: { id: string; d: string; n: number; total: number; color: string; invertir?: boolean }) {
  const ancho = 6 + (total ? (n / total) * 16 : 0);
  const paquetes = n ? Math.min(7, Math.max(1, Math.ceil(n / 30))) : 0;
  const dur = 4.2;
  return (
    <g>
      <path id={id} d={d} fill="none" stroke={color} strokeOpacity={0.14} strokeWidth={ancho + 10} strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeOpacity={n ? 0.55 : 0.18} strokeWidth={ancho} strokeLinecap="round" />
      {n > 0 && <path d={d} fill="none" stroke="var(--bg)" strokeOpacity={0.55} strokeWidth={Math.max(2, ancho - 4)} strokeDasharray="6 6" className="flujo" />}
      {Array.from({ length: paquetes }, (_, i) => (
        <g key={i}>
          <rect x={-6} y={-6} width={12} height={12} rx={3} fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
            <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(i * dur) / paquetes}s`} rotate="auto" keyPoints={invertir ? "1;0" : "0;1"} keyTimes="0;1" calcMode="linear">
              <mpath href={`#${id}`} />
            </animateMotion>
          </rect>
        </g>
      ))}
    </g>
  );
}

// Estación de trabajo: caja con engranaje girando, título y cantidad.
function Estacion({ x, y, titulo, emoji, valor, sub, color }: { x: number; y: number; titulo: string; emoji: string; valor: number; sub?: string; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-6} y={-6} width={192} height={162} rx={26} fill="none" stroke={color} strokeOpacity={0.35} className="respira" />
      <rect width={180} height={150} rx={22} fill="var(--panel)" stroke={color} strokeOpacity={0.6} strokeWidth={1.5} />
      <g transform="translate(150 30)">
        <circle r={13} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={6} strokeDasharray="4 3" className="gira" />
        <circle r={5} fill={color} fillOpacity={0.6} />
      </g>
      <text x={18} y={36} fontSize={24}>{emoji}</text>
      <text x={18} y={64} fontSize={13} fill="var(--muted)" style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>{titulo}</text>
      <text x={18} y={108} fontSize={38} fontWeight={700} fill="var(--text)" className="num">{entero(valor)}</text>
      {sub && <text x={18} y={134} fontSize={12} fill="var(--muted)">{sub}</text>}
    </g>
  );
}

function Etiqueta({ x, y, color, titulo, valor, detalle }: { x: number; y: number; color: string; titulo: string; valor: number; detalle?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-78} y={-20} width={156} height={detalle ? 52 : 36} rx={12} fill="var(--panel-2)" stroke={color} strokeOpacity={0.5} />
      <text x={0} y={-2} textAnchor="middle" fontSize={12} fill={color} fontWeight={600}>{titulo}</text>
      <text x={0} y={13} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--text)" className="num">{entero(valor)}</text>
      {detalle && <text x={0} y={27} textAnchor="middle" fontSize={10} fill="var(--muted)">{detalle}</text>}
    </g>
  );
}

export function FabricaAgente({ d }: { d: DatosFabrica }) {
  const rem = d.rem_agente + d.rem_humano;
  const guiaAgente = d.guia_aa + d.guia_ha, guiaHumano = d.guia_ah + d.guia_hh, guias = guiaAgente + guiaHumano;
  const sinGuia = d.sin_guia_agente + d.sin_guia_humano;
  return (
    <div className="card p-4 overflow-x-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="font-display text-lg font-semibold">🏭 Fábrica de hoy</h2>
        <div className="text-xs text-muted">
          Hecho por el agente: <b className="text-blue-2">{pct(d.rem_agente, d.rem_humano)} %</b> de las remisiones ·{" "}
          <b className="text-green">{pct(guiaAgente, guiaHumano)} %</b> de las guías
        </div>
      </div>
      <svg viewBox="0 0 1120 420" className="w-full min-w-[900px]" role="img" aria-label="Flujo de hoy: órdenes, remisiones y guías, por agente y por humano">
        {/* Orden → remisión: arriba el agente, abajo una persona. */}
        <Banda id="fab-r-a" d="M 220 170 C 300 70, 400 70, 470 170" n={d.rem_agente} total={rem} color={C.agenteRem} />
        <Banda id="fab-r-h" d="M 220 250 C 300 350, 400 350, 470 250" n={d.rem_humano} total={rem} color={C.humanoRem} />
        {/* Remisión → guía. */}
        <Banda id="fab-g-a" d="M 650 170 C 730 70, 830 70, 900 170" n={guiaAgente} total={guias} color={C.agenteGuia} />
        <Banda id="fab-g-h" d="M 650 250 C 730 350, 830 350, 900 250" n={guiaHumano} total={guias} color={C.humanoGuia} />
        {/* Salida a despacho. */}
        <Banda id="fab-out" d="M 1080 210 L 1112 210" n={guias} total={guias} color={C.agenteGuia} />

        <Estacion x={40} y={135} titulo="Órdenes" emoji="🧾" valor={d.ordenes_hoy}
          sub={`${entero(d.sin_remision)} sin remisión${d.anuladas_hoy ? ` · ${entero(d.anuladas_hoy)} anuladas` : ""}`} color="var(--cyan)" />
        <Estacion x={470} y={135} titulo="Remisiones" emoji="📄" valor={rem} sub={sinGuia ? `${entero(sinGuia)} esperando guía` : "todas con guía"} color={C.agenteRem} />
        <Estacion x={900} y={135} titulo="Guías" emoji="🚚" valor={guias} sub="listas para despacho" color={C.agenteGuia} />

        <Etiqueta x={345} y={62} color={C.agenteRem} titulo="🤖 Agente" valor={d.rem_agente} />
        <Etiqueta x={345} y={360} color={C.humanoRem} titulo="👤 Humano" valor={d.rem_humano} />
        <Etiqueta x={775} y={56} color={C.agenteGuia} titulo="🤖 Agente" valor={guiaAgente}
          detalle={`${entero(d.guia_aa)} de remisión del agente · ${entero(d.guia_ha)} de humano`} />
        <Etiqueta x={775} y={358} color={C.humanoGuia} titulo="👤 Humano" valor={guiaHumano}
          detalle={`${entero(d.guia_ah)} de remisión del agente · ${entero(d.guia_hh)} de humano`} />
      </svg>
      <p className="text-[11px] text-muted mt-1">
        Agente = lo creó el agente en Effi (solo, con “Ejecutar ahora” o con “Ejecutar”). Humano = lo hizo una persona directo en Effi.
        Cada guía dice además quién hizo su remisión.
      </p>
    </div>
  );
}
