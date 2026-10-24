import { createClient } from "@/lib/supabase/server";
import { leerFiltros, rpcArgs } from "@/lib/filtros";
import { dias, dinero, entero, fechaHora } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { Panel, TablaScroll, Vacio } from "@/components/ui";
import { FlujoDinero } from "./flujo";

type Linea = { cuenta: string; divisa: string; grupo: "ingreso" | "egreso" | "reversion" | "caja"; linea: string; movimientos: number; total: number };
type SinLiq = { cuenta: string; guia: string | null; transportadora: string | null; destino: string; fecha_entrega: string | null; dias: number | null; valor_recaudo: number | null };
type Transp = { cuenta: string; transportadora: string; entregadas: number; recaudo_entregado: number | null; dias_pago: number | null; sin_liquidar: number };

// Orden de las líneas del PyG (docs/reglas-negocio.md §4).
const ORDEN = ["Recaudo de venta", "Indemnizaciones", "Crédito revertido", "Costo de mercancía", "Flete con recaudo", "Flete devolución", "Flete sin recaudo", "Fulfillment", "Otros (4xmil)", "Débito revertido", "Otros", "Retiros"];

export default async function DineroPage({ searchParams }: PageProps<"/dinero">) {
  const f = leerFiltros(await searchParams);
  const supabase = await createClient();
  const [{ data: w, error }, { data: wd }, { data: sl }, { data: tr }] = await Promise.all([
    supabase.rpc("kpi_wallet", rpcArgs(f)),
    supabase.rpc("kpi_wallet_diario", rpcArgs(f)),
    supabase.rpc("kpi_sin_liquidar", rpcArgs(f)),
    supabase.rpc("kpi_transportadoras", rpcArgs(f)),
  ]);
  const lineas = (w ?? []) as Linea[];
  const cuentas = [...new Set(lineas.map((l) => l.cuenta))];
  const sinLiq = (sl ?? []) as SinLiq[];
  const transp = ((tr ?? []) as Transp[]).filter((t) => t.entregadas > 0);

  return (
    <>
      <Encabezado titulo="💰 Wallet y PyG Effi" subtitulo="Movimientos del wallet de Effi por fecha del movimiento. Cada país en su moneda; los retiros van aparte (caja), fuera del PyG." f={f} />
      {error && <p className="text-sm text-red mb-4">{error.message}</p>}
      {!cuentas.length && !error && <div className="card p-6"><Vacio>Sin movimientos de wallet en este periodo.</Vacio></div>}

      <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {cuentas.map((c) => {
          const de = lineas.filter((l) => l.cuenta === c).sort((a, b) => ORDEN.indexOf(a.linea) - ORDEN.indexOf(b.linea));
          const ingresos = de.filter((l) => l.grupo === "ingreso");
          const egresos = de.filter((l) => l.grupo === "egreso");
          const reversiones = de.filter((l) => l.grupo === "reversion");
          const caja = de.filter((l) => l.grupo === "caja");
          const tIng = ingresos.reduce((a, l) => a + Number(l.total), 0);
          const tEgr = egresos.reduce((a, l) => a + Number(l.total), 0);
          const tRev = reversiones.reduce((a, l) => a + Number(l.total), 0);
          const util = tIng + tEgr + tRev;
          const i = infoCuenta(c);
          return (
            <section key={c} className="card p-5">
              <header className="flex items-center justify-between mb-3">
                <h2 className="font-display text-lg font-semibold">{i.bandera} {i.nombre}</h2>
                <span className="text-xs text-muted">PyG Effi · {i.divisa}</span>
              </header>
              <div className="card-glow rounded-xl border border-line p-4 mb-4">
                <div className="text-xs text-muted">Utilidad bruta Effi (antes de publicidad y gastos fijos)</div>
                <div className={`num text-3xl font-semibold mt-1 ${util >= 0 ? "text-green" : "text-red"}`}>{dinero(util, c)}</div>
                <div className="text-xs text-muted mt-1">Margen sobre recaudo: {tIng ? `${((util / tIng) * 100).toFixed(1).replace(".", ",")} %` : "—"}</div>
              </div>
              <Bloque titulo="Ingresos" filas={ingresos} total={tIng} cuenta={c} />
              <Bloque titulo="Egresos" filas={egresos} total={tEgr} cuenta={c} />
              <Bloque titulo="Reversiones (concepto propio)" filas={reversiones} total={tRev} cuenta={c} />
              {caja.length > 0 && <Bloque titulo="Caja (fuera del PyG)" filas={caja} total={caja.reduce((a, l) => a + Number(l.total), 0)} cuenta={c} tenue />}
            </section>
          );
        })}
      </div>

      {(wd?.length ?? 0) > 0 && (
        <Panel titulo="Ingresos vs egresos por día" detalle="Un país a la vez (cada uno en su moneda)" className="mt-3">
          <FlujoDinero filas={wd as { fecha: string; cuenta: string; grupo: string; total: number }[]} cuentas={cuentas} />
        </Panel>
      )}

      <div className="grid xl:grid-cols-[1fr_1.2fr] gap-3 mt-3">
        <Panel titulo="¿Cuánto tarda Effi en pagar?" detalle="Días desde la entrega hasta el recaudo en el wallet, por transportadora">
          {transp.length ? (
            <TablaScroll>
              <thead><tr><th>País</th><th>Transportadora</th><th className="text-right">Entregadas</th><th className="text-right">Recaudo</th><th className="text-right">Días a pagar</th><th className="text-right">Sin liquidar</th></tr></thead>
              <tbody>
                {transp.map((t) => (
                  <tr key={`${t.cuenta}-${t.transportadora}`}>
                    <td>{infoCuenta(t.cuenta).bandera}</td>
                    <td className="font-medium">{t.transportadora}</td>
                    <td className="text-right num">{entero(t.entregadas)}</td>
                    <td className="text-right num">{dinero(t.recaudo_entregado, t.cuenta, true)}</td>
                    <td className="text-right num">{dias(t.dias_pago)}</td>
                    <td className={`text-right num ${t.sin_liquidar ? "text-amber" : "text-muted"}`}>{entero(t.sin_liquidar)}</td>
                  </tr>
                ))}
              </tbody>
            </TablaScroll>
          ) : <Vacio>Sin entregas en el periodo.</Vacio>}
        </Panel>

        <Panel titulo="Guías entregadas sin liquidar" detalle={`Para reclamar a Effi · ${entero(sinLiq.length)} guías entregadas sin recaudo acreditado`}>
          {sinLiq.length ? (
            <div className="max-h-[30rem] overflow-y-auto">
              <TablaScroll>
                <thead><tr><th>País</th><th>Guía</th><th>Transportadora</th><th>Destino</th><th className="text-right">Entregada</th><th className="text-right">Días</th><th className="text-right">Recaudo</th></tr></thead>
                <tbody>
                  {sinLiq.map((s) => (
                    <tr key={`${s.cuenta}-${s.guia}`}>
                      <td>{infoCuenta(s.cuenta).bandera}</td>
                      <td className="font-mono text-xs">{s.guia ?? "—"}</td>
                      <td className="text-muted">{s.transportadora ?? "—"}</td>
                      <td className="text-muted">{s.destino}</td>
                      <td className="text-right text-muted">{fechaHora(s.fecha_entrega)}</td>
                      <td className={`text-right num ${Number(s.dias) > 3 ? "text-red" : "text-amber"}`}>{s.dias == null ? "—" : Number(s.dias).toFixed(0)}</td>
                      <td className="text-right num">{dinero(s.valor_recaudo, s.cuenta)}</td>
                    </tr>
                  ))}
                </tbody>
              </TablaScroll>
            </div>
          ) : <Vacio>Todo liquidado. 👌</Vacio>}
        </Panel>
      </div>
    </>
  );
}

function Bloque({ titulo, filas, total, cuenta, tenue }: { titulo: string; filas: Linea[]; total: number; cuenta: string; tenue?: boolean }) {
  if (!filas.length) return null;
  return (
    <div className={`mt-3 ${tenue ? "opacity-70" : ""}`}>
      <div className="flex justify-between text-xs text-muted border-b border-line pb-1.5 mb-1.5">
        <span>{titulo}</span>
        <span className="num">{dinero(total, cuenta)}</span>
      </div>
      {filas.map((l) => (
        <div key={l.linea} className="flex justify-between items-baseline py-1 text-sm">
          <span>{l.linea} <span className="text-[11px] text-muted">· {entero(l.movimientos)}</span></span>
          <span className={`num ${Number(l.total) < 0 ? "text-text/80" : "text-green"}`}>{dinero(l.total, cuenta)}</span>
        </div>
      ))}
    </div>
  );
}
