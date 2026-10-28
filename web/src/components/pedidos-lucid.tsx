"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { entero } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";

// Cuadro del mes como la hoja de la empleada, pero con los días hacia abajo y un país por columna. Cada casilla se
// guarda sola al salir de ella (rpc pedidos_lucid_guardar); los días que ya no se pueden corregir quedan en solo lectura.
type Fila = { cuenta: string; fecha: string; pedidos: number; por: string | null };

export function PedidosLucid({ mes, dias, hoy, cuentas, esOwner, filas }: {
  mes: string; dias: number; hoy: string; cuentas: string[]; esOwner: boolean; filas: Fila[];
}) {
  const [valores, setValores] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(filas.map((f) => [`${f.cuenta}|${f.fecha}`, f.pedidos])));
  const [estado, setEstado] = useState<Record<string, "guardando" | "ok" | "error">>({});
  const [error, setError] = useState<string | null>(null);
  const limite = new Date(Date.parse(`${hoy}T12:00:00`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const editable = (fecha: string) => fecha <= hoy && (esOwner || fecha >= limite);
  const fechas = Array.from({ length: dias }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`).filter((f) => f <= hoy).reverse();
  const total = (c: string) => fechas.reduce((s, f) => s + (valores[`${c}|${f}`] ?? 0), 0);

  async function guardar(cuenta: string, fecha: string, texto: string) {
    const clave = `${cuenta}|${fecha}`;
    const limpio = texto.replace(/\D/g, "");
    const nuevo = limpio === "" ? null : Number(limpio);
    if (nuevo === (valores[clave] ?? null)) return;
    setEstado((e) => ({ ...e, [clave]: "guardando" })); setError(null);
    const { error: e } = await createClient().rpc("pedidos_lucid_guardar", { p_cuenta: cuenta, p_fecha: fecha, p_pedidos: nuevo });
    if (e) { setEstado((s) => ({ ...s, [clave]: "error" })); setError(e.message); return; }
    setValores((v) => ({ ...v, [clave]: nuevo }));
    setEstado((s) => ({ ...s, [clave]: "ok" }));
  }

  return (
    <div className="card overflow-x-auto p-0">
      {error && <p className="px-4 pt-3 text-sm text-red">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-blue/10 text-left text-[11px] uppercase tracking-wider font-semibold">
            <th className="px-4 py-3">Día</th>
            {cuentas.map((c) => <th key={c} className="px-4 py-3 text-right">{infoCuenta(c).bandera} {infoCuenta(c).nombre}</th>)}
            <th className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="font-semibold border-b border-line">
            <td className="px-4 py-2">Total del mes</td>
            {cuentas.map((c) => <td key={c} className="px-4 py-2 text-right num">{entero(total(c))}</td>)}
            <td className="px-4 py-2 text-right num">{entero(cuentas.reduce((s, c) => s + total(c), 0))}</td>
          </tr>
          {fechas.map((f) => {
            const dia = new Date(`${f}T12:00:00`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
            const suma = cuentas.reduce((s, c) => s + (valores[`${c}|${f}`] ?? 0), 0);
            return (
              <tr key={f} className={`border-b border-line/50 ${f === hoy ? "bg-white/[0.03]" : ""}`}>
                <td className="px-4 py-1.5 whitespace-nowrap capitalize">{dia}{f === hoy && <span className="ml-2 text-[11px] text-muted normal-case">hoy (aún abierto)</span>}</td>
                {cuentas.map((c) => {
                  const clave = `${c}|${f}`;
                  const v = valores[clave];
                  const st = estado[clave];
                  return (
                    <td key={c} className="px-4 py-1.5 text-right">
                      {editable(f) ? (
                        <input
                          inputMode="numeric"
                          defaultValue={v ?? ""}
                          placeholder="—"
                          onBlur={(e) => guardar(c, f, e.currentTarget.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                          className={`w-24 rounded-lg border bg-bg px-2 py-1 text-right num outline-none focus:border-blue-2 ${st === "error" ? "border-red" : st === "ok" ? "border-green/60" : "border-line"}`}
                          aria-label={`Pedidos de ${infoCuenta(c).nombre} el ${f}`}
                        />
                      ) : (
                        <span className="num">{v == null ? <span className="text-muted">—</span> : entero(v)}</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-1.5 text-right num text-muted">{suma ? entero(suma) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
