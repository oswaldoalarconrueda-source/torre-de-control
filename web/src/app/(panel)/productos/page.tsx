import { createClient, exigirModulo, getUsuario } from "@/lib/supabase/server";
import { esSocio } from "@/lib/modulos";
import { leerFiltros } from "@/lib/filtros";
import { infoCuenta } from "@/lib/paises";
import { kpiUtilidad } from "@/lib/datos";
import { Encabezado } from "@/components/encabezado";
import { Productos, type DatosPais } from "@/components/productos";
import type { ProductoHistorico } from "@/components/asignar-producto";

// 📦 Productos (skill "menu-productos-joalix"): un país a la vez, en su moneda. La publicidad sale de Meta por API y se
// asigna a cada producto por el nombre de la campaña (reglas + homologación manual en /productos/homologar).
const INICIO_PRODUCTOS = "2026-07-01";

export default async function ProductosPage({ searchParams }: PageProps<"/productos">) {
  await exigirModulo("resumen");
  const sp = await searchParams;
  const base = leerFiltros(sp);
  const desde = base.desde < INICIO_PRODUCTOS ? INICIO_PRODUCTOS : base.desde;
  const f = { ...base, desde, hasta: base.hasta < desde ? desde : base.hasta };
  const cuenta = f.cuentas?.[0] ?? "TIENDA_CO";
  const pais = infoCuenta(cuenta);

  const supabase = await createClient();
  const [{ data, error }, { data: u }, { data: hist }, usuario] = await Promise.all([
    supabase.rpc("productos_datos", { p_cuenta: cuenta, p_desde: f.desde, p_hasta: f.hasta }),
    kpiUtilidad(cuenta, f.desde, f.hasta, "ambas"),
    supabase.rpc("prod_productos_historicos", { p_cuenta: cuenta }),
    getUsuario(),
  ]);
  const d = data as Omit<DatosPais, "cuenta" | "wallet"> | null;
  // Utilidad de la wallet antes de gastos fijos: la del PyG de Data Experience sin aplicaciones, administrativo ni operativo.
  const wallet = u ? Number(u.pyg_total) - Number(u.proyeccion?.total ?? 0) - Number(u.publicidad?.total ?? 0) : null;

  return (
    <>
      <Encabezado
        titulo="📦 Productos"
        subtitulo={`${pais.bandera} ${pais.nombre} · ventas, costos, publicidad y utilidad por producto, en ${pais.divisa}. La publicidad se asigna por el nombre de la campaña.`}
        f={f}
        inicio={INICIO_PRODUCTOS}
      />
      {error || !d ? (
        <p className="text-sm text-red">No se pudieron cargar los productos: {error?.message ?? "sin datos"}</p>
      ) : (
        <Productos key={`${cuenta}${f.desde}${f.hasta}`} paises={[{ cuenta, wallet, ...d }]} desde={f.desde} hasta={f.hasta}
          puedeEditar={!!usuario && esSocio(usuario)} productosHist={(hist as ProductoHistorico[] | null) ?? []} />
      )}
    </>
  );
}
