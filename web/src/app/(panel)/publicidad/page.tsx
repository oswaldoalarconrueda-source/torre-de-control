import { createClient, exigirSocio } from "@/lib/supabase/server";
import { hoyBogota, leerFiltros, type Filtros } from "@/lib/filtros";
import { dinero, diaCorto, entero, haceCuanto, pct } from "@/lib/formato";
import { infoCuenta, ordenCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { GastoPorDia } from "@/components/charts";
import { Kpi, Panel, TablaScroll, Vacio } from "@/components/ui";

// 📢 Publicidad: todo el gasto de Meta que tiene la Torre, por país, día, cuenta publicitaria y campaña. Casi todo llega
// por la API (meta-gasto, cada hora, un token por portafolio); lo que no, quedó de los CSV del BM. Montos en COP.
// Solo la ven el dueño y los socios (ni empleados ni proveedores).

type PorTienda = { cuenta: string; monto: number; dias: number; ultimo: string; cuentas_ads: number };
type CuentaAds = {
  cuenta_ads: string; total: number; por_tienda: Record<string, number>; ultimo: string; portafolio: string | null;
  por_api: boolean; ultima_sync: string | null; error: string | null;
};
type Campana = { campana: string; cuenta_ads: string; cuenta: string; monto: number; dias: number; ultimo: string; ultimo_monto: number | null };
type Conexion = {
  portafolios: { portafolio: string; cuentas: number; con_error: number; ultima_sync: string | null }[];
  cuentas_sin_gasto: { nombre: string; portafolio: string | null; estado: number | null; divisa: string | null }[];
  proxima: string;
};
type Resumen = {
  total: number; dias: number; ultimo_dia: string | null; por_tienda: PorTienda[]; por_dia: { fecha: string; cuenta: string; monto: number }[];
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

  return (
    <>
      <Encabezado
        titulo="📢 Publicidad"
        subtitulo="Gasto en Meta por país, día, cuenta publicitaria y campaña. Llega solo por la API de Meta cada hora (un token por portafolio); el país de entrega del anuncio decide la tienda. Montos en COP."
        f={f}
        varios
        inicio={INICIO_PUBLICIDAD}
      />
      {error && <p className="text-sm text-red mb-4">{error.message}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Kpi
          etiqueta="Gasto total"
          valor={cop(r?.total)}
          nota={`${entero(conGasto)} días con gasto · ${cop(conGasto ? Number(r?.total) / conGasto : 0)} por día`}
          acento
        />
        {tiendas.map((t) => (
          <Kpi
            key={t.cuenta}
            etiqueta={`${infoCuenta(t.cuenta).bandera} ${infoCuenta(t.cuenta).nombre}`}
            valor={cop(t.monto)}
            nota={`${pct(Number(r?.total) ? t.monto / Number(r?.total) : 0)} del total · ${entero(t.cuentas_ads)} cuentas · hasta ${diaCorto(t.ultimo)}`}
          />
        ))}
      </div>

      <Panel titulo="Gasto por día" detalle={`Por país de entrega${r?.ultimo_dia ? ` · último día con gasto: ${diaCorto(r.ultimo_dia)}` : ""}`} className="mb-3">
        {r?.por_dia.length ? <GastoPorDia filas={r.por_dia} paises={paises} /> : <Vacio>Sin gasto en este periodo.</Vacio>}
      </Panel>

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

      <Panel titulo="Cuentas publicitarias" detalle="Gasto del periodo por cuenta y país" className="mb-3">
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
                  {tiendas.map((t) => <td key={t.cuenta} className="text-right num">{c.por_tienda[t.cuenta] ? cop(c.por_tienda[t.cuenta]) : <span className="text-muted">—</span>}</td>)}
                  <td className="text-right num font-semibold">{cop(c.total)}</td>
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
              <tr><th>Campaña</th><th>Cuenta</th><th>País</th><th className="text-right">Gasto</th><th className="text-right">Días</th><th className="text-right">Por día</th><th className="text-right">Último día</th></tr>
            </thead>
            <tbody>
              {r.campanas.map((c) => (
                <tr key={`${c.cuenta_ads}|${c.campana}|${c.cuenta}`}>
                  <td className="max-w-[28rem] truncate" title={c.campana}>{c.campana}</td>
                  <td className="text-muted">{c.cuenta_ads}</td>
                  <td>{infoCuenta(c.cuenta).bandera}</td>
                  <td className="text-right num font-semibold">{cop(c.monto)}</td>
                  <td className="text-right num text-muted">{entero(c.dias)}</td>
                  <td className="text-right num text-muted">{cop(c.dias ? c.monto / c.dias : 0)}</td>
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
