"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readSheet } from "read-excel-file/browser";
import Papa from "papaparse";
import { FileUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { leerTabla, NOMBRE_TIPO, type Celda, type Lectura } from "@/lib/cargas";
import { infoCuenta } from "@/lib/paises";

type Item = {
  key: string;
  archivo: File;
  lectura?: Lectura;
  cuenta: string | null;
  detectada?: { cuenta: string; por: string } | null; // de qué tienda es según lo ya cargado (verificador)
  confirmado?: boolean;                                // el dueño confirmó a mano la tienda elegida
  error?: string;
  estado: "leido" | "subiendo" | "listo" | "error";
  avance: number;
  resultado?: string;
};

const nombreTienda = (c: string) => `${infoCuenta(c).bandera} ${infoCuenta(c).nombre}`;

// Verificador: con lo ya cargado, de qué tienda del Centro de Control es el archivo. Órdenes: por el número de tienda
// de Dropi; productos y cartera: por los números de orden. null = no hay cómo saberlo (tienda o órdenes nuevas).
async function verificar(l: Lectura): Promise<{ cuenta: string; por: string } | null> {
  if (l.tipo === "meta_bm") return null;
  const filas = l.filas as Record<string, unknown>[];
  const tiendas = l.tipo === "dropi_ordenes" ? [...new Set(filas.map((f) => f.tienda).filter(Boolean) as string[])] : [];
  const ordenes = [...new Set(filas.map((f) => (l.tipo === "dropi_ordenes" ? f.id : f.orden_id)).filter((x) => x != null) as number[])];
  const { data } = await createClient().rpc("dropi_verificar", { p_tiendas: tiendas, p_ordenes: ordenes.slice(0, 5000) });
  const v = (data ?? {}) as { tiendas?: Record<string, string[]>; ordenes?: Record<string, number> };
  const porTienda = [...new Set(Object.values(v.tiendas ?? {}).flat())];
  if (porTienda.length === 1) return { cuenta: porTienda[0], por: `tienda Dropi ${Object.keys(v.tiendas ?? {}).join(", ")}` };
  const porOrden = Object.entries(v.ordenes ?? {}).sort((a, b) => b[1] - a[1]);
  if (porOrden.length && porOrden[0][1] >= 0.5 * porOrden.reduce((s, x) => s + x[1], 0))
    return { cuenta: porOrden[0][0], por: `${nf.format(porOrden[0][1])} órdenes ya cargadas ahí` };
  return null;
}

const BLOQUE = 1000;
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

async function leerArchivo(f: File): Promise<Lectura> {
  if (/\.csv$/i.test(f.name)) {
    const txt = (await f.text()).replace(/^﻿/, "");
    const { data } = Papa.parse<Celda[]>(txt, { skipEmptyLines: true });
    return leerTabla(data);
  }
  if (/\.xlsx$/i.test(f.name)) return leerTabla((await readSheet(f)) as Celda[][]);
  throw new Error("Solo se aceptan .xlsx (Otra P) y .csv (Meta).");
}

// tiendas: las de la sociedad que el dueño está viendo (la barra lateral); el archivo nuevo va a la de ese país.
export function Cargador({ tiendas }: { tiendas: string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const cambiar = (key: string, cambio: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...cambio } : x)));

  async function agregar(lista: FileList | File[]) {
    const nuevos = await Promise.all(
      [...lista].map(async (archivo): Promise<Item> => {
        const key = `${archivo.name}-${archivo.size}-${archivo.lastModified}`;
        try {
          const lectura = await leerArchivo(archivo);
          if (lectura.tipo === "meta_bm") return { key, archivo, lectura, cuenta: null, estado: "leido", avance: 0 };
          const detectada = await verificar(lectura).catch(() => null);
          // Sin dato previo: la tienda de ese país en la sociedad que se está viendo (si hay una sola).
          const pais = lectura.cuenta ? infoCuenta(lectura.cuenta).pais : "";
          const delPais = tiendas.filter((t) => infoCuenta(t).pais === pais);
          const cuenta = detectada?.cuenta ?? (delPais.length === 1 ? delPais[0] : null);
          return { key, archivo, lectura, cuenta, detectada, confirmado: false, estado: "leido", avance: 0 };
        } catch (e) {
          return { key, archivo, cuenta: null, error: (e as Error).message, estado: "error", avance: 0 };
        }
      }),
    );
    setItems((xs) => [...xs.filter((x) => !nuevos.some((n) => n.key === x.key)), ...nuevos]);
  }

  async function guardar() {
    setSubiendo(true);
    const supabase = createClient();
    // Del archivo más viejo al más nuevo: si dos archivos traen el mismo dato, queda el más reciente.
    const cola = items.filter((x) => x.estado === "leido" && x.lectura && listo(x)).sort((a, b) => a.archivo.lastModified - b.archivo.lastModified);
    for (const it of cola) {
      const l = it.lectura!;
      cambiar(it.key, { estado: "subiendo", avance: 0 });
      try {
        let carga: number | null = null;
        let filas = 0, omitidas = 0;
        const resumen = { desde: l.desde, hasta: l.hasta, totales: l.totales };
        for (let i = 0; i < l.filas.length || (i === 0 && !l.filas.length); i += BLOQUE) {
          const { data, error } = await supabase.rpc("app_cargar", {
            p_tipo: l.tipo, p_cuenta: l.tipo === "meta_bm" ? null : it.cuenta, p_archivo: it.archivo.name,
            p_filas: l.filas.slice(i, i + BLOQUE), p_carga: carga, p_resumen: resumen,
          });
          if (error) throw new Error(error.message);
          const r = data as { carga: number; filas: number; omitidas: number };
          carga = r.carga; filas += r.filas; omitidas += r.omitidas;
          cambiar(it.key, { avance: Math.min(1, (i + BLOQUE) / Math.max(1, l.filas.length)) });
          if (!l.filas.length) break;
        }
        cambiar(it.key, { estado: "listo", avance: 1, resultado: `${nf.format(filas)} filas guardadas${omitidas ? ` · ${nf.format(omitidas)} sin tienda` : ""}` });
      } catch (e) {
        cambiar(it.key, { estado: "error", error: (e as Error).message });
      }
    }
    setSubiendo(false);
    router.refresh();
  }

  // Se guarda solo si la tienda está elegida y, cuando no coincide con lo ya cargado o no hay cómo verificarla, el dueño
  // lo confirmó.
  const listo = (x: Item) => x.lectura?.tipo === "meta_bm" || (!!x.cuenta && (x.detectada?.cuenta === x.cuenta || !!x.confirmado));
  const pendientes = items.filter((x) => x.estado === "leido" && listo(x)).length;
  const porConfirmar = items.filter((x) => x.estado === "leido" && !listo(x)).length;

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregar(e.dataTransfer.files); }}
        className={`card flex flex-col items-center justify-center gap-2 p-8 text-center cursor-pointer border-dashed transition-colors ${arrastrando ? "border-blue bg-blue/10" : "hover:bg-tinte/[0.03]"}`}
      >
        <FileUp className="size-7 text-blue-2" aria-hidden />
        <div className="font-semibold">Arrastra aquí los archivos o haz clic para elegirlos</div>
        <div className="text-xs text-muted max-w-xl">
          Otra P: <span className="font-mono">ordenes_*.xlsx</span>, <span className="font-mono">ordenes_productos_*.xlsx</span> e <span className="font-mono">historial de cartera-*.xlsx</span>.
          Meta: el CSV de cada Business Manager con país, cuenta, campaña, día y monto gastado en COP. Puedes subir varios a la vez.
        </div>
        <input id="archivos-carga" ref={input} type="file" multiple accept=".xlsx,.csv" className="sr-only"
          onChange={(e) => { if (e.target.files) agregar(e.target.files); e.target.value = ""; }} />
      </label>

      {items.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest font-mono text-muted">
                <th className="p-3">Archivo</th><th className="p-3">Tipo</th><th className="p-3">Tienda</th>
                <th className="p-3">Fechas</th><th className="p-3">Contenido</th><th className="p-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((it) => {
                const l = it.lectura;
                return (
                  <tr key={it.key} className="align-top">
                    <td className="p-3 max-w-[16rem] truncate" title={it.archivo.name}>{it.archivo.name}</td>
                    <td className="p-3 whitespace-nowrap">{l ? NOMBRE_TIPO[l.tipo] : "—"}</td>
                    <td className="p-3">
                      {l && l.tipo !== "meta_bm" ? (
                        <div className="space-y-1.5 min-w-[13rem]">
                          <select value={it.cuenta ?? ""} disabled={it.estado !== "leido"} onChange={(e) => cambiar(it.key, { cuenta: e.target.value || null, confirmado: false })}
                            className="rounded-lg border border-line bg-transparent px-2 py-1 text-sm">
                            {!it.cuenta && <option value="" className="bg-bg">Elegir tienda…</option>}
                            {[...new Set([...tiendas, ...(it.detectada ? [it.detectada.cuenta] : [])])].map((c) => (
                              <option key={c} value={c} className="bg-bg">{nombreTienda(c)}</option>
                            ))}
                          </select>
                          {it.estado === "leido" && it.detectada && it.detectada.cuenta === it.cuenta && (
                            <div className="text-xs text-green">✓ Verificado: es de {nombreTienda(it.detectada.cuenta)} ({it.detectada.por})</div>
                          )}
                          {it.estado === "leido" && it.detectada && it.cuenta && it.detectada.cuenta !== it.cuenta && (
                            <label className="flex items-start gap-1.5 text-xs text-red">
                              <input type="checkbox" checked={!!it.confirmado} onChange={(e) => cambiar(it.key, { confirmado: e.target.checked })} className="mt-0.5" />
                              <span>⚠️ Esto ya es de <b>{nombreTienda(it.detectada.cuenta)}</b> ({it.detectada.por}) y lo vas a guardar en <b>{nombreTienda(it.cuenta)}</b>. Márcalo solo si estás seguro.</span>
                            </label>
                          )}
                          {it.estado === "leido" && !it.detectada && it.cuenta && (
                            <label className="flex items-start gap-1.5 text-xs text-amber">
                              <input type="checkbox" checked={!!it.confirmado} onChange={(e) => cambiar(it.key, { confirmado: e.target.checked })} className="mt-0.5" />
                              <span>Tienda nueva para el Centro de Control: confirma que es de <b>{nombreTienda(it.cuenta)}</b>.</span>
                            </label>
                          )}
                          {it.estado === "leido" && !it.cuenta && <div className="text-xs text-amber">Elige de qué tienda es antes de guardar.</div>}
                        </div>
                      ) : l ? <span className="text-muted">Según el país de cada fila</span> : null}
                    </td>
                    <td className="p-3 whitespace-nowrap font-mono text-xs">{l?.desde ? `${l.desde} → ${l.hasta}` : "—"}</td>
                    <td className="p-3 text-xs text-muted">
                      {l?.totales.map((t) => <div key={t.etiqueta}>{t.etiqueta}: <span className="text-text font-mono">{nf.format(t.valor)}</span></div>)}
                      {l?.avisos.map((a) => <div key={a} className="text-amber">{a}</div>)}
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      {it.estado === "leido" && (listo(it) ? <span className="text-muted">Listo para guardar</span> : <span className="text-amber">Falta confirmar la tienda</span>)}
                      {it.estado === "subiendo" && <span className="inline-flex items-center gap-1 text-blue-2"><Loader2 className="size-3 animate-spin" />{Math.round(it.avance * 100)}%</span>}
                      {it.estado === "listo" && <span className="text-green">✓ {it.resultado}</span>}
                      {it.estado === "error" && <span className="text-red whitespace-normal">{it.error}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-3 border-t border-line p-3">
            <span className="flex items-center gap-3">
              <button type="button" onClick={() => setItems([])} disabled={subiendo} className="text-sm text-muted hover:text-text">Limpiar lista</button>
              {porConfirmar > 0 && <span className="text-xs text-amber">{porConfirmar} archivo{porConfirmar === 1 ? "" : "s"} sin confirmar no se guarda{porConfirmar === 1 ? "" : "n"}</span>}
            </span>
            <button type="button" onClick={guardar} disabled={subiendo || !pendientes}
              className="rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {subiendo ? "Guardando…" : `Guardar ${pendientes} archivo${pendientes === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
