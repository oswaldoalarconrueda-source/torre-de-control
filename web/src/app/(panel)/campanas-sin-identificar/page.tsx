import { createClient, exigirModulo } from "@/lib/supabase/server";
import { tieneModulo } from "@/lib/modulos";
import { leerFiltros } from "@/lib/filtros";
import { infoCuenta, ordenCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { HomologarCampanas, type CampanaHomologar } from "@/components/homologar-campanas";
import type { ProductoHistorico } from "@/components/asignar-producto";

// 🏷️ Campañas sin identificar (pedido del dueño, 23-nov-2026): submenú de Productos pero con su propio permiso ('campanas'),
// para dárselo a un empleado que diga de qué producto es cada campaña de Meta que las reglas no reconocen. Solo el
// calendario, las campañas del periodo y las sugerencias por nombre; Productos sigue igual.
export default async function CampanasSinIdentificarPage({ searchParams }: PageProps<"/campanas-sin-identificar">) {
  const u = await exigirModulo("campanas");
  const sp = await searchParams;
  const base = leerFiltros(sp);
  const desde = base.desde < "2026-07-01" ? "2026-07-01" : base.desde;
  const f = { ...base, desde, hasta: base.hasta < desde ? desde : base.hasta };
  const supabase = await createClient();
  // Solo los países donde la persona tiene este permiso (el dueño: los de la sociedad que está viendo).
  const { data: vis } = await supabase.rpc("app_cuentas_visibles", { p_modulo: "campanas" });
  const permitidas = ((vis as string[] | null) ?? []).sort((a, b) => ordenCuenta(a) - ordenCuenta(b));
  const pedida = f.cuentas?.[0];
  const cuenta = pedida && permitidas.includes(pedida) ? pedida : permitidas.includes("TIENDA_CO") ? "TIENDA_CO" : permitidas[0] ?? "TIENDA_CO";
  const pais = infoCuenta(cuenta);
  const [{ data, error }, { data: hist }] = await Promise.all([
    supabase.rpc("prod_campanas", { p_cuenta: cuenta, p_desde: f.desde, p_hasta: f.hasta }),
    supabase.rpc("prod_productos_historicos", { p_cuenta: cuenta }),
  ]);
  const d = data as { campanas: CampanaHomologar[]; productos: string[] } | null;
  // Lo que la tienda ha vendido en toda su historia (más vendido primero); si algo falla, los nombres de las reglas.
  const vendidos = (hist as ProductoHistorico[] | null)?.length ? (hist as ProductoHistorico[]) : (d?.productos ?? []).map((producto) => ({ producto, guias: 0 }));
  // «Testeo» siempre disponible (de primera): campañas de prueba que no son de un producto vendido.
  const productos = [{ producto: "Testeo", guias: 0 }, ...vendidos.filter((p) => p.producto.trim().toLowerCase() !== "testeo")];

  return (
    <>
      <Encabezado
        titulo="🏷️ Campañas sin identificar"
        subtitulo={`${pais.bandera} ${pais.nombre} · campañas de Meta con gasto en el periodo cuyo producto no se reconoce por el nombre. Elige de qué producto es cada una; Productos lo reparte solo. Gasto en COP, como cobra Meta.`}
        f={{ ...f, cuentas: [cuenta] }}
        inicio="2026-07-01"
        soloCuentas={permitidas}
      />
      {error || !d ? (
        <p className="text-sm text-red">No se pudieron cargar las campañas: {error?.message ?? "sin datos"}</p>
      ) : (
        <HomologarCampanas cuenta={cuenta} campanas={d.campanas} productos={productos} puedeEditar={tieneModulo(u, "campanas")} desde={f.desde} hasta={f.hasta} />
      )}
    </>
  );
}
