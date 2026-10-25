import { createClient, exigirModulo } from "@/lib/supabase/server";
import { hoyBogota, leerFiltros, mismoDiaMesAnterior, type Filtros } from "@/lib/filtros";
import { Encabezado } from "@/components/encabezado";
import { SelectorPlataforma, leerPlataforma } from "@/components/selector-plataforma";
import { GlobalVista, type DatosGlobal, type FilaMes } from "@/components/global-vista";

// 🌎 Global, como en el Dashboard Joalix: todos los países (o los que elijas) juntos para el mismo calendario.
// Es la única pantalla que suma países: las cantidades se suman tal cual y los montos tras pasarlos a una moneda.
export default async function GlobalPage({ searchParams }: PageProps<"/global">) {
  await exigirModulo("global");
  const sp = await searchParams;
  const base = leerFiltros(sp);
  const lista = typeof sp.c === "string" ? sp.c.split(",").filter((x) => /^[A-Z0-9_]+$/.test(x)) : [];
  const f: Filtros = { ...base, cuentas: lista.length ? lista : null };
  const plataforma = leerPlataforma(sp);
  const hoy = hoyBogota();
  const hasta = f.hasta > hoy ? hoy : f.hasta;
  const antDesde = mismoDiaMesAnterior(f.desde), antHasta = mismoDiaMesAnterior(hasta);

  const supabase = await createClient();
  const [{ data: act, error }, { data: ant }, { data: meses }, { data: tiendas }] = await Promise.all([
    supabase.rpc("kpi_global", { p_cuentas: f.cuentas, p_desde: f.desde, p_hasta: hasta, p_plataforma: plataforma }),
    supabase.rpc("kpi_global", { p_cuentas: f.cuentas, p_desde: antDesde, p_hasta: antHasta, p_plataforma: plataforma }),
    supabase.rpc("kpi_global_meses", { p_cuentas: f.cuentas, p_plataforma: plataforma, p_dia: Number(hoy.slice(8, 10)) }),
    supabase.from("effi_accounts").select("slug").eq("activa", true).eq("tipo", "tienda"),
  ]);
  const orden = ["TIENDA_CO", "TIENDA_EC", "TIENDA_GT", "TIENDA_CR"];
  const visibles = (tiendas ?? []).map((t) => t.slug as string).sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
  const cuentas = f.cuentas ? visibles.filter((c) => f.cuentas!.includes(c)) : visibles;

  return (
    <>
      <Encabezado
        titulo="🌎 Global"
        subtitulo={`${cuentas.length === 1 ? "1 país" : `${cuentas.length} países`} combinados · las cantidades se suman tal cual y los montos se pasan a una sola moneda con la TRM del mes.`}
        f={f}
        varios
      />
      <div className="mb-3 flex justify-end"><SelectorPlataforma sp={sp} actual={plataforma} /></div>
      {error && <p className="text-sm text-red mb-4">{error.message}</p>}
      {act && (
        <GlobalVista
          key={`${cuentas.join(",")}|${f.desde}|${hasta}|${plataforma}`}
          cuentas={cuentas} desde={f.desde} hasta={hasta} antDesde={antDesde} antHasta={antHasta}
          actual={act as DatosGlobal} anterior={(ant ?? { filas: [], primer_dia: {}, trm: [] }) as DatosGlobal}
          meses={(meses ?? []) as FilaMes[]} hoy={hoy}
        />
      )}
    </>
  );
}
