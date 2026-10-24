import { entero } from "@/lib/formato";
import { OBSERVACIONES, type CodigoObs } from "@/lib/oficina";
import { Panel, TablaScroll } from "./ui";

// Estadística del CRM de oficina: por día (lo que llegó, lo que se llamó y en qué terminó), por hora de la
// llamada y por número de intento. Sirve para decidir a qué hora llamar y cuántas veces vale la pena insistir.

type Dia = {
  dia: string; llegaron: number; llamadas: number; guias_llamadas: number; contesto: number; no_contesto: number; telefono_malo: number;
  entregadas: number; devueltas: number; en_oficina: number; llamadas_entregadas: number; llamadas_total: number; sin_llamar_entregadas: number; sin_llamar_total: number;
};
type Grupo = { llamadas: number; contesto: number; entregadas: number; guias: number };
type Obs = { codigo: CodigoObs; guias: number; entregadas: number; devueltas: number; en_oficina: number; con_fecha: number; cumplieron: number };
export type Estadisticas = { dias: Dia[]; horas: (Grupo & { hora: number })[]; intentos: (Grupo & { intento: number })[]; observaciones: Obs[] };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const fecha = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}-${MESES[d.getUTCMonth()]}`; };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export function EstadisticasOficina({ e }: { e: Estadisticas }) {
  const maxHora = Math.max(1, ...e.horas.map((h) => h.llamadas));
  return (
    <div className="space-y-3 mt-6">
      <Panel titulo="Estadística por día" detalle="Guías que llegaron a oficina ese día, cuántos contactos se hicieron y en qué terminaron (estado actual)">
        <TablaScroll>
          <thead>
            <tr>
              <th>Día</th><th className="text-right">Llegaron</th><th className="text-right">Contactos</th><th className="text-right">Guías gestionadas</th>
              <th className="text-right">Contactado</th><th className="text-right">No contesta</th><th className="text-right">No aplica</th>
              <th className="text-right">Entregadas</th><th className="text-right">Devueltas</th><th className="text-right">Siguen en oficina</th>
              <th className="text-right">% entrega gestionadas</th><th className="text-right">% entrega sin gestionar</th>
            </tr>
          </thead>
          <tbody>
            {e.dias.map((d) => (
              <tr key={d.dia}>
                <td className="whitespace-nowrap">{fecha(d.dia)}</td>
                <td className="text-right num">{entero(d.llegaron)}</td>
                <td className="text-right num">{entero(d.llamadas)}</td>
                <td className="text-right num">{entero(d.guias_llamadas)}</td>
                <td className="text-right num text-green">{entero(d.contesto)}</td>
                <td className="text-right num text-red">{entero(d.no_contesto)}</td>
                <td className="text-right num" style={{ color: "#b48cff" }}>{entero(d.telefono_malo)}</td>
                <td className="text-right num text-green">{entero(d.entregadas)}</td>
                <td className="text-right num text-red">{entero(d.devueltas)}</td>
                <td className="text-right num">{entero(d.en_oficina)}</td>
                <td className="text-right num font-semibold">{pct(d.llamadas_entregadas, d.llamadas_total)}</td>
                <td className="text-right num text-muted">{pct(d.sin_llamar_entregadas, d.sin_llamar_total)}</td>
              </tr>
            ))}
          </tbody>
        </TablaScroll>
      </Panel>

      <Panel titulo="¿Qué dicen los clientes?" detalle="Observaciones de los últimos 14 días y en qué terminaron esas guías (estado actual)">
        {e.observaciones?.length ? (
          <TablaScroll>
            <thead>
              <tr>
                <th>Observación</th><th className="text-right">Guías</th><th className="text-right">Entregadas</th><th className="text-right">Devueltas</th>
                <th className="text-right">Siguen en oficina</th><th className="text-right">Cumplieron la fecha</th>
              </tr>
            </thead>
            <tbody>
              {e.observaciones.map((o) => (
                <tr key={o.codigo}>
                  <td>
                    <span className="inline-block size-2 rounded-full mr-2" style={{ background: OBSERVACIONES[o.codigo]?.color }} />
                    {OBSERVACIONES[o.codigo]?.label ?? o.codigo}
                  </td>
                  <td className="text-right num">{entero(o.guias)}</td>
                  <td className="text-right num text-green">{entero(o.entregadas)} <span className="text-muted">· {pct(o.entregadas, o.guias)}</span></td>
                  <td className="text-right num text-red">{entero(o.devueltas)} <span className="text-muted">· {pct(o.devueltas, o.guias)}</span></td>
                  <td className="text-right num">{entero(o.en_oficina)}</td>
                  <td className="text-right num" title="Recogió a más tardar un día después de la fecha que prometió">
                    {o.con_fecha ? <>{entero(o.cumplieron)} de {entero(o.con_fecha)} <span className="text-muted">· {pct(o.cumplieron, o.con_fecha)}</span></> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </TablaScroll>
        ) : <p className="text-sm text-muted">Aún no hay observaciones registradas.</p>}
      </Panel>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel titulo="Mejor hora para contactar" detalle="Contactos por hora local, % contactado y % de esas guías que terminó entregada">
          {e.horas.length ? (
            <div className="space-y-1.5">
              {e.horas.map((h) => (
                <div key={h.hora} className="grid grid-cols-[3.5rem_1fr_4.5rem_4.5rem] items-center gap-2 text-xs">
                  <span className="font-mono text-muted">{String(h.hora).padStart(2, "0")}:00</span>
                  <div className="h-2.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div className="h-full rounded-full bg-blue" style={{ width: `${(h.llamadas / maxHora) * 100}%` }} />
                  </div>
                  <span className="text-right text-green" title="Contactado">{pct(h.contesto, h.llamadas)} ✅</span>
                  <span className="text-right" title="Entregadas">{pct(h.entregadas, h.guias)} 📦</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted">Aún no hay contactos registrados.</p>}
        </Panel>
        <Panel titulo="¿Cuántas veces insistir?" detalle="Resultado de cada llamada: contacto 1, 2 y 3">
          {e.intentos.length ? (
            <TablaScroll>
              <thead><tr><th>Contacto</th><th className="text-right">Contactos</th><th className="text-right">% contactado</th><th className="text-right">% entregadas</th></tr></thead>
              <tbody>
                {e.intentos.map((i) => (
                  <tr key={i.intento}>
                    <td>Contacto {i.intento}</td>
                    <td className="text-right num">{entero(i.llamadas)}</td>
                    <td className="text-right num text-green">{pct(i.contesto, i.llamadas)}</td>
                    <td className="text-right num">{pct(i.entregadas, i.guias)}</td>
                  </tr>
                ))}
              </tbody>
            </TablaScroll>
          ) : <p className="text-sm text-muted">Aún no hay contactos registrados.</p>}
        </Panel>
      </div>
    </div>
  );
}
