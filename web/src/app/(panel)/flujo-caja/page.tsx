import { createClient, exigirSocio } from "@/lib/supabase/server";
import { hoyBogota, leerFiltros, type Filtros } from "@/lib/filtros";
import { diaCorto, entero } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { AdsVsIngreso } from "@/components/charts";
import { Kpi, Panel, TablaScroll, Vacio } from "@/components/ui";

// 💵 Flujo de Caja (pedido del dueño, 12-nov-2026): por día, lo que se gastó en publicidad frente a lo que entró a la
// wallet de Effi ese día (flujo_caja_diario). Ingreso neto = recaudo de las guías liquidadas menos lo que Effi descuenta
// en la misma liquidación (costo del producto, fletes, devoluciones, fulfillment). Los retiros a la cuenta bancaria no son
// ingreso ni gasto, igual que las transferencias entre wallets: van aparte. Todo en la moneda del país; Meta cobra en pesos y se pasa con la tasa del día del gasto.
// Solo dueño y socios.

type Dia = { cuenta: string; fecha: string; ads: number | null; ads_cop: number | null; recaudo: number; descuentos: number; neto: number; retiros: number; guias: number };

// La publicidad de la sociedad empieza en julio de 2026.
const INICIO = "2026-07-01";

export default async function FlujoCajaPage({ searchParams }: PageProps<"/flujo-caja">) {
  await exigirSocio();
  const sp = await searchParams;
  const base = leerFiltros(sp);
  const desde = base.desde < INICIO ? INICIO : base.desde;
  const f: Filtros = { ...base, desde, hasta: base.hasta < desde ? desde : base.hasta };
  const cuenta = f.cuentas?.[0] ?? "TIENDA_CO";
  const hoy = hoyBogota();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("flujo_caja_diario", { p_cuentas: [cuenta], p_desde: f.desde, p_hasta: f.hasta > hoy ? hoy : f.hasta });
  const dias = ((data ?? []) as Dia[]).map((d) => ({ ...d, ads: Number(d.ads ?? 0), neto: Number(d.neto), recaudo: Number(d.recaudo), descuentos: Number(d.descuentos), retiros: Number(d.retiros) }));
  const div = infoCuenta(cuenta).divisa || "USD";
  const plata = (v: number, signo = false) =>
    `${signo && v > 0 ? "+" : ""}${new Intl.NumberFormat("es-CO", { style: "currency", currency: div, currencyDisplay: div === "USD" ? "symbol" : "narrowSymbol", maximumFractionDigits: div === "COP" ? 0 : 2, minimumFractionDigits: div === "COP" ? 0 : 2 }).format(v)}`;
  const t = dias.reduce((s, d) => ({ ads: s.ads + d.ads, neto: s.neto + d.neto, recaudo: s.recaudo + d.recaudo, descuentos: s.descuentos + d.descuentos, retiros: s.retiros + d.retiros, guias: s.guias + Number(d.guias) }),
    { ads: 0, neto: 0, recaudo: 0, descuentos: 0, retiros: 0, guias: 0 });
  const queda = t.neto - t.ads;
  const color = (v: number) => (v < 0 ? "text-red" : "text-green");

  return (
    <>
      <Encabezado
        titulo="💵 Flujo de Caja"
        subtitulo="Por día: lo que se gastó en publicidad frente a lo que entró a la wallet de Effi. El ingreso neto es el recaudo de las guías liquidadas ese día menos lo que Effi descuenta en la misma liquidación (producto, fletes, devoluciones y fulfillment). Los retiros a tu banco y las transferencias entre wallets van aparte. Todo en la moneda del país; el gasto de Meta se pasa con la tasa del día."
        f={f}
        inicio={INICIO}
      />
      {error && <p className="text-sm text-red mb-4">{error.message}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Kpi etiqueta="Ingreso neto wallet" valor={plata(t.neto)} nota={`${entero(t.guias)} guías liquidadas · recaudo ${plata(t.recaudo)}`} acento />
        <Kpi etiqueta="Gasto en ads" valor={plata(t.ads)} nota="Meta, con la tasa de cada día" />
        <Kpi etiqueta="Queda después de ads" valor={<span className={color(queda)}>{plata(queda, true)}</span>}
          nota={t.ads ? `Por cada 1 que se gasta en ads entran ${(t.neto / t.ads).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Sin gasto en ads"} />
        <Kpi etiqueta="Retiros y traslados" valor={plata(t.retiros, true)} nota="Retiros a tu banco y transferencias entre wallets; no son ingreso ni gasto" />
      </div>

      {dias.length ? (
        <>
          <Panel titulo="Ingreso neto wallet vs. gasto en ads" className="mb-3">
            <AdsVsIngreso filas={dias.map((d) => ({ fecha: d.fecha, neto: Math.round(d.neto * 100) / 100, ads: Math.round(d.ads * 100) / 100 }))} divisa={div} />
          </Panel>
          <Panel titulo="Día por día" detalle="Día según la hora del país. Recaudo y descuentos son de las guías que Effi liquidó ese día.">
            <TablaScroll>
              <thead>
                <tr>
                  <th>Día</th>
                  <th className="text-right">Gasto ads</th>
                  <th className="text-right">Ingreso neto</th>
                  <th className="text-right">Queda</th>
                  <th className="text-right">Recaudo</th>
                  <th className="text-right">Descuentos Effi</th>
                  <th className="text-right">Guías</th>
                  <th className="text-right">Retiros y traslados</th>
                </tr>
              </thead>
              <tbody>
                <tr className="font-semibold">
                  <td>Periodo</td>
                  <td className="text-right num">{plata(t.ads)}</td>
                  <td className="text-right num">{plata(t.neto)}</td>
                  <td className={`text-right num ${color(queda)}`}>{plata(queda, true)}</td>
                  <td className="text-right num">{plata(t.recaudo)}</td>
                  <td className="text-right num text-muted">{plata(t.descuentos)}</td>
                  <td className="text-right num">{entero(t.guias)}</td>
                  <td className="text-right num text-muted">{t.retiros ? plata(t.retiros) : "—"}</td>
                </tr>
                {dias.map((d) => {
                  const q = d.neto - d.ads;
                  return (
                    <tr key={d.fecha}>
                      <td className="whitespace-nowrap">{diaCorto(d.fecha)}</td>
                      <td className="text-right num">{d.ads ? plata(d.ads) : "—"}</td>
                      <td className="text-right num">{plata(d.neto)}</td>
                      <td className={`text-right num ${color(q)}`}>{plata(q, true)}</td>
                      <td className="text-right num">{plata(d.recaudo)}</td>
                      <td className="text-right num text-muted">{plata(d.descuentos)}</td>
                      <td className="text-right num">{entero(d.guias)}</td>
                      <td className="text-right num text-muted">{d.retiros ? plata(d.retiros) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TablaScroll>
          </Panel>
        </>
      ) : (
        <Vacio>Sin movimientos de wallet ni gasto en ads en este periodo.</Vacio>
      )}
    </>
  );
}
