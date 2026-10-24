import { createClient } from "@/lib/supabase/server";
import { leerFiltros, rpcArgs } from "@/lib/filtros";
import { entero, pct } from "@/lib/formato";
import { infoCuenta, type Semaforo } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { Barra, Chip, Kpi, Panel, TablaScroll, Vacio } from "@/components/ui";

type Fila = { cuenta: string; novedad: string; transportadora: string; guias: number; recuperadas: number; devueltas: number; abiertas: number };

const agrupar = (filas: Fila[], clave: (f: Fila) => string) => {
  const m = new Map<string, { k: string; cuenta: string; guias: number; recuperadas: number; devueltas: number; abiertas: number }>();
  for (const f of filas) {
    const k = clave(f);
    const o = m.get(k) ?? { k, cuenta: f.cuenta, guias: 0, recuperadas: 0, devueltas: 0, abiertas: 0 };
    o.guias += Number(f.guias);
    o.recuperadas += Number(f.recuperadas);
    o.devueltas += Number(f.devueltas);
    o.abiertas += Number(f.abiertas);
    m.set(k, o);
  }
  return [...m.values()].sort((a, b) => b.guias - a.guias);
};

// Recuperación por transportadora: verde ≥ 30 %, amarillo ≥ 15 % (skill effi-dashboard).
const semRecuperacion = (v: number | null): Semaforo => (v == null ? "nada" : v >= 0.3 ? "verde" : v >= 0.15 ? "naranja" : "rojo");

export default async function NovedadesPage({ searchParams }: PageProps<"/novedades">) {
  const f = leerFiltros(await searchParams);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_novedades", rpcArgs(f));
  const filas = (data ?? []) as Fila[];
  const total = filas.reduce((a, r) => a + Number(r.guias), 0);
  const rec = filas.reduce((a, r) => a + Number(r.recuperadas), 0);
  const dev = filas.reduce((a, r) => a + Number(r.devueltas), 0);
  const abiertas = filas.reduce((a, r) => a + Number(r.abiertas), 0);
  const porTipo = agrupar(filas, (r) => r.novedad);
  const porTransp = agrupar(filas, (r) => `${r.cuenta}|${r.transportadora}`);

  return (
    <>
      <Encabezado titulo="⚠️ Novedades" subtitulo="Novedades que requieren solución de la tienda, creadas en el periodo. Recuperada = la guía terminó entregada." f={f} />
      {error && <p className="text-sm text-red mb-4">{error.message}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi acento etiqueta="Guías con novedad" valor={entero(total)} />
        <Kpi etiqueta="Recuperadas" valor={entero(rec)} nota={`${pct(total ? rec / total : null)} de recuperación`} semaforo={semRecuperacion(total ? rec / total : null)} />
        <Kpi etiqueta="Terminaron en devolución" valor={entero(dev)} nota={pct(total ? dev / total : null)} />
        <Kpi etiqueta="Aún abiertas" valor={entero(abiertas)} nota="por gestionar o en camino" />
      </div>

      <div className="grid xl:grid-cols-2 gap-3 mt-3">
        <Panel titulo="Por tipo de novedad" detalle="Ordenado por número de guías">
          {porTipo.length ? (
            <TablaScroll>
              <thead><tr><th>Novedad</th><th className="text-right">Guías</th><th>Peso</th><th className="text-right">Recuperadas</th><th className="text-right">Devueltas</th><th className="text-right">% recup.</th></tr></thead>
              <tbody>
                {porTipo.slice(0, 30).map((t) => {
                  const r = t.guias ? t.recuperadas / t.guias : null;
                  return (
                    <tr key={t.k}>
                      <td className="max-w-[18rem] truncate" title={t.k}>{t.k}</td>
                      <td className="text-right num">{entero(t.guias)}</td>
                      <td><Barra valor={t.guias / (porTipo[0]?.guias || 1)} /></td>
                      <td className="text-right num">{entero(t.recuperadas)}</td>
                      <td className="text-right num">{entero(t.devueltas)}</td>
                      <td className="text-right"><Chip s={semRecuperacion(r)}>{pct(r)}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </TablaScroll>
          ) : <Vacio>Sin novedades en este periodo (o aún se están cargando).</Vacio>}
        </Panel>

        <Panel titulo="Por transportadora" detalle="Recuperación: verde ≥ 30 %, amarillo ≥ 15 %">
          {porTransp.length ? (
            <TablaScroll>
              <thead><tr><th>País</th><th>Transportadora</th><th className="text-right">Guías</th><th className="text-right">Recuperadas</th><th className="text-right">Devueltas</th><th className="text-right">Abiertas</th><th className="text-right">% recup.</th></tr></thead>
              <tbody>
                {porTransp.map((t) => {
                  const r = t.guias ? t.recuperadas / t.guias : null;
                  return (
                    <tr key={t.k}>
                      <td>{infoCuenta(t.cuenta).bandera}</td>
                      <td className="font-medium">{t.k.split("|")[1]}</td>
                      <td className="text-right num">{entero(t.guias)}</td>
                      <td className="text-right num">{entero(t.recuperadas)}</td>
                      <td className="text-right num">{entero(t.devueltas)}</td>
                      <td className="text-right num text-muted">{entero(t.abiertas)}</td>
                      <td className="text-right"><Chip s={semRecuperacion(r)}>{pct(r)}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </TablaScroll>
          ) : <Vacio>Sin datos.</Vacio>}
        </Panel>
      </div>
    </>
  );
}
