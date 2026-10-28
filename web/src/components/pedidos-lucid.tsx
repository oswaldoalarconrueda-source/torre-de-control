"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { entero } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";

// Cuadro del mes como la hoja de la empleada, pero con los días hacia abajo y un país por columna. Al dar Enter (o salir
// de la casilla con un número distinto) sale "¿Está segura?" con el país, el día y el número: solo con "Sí" se guarda
// (rpc pedidos_lucid_guardar); con "No" la casilla vuelve a lo que tenía para revisarla. Los días que ya no se pueden
// corregir quedan en solo lectura.
type Fila = { cuenta: string; fecha: string; pedidos: number; por: string | null };
type Pendiente = { cuenta: string; fecha: string; nuevo: number | null; antes: number | null; el: HTMLInputElement };

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

  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const diaLargo = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

  // Enter o salir de la casilla: si el número cambió, se pregunta antes de guardar.
  function preguntar(cuenta: string, fecha: string, el: HTMLInputElement) {
    if (pendiente) return;
    const limpio = el.value.replace(/\D/g, "");
    const nuevo = limpio === "" ? null : Number(limpio);
    const antes = valores[`${cuenta}|${fecha}`] ?? null;
    if (nuevo === antes) return;
    setPendiente({ cuenta, fecha, nuevo, antes, el });
  }
  function noGuardar() {
    if (!pendiente) return;
    pendiente.el.value = pendiente.antes == null ? "" : String(pendiente.antes);
    pendiente.el.focus();
    setPendiente(null);
  }
  async function confirmar() {
    if (!pendiente) return;
    const p = pendiente;
    setPendiente(null);
    await guardar(p.cuenta, p.fecha, p.nuevo);
  }

  async function guardar(cuenta: string, fecha: string, nuevo: number | null) {
    const clave = `${cuenta}|${fecha}`;
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
                          onBlur={(e) => preguntar(c, f, e.currentTarget)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); preguntar(c, f, e.currentTarget); } }}
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

      {/* "¿Está segura?": se ve el país, el día y el número antes de guardar. Escape = No. Enter no confirma, para que
          un doble Enter no guarde sin mirar. */}
      {pendiente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true"
          onKeyDown={(e) => { if (e.key === "Escape") noGuardar(); }}>
          <div className="card w-full max-w-sm p-5 text-center">
            <div className="text-3xl">🤔</div>
            <div className="mt-2 font-display text-xl font-semibold">¿Está segura?</div>
            <div className="mt-3 text-sm text-muted capitalize">{infoCuenta(pendiente.cuenta).bandera} {infoCuenta(pendiente.cuenta).nombre} · {diaLargo(pendiente.fecha)}</div>
            <div className="mt-1 num text-4xl font-bold">{pendiente.nuevo == null ? "Vacío" : entero(pendiente.nuevo)}</div>
            <div className="text-sm text-muted">{pendiente.nuevo == null ? "se borra el dato de ese día" : "pedidos"}</div>
            {pendiente.antes != null && <div className="mt-2 text-xs text-amber">Antes decía {entero(pendiente.antes)}</div>}
            <div className="mt-5 flex justify-center gap-3">
              <button onClick={confirmar} className="rounded-full bg-green px-6 py-2 font-bold text-black">Sí</button>
              <button onClick={noGuardar} autoFocus className="rounded-full border border-line px-6 py-2 font-semibold hover:bg-white/5">No</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
