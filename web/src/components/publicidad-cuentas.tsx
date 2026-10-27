"use client";

import { useState, type ReactNode } from "react";
import { diaCorto, pct } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";
import { TablaScroll } from "./ui";
import { Doble, cop, portafolio } from "./publicidad-montos";

export type CuentaAds = {
  cuenta_ads: string; total: number; por_tienda: Record<string, number>; por_tienda_local: Record<string, number | null>; ultimo: string;
  portafolio: string | null; por_api: boolean; ultima_sync: string | null; error: string | null;
};

const origen = (c: CuentaAds) => (c.por_api ? `API · ${portafolio(c.portafolio)}` : "Archivo (sin API)");

// Tabla "Cuentas publicitarias": se ordena por cualquier columna (clic en el encabezado; otro clic invierte el orden).
// Los países y el total ordenan por pesos; las celdas vacías van siempre al final.
type Columna = "origen" | "cuenta" | "total" | "pct" | "ultimo" | `t:${string}`;

export function TablaCuentasAds({ filas, tiendas, total, unica }: { filas: CuentaAds[]; tiendas: string[]; total: number; unica: string | null }) {
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: "total", asc: false });
  const valor = (c: CuentaAds, col: Columna): string | number | null =>
    col === "origen" ? origen(c)
      : col === "cuenta" ? c.cuenta_ads.toLowerCase()
        : col === "total" || col === "pct" ? Number(c.total)
          : col === "ultimo" ? c.ultimo
            : c.por_tienda[col.slice(2)] ? Number(c.por_tienda[col.slice(2)]) : null;
  const ordenadas = [...filas].sort((a, b) => {
    const x = valor(a, orden.col), y = valor(b, orden.col);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es");
    return orden.asc ? d : -d;
  });
  const sumaLocal = (o: Record<string, number | null>) => Object.values(o).reduce<number>((a, v) => a + Number(v ?? 0), 0);

  const Th = ({ col, children, derecha = false }: { col: Columna; children: ReactNode; derecha?: boolean }) => {
    const activa = orden.col === col;
    const texto = col === "origen" || col === "cuenta";
    return (
      <th className={derecha ? "text-right" : undefined} aria-sort={activa ? (orden.asc ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          onClick={() => setOrden(activa ? { col, asc: !orden.asc } : { col, asc: texto })}
          className={`inline-flex items-center gap-1 hover:text-text transition-colors ${activa ? "text-text" : ""}`}
          title="Ordenar"
        >
          {children}
          <span className={`text-[10px] ${activa ? "opacity-100" : "opacity-30"}`}>{activa ? (orden.asc ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  };

  return (
    <TablaScroll>
      <thead>
        <tr>
          <Th col="origen">Origen</Th>
          <Th col="cuenta">Cuenta</Th>
          {tiendas.map((t) => <Th key={t} col={`t:${t}`} derecha>{infoCuenta(t).bandera} {infoCuenta(t).nombre}</Th>)}
          <Th col="total" derecha>Total</Th>
          <Th col="pct" derecha>% del total</Th>
          <Th col="ultimo" derecha>Último día</Th>
        </tr>
      </thead>
      <tbody>
        {ordenadas.map((c) => (
          <tr key={c.cuenta_ads}>
            <td className="text-xs">
              {c.por_api
                ? <span className={c.error ? "text-red" : "text-green"} title={c.error ?? undefined}>{origen(c)}{c.error ? " · error" : ""}</span>
                : <span className="text-amber">{origen(c)}</span>}
            </td>
            <td className="font-medium">{c.cuenta_ads}</td>
            {tiendas.map((t) => (
              <td key={t} className="text-right num">
                {c.por_tienda[t] ? <Doble local={c.por_tienda_local[t]} enCop={c.por_tienda[t]} cuenta={t} /> : <span className="text-muted">—</span>}
              </td>
            ))}
            <td className="text-right num">
              {unica ? <Doble local={sumaLocal(c.por_tienda_local)} enCop={c.total} cuenta={unica} fuerte /> : <span className="font-semibold">{cop(c.total)}</span>}
            </td>
            <td className="text-right num text-muted">{pct(total ? c.total / total : 0)}</td>
            <td className="text-right text-muted">{diaCorto(c.ultimo)}</td>
          </tr>
        ))}
      </tbody>
    </TablaScroll>
  );
}
