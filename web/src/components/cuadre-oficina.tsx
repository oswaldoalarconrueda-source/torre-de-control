import { entero } from "@/lib/formato";
import { Panel, TablaScroll } from "./ui";

// Disponible en oficina como inventario: cuadre del día (inicio + llegaron − salidas = cierre). "Entregadas" =
// el cliente la recogió en la oficina (pasó a Entregada) y, por día de
// llegada, en qué terminaron esas guías, separando las contactadas de las que no. Datos de oficina_cuadre.

type DiaCuadre = { dia: string; inicio: number; llegaron: number; retiradas: number; devolucion: number; otro: number; cierre: number };
type DiaLlegada = {
  dia: string; llegaron: number; retiradas: number; devueltas: number; en_oficina: number; otro: number;
  contactadas: number; contactadas_retiradas: number; sin_contactar: number; sin_contactar_retiradas: number;
};
export type Cuadre = { cuadre: DiaCuadre[]; llegadas: DiaLlegada[] };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const fecha = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}-${MESES[d.getUTCMonth()]}`; };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

// Franja de arriba: cómo cuadra hoy la oficina.
export function CuadreHoy({ c }: { c: Cuadre }) {
  const h = c.cuadre[0];
  if (!h) return null;
  const salieron = h.retiradas + h.devolucion + h.otro;
  const pasos = [
    { titulo: "Al empezar el día", valor: h.inicio, color: "var(--muted)", op: "" },
    { titulo: "Llegaron", valor: h.llegaron, color: "var(--blue-2)", op: "+" },
    { titulo: "Entregadas", valor: h.retiradas, color: "var(--green)", op: "−", ayuda: "El cliente la recogió: pasó de oficina a Entregada" },
    { titulo: "A devolución", valor: h.devolucion, color: "var(--red)", op: "−", ayuda: "Pasaron de oficina a Devolución" },
    { titulo: "Volvieron a tránsito", valor: h.otro, color: "var(--amber)", op: "−", ayuda: "Salieron de oficina a otro estado; casi siempre van camino a devolución" },
    { titulo: "En oficina ahora", valor: h.cierre, color: "var(--text)", op: "=" },
  ];
  return (
    <div className="card p-4 mb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <span className="font-display font-semibold">Hoy en la oficina</span>
        <span className="text-xs text-muted">
          Salieron {entero(salieron)} · {pct(h.retiradas, salieron)} entregadas
        </span>
      </div>
      <div className="flex flex-wrap items-stretch gap-2">
        {pasos.map((p) => (
          <div key={p.titulo} className="flex items-center gap-2 flex-1 min-w-[8.5rem]">
            {p.op && <span className="text-lg text-muted font-mono">{p.op}</span>}
            <div className={`flex-1 rounded-xl px-3 py-2.5 ${p.op === "=" ? "border border-line bg-white/[0.04]" : "bg-white/[0.02]"}`} title={p.ayuda}>
              <div className="text-[11px] uppercase tracking-wider font-mono text-muted whitespace-nowrap">{p.titulo}</div>
              <div className="num text-2xl font-semibold mt-0.5" style={{ color: p.color }}>{entero(p.valor)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tablas de abajo: cuadre de los últimos días y resultado por día de llegada (con el efecto del contacto).
export function CuadreTablas({ c }: { c: Cuadre }) {
  return (
    <div className="space-y-3 mt-6">
      <Panel titulo="Cuadre diario de la oficina" detalle="Inicio + llegaron − entregadas − a devolución − volvieron a tránsito = cierre. Según la hora en que Effi marcó cada cambio de estado.">
        <TablaScroll>
          <thead>
            <tr>
              <th>Día</th><th className="text-right">Inicio</th><th className="text-right">Llegaron</th>
              <th className="text-right">Entregadas</th><th className="text-right">A devolución</th><th className="text-right">Volvieron a tránsito</th>
              <th className="text-right">Cierre</th><th className="text-right">Cambio</th><th className="text-right">% entregadas de lo que salió</th>
            </tr>
          </thead>
          <tbody>
            {c.cuadre.map((d) => {
              const sal = d.retiradas + d.devolucion + d.otro, cambio = d.cierre - d.inicio;
              return (
                <tr key={d.dia}>
                  <td className="whitespace-nowrap">{fecha(d.dia)}</td>
                  <td className="text-right num text-muted">{entero(d.inicio)}</td>
                  <td className="text-right num text-blue-2">+{entero(d.llegaron)}</td>
                  <td className="text-right num text-green">−{entero(d.retiradas)}</td>
                  <td className="text-right num text-red">−{entero(d.devolucion)}</td>
                  <td className="text-right num text-amber">−{entero(d.otro)}</td>
                  <td className="text-right num font-semibold">{entero(d.cierre)}</td>
                  <td className={`text-right num text-xs ${cambio > 0 ? "text-amber" : "text-green"}`}>{cambio > 0 ? "▲ +" : cambio < 0 ? "▼ −" : ""}{cambio ? entero(Math.abs(cambio)) : "="}</td>
                  <td className="text-right num font-semibold">{pct(d.retiradas, sal)}</td>
                </tr>
              );
            })}
          </tbody>
        </TablaScroll>
        <p className="text-[11px] text-muted mt-2">▲ la oficina se está llenando (llegan más de las que salen); ▼ se está vaciando.</p>
      </Panel>

      <Panel titulo="Resultado por día de llegada" detalle="De las guías que llegaron a oficina cada día, en qué están hoy. Contactada = al menos un contacto marcado “Contactado” en este CRM.">
        <TablaScroll>
          <thead>
            <tr>
              <th>Llegaron el</th><th className="text-right">Guías</th><th className="text-right">Entregadas</th><th className="text-right">Devueltas</th>
              <th className="text-right">Volvieron a tránsito</th><th className="text-right">Siguen en oficina</th><th className="text-right">% entrega</th>
              <th className="text-right">Contactadas · % entrega</th><th className="text-right">Sin contactar · % entrega</th>
            </tr>
          </thead>
          <tbody>
            {c.llegadas.map((d) => {
              return (
                <tr key={d.dia}>
                  <td className="whitespace-nowrap">{fecha(d.dia)}</td>
                  <td className="text-right num font-semibold">{entero(d.llegaron)}</td>
                  <td className="text-right num text-green">{entero(d.retiradas)}</td>
                  <td className="text-right num text-red">{entero(d.devueltas)}</td>
                  <td className="text-right num text-amber">{entero(d.otro)}</td>
                  <td className="text-right num">{entero(d.en_oficina)}</td>
                  <td className="text-right num font-semibold">{pct(d.retiradas, d.llegaron)}</td>
                  <td className="text-right num">{d.contactadas ? <>{entero(d.contactadas)} · <span className="font-semibold text-green">{pct(d.contactadas_retiradas, d.contactadas)}</span></> : <span className="text-muted">—</span>}</td>
                  <td className="text-right num">{entero(d.sin_contactar)} · <span className="text-muted">{pct(d.sin_contactar_retiradas, d.sin_contactar)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </TablaScroll>
        <p className="text-[11px] text-muted mt-2">Las columnas de contactadas se llenan a medida que el equipo marca los contactos en esta pantalla. Comparando “Contactadas” contra “Sin contactar” se ve cuánto sube la entrega por llamar.</p>
      </Panel>
    </div>
  );
}
