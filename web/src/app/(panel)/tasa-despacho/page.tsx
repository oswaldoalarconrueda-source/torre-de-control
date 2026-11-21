import Link from "next/link";
import { createClient, exigirModulo } from "@/lib/supabase/server";
import { hoyBogota, leerFiltros } from "@/lib/filtros";
import { diaCorto, entero } from "@/lib/formato";
import { infoCuenta, ordenCuenta, type Semaforo } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { TasaDespacho } from "@/components/tasa-despacho-grafica";
import { Chip, Kpi, Panel, TablaScroll, Vacio } from "@/components/ui";

// 📦 Tasa de despacho (pedido del dueño, 17-nov-2026): por día, las ventas que entraron a LucidBot (Data Lucid) frente a las
// guías que se generaron ese día (Effi + Dropi). Tasa = guías ÷ ventas. Un día puede pasar de 100 % cuando se ponen al día
// ventas de días anteriores. LucidBot solo da cuántas ventas entraron, no cuáles: no se sigue venta por venta.
// Un país a la vez (como el resto del Centro); los porcentajes de todos los países salen aparte para compararlos.

type Fila = { cuenta: string; fecha: string; ventas: number; guias_effi: number; guias_dropi: number };

const semaforo = (t: number | null): Semaforo => (t == null ? "nada" : t >= 0.9 ? "verde" : t >= 0.75 ? "naranja" : "rojo");
const pct = (t: number | null) => (t == null ? "—" : `${(t * 100).toFixed(1).replace(".", ",")} %`);

export default async function TasaDespachoPage({ searchParams }: PageProps<"/tasa-despacho">) {
  await exigirModulo("resumen");
  const sp = await searchParams;
  const f = leerFiltros(sp);
  const hoy = hoyBogota();
  const hasta = f.hasta > hoy ? hoy : f.hasta;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tasa_despacho_diaria", { p_cuentas: null, p_desde: f.desde, p_hasta: hasta });
  const filas = ((data ?? []) as Fila[]).map((r) => ({ ...r, ventas: Number(r.ventas), guias: Number(r.guias_effi) + Number(r.guias_dropi) }));
  const cuentas = [...new Set(filas.map((r) => r.cuenta))].sort((a, b) => ordenCuenta(a) - ordenCuenta(b));
  const cuenta = f.cuentas?.[0] && cuentas.includes(f.cuentas[0]) ? f.cuentas[0] : (cuentas[0] ?? "TIENDA_CO");
  const dias = filas.filter((r) => r.cuenta === cuenta).map((r) => ({ ...r, tasa: r.ventas ? r.guias / r.ventas : null }));

  const total = (c: string) => {
    const d = filas.filter((r) => r.cuenta === c);
    const ventas = d.reduce((a, r) => a + r.ventas, 0), guias = d.reduce((a, r) => a + r.guias, 0);
    const tasas = d.filter((r) => r.ventas).map((r) => r.guias / r.ventas);
    return { ventas, guias, tasa: ventas ? guias / ventas : null, promedio: tasas.length ? tasas.reduce((a, t) => a + t, 0) / tasas.length : null,
      dropi: d.reduce((a, r) => a + Number(r.guias_dropi), 0) };
  };
  const t = total(cuenta);
  const conVentas = dias.filter((d) => d.ventas);
  const mejor = conVentas.reduce<(typeof dias)[number] | null>((m, d) => (!m || (d.tasa ?? 0) > (m.tasa ?? 0) ? d : m), null);
  const peor = conVentas.reduce<(typeof dias)[number] | null>((m, d) => (!m || (d.tasa ?? 0) < (m.tasa ?? 0) ? d : m), null);

  return (
    <>
      <Encabezado
        titulo="📦 Tasa de despacho"
        subtitulo="Por día: las ventas que entraron a LucidBot frente a las guías que se generaron ese día (Effi y O.A.). Tasa = guías ÷ ventas. Un día puede pasar de 100 % cuando se despachan ventas de días anteriores."
        f={{ ...f, cuentas: [cuenta] }}
        soloCuentas={cuentas.length ? cuentas : undefined}
      />
      {error && <p className="text-sm text-red mb-4">{error.message}</p>}

      {dias.length ? (
        <>
          <div className="grid grid-cols-1 min-[440px]:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <Kpi acento etiqueta="Tasa de despacho del periodo" valor={pct(t.tasa)} semaforo={semaforo(t.tasa)}
              nota={`${entero(t.guias)} guías de ${entero(t.ventas)} ventas`} />
            <Kpi etiqueta="Promedio de los % diarios" valor={pct(t.promedio)} semaforo={semaforo(t.promedio)}
              nota={`${conVentas.length} días con ventas cargadas`} />
            <Kpi etiqueta="Ventas LucidBot" valor={entero(t.ventas)} nota="Las que se cargan en Pedidos plataformas" />
            <Kpi etiqueta="Guías generadas" valor={entero(t.guias)}
              nota={t.dropi ? `${entero(t.guias - t.dropi)} Effi · ${entero(t.dropi)} O.A.` : "Effi, sin anuladas"} />
          </div>

          <Panel titulo="Ventas vs. guías por día" className="mb-3"
            detalle={mejor && peor ? `Mejor día: ${diaCorto(mejor.fecha)} (${pct(mejor.tasa)}) · Más bajo: ${diaCorto(peor.fecha)} (${pct(peor.tasa)}). La línea punteada es 100 %.` : undefined}>
            <TasaDespacho filas={dias.map((d) => ({ fecha: d.fecha, ventas: d.ventas, guias: d.guias, tasa: d.tasa == null ? null : Math.round(d.tasa * 1000) / 10 }))} />
          </Panel>

          <div className="grid xl:grid-cols-[1fr_1.4fr] gap-3">
            <Panel titulo="Todos los países" detalle="Mismo periodo. Toca un país para verlo. Verde ≥ 90 %, amarillo ≥ 75 %.">
              <TablaScroll>
                <thead><tr><th>País</th><th className="text-right">Ventas</th><th className="text-right">Guías</th><th className="text-right">Tasa</th><th className="text-right">Prom. diario</th></tr></thead>
                <tbody>
                  {cuentas.map((c) => {
                    const x = total(c), i = infoCuenta(c);
                    return (
                      <tr key={c} className={c === cuenta ? "font-semibold" : ""}>
                        <td className="whitespace-nowrap"><Link href={`/tasa-despacho?c=${c}&d=${f.desde}&h=${f.hasta}`} className="hover:underline">{i.bandera} {i.nombre}</Link></td>
                        <td className="text-right num">{entero(x.ventas)}</td>
                        <td className="text-right num">{entero(x.guias)}</td>
                        <td className="text-right"><Chip s={semaforo(x.tasa)}>{pct(x.tasa)}</Chip></td>
                        <td className="text-right num text-muted">{pct(x.promedio)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </TablaScroll>
            </Panel>

            <Panel titulo="Día por día" detalle={`${infoCuenta(cuenta).bandera} ${infoCuenta(cuenta).nombre}. Día según la hora del país.`}>
              <TablaScroll>
                <thead><tr><th>Día</th><th className="text-right">Ventas LucidBot</th><th className="text-right">Guías</th><th className="text-right">Diferencia</th><th className="text-right">% despachado</th></tr></thead>
                <tbody>
                  <tr className="font-semibold">
                    <td>Periodo</td>
                    <td className="text-right num">{entero(t.ventas)}</td>
                    <td className="text-right num">{entero(t.guias)}</td>
                    <td className="text-right num">{entero(t.guias - t.ventas)}</td>
                    <td className="text-right"><Chip s={semaforo(t.tasa)}>{pct(t.tasa)}</Chip></td>
                  </tr>
                  {[...dias].reverse().map((d) => (
                    <tr key={d.fecha}>
                      <td className="whitespace-nowrap">{diaCorto(d.fecha)}</td>
                      <td className="text-right num">{d.ventas ? entero(d.ventas) : <span className="text-muted">sin cargar</span>}</td>
                      <td className="text-right num">{entero(d.guias)}</td>
                      <td className={`text-right num ${d.guias - d.ventas < 0 ? "text-red" : "text-muted"}`}>{d.ventas ? entero(d.guias - d.ventas) : "—"}</td>
                      <td className="text-right"><Chip s={semaforo(d.tasa)}>{pct(d.tasa)}</Chip></td>
                    </tr>
                  ))}
                </tbody>
              </TablaScroll>
            </Panel>
          </div>
          <p className="text-xs text-muted mt-3">
            LucidBot solo dice cuántas ventas entraron cada día, no cuáles; por eso se compara día contra día y no venta por venta. Los últimos días
            suben cuando se generan las guías pendientes. <Link href={`/pedidos-lucid?c=${cuenta}`} className="underline">Ver Pedidos plataformas</Link>
          </p>
        </>
      ) : (
        <Vacio>No hay ventas de LucidBot cargadas para este periodo.</Vacio>
      )}
    </>
  );
}
