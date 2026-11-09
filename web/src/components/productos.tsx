"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { dinero, entero } from "@/lib/formato";
import { infoCuenta, semaforoDevolucion, COLOR_SEMAFORO } from "@/lib/paises";
import { AsignarProducto, AceptarSugeridas, type ProductoHistorico } from "./asignar-producto";
import { MarcaOtroPais } from "./marca-otro-pais";

// 📦 Desempeño por producto (réplica del menú Productos del Dashboard Joalix, skill "menu-productos-joalix"). Recibe
// los datos de productos_datos por país y arma en pantalla la cascada, el ranking, las campañas sin identificar, la
// publicidad y la utilidad día × producto y el resumen de estados. Un país: moneda local. Varios: todo en COP con la
// tasa del mes. Reglas del skill: lo sin identificar nunca se reparte; con productos elegidos no hay "sin asignar" ni
// ajuste de conciliación; otros gastos = gastos del mes ÷ entregas del mes, por cada entrega.

type Econ = [string, string, number, number, number, number, number, number, number, number, number];
type Estado = [string, string, string, string, string | null, number];
export type DatosPais = {
  cuenta: string;
  econ: Econ[];
  estados: Estado[];
  ads: [string, string, number][];
  sin: [string, string, string, number][];
  otros?: [string, string | null, string][]; // [campaña, producto, países] con pauta entregada en otro país
  ads_dia: [string, number][];
  meses: Record<string, { factor: number | null; gastos: number; entregas: number }>;
  wallet: number | null; // utilidad del PyG de la wallet antes de gastos fijos (Data Experience)
};

const SIN = "Publicidad sin asignar a producto";
const SINID = "Sin identificar";
const esSin = (p: string) => p === SIN || p === SINID;
const DOW = ["D", "L", "M", "M", "J", "V", "S"];
const ESTADOS = ["ENTREGADO", "EN_TRANSITO", "DEVOLUCION", "NOVEDAD", "PENDIENTE", "EN_OFICINA", "INDEMNIZACION", "CANCELADA"];
const NOMBRE_ESTADO: Record<string, string> = {
  ENTREGADO: "Entregado", EN_TRANSITO: "En tránsito", DEVOLUCION: "Devolución", NOVEDAD: "Novedad", PENDIENTE: "Pendiente",
  EN_OFICINA: "Disponible en oficina", INDEMNIZACION: "Indemnización", CANCELADA: "Cancelada",
};

type Acc = { ent: number; dev: number; pend: number; venta: number; costo: number; flete: number; ful: number; tax: number; fdv: number; ads: number; proy: number; otr: number };
const Z = (): Acc => ({ ent: 0, dev: 0, pend: 0, venta: 0, costo: 0, flete: 0, ful: 0, tax: 0, fdv: 0, ads: 0, proy: 0, otr: 0 });
const util = (o: Acc) => o.venta - o.costo - o.flete - o.ful - o.tax - o.fdv - o.ads;
const sumar = (a: Acc, b: Acc) => { (Object.keys(a) as (keyof Acc)[]).forEach((k) => (a[k] += b[k])); };

function diasEntre(d: string, h: string) {
  const out: string[] = [];
  for (let t = Date.parse(`${d}T12:00:00Z`); t <= Date.parse(`${h}T12:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function Productos({ paises, desde, hasta, puedeEditar = false, productosHist = [] }: {
  paises: DatosPais[]; desde: string; hasta: string; puedeEditar?: boolean; productosHist?: ProductoHistorico[];
}) {
  const [sel, setSel] = useState<string[]>([]);
  const [prov, setProv] = useState<string>("");
  const [sort, setSort] = useState<{ k: string; dir: number }>({ k: "venta", dir: -1 });
  const [det, setDet] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const all = paises.length > 1;
  const una = all ? null : paises[0]?.cuenta ?? "TIENDA_CO";
  const fmtCuenta = all ? "TIENDA_CO" : una!;
  const esCO = una === "TIENDA_CO";
  const fulLbl = all ? "Fulfillment / 4x1000" : esCO ? "Impuesto 4x1000" : "Fulfillment";
  const days = useMemo(() => diasEntre(desde, hasta), [desde, hasta]);

  const todosProductos = useMemo(() => {
    const s = new Set<string>();
    paises.forEach((P) => { P.econ.forEach((e) => s.add(e[1])); P.ads.forEach((a) => s.add(a[1])); });
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [paises]);
  const proveedores = useMemo(() => {
    const s = new Set<string>();
    paises.forEach((P) => P.estados.forEach((e) => e[4] && s.add(e[4])));
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [paises]);

  const m = useMemo(() => {
    const S = new Set(sel);
    const okP = (p: string) => S.size === 0 || S.has(p);
    const M: Record<string, Record<string, Acc>> = {};
    const get = (p: string, d: string) => ((M[p] ??= {})[d] ??= Z());
    let adj = 0;
    paises.forEach((P) => {
      const fac = (mes: string) => P.meses[mes]?.factor ?? 0; // COP → moneda local
      const aCOP = (v: number, mes: string) => (fac(mes) ? v / fac(mes) : 0);
      const f = (v: number, mes: string) => (all ? aCOP(v, mes) : v);
      const rate = (mes: string) => { const x = P.meses[mes]; return x && x.gastos > 0 && x.entregas > 0 ? x.gastos / x.entregas : 0; };
      let pre = 0;
      // proyección: flete de devolución promedio real por producto (≥3 devoluciones), si no el del país
      const st: Record<string, { dev: number; fdv: number }> = {};
      let TD = 0, TF = 0;
      P.econ.forEach((e) => { const q = (st[e[1]] ??= { dev: 0, fdv: 0 }); q.dev += e[3]; q.fdv += e[10]; TD += e[3]; TF += e[10]; });
      const gavg = TD ? TF / TD : 0;
      P.econ.forEach(([d, p, ent, dev, pend, venta, costo, flete, ful, x4, fdv]) => {
        if (!okP(p)) return;
        const mes = d.slice(0, 7), o = get(p, d);
        o.ent += ent; o.dev += dev; o.pend += pend; o.otr += f(ent * rate(mes), mes);
        o.venta += f(venta, mes); o.costo += f(costo, mes); o.flete += f(flete, mes); o.ful += f(ful, mes); o.tax += f(x4, mes); o.fdv += f(fdv, mes);
        pre += venta - costo - flete - ful - x4 - fdv;
        if (pend) { const q = st[p]; const avg = q.dev >= 3 && q.fdv > 0 ? q.fdv / q.dev : gavg; o.proy += f(pend * avg, mes); pre -= pend * avg; }
      });
      const asg: Record<string, number> = {};
      P.ads.forEach(([d, p, cop]) => {
        asg[d] = (asg[d] ?? 0) + cop;
        const mes = d.slice(0, 7);
        pre -= cop * fac(mes);
        if (okP(p)) get(p, d).ads += all ? cop : cop * fac(mes);
      });
      P.sin.forEach(([d, , , cop]) => {
        asg[d] = (asg[d] ?? 0) + cop;
        const mes = d.slice(0, 7);
        pre -= cop * fac(mes);
        if (S.size === 0) get(SINID, d).ads += all ? cop : cop * fac(mes);
      });
      P.ads_dia.forEach(([d, cop]) => {
        const resto = cop - (asg[d] ?? 0);
        if (resto > 1) { const mes = d.slice(0, 7); pre -= resto * fac(mes); if (S.size === 0) get(SIN, d).ads += all ? resto : resto * fac(mes); }
      });
      if (P.wallet != null) { const a = P.wallet - pre; adj += all ? aCOP(a, hasta.slice(0, 7)) : a; }
    });
    if (S.size) adj = 0;
    const A: Record<string, Acc & { guias: number; u: number }> = {};
    const gt = Z(); const tot: Record<string, Acc> = {};
    Object.keys(M).forEach((p) => {
      const o = Z();
      days.forEach((d) => { const x = M[p][d]; if (!x) return; sumar(o, x); sumar((tot[d] ??= Z()), x); });
      A[p] = { ...o, guias: o.ent + o.dev + o.pend, u: util(o) };
      sumar(gt, o);
    });
    return { M, A, gt, tot, adj };
  }, [paises, sel, days, all, hasta]);

  const { M, A, gt, tot, adj } = m;
  const nf = (v: number, d: number) => Math.abs(v).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
  const sg = (v: number, d: number) => `${v < -0.005 ? "-" : ""}${nf(v, d)} %`; // porcentaje con signo
  const fm = (v: number) => (Math.abs(v) < 0.005 ? "–" : dinero(v, fmtCuenta));
  const fmz = (v: number) => dinero(v, fmtCuenta);
  const neg = (v: number) => (Math.abs(v) < 0.005 ? "–" : dinero(-v, fmtCuenta));
  const cls = (v: number | null) => (v == null || Math.abs(v) < 0.005 ? "" : v > 0 ? "text-green" : "text-red");
  const venta = gt.venta;
  const pc = (v: number) => (venta > 0.005 ? sg((v / venta) * 100, 1) : "–");
  const gtU = util(gt);
  const up = gtU - gt.proy;
  const uf = up + adj - gt.otr;
  const roi = gt.ads > 0.005 ? (uf / gt.ads) * 100 : null;
  const maxv = Math.max(venta, 1);
  const thDias = days.map((d) => <th key={d} title={d} className="text-right">{d.slice(8)}/{d.slice(5, 7)}<div className="text-[10px] text-muted">{DOW[new Date(`${d}T12:00:00Z`).getUTCDay()]}</div></th>);

  // ranking
  const prods = Object.keys(A).filter((p) => Math.abs(A[p].u) > 0.005 || A[p].venta > 0.005 || A[p].ads > 0.005 || A[p].guias > 0);
  const filas = prods.map((p) => {
    const o = A[p]; const ufp = o.u - o.proy - o.otr;
    return { p, venta: o.venta, costo: o.costo, flete: o.flete, ful: o.ful + o.tax, fdv: o.fdv, ads: o.ads, u: o.u, pend: o.pend, proy: o.proy, up: o.u - o.proy, otr: o.otr, uf: ufp,
      roi: o.ads > 0.005 ? (ufp / o.ads) * 100 : null, mg: o.venta > 0.005 ? (o.u / o.venta) * 100 : null, peso: venta > 0.005 ? (o.venta / venta) * 100 : 0 };
  });
  type Fila = (typeof filas)[number];
  filas.sort((a, b) => {
    if (esSin(a.p) !== esSin(b.p)) return esSin(a.p) ? 1 : -1;
    if (sort.k === "p") return sort.dir * a.p.localeCompare(b.p, "es");
    const x = a[sort.k as keyof Fila] as number | null, y = b[sort.k as keyof Fila] as number | null;
    return sort.dir * ((x ?? -Infinity) - (y ?? -Infinity));
  });
  const maxU = Math.max(1, ...filas.map((r) => Math.abs(r.u)));
  const COLS: [string, string][] = [["p", "Producto"], ["venta", "Venta liq."], ["costo", "− Costo"], ["flete", "− Flete entrega"], ["ful", `− ${fulLbl}`], ["fdv", "− Flete dev."], ["ads", "− Publicidad"], ["u", "Utilidad"], ["pend", "Pend."], ["proy", "− Proy. dev."], ["up", "Util. proyectada"], ["otr", "− Otros gastos"], ["uf", "Util. final"], ["roi", "ROI ads"], ["mg", "% s/venta"], ["peso", "Peso"]];
  const ordenar = (k: string) => setSort((s) => (s.k === k ? { k, dir: -s.dir } : { k, dir: k === "p" ? 1 : -1 }));

  // Pauta entregada en otro país (se marca con * rojo): por campaña y por producto.
  const otrosCampana = new Map<string, string>();
  const otrosProducto = new Map<string, Set<string>>();
  paises.forEach((P) => (P.otros ?? []).forEach(([c, prod, ps]) => {
    otrosCampana.set(c, ps);
    const k = prod ?? SINID;
    const set = otrosProducto.get(k) ?? new Set<string>();
    ps.split(",").forEach((x) => set.add(x));
    otrosProducto.set(k, set);
  }));
  const marcaProducto = (p: string) => (otrosProducto.has(p) ? <MarcaOtroPais paises={[...otrosProducto.get(p)!].join(",")} /> : null);

  // campañas sin identificar
  const sinRows = useMemo(() => {
    if (sel.length) return [];
    const acc: Record<string, { c: string; b: string; pais: string; v: number; ds: Set<string> }> = {};
    paises.forEach((P) => P.sin.forEach(([d, b, c, cop]) => {
      const mes = d.slice(0, 7); const fac = P.meses[mes]?.factor ?? 0;
      const k = `${P.cuenta}||${b}||${c}`; const o = (acc[k] ??= { c, b, pais: P.cuenta, v: 0, ds: new Set() });
      o.v += all ? cop : cop * fac; o.ds.add(d);
    }));
    return Object.values(acc).sort((a, b) => b.v - a.v);
  }, [paises, sel, all]);
  const sinTot = sinRows.reduce((s, r) => s + r.v, 0);
  const editar = puedeEditar && !all; // homologar aquí mismo: un país a la vez

  // publicidad por día
  const adsProds = Object.keys(A).filter((p) => A[p].ads > 0.005).sort((a, b) => Number(esSin(a)) - Number(esSin(b)) || A[b].venta - A[a].venta || A[b].ads - A[a].ads);
  const control = days.map((d) => paises.reduce((s, P) => { const c = P.ads_dia.find((x) => x[0] === d)?.[1] ?? 0; const fac = P.meses[d.slice(0, 7)]?.factor ?? 0; return s + (all ? c : c * fac); }, 0));
  const ordenados = prods.slice().sort((a, b) => Number(esSin(a)) - Number(esSin(b)) || A[b].venta - A[a].venta || A[b].ads - A[a].ads);

  // resumen de estados (producto o proveedor, excluyentes)
  const estados = useMemo(() => {
    const T: Record<string, Record<string, number>> = {};
    paises.forEach((P) => P.estados.forEach(([d, p, e, , pv, n]) => {
      if (sel.length && !sel.includes(p)) return;
      if (prov && pv !== prov) return;
      (T[e] ??= {})[d] = (T[e][d] ?? 0) + n;
    }));
    return T;
  }, [paises, sel, prov]);
  const listaEstados = [...ESTADOS.filter((e) => estados[e]), ...Object.keys(estados).filter((e) => !ESTADOS.includes(e))];
  const totDia = (d: string) => listaEstados.reduce((s, e) => s + (estados[e]?.[d] ?? 0), 0);
  const devPct = (d: string | null) => {
    const sum = (e: string) => (d ? estados[e]?.[d] ?? 0 : Object.values(estados[e] ?? {}).reduce((a, b) => a + b, 0));
    const total = d ? totDia(d) : days.reduce((s, x) => s + totDia(x), 0);
    const base = total - sum("INDEMNIZACION");
    return base > 0 ? (base - sum("ENTREGADO")) / base : null;
  };

  const etiquetaProd = sel.length === 0 ? "Todos los productos" : sel.length === 1 ? sel[0] : `${sel.length} productos`;
  const lbl = `${days[0]?.slice(8)}/${days[0]?.slice(5, 7)} – ${days.at(-1)?.slice(8)}/${days.at(-1)?.slice(5, 7)}`;

  return (
    <div className="space-y-3">
      {/* Filtros del módulo: producto (varios) y proveedor (solo resumen de estados; excluyentes). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button onClick={() => setAbierto((v) => !v)} className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm hover:border-blue-2">
            📦 {etiquetaProd} ▾
          </button>
          {abierto && (
            <div className="absolute z-20 mt-1 max-h-80 w-72 overflow-auto rounded-xl border border-line bg-panel p-2 shadow-xl">
              <button onClick={() => setSel([])} className="mb-1 w-full rounded px-2 py-1 text-left text-xs text-blue-2 hover:bg-tinte/5">Todos los productos</button>
              {todosProductos.map((p) => (
                <label key={p} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-tinte/5">
                  <input type="checkbox" checked={sel.includes(p)} onChange={(e) => { setProv(""); setSel((s) => (e.target.checked ? [...s, p] : s.filter((x) => x !== p))); }} />
                  {p}
                </label>
              ))}
            </div>
          )}
        </div>
        {proveedores.length > 0 && (
          <select value={prov} onChange={(e) => { setSel([]); setProv(e.target.value); }} className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm">
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        {prov && <span className="text-xs text-muted">El proveedor filtra solo el resumen de estados.</span>}
      </div>

      <section className="card p-4 sm:p-5 min-w-0">
        <h2 className="font-display text-lg font-semibold tracking-tight">Desempeño por producto</h2>
        <p className="text-xs text-muted mt-1">
          {all ? "Países seleccionados · en pesos colombianos (tasa promedio del mes)" : `${infoCuenta(una!).bandera} ${infoCuenta(una!).nombre} · moneda local`} · {lbl}. Cada día es el de creación de la guía u orden.
          Utilidad = lo ya liquidado (entregadas − costo − fletes − {fulLbl.toLowerCase()}, devueltas − flete de devolución) menos la publicidad del producto. No incluye gastos fijos mensuales.
        </p>

        {/* Cascada */}
        <div className="mt-4 overflow-x-auto">
          <div className="text-sm sm:min-w-[560px]">
            {[
              ["Ventas liquidadas (entregadas)", venta, 1, gt.ent, "base"],
              ["− Costo de mercancía", gt.costo, -1, gt.ent, ""],
              ["− Flete de entrega", gt.flete, -1, gt.ent, ""],
              [`− ${fulLbl}`, gt.ful + gt.tax, -1, null, ""],
              ["− Flete de devolución", gt.fdv, -1, gt.dev, ""],
              ["− Publicidad", gt.ads, -1, null, ""],
            ].map(([n, v, s, g, k]) => (
              <FilaCascada key={n as string} nombre={n as string} ancho={Math.abs(v as number) / maxv} barra={k === "base" ? "base" : "neg"}
                cant={g as number | null} valor={k === "base" ? fmz(v as number) : Math.abs(v as number) < 0.005 ? "–" : fmz((v as number) * (s as number))} pct={k === "base" ? "100 %" : pc(v as number)} />
            ))}
            <FilaCascada nombre="= Utilidad antes de gastos fijos" total ancho={Math.abs(gtU) / maxv} barra={gtU < 0 ? "neg" : "pos"} cant={gt.ent} valor={fmz(gtU)} pct={pc(gtU)} clase={cls(gtU)} />
            <FilaCascada nombre={`− Proyección: ${entero(Math.round(gt.pend))} guías pendientes que se devuelvan`} ancho={gt.proy / maxv} barra="neg" cant={gt.pend} valor={Math.abs(gt.proy) < 0.005 ? "–" : fmz(-gt.proy)} pct={pc(gt.proy)} />
            <FilaCascada nombre="= Utilidad proyectada" total ancho={Math.abs(up) / maxv} barra={up < 0 ? "neg" : "pos"} cant={gt.ent} valor={fmz(up)} pct={pc(up)} clase={cls(up)} />
            <FilaCascada nombre="± Ajuste de conciliación con wallet (reversos, garantías, guías sin acreditar, promedio de proyección)" ancho={Math.abs(adj) / maxv} barra={adj < 0 ? "neg" : "pos"} cant={null} valor={Math.abs(adj) < 0.005 ? "–" : fmz(adj)} pct={pc(adj)} clase={cls(adj)} />
            <FilaCascada nombre="− Otros gastos del mes (aplicaciones, nómina, administrativo, operativo) promediados por entrega" ancho={gt.otr / maxv} barra="neg" cant={gt.ent} valor={Math.abs(gt.otr) < 0.005 ? "–" : fmz(-gt.otr)} pct={pc(gt.otr)} />
            <FilaCascada nombre="= Utilidad final después de otros gastos" total ancho={Math.abs(uf) / maxv} barra={uf < 0 ? "neg" : "pos"} cant={gt.ent} valor={fmz(uf)} pct={pc(uf)} clase={cls(uf)} />
            <FilaCascada nombre="ROI sobre publicidad (utilidad final ÷ inversión en ads)" ancho={0} barra="pos" cant={null} valor={roi == null ? "–" : sg(roi, 1)} pct="" clase={cls(roi)} />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Hasta la utilidad antes de gastos fijos no se incluyen aplicaciones, nómina, administrativo ni operativo. El ajuste de conciliación hace que la utilidad final sea la misma del PyG de la wallet (Data Experience).
          Otros gastos: total diligenciado del mes ÷ guías entregadas del mes del país, × las entregas de cada producto (un mes sin gastos cargados queda en cero). Base: {entero(Math.round(gt.ent))} guías entregadas y {entero(Math.round(gt.dev))} devueltas.
          La proyección supone que todas las guías pendientes terminan en devolución: solo suma el flete de devolución promedio real (sin costo de mercancía).
        </p>

        {/* Ranking */}
        <div className="mt-5 overflow-x-auto -mx-4 sm:-mx-5 md:px-5">
          <table className="tabla w-full min-w-max text-sm">
            <thead>
              <tr>
                {COLS.map(([k, t]) => (
                  <th key={k} onClick={() => ordenar(k)} className={`cursor-pointer select-none ${k === "p" ? "text-left" : "text-right"} ${sort.k === k ? "text-blue-2" : ""}`}>
                    {t}{sort.k === k ? (sort.dir < 0 ? " ▼" : " ▲") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((r, i) => (
                <tr key={r.p}>
                  <td className="text-left">{!esSin(r.p) && <span className="mr-1.5 text-xs text-muted">{i + 1}</span>}{esSin(r.p) ? <i>{r.p}</i> : r.p}{marcaProducto(r.p)}</td>
                  <td className="num text-right">{fm(r.venta)}</td><td className="num text-right">{neg(r.costo)}</td><td className="num text-right">{neg(r.flete)}</td>
                  <td className="num text-right">{neg(r.ful)}</td><td className="num text-right">{neg(r.fdv)}</td><td className="num text-right">{neg(r.ads)}</td>
                  <td className={`num text-right ${cls(r.u)}`}>
                    <div className="flex items-center justify-end gap-2">
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-tinte/5"><span className="block h-full rounded-full" style={{ width: `${(Math.abs(r.u) / maxU) * 100}%`, background: r.u < 0 ? "var(--red)" : "var(--green)" }} /></span>
                      <b>{fm(r.u)}</b>
                    </div>
                  </td>
                  <td className="num text-right">{r.pend ? entero(Math.round(r.pend)) : "–"}</td><td className="num text-right">{neg(r.proy)}</td>
                  <td className={`num text-right ${cls(r.up)}`}>{fm(r.up)}</td><td className="num text-right">{neg(r.otr)}</td>
                  <td className={`num text-right ${cls(r.uf)}`}>{fm(r.uf)}</td>
                  <td className={`num text-right ${cls(r.roi)}`}>{r.roi == null ? "–" : sg(r.roi, 0)}</td>
                  <td className={`num text-right ${cls(r.mg)}`}>{r.mg == null ? "–" : sg(r.mg, 1)}</td>
                  <td className="num text-right">{nf(r.peso, 1)} %</td>
                </tr>
              ))}
              {filas.length > 0 && Math.abs(adj) >= 0.005 && (
                <tr><td className="text-left"><i>Ajuste de conciliación con wallet</i></td><td colSpan={11} /><td className={`num text-right ${cls(adj)}`}>{fm(adj)}</td><td colSpan={3} /></tr>
              )}
              {filas.length > 0 ? (
                <tr className="font-semibold">
                  <td className="text-left">Total</td><td className="num text-right">{fm(gt.venta)}</td><td className="num text-right">{neg(gt.costo)}</td><td className="num text-right">{neg(gt.flete)}</td>
                  <td className="num text-right">{neg(gt.ful + gt.tax)}</td><td className="num text-right">{neg(gt.fdv)}</td><td className="num text-right">{neg(gt.ads)}</td>
                  <td className={`num text-right ${cls(gtU)}`}>{fm(gtU)}</td><td className="num text-right">{entero(Math.round(gt.pend))}</td><td className="num text-right">{neg(gt.proy)}</td>
                  <td className={`num text-right ${cls(up)}`}>{fm(up)}</td><td className="num text-right">{neg(gt.otr)}</td><td className={`num text-right ${cls(uf)}`}>{fm(uf)}</td>
                  <td className={`num text-right ${cls(roi)}`}>{roi == null ? "–" : sg(roi, 0)}</td>
                  <td className={`num text-right ${cls(gtU)}`}>{venta > 0.005 ? sg((gtU / venta) * 100, 1) : "–"}</td><td className="num text-right">100 %</td>
                </tr>
              ) : (
                <tr><td colSpan={COLS.length} className="text-center text-muted">Sin movimientos en este rango.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Campañas sin identificar */}
      <section className="card p-4 sm:p-5 min-w-0">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-semibold">
            Campañas sin identificar{" "}
            <span className="text-xs font-normal text-muted">{sinRows.length ? `· ${sinRows.length} campaña${sinRows.length === 1 ? "" : "s"} · ${fmz(sinTot)}${gt.ads > 0.005 ? ` (${nf((sinTot / gt.ads) * 100, 1)} % de la publicidad)` : ""}` : ""}</span>
          </h3>
          <span className="flex flex-wrap items-center gap-3">
            {editar && una && <AceptarSugeridas cuenta={una} campanas={sinRows.map((r) => r.c)} productos={productosHist} />}
            {!all && <Link href={`/productos/homologar?c=${una}&d=${desde}&h=${hasta}`} className="text-sm text-blue-2 hover:underline">Ver todas las campañas →</Link>}
          </span>
        </header>
        <div className="mt-3 overflow-x-auto -mx-4 sm:-mx-5 md:px-5">
          <table className="tabla w-full min-w-max text-sm">
            <thead><tr><th className="text-left">Campaña</th>{all && <th className="text-left">País</th>}<th className="text-left">Cuenta</th><th className="text-right">Días con gasto</th><th className="text-right">Inversión</th><th className="text-right">% de la publicidad</th>{editar && <th className="text-left">¿De qué producto es?</th>}</tr></thead>
            <tbody>
              {sinRows.map((r) => (
                <tr key={`${r.pais}${r.b}${r.c}`}>
                  <td className="text-left">{r.c}<MarcaOtroPais paises={otrosCampana.get(r.c)} /></td>{all && <td className="text-left">{infoCuenta(r.pais).bandera}</td>}<td className="text-left">{r.b}</td>
                  <td className="num text-right">{r.ds.size}</td><td className="num text-right">{fmz(r.v)}</td><td className="num text-right">{gt.ads > 0.005 ? `${nf((r.v / gt.ads) * 100, 1)} %` : "–"}</td>
                  {editar && <td className="text-left"><AsignarProducto cuenta={r.pais} campana={r.c} productos={productosHist} /></td>}
                </tr>
              ))}
              {sinRows.length === 0 && <tr><td colSpan={(all ? 6 : 5) + (editar ? 1 : 0)} className="text-center text-muted">{sel.length ? "Con productos elegidos no se muestran." : "✓ Todas las campañas de este período están asignadas a un producto."}</td></tr>}
              {sinRows.length > 0 && <tr className="font-semibold"><td className="text-left">Total</td>{all && <td />}<td /><td /><td className="num text-right">{fmz(sinTot)}</td><td className="num text-right">{gt.ads > 0.005 ? `${nf((sinTot / gt.ads) * 100, 1)} %` : "–"}</td>{editar && <td />}</tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Inversión publicitaria por día y producto */}
      <section className="card p-4 sm:p-5 min-w-0">
        <h3 className="font-display text-base font-semibold">Inversión publicitaria por día y producto <span className="text-xs font-normal text-muted">· {all ? "pesos colombianos" : infoCuenta(una!).divisa}</span></h3>
        <div className="mt-3 overflow-x-auto -mx-4 sm:-mx-5 md:px-5">
          <table className="tabla w-full min-w-max text-sm">
            <thead><tr><th className="text-left">Producto</th>{thDias}<th className="text-right">Total</th></tr></thead>
            <tbody>
              {adsProds.map((p) => (
                <tr key={p}><td className="text-left">{esSin(p) ? <i>{p}</i> : p}{marcaProducto(p)}</td>{days.map((d) => <td key={d} className="num text-right">{fm(M[p][d]?.ads ?? 0)}</td>)}<td className="num text-right font-semibold">{fm(A[p].ads)}</td></tr>
              ))}
              <tr className="font-semibold"><td className="text-left">Total publicidad</td>{days.map((d) => <td key={d} className="num text-right">{fm(tot[d]?.ads ?? 0)}</td>)}<td className="num text-right">{fm(gt.ads)}</td></tr>
              <tr className="text-muted"><td className="text-left">Control: gasto real de las cuentas</td>{control.map((v, i) => <td key={days[i]} className="num text-right">{fm(v)}</td>)}<td className="num text-right">{fm(control.reduce((a, b) => a + b, 0))}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Utilidad día a día */}
      <section className="card p-4 sm:p-5 min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold">Utilidad día a día por producto</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={det} onChange={(e) => setDet(e.target.checked)} /> Ver discriminado</label>
        </header>
        <div className="mt-3 overflow-x-auto -mx-4 sm:-mx-5 md:px-5">
          <table className="tabla w-full min-w-max text-sm">
            <thead><tr><th className="text-left">Producto</th>{thDias}<th className="text-right">Total</th></tr></thead>
            <tbody>
              {ordenados.map((p) => {
                const o = A[p];
                if (!det) return (
                  <tr key={p}><td className="text-left">{esSin(p) ? <i>{p}</i> : p}</td>{days.map((d) => { const x = M[p][d]; const u = x ? util(x) : 0; return <td key={d} className={`num text-right ${cls(u)}`}>{fm(u)}</td>; })}<td className={`num text-right font-semibold ${cls(o.u)}`}>{fm(o.u)}</td></tr>
                );
                const lineas: [string, keyof Acc][] = [["Ventas liquidadas", "venta"], ["− Costo de mercancía", "costo"], ["− Flete de entrega", "flete"], ["− Fulfillment", "ful"], ["− Impuesto 4x1000", "tax"], ["− Flete de devolución", "fdv"], ["− Publicidad", "ads"]];
                return (
                  <Fragment key={p}>
                    <tr className="font-semibold"><td className="text-left" colSpan={days.length + 2}>{p}</td></tr>
                    {lineas.filter(([, k]) => Math.abs(o[k]) > 0.005).map(([t, k]) => (
                      <tr key={k} className="text-muted"><td className="text-left pl-4">{t}</td>{days.map((d) => <td key={d} className="num text-right">{fm((M[p][d]?.[k] ?? 0) * (k === "venta" ? 1 : -1))}</td>)}<td className="num text-right">{fm(o[k] * (k === "venta" ? 1 : -1))}</td></tr>
                    ))}
                    <tr><td className="text-left pl-4">= Utilidad del día</td>{days.map((d) => { const x = M[p][d]; const u = x ? util(x) : 0; return <td key={d} className={`num text-right ${cls(u)}`}>{fm(u)}</td>; })}<td className={`num text-right ${cls(o.u)}`}>{fm(o.u)}</td></tr>
                    {o.otr > 0.005 && (
                      <>
                        <tr className="text-muted"><td className="text-left pl-4">− Otros gastos (promediado)</td>{days.map((d) => <td key={d} className="num text-right">{fm(-(M[p][d]?.otr ?? 0))}</td>)}<td className="num text-right">{fm(-o.otr)}</td></tr>
                        <tr><td className="text-left pl-4">= Utilidad después de otros gastos</td>{days.map((d) => { const x = M[p][d]; const u = x ? util(x) - x.otr : 0; return <td key={d} className={`num text-right ${cls(u)}`}>{fm(u)}</td>; })}<td className={`num text-right ${cls(o.u - o.otr)}`}>{fm(o.u - o.otr)}</td></tr>
                      </>
                    )}
                    <tr className="text-muted"><td className="text-left pl-4">Guías entreg. / dev. / pend.</td>{days.map((d) => { const x = M[p][d]; return <td key={d} className="num text-right">{x && (x.ent || x.dev || x.pend) ? `${Math.round(x.ent)} / ${Math.round(x.dev)} / ${Math.round(x.pend)}` : "–"}</td>; })}<td className="num text-right">{Math.round(o.ent)} / {Math.round(o.dev)} / {Math.round(o.pend)}</td></tr>
                  </Fragment>
                );
              })}
              <tr className="font-semibold"><td className="text-left">Total</td>{days.map((d) => { const t = tot[d]; const u = t ? util(t) : 0; return <td key={d} className={`num text-right ${cls(u)}`}>{fm(u)}</td>; })}<td className={`num text-right ${cls(gtU)}`}>{fm(gtU)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          {A[SINID]?.ads > 0.005 && <><b>Sin identificar:</b> campañas cuyo nombre no permite saber el producto; se mantienen aparte (no se reparten) hasta que se homologuen. </>}
          {otrosProducto.size > 0 && <><span className="font-bold text-red">*</span> Parte de la pauta se entregó en otro país donde la sociedad no tiene tienda y se carga a esta (pasa el mouse para ver el país). </>}
          {A[SIN]?.ads > 0.005 && <><b>Publicidad sin asignar a producto:</b> gasto de las cuentas sin detalle por campaña; está descontado del total para que la utilidad sea real. </>}
          Las guías en tránsito, novedad o pendientes todavía no suman utilidad y se reflejan cuando se liquidan; por eso los últimos días se ven más bajos. Las guías de varios productos se reparten por unidades.
        </p>
      </section>

      {/* Resumen diario por estados */}
      <section className="card p-4 sm:p-5 min-w-0">
        <h3 className="font-display text-base font-semibold">Resumen diario por estados {sel.length ? `· ${etiquetaProd}` : prov ? `· ${prov}` : ""}</h3>
        <div className="mt-3 overflow-x-auto -mx-4 sm:-mx-5 md:px-5">
          <table className="tabla w-full min-w-max text-sm">
            <thead><tr><th className="text-left">Estado</th>{thDias}<th className="text-right">Total</th></tr></thead>
            <tbody>
              {listaEstados.map((e) => (
                <tr key={e}><td className="text-left">{NOMBRE_ESTADO[e] ?? e}</td>{days.map((d) => <td key={d} className="num text-right">{estados[e]?.[d] ? entero(estados[e][d]) : "–"}</td>)}<td className="num text-right font-semibold">{entero(Object.values(estados[e] ?? {}).reduce((a, b) => a + b, 0))}</td></tr>
              ))}
              <tr className="font-semibold"><td className="text-left">Total general</td>{days.map((d) => <td key={d} className="num text-right">{totDia(d) ? entero(totDia(d)) : "–"}</td>)}<td className="num text-right">{entero(days.reduce((s, d) => s + totDia(d), 0))}</td></tr>
              <tr>
                <td className="text-left">% devolución</td>
                {[...days, null].map((d) => {
                  const p = devPct(d); const s = all ? "nada" : semaforoDevolucion(una!, p);
                  return <td key={d ?? "t"} className="num text-right" style={{ color: s === "nada" ? undefined : COLOR_SEMAFORO[s] }}>{p == null ? "–" : `${nf(p * 100, 1)} %`}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">% devolución = (total − indemnizaciones − entregadas) ÷ (total − indemnizaciones). Guías por producto: una guía con varios productos cuenta en cada uno.</p>
      </section>
    </div>
  );
}

function FilaCascada({ nombre, ancho, barra, cant, valor, pct, total, clase = "" }: {
  nombre: string; ancho: number; barra: "base" | "neg" | "pos"; cant: number | null; valor: string; pct: string; total?: boolean; clase?: string;
}) {
  const color = barra === "base" ? "var(--blue)" : barra === "neg" ? "var(--red)" : "var(--green)";
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto_3.5rem] sm:grid-cols-[minmax(0,1fr)_9rem_4.5rem_8rem_4rem] items-center gap-x-3 border-b border-line/50 py-1.5 ${total ? "font-semibold" : ""}`}>
      <div className="min-w-0">{nombre}</div>
      <div className="hidden sm:block h-2 overflow-hidden rounded-full bg-tinte/5"><div className="h-full rounded-full" style={{ width: `${Math.min(100, ancho * 100)}%`, background: color, opacity: total ? 1 : 0.75 }} /></div>
      <div className="hidden sm:block num text-right text-muted">{cant == null || Math.abs(cant) < 0.5 ? "" : entero(Math.round(cant))}</div>
      <div className={`num text-right ${clase}`}>{valor}</div>
      <div className={`num text-right text-muted ${clase}`}>{pct}</div>
    </div>
  );
}
