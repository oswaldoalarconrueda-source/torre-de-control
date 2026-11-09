"use client";

import { useState } from "react";
import { dinero, entero } from "@/lib/formato";
import { AsignarProducto, AceptarSugeridas, type ProductoHistorico } from "./asignar-producto";
import { MarcaOtroPais } from "./marca-otro-pais";

// Lista de campañas con gasto y su producto: a mano (manda), por regla de palabra, o "Sin identificar". El dueño o un
// socio asigna o corrige; al guardar, la pantalla de Productos ya reparte ese gasto en todos los periodos.

export type CampanaHomologar = {
  campana: string; cuentas: string; cop: number; dias: number; desde: string; hasta: string;
  manual: string | null; asignado_por: string | null; regla: string | null; patron: string | null;
  primer_gasto?: string | null; ultimo_gasto?: string | null; // toda la historia, no solo el periodo
  creada?: string | null; inicio?: string | null; fin?: string | null; estado?: string | null; // de la API de Meta
  otros_paises?: string | null; // pauta entregada en otro país que se carga a esta tienda (* rojo)
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (d?: string | null) => (d ? `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "–");
const ESTADO: Record<string, { t: string; c: string }> = {
  ACTIVE: { t: "Activa", c: "bg-green/15 text-green" },
  PAUSED: { t: "Pausada", c: "bg-amber/15 text-amber" },
  CAMPAIGN_PAUSED: { t: "Pausada", c: "bg-amber/15 text-amber" },
  ARCHIVED: { t: "Archivada", c: "bg-tinte/5 text-muted" },
  DELETED: { t: "Borrada", c: "bg-red/15 text-red" },
  IN_PROCESS: { t: "En revisión", c: "bg-blue-2/15 text-blue-2" },
  WITH_ISSUES: { t: "Con problemas", c: "bg-red/15 text-red" },
};

// Inicio: el que da Meta (o la creación); si Meta aún no la trae, el primer día con gasto.
function Fechas({ c }: { c: CampanaHomologar }) {
  const inicio = c.inicio ?? c.creada ?? c.primer_gasto;
  const e = c.estado ? ESTADO[c.estado] ?? { t: c.estado, c: "bg-tinte/5 text-muted" } : null;
  return (
    <>
      <td data-l="Inicio" className="num text-left whitespace-nowrap max-md:col-span-2" title={c.inicio || c.creada ? `Meta: creada ${fecha(c.creada)}, inicio ${fecha(c.inicio)}` : "Primer día con gasto (Meta aún no trae la fecha)"}>
        {fecha(inicio)}
      </td>
      <td data-l="Último gasto" className="num text-left whitespace-nowrap max-md:col-span-2" title={c.fin ? `Fin programado en Meta: ${fecha(c.fin)}` : "Último día con gasto en toda la historia"}>
        {fecha(c.ultimo_gasto)}
      </td>
      <td data-l="Estado en Meta" className="text-left max-md:col-span-2">
        {e ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.c}`}>{e.t}</span> : <span className="text-muted">–</span>}
      </td>
    </>
  );
}

const SIN_PRODUCTO = "Sin identificar";
const normal = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function HomologarCampanas({ cuenta, campanas, productos, puedeEditar }: {
  cuenta: string; campanas: CampanaHomologar[]; productos: ProductoHistorico[]; puedeEditar: boolean;
}) {
  const [vista, setVista] = useState<"sin" | "todas">("sin");
  // Filtros para revisar: campaña (texto, sin importar tildes), cuenta publicitaria y producto asignado.
  const [fCampana, setFCampana] = useState("");
  const [fCuenta, setFCuenta] = useState("");
  const [fProducto, setFProducto] = useState("");

  const productoDe = (c: CampanaHomologar) => c.manual ?? c.regla ?? SIN_PRODUCTO;
  const sinId = campanas.filter((c) => !c.manual && !c.regla);
  const total = campanas.reduce((s, c) => s + c.cop, 0);
  const totalSin = sinId.reduce((s, c) => s + c.cop, 0);
  const cuentasAds = [...new Set(campanas.flatMap((c) => c.cuentas.split(", ")))].sort((a, b) => a.localeCompare(b, "es"));
  const productosAsignados = [...new Set(campanas.map(productoDe))].sort((a, b) =>
    a === SIN_PRODUCTO ? -1 : b === SIN_PRODUCTO ? 1 : a.localeCompare(b, "es"));
  const palabras = normal(fCampana).split(/\s+/).filter(Boolean);
  const filtrando = !!(palabras.length || fCuenta || fProducto);
  const lista = (vista === "sin" ? sinId : campanas).filter((c) =>
    palabras.every((w) => normal(c.campana).includes(w))
    && (!fCuenta || c.cuentas.split(", ").includes(fCuenta))
    && (!fProducto || productoDe(c) === fProducto));
  const totalLista = lista.reduce((s, c) => s + c.cop, 0);

  return (
    <section className="card p-4 sm:p-5 min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Campañas del periodo</h2>
          <p className="text-xs text-muted mt-0.5">
            {entero(campanas.length)} campañas · {dinero(total, "TIENDA_CO")} · sin identificar: {entero(sinId.length)} ({dinero(totalSin, "TIENDA_CO")}
            {total > 0 ? `, ${((totalSin / total) * 100).toFixed(1).replace(".", ",")} %` : ""})
          </p>
        </div>
        <div className="flex gap-1 rounded-full border border-line p-0.5 text-sm">
          {(["sin", "todas"] as const).map((v) => (
            <button key={v} onClick={() => setVista(v)} className={`rounded-full px-3 py-1 ${vista === v ? "bg-blue-2 text-white" : "text-muted"}`}>
              {v === "sin" ? `Sin identificar (${sinId.length})` : `Todas (${campanas.length})`}
            </button>
          ))}
        </div>
      </header>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <input value={fCampana} onChange={(e) => setFCampana(e.target.value)} placeholder="Buscar campaña…" aria-label="Filtrar por campaña"
          className="w-full rounded-lg border border-line bg-panel px-2 py-1 sm:w-56" />
        <select value={fCuenta} onChange={(e) => setFCuenta(e.target.value)} aria-label="Filtrar por cuenta"
          className="w-full rounded-lg border border-line bg-panel px-2 py-1 sm:w-auto sm:max-w-[14rem]">
          <option value="">Todas las cuentas</option>
          {cuentasAds.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={fProducto} aria-label="Filtrar por producto"
          onChange={(e) => { setFProducto(e.target.value); if (e.target.value && e.target.value !== SIN_PRODUCTO) setVista("todas"); }}
          className="w-full rounded-lg border border-line bg-panel px-2 py-1 sm:w-auto sm:max-w-[16rem]">
          <option value="">Todos los productos</option>
          {productosAsignados.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        {filtrando && (
          <>
            <span className="text-xs text-muted">{entero(lista.length)} campaña{lista.length === 1 ? "" : "s"} · {dinero(totalLista, "TIENDA_CO")}</span>
            <button type="button" onClick={() => { setFCampana(""); setFCuenta(""); setFProducto(""); }} className="text-xs text-blue-2 hover:underline">Limpiar filtros</button>
          </>
        )}
      </div>
      {!puedeEditar && <p className="mt-2 text-xs text-muted">Solo el dueño o un socio pueden asignar productos.</p>}
      {campanas.some((c) => c.otros_paises) && (
        <p className="mt-2 text-xs text-muted"><span className="font-bold text-red">*</span> Pauta entregada en otro país donde la sociedad no tiene tienda; se carga a esta (pasa el mouse para ver el país).</p>
      )}
      {puedeEditar && sinId.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Las verdes son sugerencias por el nombre de la campaña (clic para aceptarlas); las amarillas, parecidos parciales para revisar.</span>
          <AceptarSugeridas cuenta={cuenta} campanas={sinId.map((c) => c.campana)} productos={productos} />
        </div>
      )}

      <div className="fichas-caja mt-3 overflow-x-auto -mx-4 sm:-mx-5 max-md:mx-0 md:px-5">
        <table className="tabla fichas w-full min-w-max text-sm">
          <thead>
            <tr><th className="text-left">Campaña</th><th className="text-left">Cuenta</th><th className="text-right">Gasto (COP)</th><th className="text-right">Días</th><th className="text-left">Inicio</th><th className="text-left">Último gasto</th><th className="text-left">Estado en Meta</th><th className="text-left">Producto</th>{puedeEditar && <th className="text-left">Asignar</th>}</tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const actual = c.manual ?? c.regla;
              return (
                <tr key={c.campana}>
                  <td data-l="Campaña" className="text-left max-w-[26rem] whitespace-normal break-words font-medium max-md:col-span-6">{c.campana}<MarcaOtroPais paises={c.otros_paises} /></td>
                  <td data-l="Cuenta" className="text-left text-muted max-w-[10rem] truncate max-md:col-span-6" title={c.cuentas}>{c.cuentas}</td>
                  <td data-l="Gasto (COP)" className="num text-right max-md:col-span-4 max-md:text-left">{dinero(c.cop, "TIENDA_CO")}</td>
                  <td data-l="Días" className="num text-right max-md:col-span-2 max-md:text-left">{c.dias}</td>
                  <Fechas c={c} />
                  <td data-l="Producto" className="text-left max-md:col-span-6">
                    {actual ? (
                      <span>
                        {actual}{" "}
                        <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${c.manual ? "bg-blue-2/15 text-blue-2" : "bg-tinte/5 text-muted"}`} title={c.manual ? `Asignado por ${c.asignado_por ?? "—"}` : `Regla: ${c.patron}`}>
                          {c.manual ? "a mano" : "regla"}
                        </span>
                      </span>
                    ) : <i className="text-amber">Sin identificar</i>}
                  </td>
                  {puedeEditar && (
                    <td data-l="Asignar" className="text-left max-md:col-span-6">
                      <AsignarProducto cuenta={cuenta} campana={c.campana} productos={productos} actual={actual} quitar={!!c.manual} />
                    </td>
                  )}
                </tr>
              );
            })}
            {lista.length === 0 && <tr><td colSpan={puedeEditar ? 9 : 8} className="text-center text-muted">{filtrando ? "Ninguna campaña coincide con los filtros." : vista === "sin" ? "✓ Todas las campañas del periodo tienen producto." : "Sin campañas con gasto en el periodo."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
