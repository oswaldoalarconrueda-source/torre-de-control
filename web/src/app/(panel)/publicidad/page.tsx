import { Fragment } from "react";
import { createClient, exigirSocio } from "@/lib/supabase/server";
import { hoyBogota, leerFiltros, type Filtros } from "@/lib/filtros";
import { diaCorto, entero, haceCuanto, pct } from "@/lib/formato";
import { infoCuenta, ordenCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { GastoPorDia } from "@/components/charts";
import { Kpi, Panel, TablaScroll, Vacio } from "@/components/ui";
import { TablaCuentasAds, type CuentaAds } from "@/components/publicidad-cuentas";
import { Doble, cop, enLocal, portafolio } from "@/components/publicidad-montos";

// 📢 Publicidad: todo el gasto de Meta que tiene la Torre, por país, día, cuenta publicitaria y campaña. Casi todo llega
// por la API (meta-gasto, cada hora, un token por portafolio); lo que no, quedó de los CSV del BM. Meta cobra en COP;
// cada cifra va en pesos arriba y, debajo, en la moneda del país con la tasa del día del gasto (app_trm_dia):
// Guatemala en quetzales, Ecuador en dólares, Costa Rica en colones. Con un solo país sale el detalle por día con las tasas.
// Solo la ven el dueño y los socios (ni empleados ni proveedores).

type PorTienda = { cuenta: string; monto: number; local: number | null; sin_tasa: number; dias: number; ultimo: string; cuentas_ads: number };
type Campana = { campana: string; cuenta_ads: string; cuenta: string; monto: number; local: number | null; dias: number; ultimo: string };
type Dia = { fecha: string; cuenta: string; monto: number; local: number | null; usd_cop: number | null; usd_gtq: number | null; usd_crc: number | null };
type Conexion = {
  portafolios: { portafolio: string; cuentas: number; con_error: number; ultima_sync: string | null }[];
  cuentas_sin_gasto: { nombre: string; portafolio: string | null; estado: number | null; divisa: string | null }[];
  proxima: string;
};
type Resumen = {
  total: number; dias: number; ultimo_dia: string | null; por_tienda: PorTienda[]; por_dia: Dia[];
  por_cuenta_ads: CuentaAds[]; campanas: Campana[]; campanas_total: number; conexion: Conexion | null;
};

const COLOR: Record<string, string> = { CO: "#f5c542", EC: "#2f7bff", GT: "#36c5f0", CR: "#ff5a6a" };

// CPA real por día: gasto de Meta del día ÷ pedidos que entraron a LucidSales ese día (📝 Pedidos Lucid). Solo salen
// los países con pedidos cargados; un día sin pedidos queda en blanco (no es CPA infinito).
function CpaReal({ porDia, pedidos }: { porDia: Dia[]; pedidos: { cuenta: string; fecha: string; pedidos: number }[] }) {
  const cuentas = [...new Set(pedidos.map((p) => p.cuenta))].sort((a, b) => ordenCuenta(a) - ordenCuenta(b));
  if (!cuentas.length) return null;
  const gasto = new Map(porDia.map((d) => [`${d.cuenta}|${d.fecha}`, d]));
  const ped = new Map(pedidos.map((p) => [`${p.cuenta}|${p.fecha}`, p.pedidos]));
  const fechas = [...new Set(pedidos.map((p) => p.fecha))].sort().reverse();
  const tot = (c: string) => fechas.reduce((s, f) => {
    const n = ped.get(`${c}|${f}`); const g = gasto.get(`${c}|${f}`);
    return n ? { pedidos: s.pedidos + n, cop: s.cop + Number(g?.monto ?? 0), local: s.local + Number(g?.local ?? 0) } : s;
  }, { pedidos: 0, cop: 0, local: 0 });
  const celda = (c: string, n: number | undefined, enCop: number, local: number | null) => (
    <>
      <td className="text-right num text-muted"><Doble local={local} enCop={enCop} cuenta={c} /></td>
      <td className="text-right num">{n ? entero(n) : "—"}</td>
      <td className="text-right num">{n ? <Doble local={local == null ? null : local / n} enCop={enCop / n} cuenta={c} fuerte /> : "—"}</td>
    </>
  );
  return (
    <Panel titulo="CPA real por día" detalle="Gasto en Meta del día ÷ pedidos que entraron a LucidSales ese día (los llena la encargada en 📝 Pedidos Lucid)" className="mb-3">
      <TablaScroll>
        <thead>
          <tr>
            <th>Día</th>
            {cuentas.map((c) => <th key={c} colSpan={3} className="text-center">{infoCuenta(c).bandera} {infoCuenta(c).nombre}</th>)}
          </tr>
          <tr>
            <th />
            {cuentas.map((c) => <Fragment key={c}><th className="text-right">Gasto</th><th className="text-right">Pedidos</th><th className="text-right">CPA</th></Fragment>)}
          </tr>
        </thead>
        <tbody>
          <tr className="font-semibold">
            <td>Periodo</td>
            {cuentas.map((c) => { const t = tot(c); return <Fragment key={c}>{celda(c, t.pedidos, t.cop, infoCuenta(c).divisa === "COP" ? null : t.local)}</Fragment>; })}
          </tr>
          {fechas.map((f) => (
            <tr key={f}>
              <td>{diaCorto(f)}</td>
              {cuentas.map((c) => { const g = gasto.get(`${c}|${f}`); return <Fragment key={c}>{celda(c, ped.get(`${c}|${f}`), Number(g?.monto ?? 0), g?.local ?? null)}</Fragment>; })}
            </tr>
          ))}
        </tbody>
      </TablaScroll>
    </Panel>
  );
}
// La publicidad de la sociedad empieza en julio de 2026: lo anterior no es de Joalix AA Group.
const INICIO_PUBLICIDAD = "2026-07-01";

export default async function PublicidadPage({ searchParams }: PageProps<"/publicidad">) {
  await exigirSocio(); // solo dueño y socios
  const sp = await searchParams;
  const base = leerFiltros(sp);
  const lista = typeof sp.c === "string" ? sp.c.split(",").filter((x) => /^[A-Z0-9_]+$/.test(x)) : [];
  const desde = base.desde < INICIO_PUBLICIDAD ? INICIO_PUBLICIDAD : base.desde;
  const f: Filtros = { ...base, desde, hasta: base.hasta < desde ? desde : base.hasta, cuentas: lista.length ? lista : null };
  const hoy = hoyBogota();
  const hasta = f.hasta > hoy ? hoy : f.hasta;

  const supabase = await createClient();
  const [{ data, error }, { data: pedidos }] = await Promise.all([
    supabase.rpc("publicidad_resumen", { p_cuentas: f.cuentas, p_desde: f.desde, p_hasta: hasta }),
    // Pedidos de LucidSales por día (📝 Pedidos Lucid): con el gasto del mismo día dan el CPA real.
    supabase.from("app_pedidos_diarios").select("cuenta,fecha,pedidos").gte("fecha", f.desde).lte("fecha", hasta),
  ]);
  const r = data as Resumen | null;
  const tiendas = [...(r?.por_tienda ?? [])].sort((a, b) => ordenCuenta(a.cuenta) - ordenCuenta(b.cuenta));
  const paises = tiendas.map((t) => ({ cuenta: t.cuenta, nombre: infoCuenta(t.cuenta).nombre, color: COLOR[infoCuenta(t.cuenta).pais] ?? "#8a94a8", divisa: infoCuenta(t.cuenta).divisa }));
  const conGasto = r?.por_dia.length ? new Set(r.por_dia.map((d) => d.fecha)).size : 0;
  const apiTotal = (r?.por_cuenta_ads ?? []).filter((c) => c.por_api).reduce((a, c) => a + Number(c.total), 0);
  // Un solo país en otra moneda: todo se muestra en esa moneda (con la TRM del día) y el COP queda de referencia.
  const unica = tiendas.length === 1 && infoCuenta(tiendas[0].cuenta).divisa !== "COP" ? tiendas[0].cuenta : null;
  const div = unica ? infoCuenta(unica).divisa : "COP";
  const totalLocal = unica ? Number(tiendas[0].local ?? 0) : null;
  // En el detalle por día, con centavos (es lo que se pasa al cuadro de datos).
  const exacto = (v: number | null | undefined) =>
    v == null ? "—" : new Intl.NumberFormat("es-CO", { style: "currency", currency: div, currencyDisplay: div === "USD" ? "symbol" : "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  return (
    <>
      <Encabezado
        titulo="📢 Publicidad"
        subtitulo="Gasto en Meta por país, día, cuenta publicitaria y campaña. Llega solo por la API de Meta cada hora (un token por portafolio); el país de entrega del anuncio decide la tienda. Meta cobra en pesos: cada cifra va en pesos y, debajo, en la moneda del país con la tasa del día del gasto."
        f={f}
        varios
        inicio={INICIO_PUBLICIDAD}
      />
      {error && <p className="text-sm text-red mb-4">{error.message}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Kpi
          etiqueta={unica ? `Gasto total · pesos y ${div}` : "Gasto total (COP)"}
          valor={unica ? <>{cop(r?.total)}<div className="text-base text-blue-2 mt-1">{enLocal(totalLocal, unica)}</div></> : cop(r?.total)}
          nota={`${entero(conGasto)} días con gasto · ${cop(conGasto ? Number(r?.total) / conGasto : 0)}${unica ? ` (${enLocal(conGasto && totalLocal != null ? totalLocal / conGasto : null, unica)})` : ""} por día`}
          acento
        />
        {tiendas.map((t) => (
          <Kpi
            key={t.cuenta}
            etiqueta={`${infoCuenta(t.cuenta).bandera} ${infoCuenta(t.cuenta).nombre}${infoCuenta(t.cuenta).divisa !== "COP" ? ` · ${infoCuenta(t.cuenta).divisa}` : ""}`}
            valor={infoCuenta(t.cuenta).divisa !== "COP" ? <>{cop(t.monto)}<div className="text-base text-blue-2 mt-1">{enLocal(t.local, t.cuenta)}</div></> : cop(t.monto)}
            nota={`${pct(Number(r?.total) ? t.monto / Number(r?.total) : 0)} del total · ${entero(t.cuentas_ads)} cuentas · hasta ${diaCorto(t.ultimo)}${t.sin_tasa ? ` · ${entero(t.sin_tasa)} días sin TRM` : ""}`}
          />
        ))}
      </div>

      <Panel titulo="Gasto por día" detalle={`Por país de entrega${r?.ultimo_dia ? ` · último día con gasto: ${diaCorto(r.ultimo_dia)}` : ""}`} className="mb-3">
        {r?.por_dia.length
          ? <GastoPorDia filas={r.por_dia} paises={paises} />
          : <Vacio>Sin gasto en este periodo.</Vacio>}
      </Panel>

      <CpaReal porDia={r?.por_dia ?? []} pedidos={(pedidos ?? []).filter((p) => !f.cuentas || f.cuentas.includes(p.cuenta as string))
        .map((p) => ({ cuenta: p.cuenta as string, fecha: p.fecha as string, pedidos: Number(p.pedidos) }))} />

      {unica && r?.por_dia.length ? (
        <Panel
          titulo={`Detalle por día en ${div}`}
          detalle={`Gasto de cada día pasado a ${div} con la tasa de ese día: pesos ÷ TRM (pesos por dólar, Banco de la República)${div === "GTQ" ? " × quetzales por dólar (Banguat)" : div === "CRC" ? " × colones por dólar (venta, publicada por Banguat)" : ""}`}
          className="mb-3"
        >
          <TablaScroll>
            <thead>
              <tr>
                <th>Día</th><th className="text-right">Gasto en pesos</th><th className="text-right">TRM (COP por USD)</th>
                {div !== "USD" && <th className="text-right">{div === "GTQ" ? "Q" : "₡"} por USD</th>}
                <th className="text-right">Gasto en {div}</th>
              </tr>
            </thead>
            <tbody>
              {r.por_dia.map((d) => (
                <tr key={d.fecha}>
                  <td>{diaCorto(d.fecha)}</td>
                  <td className="text-right num text-muted">{cop(d.monto)}</td>
                  <td className="text-right num text-muted">{d.usd_cop == null ? "—" : Number(d.usd_cop).toLocaleString("es-CO", { minimumFractionDigits: 2 })}</td>
                  {div !== "USD" && <td className="text-right num text-muted">{(div === "GTQ" ? d.usd_gtq : d.usd_crc) == null ? "—" : Number(div === "GTQ" ? d.usd_gtq : d.usd_crc).toLocaleString("es-CO", { minimumFractionDigits: div === "GTQ" ? 5 : 2 })}</td>}
                  <td className="text-right num font-semibold">{exacto(d.local)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total</td><td className="text-right num">{cop(r.total)}</td><td />{div !== "USD" && <td />}
                <td className="text-right num">{exacto(totalLocal)}</td>
              </tr>
            </tbody>
          </TablaScroll>
        </Panel>
      ) : null}

      {r?.conexion && (
        <Panel
          titulo="Conexión con Meta"
          detalle={`Solo tú ves esto. Se actualiza cada hora (minuto 20) con los últimos 3 días · próxima ${new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" }).format(new Date(r.conexion.proxima))}`}
          className="mb-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {r.conexion.portafolios.map((p) => (
              <div key={p.portafolio} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Portafolio {portafolio(p.portafolio)}</span>
                  <span className={`text-xs ${p.con_error ? "text-red" : "text-green"}`}>{p.con_error ? `${p.con_error} con error` : "● Conectado"}</span>
                </div>
                <div className="text-xs text-muted mt-1">{entero(p.cuentas)} cuentas publicitarias · actualizado {haceCuanto(p.ultima_sync)}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            {pct(Number(r.total) ? apiTotal / Number(r.total) : 0)} del gasto del periodo llegó por la API.
            {r.conexion.cuentas_sin_gasto.length > 0 && (
              <> Cuentas conectadas sin gasto en el periodo: {r.conexion.cuentas_sin_gasto.map((c) => c.nombre).join(", ")}.</>
            )}
          </p>
        </Panel>
      )}

      <Panel titulo="Cuentas publicitarias" detalle={`Gasto del periodo por cuenta y país: en pesos y, debajo, en la moneda de cada país${unica ? "" : " (el total suma países: solo pesos)"}`} className="mb-3">
        {r?.por_cuenta_ads.length ? (
          <TablaCuentasAds filas={r.por_cuenta_ads} tiendas={tiendas.map((t) => t.cuenta)} total={Number(r.total)} unica={unica} />
        ) : <Vacio>Sin gasto en este periodo.</Vacio>}
      </Panel>

      <Panel
        titulo="Campañas"
        detalle={`${entero(r?.campanas_total ?? 0)} campañas con gasto en el periodo${(r?.campanas_total ?? 0) > (r?.campanas.length ?? 0) ? ` · se muestran las ${entero(r?.campanas.length)} de más gasto` : ""}`}
      >
        {r?.campanas.length ? (
          <TablaScroll>
            <thead>
              <tr><th>Campaña</th><th>Cuenta</th><th>País</th><th className="text-right">Gasto</th><th className="text-right">Días</th><th className="text-right">Por día</th><th className="text-right">Último día</th></tr>
            </thead>
            <tbody>
              {r.campanas.map((c) => (
                <tr key={`${c.cuenta_ads}|${c.campana}|${c.cuenta}`}>
                  <td className="max-w-[28rem] truncate" title={c.campana}>{c.campana}</td>
                  <td className="text-muted">{c.cuenta_ads}</td>
                  <td>{infoCuenta(c.cuenta).bandera}</td>
                  <td className="text-right num"><Doble local={c.local} enCop={c.monto} cuenta={c.cuenta} fuerte /></td>
                  <td className="text-right num text-muted">{entero(c.dias)}</td>
                  <td className="text-right num"><Doble local={c.dias && c.local != null ? c.local / c.dias : null} enCop={c.dias ? c.monto / c.dias : 0} cuenta={c.cuenta} /></td>
                  <td className={`text-right ${c.ultimo === r.ultimo_dia ? "text-green" : "text-muted"}`}>{diaCorto(c.ultimo)}</td>
                </tr>
              ))}
            </tbody>
          </TablaScroll>
        ) : <Vacio>Sin campañas con gasto en este periodo.</Vacio>}
      </Panel>
    </>
  );
}
