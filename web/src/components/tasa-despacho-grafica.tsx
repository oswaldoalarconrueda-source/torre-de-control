"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const ejeX = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const tooltipStyle = {
  contentStyle: { background: "var(--panel-2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 12, fontSize: 12 },
  labelStyle: { color: "var(--muted)" },
  cursor: { fill: "color-mix(in srgb, var(--tinte) 4%, transparent)" },
};

// 📦 Tasa de despacho: por día, ventas de LucidBot (gris) y guías generadas (azul); la línea es el % despachado (eje derecho).
const NOMBRE_TASA: Record<string, string> = { ventas: "Ventas LucidBot", guias: "Guías generadas", tasa: "% despachado" };
export function TasaDespacho({ filas }: { filas: { fecha: string; ventas: number; guias: number; tasa: number | null }[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={filas} margin={{ left: 0, right: 0, top: 4 }} barGap={1}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="fecha" tickFormatter={ejeX} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis yAxisId="n" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
          <YAxis yAxisId="p" orientation="right" domain={[0, (max: number) => Math.max(120, Math.ceil(max / 20) * 20)]} tickFormatter={(v) => `${v} %`}
            tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <ReferenceLine yAxisId="p" y={100} stroke="var(--muted)" strokeDasharray="4 4" />
          <Tooltip {...tooltipStyle} labelFormatter={(l) => ejeX(String(l))}
            formatter={(v, n) => [n === "tasa" ? `${Number(v).toFixed(1).replace(".", ",")} %` : new Intl.NumberFormat("es-CO").format(Number(v)), NOMBRE_TASA[String(n)] ?? n]} />
          <Legend formatter={(v) => <span style={{ color: "var(--muted)", fontSize: 12 }}>{NOMBRE_TASA[v] ?? v}</span>} iconType="circle" iconSize={8} />
          <Bar yAxisId="n" dataKey="ventas" fill="#8a8f98" radius={[3, 3, 0, 0]} />
          <Bar yAxisId="n" dataKey="guias" fill="#4f8cff" radius={[3, 3, 0, 0]} />
          <Line yAxisId="p" dataKey="tasa" stroke="#ffb020" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
