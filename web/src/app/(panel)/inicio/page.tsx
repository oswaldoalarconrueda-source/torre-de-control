import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient, getUsuario } from "@/lib/supabase/server";
import { hoyBogota } from "@/lib/filtros";
import { dinero, entero } from "@/lib/formato";
import { infoCuenta, ordenCuenta } from "@/lib/paises";
import { versiculoDelDia } from "@/lib/versiculos";

// 🏠 Inicio: lo primero que se ve al entrar. Saludo, versículo del día y, por cada tienda del usuario, lo de hoy, lo que va
// del mes y lo pendiente (app_inicio solo trae lo que sus módulos le dejan ver; la franja sin datos no se muestra).
type Fila = {
  cuenta: string; dia: string; ordenes: number | null; guias: number | null; entregadas: number | null; recaudo: number | null;
  mes_pedidos: number | null; mes_entregadas: number | null; mes_recaudo: number | null; mes_gasto: number | null; mes_pedidos_lucid: number | null;
  en_oficina: number | null; volver: number | null; novedades: number | null; errores: number | null;
};
type Dato = { etiqueta: string; valor: ReactNode; href: string; color?: string };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const primerNombre = (nombre: string | null, email: string) => {
  const n = (nombre?.trim() || email.split("@")[0]).split(/[\s._-]+/)[0];
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
};

function Franja({ titulo, datos }: { titulo: string; datos: (Dato | null)[] }) {
  const lista = datos.filter((d): d is Dato => !!d);
  if (!lista.length) return null;
  return (
    <div className="border-t border-line px-4 py-3 sm:px-5">
      <div className="text-xs font-semibold text-muted mb-2">{titulo}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-3">
        {lista.map((d) => (
          <Link key={d.etiqueta} href={d.href} className="group flex min-w-0 flex-col justify-between rounded-lg -m-1 p-1 hover:bg-tinte/[0.04]">
            <div className="text-[11px] leading-tight uppercase tracking-wider text-muted">{d.etiqueta}</div>
            <div className="num text-lg font-semibold mt-0.5 truncate group-hover:underline" style={d.color ? { color: d.color } : undefined}>{d.valor}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function TarjetaPais({ f }: { f: Fila }) {
  const c = infoCuenta(f.cuenta);
  const q = `?c=${f.cuenta}`;
  const dato = (etiqueta: string, v: number | null, valor: ReactNode, href: string, color?: string): Dato | null =>
    v == null ? null : { etiqueta, valor, href: `${href}${q}`, color };
  const pctEntrega = f.mes_pedidos ? `${Math.round(((f.mes_entregadas ?? 0) / f.mes_pedidos) * 100)}%` : "—";
  const cpa = f.mes_pedidos_lucid ? dinero((f.mes_gasto ?? 0) / f.mes_pedidos_lucid, "TIENDA_CO") : "—";
  return (
    <section className="card min-w-0 overflow-hidden">
      <h2 className="font-display text-lg font-semibold tracking-tight px-4 py-3 sm:px-5">{c.bandera} {c.nombre}</h2>
      <Franja titulo={`Hoy · ${Number(f.dia.slice(8, 10))} de ${MESES[Number(f.dia.slice(5, 7)) - 1]}`} datos={[
        dato("Órdenes", f.ordenes, entero(f.ordenes), "/agente"),
        dato("Guías hechas", f.guias, entero(f.guias), "/datos"),
        dato("Entregadas", f.entregadas, entero(f.entregadas), "/datos", "var(--green)"),
        dato("Recaudo", f.recaudo, dinero(f.recaudo, f.cuenta), "/wallet-en-vivo"),
      ]} />
      <Franja titulo={`Mes corrido · ${MESES[Number(f.dia.slice(5, 7)) - 1]}`} datos={[
        dato("Pedidos", f.mes_pedidos, entero(f.mes_pedidos), "/datos"),
        dato("% de entrega", f.mes_pedidos, pctEntrega, "/datos"),
        dato("Recaudo", f.mes_recaudo, dinero(f.mes_recaudo, f.cuenta), "/dinero"),
        dato("CPA real", f.mes_gasto, cpa, "/publicidad"),
      ]} />
      <Franja titulo="Pendiente ahora" datos={[
        dato("En oficina", f.en_oficina, entero(f.en_oficina), "/oficina"),
        dato("Volver a llamar", f.volver, entero(f.volver), "/oficina", f.volver ? "#b48cff" : undefined),
        dato("Novedades", f.novedades, entero(f.novedades), "/novedades", f.novedades ? "var(--amber)" : undefined),
        dato("Errores agente", f.errores, entero(f.errores), "/agente", f.errores ? "var(--red)" : undefined),
      ]} />
    </section>
  );
}

export default async function InicioPage() {
  const u = await getUsuario();
  if (!u) redirect("/login");
  const supabase = await createClient();
  const [{ data: resumen }, { data: cuentas }, { data: yo }] = await Promise.all([
    supabase.rpc("app_inicio"),
    supabase.from("effi_accounts").select("sociedad"),
    supabase.from("app_usuarios").select("sociedad_vista").eq("user_id", u.id).maybeSingle(),
  ]);
  // El dueño: la sociedad que está mirando (con "Todas", Joalix). Los demás: la suya.
  const sociedades = [...new Set((cuentas ?? []).map((c) => c.sociedad as string))];
  const equipo = u.rol === "owner" ? ((yo?.sociedad_vista as string | null) ?? "Joalix AA Group") : sociedades.join(" y ");
  const filas = ((resumen ?? []) as Fila[]).sort((a, b) => ordenCuenta(a.cuenta) - ordenCuenta(b.cuenta));
  const v = versiculoDelDia(hoyBogota());

  return (
    <>
      <header className="pt-8 mb-6 pr-28">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Hola, {primerNombre(u.nombre, u.email)}</h1>
        <p className="text-base sm:text-lg mt-1.5">Gracias por hacer parte del equipo de {equipo || "Centro de Control"}</p>
        <blockquote className="mt-4 border-l-2 border-blue-2 pl-3 text-sm text-muted">
          <span className="italic">“{v.texto}”</span> <cite className="not-italic whitespace-nowrap">— {v.cita}</cite>
        </blockquote>
      </header>
      {filas.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filas.map((f) => <TarjetaPais key={f.cuenta} f={f} />)}
        </div>
      ) : (
        <p className="text-sm text-muted">Entra a tus módulos desde el menú.</p>
      )}
    </>
  );
}
