import Link from "next/link";
import { createClient, exigirModulo } from "@/lib/supabase/server";
import { hoyBogota } from "@/lib/filtros";
import { ordenCuenta } from "@/lib/paises";
import { PedidosLucid } from "@/components/pedidos-lucid";

// 📝 Pedidos plataformas (antes Data Lucid y Pedidos Lucid; nombre del 20-nov-2026): la persona encargada llena cada día cuántos
// pedidos entraron a LucidSales en cada país (el mismo número de la hoja "RELACION DE PEDIDOS JOALIX"). Con eso 📢 Publicidad
// saca el CPA real del día: gasto ÷ pedidos. En A un clic también todo llega por Lucid: Guatemala, Honduras y El Salvador
// se llenan igual, a mano (la encargada mira cuántos llegaron y los anota).
// Módulo exclusivo: solo el dueño y a quien se le marque en /usuarios. Puede corregir los últimos 7 días.
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default async function PedidosLucidPage({ searchParams }: PageProps<"/pedidos-lucid">) {
  const u = await exigirModulo("pedidos_lucid");
  const sp = await searchParams;
  const hoy = hoyBogota();
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) && sp.mes <= hoy.slice(0, 7) ? sp.mes : hoy.slice(0, 7);
  const [a, m] = mes.split("-").map(Number);
  const dias = new Date(a, m, 0).getDate();
  const desde = `${mes}-01`, hasta = `${mes}-${String(dias).padStart(2, "0")}`;
  const otro = (n: number) => { const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

  const supabase = await createClient();
  const esOwner = u.rol === "owner";
  // Llenan el dueño, los socios (tiendas de su sociedad) y la empleada que tenga el módulo; los dos últimos, 7 días atrás.
  const esSocio = u.rol === "socio";
  // Tiendas: el dueño, las de la sociedad que tenga elegida arriba (sin elegir, Joalix); los socios, las tiendas que ven;
  // los empleados, las que tengan con este módulo.
  const vista = esOwner
    ? ((await supabase.from("app_usuarios").select("sociedad_vista").eq("user_id", u.id).maybeSingle()).data?.sociedad_vista as string | null) ?? "Joalix AA Group"
    : null;
  const { data: tiendas } = esOwner
    ? await supabase.from("effi_accounts").select("slug").eq("tipo", "tienda").eq("sociedad", vista).eq("activa", true)
    : esSocio
      ? await supabase.from("effi_accounts").select("slug").eq("tipo", "tienda").eq("activa", true)
      : await supabase.from("app_permisos").select("slug:cuenta").eq("user_id", u.id).contains("modulos", ["pedidos_lucid"]);
  const cuentas = (tiendas ?? []).map((t) => t.slug as string).sort((x, y) => ordenCuenta(x) - ordenCuenta(y));
  const [{ data: filas }, { data: auto }] = cuentas.length
    ? await Promise.all([
        supabase.from("app_pedidos_diarios").select("cuenta,fecha,pedidos,actualizado_por,actualizado_en")
          .in("cuenta", cuentas).gte("fecha", desde).lte("fecha", hasta),
        // Pedidos automáticos de icomfly (Joalix Colombia, desde noviembre): van en su propia casilla, sin tocar los de Lucid.
        supabase.from("app_pedidos_plataforma").select("cuenta,fecha,pedidos").eq("plataforma", "icomfly")
          .in("cuenta", cuentas).gte("fecha", desde).lte("fecha", hasta),
      ])
    : [{ data: [] }, { data: [] }];
  // Colombia de Joalix, desde noviembre (pedido del dueño, 23-nov-2026): dos casillas, Lucid a mano e icomfly automático.
  const conIcomfly = mes >= "2026-11" ? cuentas.filter((c) => c === "TIENDA_CO") : [];

  return (
    <>
      <div className="pt-8 mb-6">
        <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight">
          <span className="flex items-center gap-1.5" aria-label="Lucid, Shopify e icomfly">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lucid.svg" alt="Lucid" title="LucidSales" className="size-9" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/shopify.svg" alt="Shopify" title="Shopify" className="size-9" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icomfly.svg" alt="icomfly" title="icomfly" className="size-9" />
          </span>
          Pedidos plataformas
        </h1>
        <p className="text-sm text-muted mt-1.5">
          Cuántos pedidos entraron cada día en cada país.{conIcomfly.length ? " En Colombia, los de Lucid se llenan a mano y los de Shopify llegan solos desde icomfly." : ""}
          {esOwner ? " Al dar Enter pide confirmar. Tú puedes corregir cualquier día." : " Al dar Enter pide confirmar. Se pueden corregir los últimos 7 días."}
        </p>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <Link href={`/pedidos-lucid?mes=${otro(-1)}`} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-tinte/5">‹ {MESES[(m + 10) % 12]}</Link>
        <span className="font-display text-lg font-semibold capitalize">{MESES[m - 1]} {a}</span>
        {mes < hoy.slice(0, 7) && (
          <Link href={`/pedidos-lucid?mes=${otro(1)}`} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-tinte/5">{MESES[m % 12]} ›</Link>
        )}
      </div>
      {cuentas.length ? (
        <PedidosLucid key={mes} mes={mes} dias={dias} hoy={hoy} cuentas={cuentas} esOwner={esOwner} conIcomfly={conIcomfly}
          auto={(auto ?? []).map((f) => ({ cuenta: f.cuenta as string, fecha: f.fecha as string, pedidos: Number(f.pedidos) }))}
          filas={(filas ?? []).map((f) => ({ cuenta: f.cuenta as string, fecha: f.fecha as string, pedidos: Number(f.pedidos), por: (f.actualizado_por as string | null) ?? null }))} />
      ) : (
        <p className="text-sm text-muted">No tienes tiendas asignadas para llenar pedidos. Pídele al dueño que te las marque en Usuarios y permisos.</p>
      )}
    </>
  );
}
