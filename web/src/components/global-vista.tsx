"use client";

import { useMemo, useState, type ReactNode } from "react";
import { infoCuenta } from "@/lib/paises";
import { entero } from "@/lib/formato";
import { sumarDias } from "@/lib/filtros";
import { Kpi, Panel } from "./ui";

// Vista Global (como la pestaña Global del Dashboard Joalix): indicadores de todos los países juntos, resumen por
// día combinado, ventas por día y país, y ventas por día en una sola moneda. Las cantidades se suman tal cual; los
// montos solo se suman después de convertirlos con la TRM del mes (pesos colombianos por dólar y por quetzal).

type Fila = { cuenta: string; fecha: string; estado: string; n: number; venta: number };
type Trm = { mes: string; usd_cop: number; gtq_cop: number; estimada: boolean };
export type DatosGlobal = { filas: Fila[]; primer_dia: Record<string, string>; trm: Trm[] };
export type FilaMes = { mes: string; cuenta: string; estado: string; n: number; hasta_dia: number };
type Moneda = "COP" | "USD" | "GTQ";

const ESTADOS = [
  { id: "ENTREGADO", label: "Entregado", color: "47 210 143" },
  { id: "DEVOLUCION", label: "Devolución", color: "255 90 106" },
  { id: "EN_TRANSITO", label: "En tránsito", color: "47 123 255" },
  { id: "EN_OFICINA", label: "Disponible en oficina", color: "180 140 255" },
  { id: "NOVEDAD", label: "Novedad", color: "255 181 71" },
  { id: "PENDIENTE", label: "Pendiente", color: "138 148 168" },
  { id: "INDEMNIZACION", label: "Indemnización", color: "255 140 66" },
  { id: "CANCELADA", label: "Cancelada por transportadora", color: "110 118 135" },
];
// No son entrega ni devolución: salen de la base del % devolución (misma regla de Datos).
const FUERA_BASE = ["INDEMNIZACION", "CANCELADA"];
const MONEDAS: { id: Moneda; label: string }[] = [
  { id: "COP", label: "Pesos colombianos (COP)" },
  { id: "USD", label: "Dólares (USD)" },
  { id: "GTQ", label: "Quetzales (GTQ)" },
];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const corto = (iso: string) => `${Number(iso.slice(8, 10))}-${MESES[Number(iso.slice(5, 7)) - 1]}`;
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(2).replace(".", ",")}%`);
const signoPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1).replace(".", ",")}%`;
const puntos = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1).replace(".", ",")} pts`;
const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const COL_TOTAL = "sticky right-0 z-10 border-l border-line bg-panel text-center num text-sm font-semibold px-4 min-w-[7rem]";
const COL_DIA = "sticky left-0 z-10 bg-panel text-left pr-4 pl-3";

function plata(v: number, moneda: string) {
  const dec = moneda === "USD" ? 2 : 0;
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: moneda, currencyDisplay: "narrowSymbol", minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
}

// TRM vigente para un día: la del mes del día o, si no hay, la última anterior.
function trmDe(trm: Trm[], dia: string) {
  const mes = `${dia.slice(0, 7)}-01`;
  let t: Trm | null = null;
  for (const x of trm) if (x.mes <= mes) t = x;
  return t ?? trm[0] ?? null;
}
// Convierte un monto de la moneda del país a la moneda elegida, pasando por pesos colombianos.
function convertir(valor: number, cuenta: string, dia: string, destino: Moneda, trm: Trm[]) {
  const t = trmDe(trm, dia);
  const origen = infoCuenta(cuenta).divisa;
  if (origen === destino) return valor;
  if (!t) return null;
  const aCop: Record<string, number | undefined> = { COP: 1, USD: Number(t.usd_cop), GTQ: Number(t.gtq_cop) };
  const ida = aCop[origen], vuelta = aCop[destino];
  if (!ida || !vuelta) return null; // moneda sin TRM (p. ej. colones)
  return (valor * ida) / vuelta;
}

export function GlobalVista({ cuentas, desde, hasta, antDesde, antHasta, actual, anterior, meses, hoy }: {
  cuentas: string[]; desde: string; hasta: string; antDesde: string; antHasta: string; actual: DatosGlobal; anterior: DatosGlobal;
  meses: FilaMes[]; hoy: string;
}) {
  const [moneda, setMoneda] = useState<Moneda>("COP");
  const [modoPais, setModoPais] = useState<"cantidad" | "monto">("cantidad");

  const dias = useMemo(() => {
    const out: string[] = [];
    for (let d = desde; d <= hasta && out.length < 400; d = sumarDias(d, 1)) out.push(d);
    return out;
  }, [desde, hasta]);

  const suma = (filas: Fila[], cond: (f: Fila) => boolean) => filas.reduce((a, f) => (cond(f) ? a + Number(f.n) : a), 0);
  const total = suma(actual.filas, () => true);
  const ent = suma(actual.filas, (f) => f.estado === "ENTREGADO");
  const dev = suma(actual.filas, (f) => f.estado === "DEVOLUCION");
  const fuera = suma(actual.filas, (f) => FUERA_BASE.includes(f.estado));
  const base = total - fuera;
  const enCamino = base - ent - dev;
  const porPais = (filas: Fila[], c: string) => suma(filas, (f) => f.cuenta === c);
  const totalAnt = suma(anterior.filas, () => true);
  const crecimiento = totalAnt ? (total - totalAnt) / totalAnt : null;
  const entAnt = suma(anterior.filas, (f) => f.estado === "ENTREGADO");
  const baseAnt = totalAnt - suma(anterior.filas, (f) => FUERA_BASE.includes(f.estado));
  const pctEnt = base ? ent / base : null, pctEntAnt = baseAnt ? entAnt / baseAnt : null;
  const pctDev = base ? (base - ent) / base : null, pctDevAnt = baseAnt ? (baseAnt - entAnt) / baseAnt : null;
  const antTxt = `${corto(antDesde)}–${corto(antHasta)}`;

  // Venta del periodo convertida a la moneda elegida (y en la moneda de cada país).
  const ventaPais = (c: string) => actual.filas.reduce((a, f) => (f.cuenta === c ? a + Number(f.venta) : a), 0);
  let ventaTotal = 0;
  let sinTrm = false;
  for (const f of actual.filas) {
    const v = convertir(Number(f.venta), f.cuenta, f.fecha, moneda, actual.trm);
    if (v == null) { if (Number(f.venta)) sinTrm = true; } else ventaTotal += v;
  }

  // Índices por día.
  const porEstadoDia = new Map<string, number>();
  const porPaisDia = new Map<string, { n: number; venta: number }>();
  for (const f of actual.filas) {
    porEstadoDia.set(`${f.estado}|${f.fecha}`, (porEstadoDia.get(`${f.estado}|${f.fecha}`) ?? 0) + Number(f.n));
    const k = `${f.cuenta}|${f.fecha}`, x = porPaisDia.get(k) ?? { n: 0, venta: 0 };
    x.n += Number(f.n); x.venta += Number(f.venta);
    porPaisDia.set(k, x);
  }
  const estados = ESTADOS.filter((e) => actual.filas.some((f) => f.estado === e.id));
  const totalDia = (d: string) => estados.reduce((a, e) => a + (porEstadoDia.get(`${e.id}|${d}`) ?? 0), 0);
  const devDia = (d: string) => {
    const b = totalDia(d) - FUERA_BASE.reduce((a, id) => a + (porEstadoDia.get(`${id}|${d}`) ?? 0), 0);
    return b ? (b - (porEstadoDia.get(`ENTREGADO|${d}`) ?? 0)) / b : null;
  };
  const ventaConv = (c: string, d: string) => {
    const v = porPaisDia.get(`${c}|${d}`)?.venta ?? 0;
    return v ? convertir(v, c, d, moneda, actual.trm) : 0;
  };
  const trmUsada = trmDe(actual.trm, hasta);

  const banderas = (fn: (c: string) => string) => cuentas.map((c) => `${infoCuenta(c).bandera} ${fn(c)}`).join(" · ");
  const incompletos = cuentas.filter((c) => actual.primer_dia[c] && actual.primer_dia[c] > antDesde);

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Comparar acento="var(--blue)" titulo="Pedidos del período" valor={entero(total)}
          delta={totalAnt ? { valor: total - totalAnt, texto: `${total - totalAnt >= 0 ? "+" : "−"}${entero(Math.abs(total - totalAnt))} pedidos`, bueno: total >= totalAnt } : null}
          pie={<>Mes pasado ({antTxt}): {entero(totalAnt)}<br />{banderas((c) => entero(porPais(actual.filas, c)))}</>} />
        <Comparar acento="var(--blue-2)" titulo="Crecimiento vs. mes pasado"
          valor={crecimiento == null ? "—" : <span style={{ color: crecimiento >= 0 ? "var(--green)" : "var(--red)" }}>{signoPct(crecimiento)}</span>}
          pie={<>
            {banderas((c) => {
              const p = porPais(anterior.filas, c), a = porPais(actual.filas, c);
              return p ? `${signoPct((a - p) / p)}${incompletos.includes(c) ? "*" : ""}` : "—";
            })}
            {incompletos.length > 0 && <><br />* {incompletos.map((c) => `${infoCuenta(c).nombre} empezó el ${corto(actual.primer_dia[c])}`).join(" · ")}: el mes pasado está incompleto</>}
          </>} />
        <Comparar acento="var(--green)" titulo="% Entregado" valor={<span style={{ color: "var(--green)" }}>{pct(pctEnt)}</span>}
          delta={pctEnt != null && pctEntAnt != null ? { valor: pctEnt - pctEntAnt, texto: puntos(pctEnt - pctEntAnt), bueno: pctEnt >= pctEntAnt } : null}
          pie={<>Mes pasado ({antTxt}): {pct(pctEntAnt)}<br />{entero(ent)} entregadas</>} />
        <Comparar acento="var(--red)" titulo="% Devolución" valor={<span style={{ color: "var(--red)" }}>{pct(pctDev)}</span>}
          delta={pctDev != null && pctDevAnt != null ? { valor: pctDev - pctDevAnt, texto: puntos(pctDev - pctDevAnt), bueno: pctDev <= pctDevAnt } : null}
          pie={<>Mes pasado ({antTxt}): {pct(pctDevAnt)}<br />No entregado ÷ pedidos · {entero(dev)} ya devueltas</>} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Kpi etiqueta={`Venta total en ${moneda}`} valor={plata(ventaTotal, moneda)}
          nota={<>{banderas((c) => plata(ventaPais(c), infoCuenta(c).divisa))}{sinTrm && <><br />Hay ventas sin TRM para convertir: no se suman.</>}</>} />
        <Kpi etiqueta="En camino" valor={pct(base ? enCamino / base : null)} nota={`${entero(enCamino)} en tránsito, oficina, novedad o pendientes · ${dias.length} días, prom. ${entero(Math.round(total / Math.max(1, dias.length)))} pedidos por día`} />
      </div>

      <MesAMes meses={meses} cuentas={cuentas} diaHoy={Number(hoy.slice(8, 10))} mesHoy={`${hoy.slice(0, 7)}-01`} />

      <Panel titulo="Resumen por día (países combinados)" detalle="Ventas por estado actual y día de creación, sumando los países elegidos arriba.">
        <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5 pb-2">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr>
                <th className={`${COL_DIA} text-xs font-medium text-muted min-w-[12rem]`}>Estado</th>
                {dias.map((d) => (
                  <th key={d} className="px-1 text-center min-w-[4rem]">
                    <div className="font-display text-sm font-semibold">{corto(d)}</div>
                    <div className={`text-[10px] tracking-wider ${dow(d) === 0 || dow(d) === 6 ? "text-blue-2" : "text-muted"}`}>{DIAS[dow(d)]}</div>
                  </th>
                ))}
                <th className={`${COL_TOTAL} text-xs font-mono text-muted`}>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {estados.map((e) => (
                <tr key={e.id}>
                  <td className={`${COL_DIA} py-2`}>
                    <span className="inline-flex items-center gap-2 font-semibold whitespace-nowrap">
                      <span className="size-2.5 rounded-full" style={{ background: `rgb(${e.color})`, boxShadow: `0 0 8px rgb(${e.color})` }} />
                      {e.label}
                    </span>
                  </td>
                  {dias.map((d) => {
                    const n = porEstadoDia.get(`${e.id}|${d}`) ?? 0;
                    return <td key={d} className={`text-center num ${n ? "" : "text-muted/40"}`}>{n ? entero(n) : "—"}</td>;
                  })}
                  <td className={COL_TOTAL}>{entero(suma(actual.filas, (f) => f.estado === e.id))}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={`${COL_DIA} py-2`}>Total general</td>
                {dias.map((d) => <td key={d} className="text-center num">{totalDia(d) ? entero(totalDia(d)) : "—"}</td>)}
                <td className={COL_TOTAL}>{entero(total)}</td>
              </tr>
              <tr>
                <td className={`${COL_DIA} py-2 text-amber`}>% devolución</td>
                {dias.map((d) => <td key={d} className="text-center num text-xs text-amber">{pct(devDia(d))}</td>)}
                <td className={`${COL_TOTAL} text-amber`}>{pct(base ? (base - ent) / base : null)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        titulo="Ventas por día y por país"
        detalle={modoPais === "cantidad" ? "Número de ventas: se puede sumar entre países." : "Monto en la moneda de cada país: no se suma entre países (para sumar, mira la tabla de abajo)."}
        accion={<Alternar opciones={[{ id: "cantidad", label: "Cantidad" }, { id: "monto", label: "Monto" }]} valor={modoPais} onCambio={(v) => setModoPais(v as "cantidad" | "monto")} />}
      >
        <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5 pb-2">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr>
                <th className={`${COL_DIA} text-xs font-medium text-muted min-w-[8rem]`}>Día</th>
                {cuentas.map((c) => (
                  <th key={c} className="px-4 text-right text-xs font-semibold whitespace-nowrap">
                    {infoCuenta(c).bandera} {infoCuenta(c).nombre}{modoPais === "monto" ? ` (${infoCuenta(c).divisa})` : ""}
                  </th>
                ))}
                {modoPais === "cantidad" && <th className={`${COL_TOTAL} text-xs font-mono text-muted`}>Total</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {dias.map((d) => (
                <tr key={d}>
                  <td className={`${COL_DIA} py-1.5 whitespace-nowrap`}>{corto(d)} <span className="text-[10px] text-muted">{DIAS[dow(d)]}</span></td>
                  {cuentas.map((c) => {
                    const x = porPaisDia.get(`${c}|${d}`);
                    const v = modoPais === "cantidad" ? x?.n ?? 0 : x?.venta ?? 0;
                    return <td key={c} className={`px-4 text-right num ${v ? "" : "text-muted/40"}`}>{v ? (modoPais === "cantidad" ? entero(v) : plata(v, infoCuenta(c).divisa)) : "—"}</td>;
                  })}
                  {modoPais === "cantidad" && <td className={COL_TOTAL}>{totalDia(d) ? entero(totalDia(d)) : "—"}</td>}
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={`${COL_DIA} py-2`}>Total</td>
                {cuentas.map((c) => (
                  <td key={c} className="px-4 text-right num">{modoPais === "cantidad" ? entero(porPais(actual.filas, c)) : plata(ventaPais(c), infoCuenta(c).divisa)}</td>
                ))}
                {modoPais === "cantidad" && <td className={COL_TOTAL}>{entero(total)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        titulo="Ventas por día en una sola moneda"
        detalle={trmUsada
          ? `Cada país se convierte a ${moneda} con la TRM de su mes (último mes: 1 USD = ${entero(trmUsada.usd_cop)} COP · 1 GTQ = ${Number(trmUsada.gtq_cop).toLocaleString("es-CO")} COP${trmUsada.estimada ? ", estimada" : ""}) para sumarlos.`
          : "Sin TRM cargada para este periodo."}
        accion={<Alternar opciones={MONEDAS} valor={moneda} onCambio={(v) => setMoneda(v as Moneda)} />}
      >
        <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5 pb-2">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr>
                <th className={`${COL_DIA} text-xs font-medium text-muted min-w-[8rem]`}>Día</th>
                {cuentas.map((c) => (
                  <th key={c} className="px-4 text-right text-xs font-semibold whitespace-nowrap">
                    {infoCuenta(c).bandera} {infoCuenta(c).nombre} <span className="font-normal text-muted">(orig. {infoCuenta(c).divisa})</span>
                  </th>
                ))}
                <th className={`${COL_TOTAL} text-xs font-mono text-muted`}>Total ({moneda})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {dias.map((d) => {
                const fila = cuentas.reduce((a, c) => a + (ventaConv(c, d) ?? 0), 0);
                return (
                  <tr key={d}>
                    <td className={`${COL_DIA} py-1.5 whitespace-nowrap`}>{corto(d)} <span className="text-[10px] text-muted">{DIAS[dow(d)]}</span></td>
                    {cuentas.map((c) => {
                      const orig = porPaisDia.get(`${c}|${d}`)?.venta ?? 0;
                      const conv = ventaConv(c, d);
                      return (
                        <td key={c} className={`px-4 text-right num ${orig ? "" : "text-muted/40"}`}>
                          {orig ? plata(orig, infoCuenta(c).divisa) : "—"}
                          {orig && infoCuenta(c).divisa !== moneda ? <div className="text-[10px] text-muted">{conv == null ? "sin TRM" : `≈ ${plata(conv, moneda)}`}</div> : null}
                        </td>
                      );
                    })}
                    <td className={COL_TOTAL}>{fila ? plata(fila, moneda) : "—"}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className={`${COL_DIA} py-2`}>Total</td>
                {cuentas.map((c) => <td key={c} className="px-4 text-right num">{plata(ventaPais(c), infoCuenta(c).divisa)}</td>)}
                <td className={COL_TOTAL}>{plata(ventaTotal, moneda)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Alternar({ opciones, valor, onCambio }: { opciones: { id: string; label: string }[]; valor: string; onCambio: (v: string) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-line p-0.5 text-xs">
      {opciones.map((o) => (
        <button key={o.id} onClick={() => onCambio(o.id)}
          className={`rounded-lg px-3 py-1 font-semibold transition-colors ${valor === o.id ? "bg-blue/20 text-text" : "text-muted hover:text-text"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Tarjeta de comparación contra el mes pasado: valor, cambio (verde si es bueno, rojo si es malo) y el dato anterior.
function Comparar({ titulo, valor, delta, pie, acento }: {
  titulo: string; valor: ReactNode; delta?: { valor: number; texto: string; bueno: boolean } | null; pie?: ReactNode; acento: string;
}) {
  return (
    <div className="card p-4 border-t-2" style={{ borderTopColor: acento }}>
      <div className="text-[11px] uppercase tracking-widest font-mono text-muted">{titulo}</div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-1.5">
        <span className="num text-3xl font-semibold leading-none">{valor}</span>
        {delta && (
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold num"
            style={{ color: delta.bueno ? "var(--green)" : "var(--red)", background: delta.bueno ? "rgb(47 210 143 / 0.12)" : "rgb(255 90 106 / 0.12)" }}>
            {delta.valor >= 0 ? "▲" : "▼"} {delta.texto}
          </span>
        )}
      </div>
      {pie && <div className="text-xs text-muted mt-2 leading-relaxed">{pie}</div>}
    </div>
  );
}

// Mes a mes: pedidos, crecimiento, % entregado y % devolución de cada mes (todos los meses con datos). El mes en
// curso se compara contra los mismos días del mes anterior; los meses cerrados, mes completo contra mes completo.
function MesAMes({ meses, cuentas, diaHoy, mesHoy }: { meses: FilaMes[]; cuentas: string[]; diaHoy: number; mesHoy: string }) {
  const lista = [...new Set(meses.map((m) => m.mes))].sort();
  if (!lista.length) return null;
  const de = (mes: string, cond: (m: FilaMes) => boolean, campo: "n" | "hasta_dia" = "n") =>
    meses.reduce((a, m) => (m.mes === mes && cond(m) ? a + Number(m[campo]) : a), 0);
  const filas = lista.map((mes, i) => {
    const n = de(mes, () => true), ent = de(mes, (m) => m.estado === "ENTREGADO");
    const base = n - de(mes, (m) => FUERA_BASE.includes(m.estado));
    const previo = i > 0 ? lista[i - 1] : null;
    const enCurso = mes === mesHoy;
    const comparable = previo ? (enCurso ? de(previo, () => true, "hasta_dia") : de(previo, () => true)) : 0;
    return {
      mes, n, enCurso, crec: comparable ? (n - comparable) / comparable : null,
      pctEnt: base ? ent / base : null, pctDev: base ? (base - ent) / base : null,
      paises: Object.fromEntries(cuentas.map((c) => [c, de(mes, (m) => m.cuenta === c)])),
    };
  });
  const etiqueta = (mes: string) => `${MESES_LARGO[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
  return (
    <Panel titulo="Mes a mes" detalle={`Pedidos de cada mes con su crecimiento contra el mes anterior. El mes en curso (hasta el día ${diaHoy}) se compara contra los mismos días del mes anterior.`}>
      <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5 pb-2">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="text-left font-medium py-2 pr-4">Mes</th>
              <th className="text-right font-medium px-3">Pedidos</th>
              <th className="text-right font-medium px-3">Crecimiento</th>
              <th className="text-right font-medium px-3">% Entregado</th>
              <th className="text-right font-medium px-3">Δ entrega</th>
              <th className="text-right font-medium px-3">% Devolución</th>
              <th className="text-right font-medium px-3">Δ devolución</th>
              {cuentas.map((c) => <th key={c} className="text-right font-medium px-3 whitespace-nowrap">{infoCuenta(c).bandera} {infoCuenta(c).nombre}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...filas].reverse().map((f) => {
              const i = filas.indexOf(f), previo = i > 0 ? filas[i - 1] : null;
              const dEnt = f.pctEnt != null && previo?.pctEnt != null ? f.pctEnt - previo.pctEnt : null;
              const dDev = f.pctDev != null && previo?.pctDev != null ? f.pctDev - previo.pctDev : null;
              const color = (v: number | null, subirEsBueno: boolean) => (v == null ? undefined : (v >= 0) === subirEsBueno ? "var(--green)" : "var(--red)");
              return (
                <tr key={f.mes}>
                  <td className="py-2 pr-4 font-semibold whitespace-nowrap">
                    {etiqueta(f.mes)}
                    {f.enCurso && <span className="ml-2 rounded-full border border-blue/40 px-2 py-0.5 text-[10px] text-blue-2">en curso · 1–{diaHoy}</span>}
                  </td>
                  <td className="px-3 text-right num font-semibold">{entero(f.n)}</td>
                  <td className="px-3 text-right num font-semibold" style={{ color: color(f.crec, true) }}>{f.crec == null ? "—" : signoPct(f.crec)}</td>
                  <td className="px-3 text-right num">{pct(f.pctEnt)}</td>
                  <td className="px-3 text-right num text-xs" style={{ color: color(dEnt, true) }}>{dEnt == null ? "—" : puntos(dEnt)}</td>
                  <td className="px-3 text-right num">{pct(f.pctDev)}</td>
                  <td className="px-3 text-right num text-xs" style={{ color: color(dDev, false) }}>{dDev == null ? "—" : puntos(dDev)}</td>
                  {cuentas.map((c) => <td key={c} className="px-3 text-right num text-muted">{f.paises[c] ? entero(f.paises[c]) : "—"}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted mt-2">% devolución = lo que no se ha entregado sobre los pedidos (incluye lo que sigue en camino), por eso los meses recientes salen más altos.</p>
    </Panel>
  );
}
