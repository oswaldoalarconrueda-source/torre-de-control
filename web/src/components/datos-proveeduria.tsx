import { createClient } from "@/lib/supabase/server";
import { hoyBogota, type Filtros } from "@/lib/filtros";
import { dinero, entero } from "@/lib/formato";
import { Fila, Tarjeta, UtilidadNeta } from "./despacho-entregado";

// Bloque "Despachado vs Entregado" de Datos para una proveeduría, con el mismo formato de las tiendas (prov_datos):
// · Venta = remisión de la proveeduría a la tienda (lo que paga la tienda). Despachado = esa venta ya tiene guía;
//   entregado = estado global de la guía.
// · Costo mercancía = costo propio de la proveeduría, con el % de costo que Effi calcula para el periodo (prov_costo_pct).
// · Flete y publicidad no son de la proveeduría (0). Comisión = 1% de la venta despachada, la "comisión de liquidación
//   dropshipping" que Effi descuenta del wallet.

type Totales = {
  ventas_n: number; ventas_valor: number; despachadas_n: number; despachadas_valor: number; entregadas_n: number; entregadas_valor: number;
  devoluciones_n: number; sin_guia_n: number; tiendas: number; comision_wallet: number; liquidado_wallet: number; liquidaciones_n: number;
};

export async function DatosProveeduria({ cuenta, f }: { cuenta: string; f: Filtros }) {
  const hoy = hoyBogota();
  const hasta = f.hasta > hoy ? hoy : f.hasta;
  const supabase = await createClient();
  const [{ data, error }, { data: costo }] = await Promise.all([
    supabase.rpc("prov_datos", { p_cuenta: cuenta, p_desde: f.desde, p_hasta: hasta }),
    supabase.rpc("prov_costo_pct", { p_cuenta: cuenta, p_desde: f.desde, p_hasta: hasta }),
  ]);
  if (error || !data) return <p className="text-sm text-red">No se pudo calcular despachado vs entregado: {error?.message}</p>;
  const t = (data as { totales: Totales }).totales;
  const c = (costo ?? {}) as { pct?: number; periodo?: string };
  const pctCosto = Number(c.pct ?? 0);
  const $ = (v: number) => dinero(v, cuenta);
  const pctDe = (v: number, base: number) => (base ? `${((v / base) * 100).toFixed(1).replace(".", ",")}%` : null);
  const prom = (v: number, n: number) => (n ? $(v / n) : "—");
  const D = { n: t.despachadas_n, venta: t.despachadas_valor, costo: t.despachadas_valor * pctCosto };
  const E = { n: t.entregadas_n, venta: t.entregadas_valor, costo: t.entregadas_valor * pctCosto };
  const comision = D.venta * 0.01;
  const costoAyuda = `Costo propio de la proveeduría: ${pctDe(pctCosto, 1) ?? "—"} de la venta, según Effi (${c.periodo === "mes_ant" ? "mes anterior" : c.periodo === "7d" ? "últimos 7 días" : c.periodo ?? "este mes"}).`;
  const neta = E.venta - E.costo - comision;

  return (
    <section className="space-y-3">
      <Fila titulo="Despachado" detalle="Ventas a las tiendas del periodo que ya tienen guía (sin las que aún no salen)">
        <Tarjeta titulo="Ventas" valor={entero(D.n)} ayuda={`${entero(t.ventas_n)} ventas en el periodo a ${entero(t.tiendas)} tiendas; ${entero(t.sin_guia_n)} todavía sin guía`} />
        <Tarjeta titulo="Venta total (despachado)" badge={pctDe(D.venta, D.venta)} valor={$(D.venta)} ayuda="Lo que pagan las tiendas por la mercancía despachada" pie={prom(D.venta, D.n)} />
        <Tarjeta titulo="Costo mercancía (despachado)" badge={pctDe(D.costo, D.venta)} valor={$(D.costo)} ayuda={costoAyuda} pie={prom(D.costo, D.n)} />
        <Tarjeta titulo="Flete (despachado)" badge={null} valor={$(0)} ayuda="El flete no es de la proveeduría" pie={$(0)} pendiente />
        <Tarjeta titulo="Publicidad (sobre despachado)" badge={null} valor={$(0)} ayuda="La proveeduría no paga publicidad" pie={$(0)} pendiente />
        <Tarjeta titulo="Comisión 1% (despachado)" badge={pctDe(comision, D.venta)} valor={$(comision)}
          ayuda={`1% de la venta despachada. En el wallet del periodo Effi cobró ${$(t.comision_wallet)} sobre ${entero(t.liquidaciones_n)} ventas liquidadas.`} pie={prom(comision, D.n)} />
      </Fila>

      <Fila titulo="Entregado" detalle="Solo lo entregado al cliente final, según el estado global de la guía">
        <Tarjeta titulo="Ventas entregadas" valor={entero(E.n)} ayuda={`${entero(t.devoluciones_n)} devoluciones en el periodo`} />
        <Tarjeta titulo="Venta total (entregado)" badge={pctDe(E.venta, E.venta)} valor={$(E.venta)} ayuda={`Effi liquidó ${$(t.liquidado_wallet)} en el wallet en este periodo`} pie={prom(E.venta, E.n)} />
        <Tarjeta titulo="Costo mercancía (entregado)" badge={pctDe(E.costo, E.venta)} valor={$(E.costo)} ayuda={costoAyuda} pie={prom(E.costo, E.n)} />
        <Tarjeta titulo="Flete (entregado)" badge={null} valor={$(0)} ayuda="El flete no es de la proveeduría" pie={$(0)} pendiente />
        <Tarjeta titulo="Publicidad (sobre entregado)" badge={null} valor={$(0)} ayuda="La proveeduría no paga publicidad" pie={$(0)} pendiente />
        <Tarjeta titulo="Comisión 1% (entregado)" badge={pctDe(comision, E.venta)} valor={$(comision)}
          ayuda={`Mismo valor del despachado, repartido sobre ${entero(E.n)} ventas entregadas`} pie={prom(comision, E.n)} />
      </Fila>

      <UtilidadNeta u={{ utilidad_neta: neta }} ventaTotal={E.venta} cuenta={cuenta} />
    </section>
  );
}
