import { createClient, exigirSocio } from "@/lib/supabase/server";
import { hoyBogota, leerFiltros, type Filtros } from "@/lib/filtros";
import { dinero, diaCorto, entero, haceCuanto, pct } from "@/lib/formato";
import { infoCuenta, ordenCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { GastoPorDia } from "@/components/charts";
import { Kpi, Panel, TablaScroll, Vacio } from "@/components/ui";

// 📢 Publicidad: todo el gasto de Meta que tiene la Torre, por país, día, cuenta publicitaria y campaña. Casi todo llega
// por la API (meta-gasto, cada hora, un token por portafolio); lo que no, quedó de los CSV del BM. Meta cobra en COP;
// cada cifra viene también en la moneda del país con la TRM del día del gasto (app_trm_dia). Con un solo país elegido
// todo se muestra en su moneda (Guatemala en quetzales, Ecuador en dólares) y sale el detalle por día con las tasas.
// Solo la ven el dueño y los socios (ni empleados ni proveedores).

type PorTienda = { cuenta: string; monto: number; local: number | null; sin_tasa: number; dias: number; ultimo: string; cuentas_ads: number };
type CuentaAds = {
  cuenta_ads: string; total: number; por_tienda: Record<string, number>; por_tienda_local: Record<string, number | null>; ultimo: string; portafolio: string | null;
  por_api: boolean; ultima_sync: string | null; error: string | null;
};
type Campana = { campana: string; cuenta_ads: string; cuenta: string; monto: number; local: number | null; dias: number; ultimo: string };
type Dia = { fecha: string; cuenta: string; monto: number; local: number | null; usd_cop: number | null; usd_gtq: number | null };
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
const cop = (v: unknown, compacto = false) => dinero(v, "TIENDA_CO", compacto);
// "meta_access_token_joaquin" → "Joaquin"; el primero (sin sufijo) es el portafolio Compras FACIL.
const portafolio = (t: string | null) => {
  if (!t) return "—";
  const s = t.replace(/^meta_access_token_?/, "");
  return s ? s[0].toUpperCase() + s.slice(1) : "Compras FACIL";
};
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
  const { data, error } = await supabase.rpc("publicidad_resumen", { p_cuentas: f.cuentas, p_desde: f.desde, p_hasta: hasta });
  const r = data as Resumen | null;
  const tiendas = [...(r?.por_tienda ?? [])].sort((a, b) => ordenCuenta(a.cuenta) - ordenCuenta(b.cuenta));
  const paises = tiendas.map((t) => ({ cuenta: t.cuenta, nombre: infoCuenta(t.cuenta).nombre, color: COLOR[infoCuenta(t.cuenta).pais] ?? "#8a94a8" }));
  const conGasto = r?.por_dia.length ? new Set(r.por_dia.map((d) => d.fecha)).size : 0;
  const apiTotal = (r?.por_cuenta_ads ?? []).filter((c) => c.por_api).reduce((a, c) => a + Number(c.total), 0);
  // Un solo país en otra moneda: todo se muestra en esa moneda (con la TRM del día) y el COP queda de referencia.
  const unica = tiendas.length === 1 && infoCuenta(tiendas[0].cuenta).divisa !== "COP" ? tiendas[0].cuenta : null;
  const div = unica ? infoCuenta(unica).divisa : "COP";
  const $ = (local: number | null | undefined, enCop: number | null | undefined) => (unica ? dinero(local, unica) : cop(enCop));
  const totalLocal = unica ? Number(tiendas[0].local ?? 0) : null;
  const sumaLocal = (o: Record<string, number | null>) => Object.values(o).reduce<number>((a, v) => a + Number(v ?? 0), 0);
  // En el detalle por día, con centavos (es lo que se pasa al cuadro de datos).
  const exacto = (v: number | null | undefined) =>
    v == null ? "—" : new Intl.NumberFormat("es-CO", { style: "currency", currency: div, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  return (
    <>
      <Encabezado
        titulo="📢 Publicidad"
        subtitulo="Gasto en Meta por país, día, cuenta publicitaria y campaña. Llega solo por la API de Meta cada hora (un token por portafolio); el país de entrega del anuncio decide la tienda. Meta cobra en COP; al elegir un solo país se ve en su moneda con la TRM de cada día."
        f={f}
        varios
        inicio={INICIO_PUBLICIDAD}
      />
      {error && <p className="text-sm text-red mb-4">{error.message}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Kpi
          etiqueta={unica ? `Gasto total en ${div}` : "Gasto total (COP)"}
          valor={$(totalLocal, r?.total)}
          nota={`${entero(conGasto)} días con gasto · ${$(conGasto && totalLocal != null ? totalLocal / conGasto : null, conGasto ? Number(r?.total) / conGasto : 0)} por día${unica ? ` · ${cop(r?.total)} en pesos` : ""}`}
          acento
        />
        {tiendas.map((t) => (
          <Kpi
            key={t.cuenta}
            etiqueta={`${infoCuenta(t.cuenta).bandera} ${infoCuenta(t.cuenta).nombre}${infoCuenta(t.cuenta).divisa !== "COP" ? ` · ${infoCuenta(t.cuenta).divisa}` : ""}`}
            valor={t.local != null ? dinero(t.local, t.cuenta) : cop(t.monto)}
            nota={`${infoCuenta(t.cuenta).divisa !== "COP" ? `${cop(t.monto)} · ` : ""}${pct(Number(r?.total) ? t.monto / Number(r?.total) : 0)} del total · ${entero(t.cuentas_ads)} cuentas · hasta ${diaCorto(t.ultimo)}${t.sin_tasa ? ` · ${entero(t.sin_tasa)} días sin TRM` : ""}`}
          />
        ))}
      </div>

      <Panel titulo="Gasto por día" detalle={`Por país de entrega${r?.ultimo_dia ? ` · último día con gasto: ${diaCorto(r.ultimo_dia)}` : ""}`} className="mb-3">
        {r?.por_dia.length
          ? <GastoPorDia filas={unica ? r.por_dia.map((d) => ({ ...d, monto: Number(d.local ?? 0) })) : r.por_dia} paises={paises} divisa={div} />
          : <Vacio>Sin gasto en este periodo.</Vacio>}
      </Panel>

      {unica && r?.por_dia.length ? (
        <Panel
          titulo={`Detalle por día en ${div}`}
          detalle={`Gasto de cada día pasado a ${div} con la TRM de ese día: pesos ÷ TRM (pesos por dólar, Banco de la República)${div === "GTQ" ? " × quetzales por dólar (Banguat)" : ""}`}
          className="mb-3"
        >
          <TablaScroll>
            <thead>
              <tr>
                <th>Día</th><th className="text-right">Gasto en pesos</th><th className="text-right">TRM (COP por USD)</th>
                {div === "GTQ" && <th className="text-right">Q por USD</th>}
                <th className="text-right">Gasto en {div}</th>
              </tr>
            </thead>
            <tbody>
              {r.por_dia.map((d) => (
                <tr key={d.fecha}>
                  <td>{diaCorto(d.fecha)}</td>
                  <td className="text-right num text-muted">{cop(d.monto)}</td>
                  <td className="text-right num text-muted">{d.usd_cop == null ? "—" : Number(d.usd_cop).toLocaleString("es-CO", { minimumFractionDigits: 2 })}</td>
                  {div === "GTQ" && <td className="text-right num text-muted">{d.usd_gtq == null ? "—" : Number(d.usd_gtq).toLocaleString("es-CO", { minimumFractionDigits: 5 })}</td>}
                  <td className="text-right num font-semibold">{exacto(d.local)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total</td><td className="text-right num">{cop(r.total)}</td><td />{div === "GTQ" && <td />}
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

      <Panel titulo="Cuentas publicitarias" detalle={`Gasto del periodo por cuenta y país${unica ? ` en ${div}` : " en pesos"}`} className="mb-3">
        {r?.por_cuenta_ads.length ? (
          <TablaScroll>
            <thead>
              <tr>
                <th>Cuenta</th><th>Origen</th>
                {tiendas.map((t) => <th key={t.cuenta} className="text-right">{infoCuenta(t.cuenta).bandera} {infoCuenta(t.cuenta).nombre}</th>)}
                <th className="text-right">Total</th><th className="text-right">% del total</th><th className="text-right">Último día</th>
              </tr>
            </thead>
            <tbody>
              {r.por_cuenta_ads.map((c) => (
                <tr key={c.cuenta_ads}>
                  <td className="font-medium">{c.cuenta_ads}</td>
                  <td className="text-xs">
                    {c.por_api
                      ? <span className={c.error ? "text-red" : "text-green"} title={c.error ?? undefined}>API · {portafolio(c.portafolio)}{c.error ? " · error" : ""}</span>
                      : <span className="text-amber">Archivo (sin API)</span>}
                  </td>
                  {tiendas.map((t) => <td key={t.cuenta} className="text-right num">{c.por_tienda[t.cuenta] ? $(c.por_tienda_local[t.cuenta], c.por_tienda[t.cuenta]) : <span className="text-muted">—</span>}</td>)}
                  <td className="text-right num font-semibold">{$(sumaLocal(c.por_tienda_local), c.total)}</td>
                  <td className="text-right num text-muted">{pct(Number(r.total) ? c.total / Number(r.total) : 0)}</td>
                  <td className="text-right text-muted">{diaCorto(c.ultimo)}</td>
                </tr>
              ))}
            </tbody>
          </TablaScroll>
        ) : <Vacio>Sin gasto en este periodo.</Vacio>}
      </Panel>

      <Panel
        titulo="Campañas"
        detalle={`${entero(r?.campanas_total ?? 0)} campañas con gasto en el periodo${(r?.campanas_total ?? 0) > (r?.campanas.length ?? 0) ? ` · se muestran las ${entero(r?.campanas.length)} de más gasto` : ""}`}
      >
        {r?.campanas.length ? (
          <TablaScroll>
            <thead>
              <tr><th>Campaña</th><th>Cuenta</th><th>País</th><th className="text-right">Gasto{unica ? ` (${div})` : " (COP)"}</th><th className="text-right">Días</th><th className="text-right">Por día</th><th className="text-right">Último día</th></tr>
            </thead>
            <tbody>
              {r.campanas.map((c) => (
                <tr key={`${c.cuenta_ads}|${c.campana}|${c.cuenta}`}>
                  <td className="max-w-[28rem] truncate" title={c.campana}>{c.campana}</td>
                  <td className="text-muted">{c.cuenta_ads}</td>
                  <td>{infoCuenta(c.cuenta).bandera}</td>
                  <td className="text-right num font-semibold">{$(c.local, c.monto)}</td>
                  <td className="text-right num text-muted">{entero(c.dias)}</td>
                  <td className="text-right num text-muted">{$(c.dias && c.local != null ? c.local / c.dias : null, c.dias ? c.monto / c.dias : 0)}</td>
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
