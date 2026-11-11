"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readSheet } from "read-excel-file/browser";
import { Loader2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dinero, entero } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";
import { leerExcelMayor } from "@/lib/excel-mayor";
import { TablaScroll } from "./ui";

// Subir el Excel de comisiones por mayor ya revisado. Nada se guarda solo: se muestra cada remisión tal como viene en el Excel, cómo
// está en Effi y si ya estaba cargada o pagada, y se guardan solo las marcadas al autorizar.
type Revisada = {
  id: number; subtotal: number; costo: number; encontrada: boolean; fecha: string | null; cliente: string | null; centro: string | null; anulada: boolean;
  subtotal_effi: number | null; costo_effi: number | null; cargada: boolean; costo_antes: number | null; tasa_antes: number | null; pagada: boolean;
};

const fechaCorta = (f: string | null) => (f ? f.split("-").reverse().join("/") : "—");

export function SubirExcelMayor({ cuenta }: { cuenta: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<Revisada[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [tasa, setTasa] = useState("");
  const [avisos, setAvisos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const empresa = `${infoCuenta(cuenta).bandera} ${infoCuenta(cuenta).nombre}`;
  const $ = (v: number) => dinero(v, cuenta);

  function cerrar() {
    setFilas(null); setArchivo(null); setAvisos([]); setError(null);
    if (input.current) input.current.value = "";
  }

  async function leer(f: File | undefined) {
    if (!f) return;
    setOcupado(true); setError(null); setListo(null);
    try {
      const lectura = leerExcelMayor((await readSheet(f)) as unknown[][]);
      if (!lectura.filas.length) throw new Error("El archivo no trae remisiones del centro de costos por mayor con «Pago total».");
      const { data, error: e } = await createClient().rpc("prov_mayor_revisar", { p_cuenta: cuenta, p_filas: lectura.filas });
      if (e) throw new Error(e.message);
      const lista = (data ?? []) as Revisada[];
      const halladas = lista.filter((x) => x.encontrada);
      if (!halladas.length) throw new Error(`Ninguna de las ${lista.length} remisiones existe en ${empresa}. ¿El Excel es de otra empresa?`);
      const v: string[] = [];
      if (lectura.tasa == null) v.push("El Excel no dice el porcentaje de la comisión: escríbelo antes de autorizar.");
      if (lectura.descartadas.sinPago) v.push(`${entero(lectura.descartadas.sinPago)} remisiones por mayor no están en «Pago total» y no entran.`);
      setAvisos(v);
      setTasa(lectura.tasa != null ? String(Math.round(lectura.tasa * 10000) / 100) : "");
      setFilas(lista);
      setMarcadas(new Set(lista.filter((x) => x.encontrada && !x.anulada && !x.pagada).map((x) => x.id)));
      setArchivo(f.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  const t = Number(tasa.replace(",", ".")) / 100;
  const tasaOk = t > 0 && t <= 1;
  const elegidas = (filas ?? []).filter((x) => marcadas.has(x.id));
  const comision = (x: Revisada) => (x.subtotal - x.costo) * 1.12 * (tasaOk ? t : 0);
  const total = elegidas.reduce((a, x) => a + comision(x), 0);

  async function autorizar() {
    if (!tasaOk) return setError("Escribe el porcentaje de la comisión (por ejemplo 10 o 20).");
    if (!elegidas.length) return setError("Marca al menos una remisión.");
    setOcupado(true); setError(null);
    const { data, error: e } = await createClient().rpc("prov_mayor_guardar", {
      p_cuenta: cuenta, p_origen: archivo ?? "Excel",
      p_filas: elegidas.map((x) => ({ id: x.id, subtotal: x.subtotal, costo: x.costo, tasa: t, nota: x.costo_effi != null && Math.abs(Number(x.costo_effi) - x.costo) >= 0.01 ? `Costo del Excel; en Effi: ${$(Number(x.costo_effi))}` : null })),
    });
    setOcupado(false);
    if (e) return setError(`No se guardó: ${e.message}`);
    setListo(`Listo: ${entero(Number(data))} remisiones por mayor guardadas en ${empresa} (comisión ${$(total)}).`);
    cerrar();
    router.refresh();
  }

  const casilla = (x: Revisada) => (
    <input type="checkbox" aria-label={`Incluir la remisión ${x.id}`} disabled={!x.encontrada} checked={marcadas.has(x.id)}
      onChange={(e) => setMarcadas((s) => { const n = new Set(s); if (e.target.checked) n.add(x.id); else n.delete(x.id); return n; })} className="size-4 accent-[var(--blue-2)]" />
  );

  return (
    <section className="card min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold tracking-tight">Subir Excel por mayor</h2>
          <p className="mt-0.5 text-xs text-muted">El Excel ya revisado. Se toman la venta, el costo y el porcentaje tal como vienen; nada se guarda hasta autorizar.</p>
        </div>
        {!filas && (
          <button type="button" onClick={() => input.current?.click()} disabled={ocupado}
            className="btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 max-sm:w-full max-sm:justify-center">
            {ocupado ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Upload size={15} aria-hidden />}
            {ocupado ? "Leyendo…" : "Subir Excel"}
          </button>
        )}
        <input ref={input} type="file" accept=".xlsx" className="hidden" aria-label="Excel de comisiones por mayor" onChange={(e) => leer(e.target.files?.[0])} />
      </div>
      {listo && <p className="mt-3 text-sm text-green" role="status">{listo}</p>}
      {error && <p className="mt-3 text-sm text-red" role="alert">{error}</p>}

      {filas && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
            <span className="min-w-0 truncate" title={archivo ?? ""}>📄 {archivo} · se carga en <b>{empresa}</b></span>
            <button type="button" onClick={cerrar} aria-label="Cancelar la carga" className="rounded-lg p-1.5 text-muted hover:text-text"><X size={16} /></button>
          </div>
          {avisos.map((a) => <p key={a} className="rounded-xl border border-amber/50 bg-amber/10 px-3 py-2 text-sm text-amber">{a}</p>)}
          <label className="flex items-center gap-2 text-sm text-muted">
            Comisión
            <input value={tasa} onChange={(e) => setTasa(e.target.value)} inputMode="decimal" aria-label="Porcentaje de la comisión"
              className="num w-20 rounded-xl border border-line bg-tinte/[0.03] px-3 py-1.5 text-right text-text outline-none focus:border-blue/60" />
            % de la utilidad
          </label>
          <TablaScroll>
            <thead>
              <tr>
                <th />
                <th>Remisión</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th className="!text-right">Venta</th>
                <th className="!text-right">Costo</th>
                <th className="!text-right">Comisión</th>
                <th>Revisión</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((x) => {
                const otroCosto = x.costo_effi != null && Math.abs(Number(x.costo_effi) - x.costo) >= 0.01;
                return (
                  <tr key={x.id} className={x.encontrada ? undefined : "opacity-60"}>
                    <td>{casilla(x)}</td>
                    <td className="num">{x.id}</td>
                    <td className="num">{fechaCorta(x.fecha)}</td>
                    <td className="max-w-[9rem] truncate sm:max-w-[16rem]" title={x.cliente ?? ""}>{x.cliente ?? "—"}</td>
                    <td className="num text-right">{$(x.subtotal)}</td>
                    <td className="num text-right">
                      {$(x.costo)}
                      {otroCosto && <div className="text-[11px] text-amber">Effi: {$(Number(x.costo_effi))}</div>}
                    </td>
                    <td className="num text-right font-semibold text-green">{x.encontrada ? $(comision(x)) : "—"}</td>
                    <td className="text-xs">
                      {!x.encontrada ? <span className="text-red">No está en Effi</span>
                        : x.anulada ? <span className="text-red">Anulada en Effi</span>
                        : x.pagada ? <span className="text-red">Ya está en un pago registrado</span>
                        : x.cargada ? <span className="text-amber">Ya cargada: se reemplaza</span>
                        : <span className="text-muted">{x.centro ?? "Nueva"}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TablaScroll>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <b className="num">{entero(elegidas.length)}</b> de {entero(filas.length)} remisiones · comisión <b className="num text-green">{$(total)}</b>
            </p>
            <button type="button" onClick={autorizar} disabled={ocupado || !elegidas.length || !tasaOk}
              className="btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 max-sm:w-full max-sm:justify-center">
              {ocupado && <Loader2 size={15} className="animate-spin" aria-hidden />}
              Autorizar {entero(elegidas.length)} {elegidas.length === 1 ? "remisión" : "remisiones"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
