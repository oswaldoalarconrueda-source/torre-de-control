"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readSheet } from "read-excel-file/browser";
import { Download, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { nombreConSociedad } from "@/lib/paises";
import { entero } from "@/lib/formato";
import { sugerirProducto } from "@/lib/sugerir-producto";
import type { ProductoHistorico } from "./asignar-producto";
import type { CampanaHomologar } from "./homologar-campanas";

// Homologar por Excel con un socio (p. ej. Brayan): se exportan las campañas que no se sabe de qué producto son, él
// llena la columna "Producto (llenar)" y el dueño sube el mismo archivo. Nada se asigna solo: se revisa fila por fila y
// se autorizan las que van.

const HOJA = "Campañas";
const COL_CODIGO = "Código tienda";
const COL_CAMPANA = "Campaña";
const COL_PRODUCTO = "Producto (llenar)";
const COL_COMENTARIO = "Comentario";
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const fechaCorta = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const ESTADO: Record<string, string> = { ACTIVE: "Activa", PAUSED: "Pausada", ARCHIVED: "Archivada", DELETED: "Borrada", IN_PROCESS: "En revisión", WITH_ISSUES: "Con problemas" };

export function ExportarExcel({ cuenta, campanas, productos, desde, hasta }: {
  cuenta: string; campanas: CampanaHomologar[]; productos: ProductoHistorico[]; desde: string; hasta: string;
}) {
  const [trabajando, setTrabajando] = useState(false);
  async function exportar() {
    setTrabajando(true);
    try {
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      const titulo = (v: string, llenar = false) => ({ value: v, fontWeight: "bold" as const, backgroundColor: llenar ? "#FFE699" : "#D9E1F2", wrap: true });
      const tienda = nombreConSociedad(cuenta).replace(/^\S+\s/, ""); // sin la bandera (Excel no la dibuja bien)
      const filas = [
        [COL_CODIGO, "Tienda", COL_CAMPANA, "Cuenta publicitaria", "Gasto (COP)", "Días con gasto", "Inicio", "Último gasto", "Estado en Meta", "Producto actual", "Sugerido por el nombre"].map((t) => titulo(t))
          .concat([titulo(COL_PRODUCTO, true), titulo(COL_COMENTARIO, true)]),
        ...campanas.map((c) => [
          { value: cuenta }, { value: tienda }, { value: c.campana }, { value: c.cuentas },
          { value: Number(c.cop) || 0, type: Number, format: "#,##0" }, { value: c.dias, type: Number },
          { value: fechaCorta(c.inicio ?? c.creada ?? c.primer_gasto) }, { value: fechaCorta(c.ultimo_gasto) },
          { value: c.estado ? ESTADO[c.estado] ?? c.estado : "" }, { value: c.manual ?? c.regla ?? "" },
          { value: c.manual || c.regla ? "" : sugerirProducto(c.campana, productos)?.producto ?? "" },
          { value: "", backgroundColor: "#FFF2CC" }, { value: "", backgroundColor: "#FFF2CC" },
        ]),
      ];
      const hojaProductos = [
        [titulo("Producto (copiar el nombre exacto)"), titulo("Guías vendidas")],
        ...productos.map((p) => [{ value: p.producto }, { value: Number(p.guias) || 0, type: Number }]),
      ];
      const instrucciones = [
        [titulo("Cómo llenarlo")],
        [{ value: `1. En la hoja "${HOJA}", escribe en la columna amarilla "${COL_PRODUCTO}" a qué producto pertenece cada campaña.` }],
        [{ value: '2. Usa el nombre tal cual aparece en la hoja "Productos". Si es un producto nuevo, escríbelo completo.' }],
        [{ value: `3. Si no sabes, déjala vacía. En "${COL_COMENTARIO}" puedes dejar una nota.` }],
        [{ value: "4. No cambies las columnas Código tienda ni Campaña: con ellas se reconoce cada fila al subir el archivo." }],
        [{ value: "5. Devuelve el mismo archivo: el dueño lo sube en Homologar campañas, lo revisa y autoriza lo que va." }],
      ];
      const blob = await writeXlsxFile([
        { data: filas, sheet: HOJA, columns: [{ width: 13 }, { width: 22 }, { width: 44 }, { width: 22 }, { width: 13 }, { width: 8 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 26 }, { width: 26 }, { width: 30 }, { width: 30 }], stickyRowsCount: 1 },
        { data: hojaProductos, sheet: "Productos", columns: [{ width: 48 }, { width: 14 }], stickyRowsCount: 1 },
        { data: instrucciones, sheet: "Cómo llenarlo", columns: [{ width: 110 }] },
      ]).toBlob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Homologar campañas - ${tienda.replace(/[\\/:*?"<>|()]/g, "").trim()} - ${desde} a ${hasta}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally {
      setTrabajando(false);
    }
  }
  return (
    <button type="button" onClick={exportar} disabled={trabajando || !campanas.length}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:bg-tinte/5 disabled:opacity-40">
      <Download className="size-3.5" aria-hidden />{trabajando ? "Armando…" : `Exportar Excel (${entero(campanas.length)})`}
    </button>
  );
}

type Propuesta = {
  campana: string; propuesto: string; comentario: string; actual: string | null;
  existe: boolean;          // el producto ya es uno de los vendidos/pautados de la tienda
  enLista: boolean;         // la campaña tiene gasto en el periodo que se está viendo
  autorizar: boolean;
};

export function SubirExcel({ cuenta, campanas, productos }: { cuenta: string; campanas: CampanaHomologar[]; productos: ProductoHistorico[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [propuestas, setPropuestas] = useState<Propuesta[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);

  async function leer(f: File) {
    setAviso(null);
    try {
      const filas = (await readSheet(f, HOJA)) as unknown[][];
      const cab = (filas[0] ?? []).map((x) => String(x ?? "").trim());
      const iCod = cab.indexOf(COL_CODIGO), iCam = cab.indexOf(COL_CAMPANA), iProd = cab.indexOf(COL_PRODUCTO), iCom = cab.indexOf(COL_COMENTARIO);
      if (iCam < 0 || iProd < 0) throw new Error(`No encuentro las columnas "${COL_CAMPANA}" y "${COL_PRODUCTO}": sube el archivo que se exportó desde aquí.`);
      const porNombre = new Map(productos.map((p) => [normal(p.producto), p.producto]));
      const porCampana = new Map(campanas.map((c) => [c.campana, c]));
      let otraTienda = 0, vacias = 0;
      const lista: Propuesta[] = [];
      for (const r of filas.slice(1)) {
        const campana = String(r[iCam] ?? "").trim();
        const escrito = String(r[iProd] ?? "").trim();
        if (!campana) continue;
        if (iCod >= 0 && String(r[iCod] ?? "").trim() && String(r[iCod]).trim() !== cuenta) { otraTienda++; continue; }
        if (!escrito) { vacias++; continue; }
        const canon = porNombre.get(normal(escrito));
        const c = porCampana.get(campana);
        const propuesto = canon ?? escrito;
        lista.push({
          campana, propuesto, comentario: iCom >= 0 ? String(r[iCom] ?? "").trim() : "", actual: c ? c.manual ?? c.regla ?? null : null,
          existe: !!canon, enLista: !!c,
          // Por defecto se marcan las que traen un producto conocido y cambian algo; las de producto nuevo se revisan a mano.
          autorizar: !!canon && !!c && (c.manual ?? c.regla ?? null) !== propuesto,
        });
      }
      setPropuestas(lista);
      setAviso([
        `${entero(lista.length)} campañas con producto escrito`,
        vacias ? `${entero(vacias)} quedaron vacías` : "",
        otraTienda ? `${entero(otraTienda)} son de otra tienda (ábrela y súbelo ahí)` : "",
      ].filter(Boolean).join(" · "));
    } catch (e) {
      setPropuestas(null);
      setAviso(`No se pudo leer el archivo: ${(e as Error).message}`);
    }
  }

  async function autorizar() {
    const elegidas = (propuestas ?? []).filter((p) => p.autorizar);
    if (!elegidas.length) return;
    const supabase = createClient();
    let hechas = 0;
    for (const p of elegidas) {
      setEstado(`Asignando ${hechas + 1} de ${elegidas.length}…`);
      const { error } = await supabase.rpc("prod_asignar_campana", { p_cuenta: cuenta, p_campana: p.campana, p_producto: p.propuesto });
      if (error) { setEstado(`Se asignaron ${hechas}; falló "${p.campana}": ${error.message}`); router.refresh(); return; }
      hechas++;
    }
    setEstado(null);
    setPropuestas(null);
    setAviso(`✓ ${entero(hechas)} campañas autorizadas y asignadas.`);
    router.refresh();
  }

  const marcar = (i: number, v: boolean) => setPropuestas((xs) => xs && xs.map((x, j) => (j === i ? { ...x, autorizar: v } : x)));
  const elegidas = (propuestas ?? []).filter((p) => p.autorizar).length;

  return (
    <>
      <button type="button" onClick={() => input.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:bg-tinte/5">
        <Upload className="size-3.5" aria-hidden />Subir Excel llenado
      </button>
      <input ref={input} type="file" accept=".xlsx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ""; }} />
      {(aviso || propuestas) && (
        <div className="basis-full mt-2 rounded-xl border border-line bg-panel-2 p-3 text-sm">
          {aviso && <p className="text-xs text-muted">{aviso}</p>}
          {propuestas && propuestas.length > 0 && (
            <>
              <p className="mt-1 text-xs text-muted">Revisa cada fila y marca las que autorizas. Las de producto <b className="text-amber">nuevo</b> o campaña fuera del periodo vienen sin marcar.</p>
              <div className="mt-2 max-h-[28rem] overflow-auto">
                <table className="tabla w-full min-w-max text-sm">
                  <thead><tr><th className="text-left">Autorizar</th><th className="text-left">Campaña</th><th className="text-left">Producto actual</th><th className="text-left">Propuesto en el Excel</th><th className="text-left">Comentario</th></tr></thead>
                  <tbody>
                    {propuestas.map((p, i) => (
                      <tr key={p.campana}>
                        <td className="text-left"><input type="checkbox" checked={p.autorizar} onChange={(e) => marcar(i, e.target.checked)} aria-label={`Autorizar ${p.campana}`} /></td>
                        <td className="text-left max-w-[22rem] whitespace-normal">{p.campana}{!p.enLista && <span className="ml-1 text-[11px] text-amber">(sin gasto en este periodo)</span>}</td>
                        <td className="text-left text-muted">{p.actual ?? <i>Sin identificar</i>}</td>
                        <td className="text-left">
                          {p.propuesto}
                          {!p.existe && <span className="ml-1 rounded-full bg-amber/15 px-1.5 py-0.5 text-[10px] text-amber" title="No está entre los productos vendidos ni pautados de esta tienda">nuevo</span>}
                          {p.actual === p.propuesto && <span className="ml-1 text-[11px] text-muted">(ya está así)</span>}
                        </td>
                        <td className="text-left text-muted max-w-[16rem] whitespace-normal">{p.comentario}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button type="button" onClick={autorizar} disabled={!elegidas || !!estado}
                  className="rounded-lg bg-blue-2 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                  {estado ?? `Autorizar ${entero(elegidas)} ${elegidas === 1 ? "campaña" : "campañas"}`}
                </button>
                <button type="button" onClick={() => { setPropuestas(null); setAviso(null); }} disabled={!!estado} className="text-xs text-muted hover:text-text">Cancelar</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
