import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarioUrl } from "@/components/calendario-url";
import { createClient, getUsuario } from "@/lib/supabase/server";
import { etiquetaRango, hoyBogota, leerFiltros, rangosRapidos } from "@/lib/filtros";
import { dinero, entero, haceCuanto, nombrePropio } from "@/lib/formato";
import { esSocio } from "@/lib/modulos";
import { infoCuenta, ordenCuenta } from "@/lib/paises";
import { versiculoDelDia } from "@/lib/versiculos";

// 🏠 Inicio: lo primero que se ve al entrar. Por país, en una sola fila: órdenes, remisiones y guías del periodo con su valor,
// la relación de despacho y cómo va el mes. El dueño y los socios ven además quién está en línea y cuánto tiempo ha estado.
type Punto = { d: number; n: number };
type Pais = {
  cuenta: string; hasta: string; ordenes: number; ordenes_valor: number | null; remisiones: number; remisiones_valor: number | null;
  guias: number; guias_valor: number | null; con_relacion: number;
  mes_guias: number; mes_entregadas: number; mes_valor: number | null; serie: Punto[]; serie_ant: Punto[];
};
type Miembro = { nombre: string; en_linea: boolean; visto: string | null; segundos: number };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pct = (a: number, b: number) => (b ? `${Math.min(100, Math.round((a / b) * 100))}%` : "—");
const tiempo = (s: number) => {
  if (s < 60) return "—";
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
};

function Fila({ etiqueta, n, valor }: { etiqueta: string; n: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1 text-[13px]">
      <span className="truncate text-muted">{etiqueta} <span className="num">({n})</span></span>
      <span className="num whitespace-nowrap font-semibold">{valor}</span>
    </div>
  );
}

// Guías por día del mes; la línea punteada es el mes pasado para comparar.
function Grafica({ serie, anterior }: { serie: Punto[]; anterior: Punto[] }) {
  const ancho = 300, alto = 70;
  const dias = Math.max(28, ...serie.map((p) => p.d), ...anterior.map((p) => p.d));
  const max = Math.max(1, ...serie.map((p) => p.n), ...anterior.map((p) => p.n));
  const x = (p: Punto) => ((p.d - 1) / (dias - 1)) * ancho;
  const y = (p: Punto) => alto - 3 - (p.n / max) * (alto - 8);
  const linea = (s: Punto[]) => s.map((p) => `${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const ultimo = serie[serie.length - 1];
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="block h-16 w-full" preserveAspectRatio="none" role="img"
      aria-label={`Guías por día del mes: ${serie.map((p) => `día ${p.d}: ${p.n}`).join(", ") || "sin datos"}`}>
      {anterior.length > 1 && <polyline points={linea(anterior)} fill="none" stroke="var(--muted)" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      {serie.length > 1 && <polygon points={`${x(serie[0])},${alto} ${linea(serie)} ${x(ultimo)},${alto}`} fill="var(--blue-2)" fillOpacity={0.14} />}
      {serie.length > 1 && <polyline points={linea(serie)} fill="none" stroke="var(--blue-2)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />}
      {serie.length === 1 && <line x1={x(ultimo)} x2={x(ultimo)} y1={alto} y2={y(ultimo)} stroke="var(--blue-2)" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

function TarjetaPais({ p }: { p: Pais }) {
  const c = infoCuenta(p.cuenta);
  const plata = (v: number | null) => (v == null ? "" : dinero(v, p.cuenta));
  return (
    <section className="min-w-0">
      <Link href={`/datos?c=${p.cuenta}`} className="inline-block font-display font-semibold tracking-tight hover:underline">{c.bandera} {c.nombre}</Link>
      <div className="mt-1.5 divide-y divide-line/60">
        <Fila etiqueta="Órdenes" n={entero(p.ordenes)} valor={plata(p.ordenes_valor)} />
        <Fila etiqueta="Remisiones" n={entero(p.remisiones)} valor={plata(p.remisiones_valor)} />
        <Fila etiqueta="Guías" n={entero(p.guias)} valor={plata(p.guias_valor)} />
        <Fila etiqueta="Despacho" n={`${entero(p.con_relacion)}/${entero(p.guias)}`} valor={pct(p.con_relacion, p.guias)} />
      </div>
      <div className="mt-3 text-[10px] uppercase tracking-wider text-muted">{MESES[Number(p.hasta.slice(5, 7)) - 1]} · guías por día</div>
      <div className="mt-1 border-b border-line"><Grafica serie={p.serie} anterior={p.serie_ant} /></div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] text-muted">
        <span className="num truncate">{entero(p.mes_guias)} · {pct(p.mes_entregadas, p.mes_guias)} entregadas</span>
        {p.mes_valor != null && <span className="num whitespace-nowrap font-semibold text-text">{dinero(p.mes_valor, p.cuenta)}</span>}
      </div>
    </section>
  );
}

function Equipo({ gente, periodo }: { gente: Miembro[]; periodo: string }) {
  // Tres columnas de lista para que el equipo no ocupe media pantalla.
  const alto = Math.ceil(gente.length / 3);
  const columnas = [gente.slice(0, alto), gente.slice(alto, alto * 2), gente.slice(alto * 2)].filter((c) => c.length);
  return (
    <section className="card min-w-0 p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold tracking-tight">Rendimiento del equipo <span className="text-xs font-normal text-muted">· {periodo}</span></h2>
      <div className="mt-3 grid items-start gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        {columnas.map((col, i) => (
          <table key={i} className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
                <th className="pb-1.5 font-medium">Usuario</th>
                <th className="pb-1.5 font-medium">Estado</th>
                <th className="pb-1.5 text-right font-medium" title="Tiempo con el Centro de Control abierto y a la vista">Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {col.map((g) => (
                <tr key={g.nombre + g.visto} className="border-t border-line/60">
                  <td className="max-w-[10rem] truncate py-1.5 pr-2" title={nombrePropio(g.nombre)}>{nombrePropio(g.nombre)}</td>
                  <td className="py-1.5 pr-2" title={g.en_linea ? "Conectado ahora" : g.visto ? `Última vez ${haceCuanto(g.visto)}` : "Aún no ha entrado"}>
                    {g.en_linea
                      ? <span className="rounded-full bg-green/15 px-2 py-0.5 text-[11px] font-medium text-green">Online</span>
                      : <span className="rounded-full bg-red/15 px-2 py-0.5 text-[11px] font-medium text-red">Off</span>}
                  </td>
                  <td className="num whitespace-nowrap py-1.5 text-right">{tiempo(Number(g.segundos))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}

export default async function InicioPage({ searchParams }: PageProps<"/inicio">) {
  const u = await getUsuario();
  if (!u) redirect("/login");
  const conEquipo = esSocio(u);
  const hoy = hoyBogota();
  const sp = await searchParams;
  // Sin fechas en la dirección: hoy.
  const { desde, hasta } = leerFiltros(typeof sp.d === "string" ? sp : { ...sp, d: hoy, h: hoy });
  const args = { p_desde: desde, p_hasta: hasta };
  const supabase = await createClient();
  const [{ data: resumen }, { data: cuentas }, { data: yo }, { data: equipo }] = await Promise.all([
    supabase.rpc("app_inicio_paises", args),
    supabase.from("effi_accounts").select("sociedad"),
    supabase.from("app_usuarios").select("sociedad_vista").eq("user_id", u.id).maybeSingle(),
    conEquipo ? supabase.rpc("app_inicio_equipo", args) : Promise.resolve({ data: [] }),
  ]);
  // El dueño: la sociedad que está mirando (con "Todas", Joalix). Los demás: la suya.
  const sociedades = [...new Set((cuentas ?? []).map((c) => c.sociedad as string))];
  const nombreEquipo = u.rol === "owner" ? ((yo?.sociedad_vista as string | null) ?? "Joalix AA Group") : sociedades.join(" y ");
  const paises = ((resumen ?? []) as Pais[]).sort((a, b) => ordenCuenta(a.cuenta) - ordenCuenta(b.cuenta));
  const gente = (equipo ?? []) as Miembro[];
  const periodo = desde === hoy && hasta === hoy ? "Hoy" : etiquetaRango(desde, hasta);
  const primerNombre = nombrePropio(u.nombre?.trim() || u.email.split("@")[0]).split(/[\s._-]+/)[0];
  const v = versiculoDelDia(hoy);

  return (
    <>
      <header className="pt-8 mb-5 pr-28">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Hola, {primerNombre}</h1>
        <p className="mt-0.5 text-sm text-muted">Gracias por hacer parte del equipo de {nombreEquipo || "Centro de Control"}</p>
        <p className="mt-1.5 text-xs text-muted"><span className="italic">“{v.texto}”</span> <span className="whitespace-nowrap">— {v.cita}</span></p>
      </header>
      <div className="space-y-4">
        <section className="card min-w-0 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold tracking-tight">{periodo}</h2>
            <CalendarioUrl desde={desde} hasta={hasta} rangos={rangosRapidos(hoy)} hoy={hoy} />
          </div>
          {paises.length ? (
            <div className="grid gap-x-7 gap-y-6 overflow-x-auto md:grid-flow-col md:auto-cols-[minmax(12.5rem,1fr)]">
              {paises.map((p) => <TarjetaPais key={p.cuenta} p={p} />)}
            </div>
          ) : (
            <p className="text-sm text-muted">Entra a tus módulos desde el menú.</p>
          )}
        </section>
        {conEquipo && gente.length > 0 && <Equipo gente={gente} periodo={periodo} />}
      </div>
    </>
  );
}
