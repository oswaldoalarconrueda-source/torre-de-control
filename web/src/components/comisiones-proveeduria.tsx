import Link from "next/link";
import type { ReactNode } from "react";
import { dinero, entero } from "@/lib/formato";
import { Panel, TablaScroll, Vacio } from "./ui";

// Liquidación de la comisión, con la estructura del Excel: una fila por cliente y arriba los totales del periodo con su detalle.
type Valores = { remisiones: number; total_neto: number; costo: number; iva: number; costo_iva: number; comision_effi: number; utilidad: number; comision: number };
type Estados = { total: number; pagadas: number; devolucion: number; transito: number; entregadas_sin_pago: number; rechazadas: number; vendido: number; guias: number };
export type DatosComisiones = {
  filas: (Valores & { cliente: string | null })[]; totales: Valores & { pedidos_cobrados: number; guias: number }; estados: Estados; sin_costo: number; reversadas: number;
};

export function Dato({ titulo, valor, destacado, className = "", children }: { titulo: string; valor: string; destacado?: boolean; className?: string; children?: ReactNode }) {
  return (
    <div className={`card min-w-0 p-3 sm:p-4 ${destacado ? "card-glow" : ""} ${className}`}>
      <div className={`text-xs ${destacado ? "font-semibold text-green" : "text-muted"}`}>{titulo}</div>
      <div className={`num mt-1.5 truncate font-semibold leading-tight ${destacado ? "text-xl text-green sm:text-2xl" : "text-lg sm:text-xl"}`} title={valor}>{valor}</div>
      {children && <div className="mt-2 space-y-0.5 text-[11px] leading-snug text-muted">{children}</div>}
    </div>
  );
}

// Una línea de detalle: el número resaltado y lo que significa.
export const Linea = ({ n, children, color }: { n: string; children: ReactNode; color?: string }) => (
  <div><span className="num font-semibold" style={{ color: color ?? "var(--text)" }}>{n}</span> {children}</div>
);

export function ComisionesProveeduria({ cuenta, datos, verSinCosto }: { cuenta: string; datos: DatosComisiones; verSinCosto: string }) {
  const { filas, totales: t, estados: e, sin_costo: sinCosto, reversadas } = datos;
  const $ = (v: number) => dinero(v, cuenta);
  return (
    <div className="space-y-4">
      {sinCosto > 0 && (
        <div className="rounded-xl border border-amber/50 bg-amber/10 px-4 py-3 text-sm">
          <b className="text-amber">Sin costo manual:</b> {entero(sinCosto)} de {entero(e.pagadas)} remisiones pagadas no tienen costo en Effi. No se pagan: no entran en el total neto, el costo, la utilidad ni la comisión.{" "}
          <Link href={verSinCosto} className="font-semibold text-amber underline underline-offset-2">Ver {sinCosto === 1 ? "cuál es" : `las ${entero(sinCosto)}`}</Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Dato titulo="Remisiones" valor={entero(e.total)}>
          <Linea n={entero(e.pagadas)} color="var(--green)">entregadas y pagas</Linea>
          {sinCosto > 0 && <Linea n={entero(sinCosto)} color="var(--amber)">de esas sin costo, no se pagan</Linea>}
          {e.entregadas_sin_pago > 0 && <Linea n={entero(e.entregadas_sin_pago)} color="var(--amber)">{e.entregadas_sin_pago === 1 ? "entregada sin pagar" : "entregadas sin pagar"}</Linea>}
          <Linea n={entero(e.transito)} color="var(--blue-2)">en tránsito</Linea>
          <Linea n={entero(e.devolucion)} color="var(--red)">en devolución</Linea>
        </Dato>
        <Dato titulo="Total neto" valor={$(t.total_neto)}>
          <Linea n={entero(t.guias)}>guías entregadas y pagas</Linea>
          <div>Total vendido: <span className="num font-semibold text-text">{$(e.vendido)}</span> en <span className="num font-semibold text-text">{entero(e.guias)}</span> guías</div>
        </Dato>
        <Dato titulo="Costo manual" valor={$(t.costo)} />
        <Dato titulo="IVA" valor={$(t.iva)}>
          <div>12% del costo manual</div>
          <Linea n={$(t.costo_iva)}>costo con IVA</Linea>
        </Dato>
        <Dato titulo="Comisión Effi" valor={$(t.comision_effi)}>
          <Linea n={entero(t.pedidos_cobrados)}>pedidos cobrados</Linea>
          <div>1% del total neto</div>
        </Dato>
        <Dato titulo="Utilidad" valor={$(t.utilidad)}>
          <Linea n={entero(t.remisiones)}>pedidos entregados y pagos</Linea>
        </Dato>
        <Dato titulo="Comisión administrador" valor={$(t.comision)} destacado className="col-span-2 md:col-span-1">
          <div>10% de la utilidad</div>
        </Dato>
      </div>
      <Panel titulo="Por cliente" detalle={`Remisiones creadas en el periodo con convenio de dropshipping, la venta en la wallet y costo manual.${reversadas ? ` Sin contar ${entero(reversadas)} con liquidación reversada.` : ""}${e.rechazadas ? ` Las ${entero(e.rechazadas)} rechazadas no cuentan en ningún total.` : ""}`}>
        {filas.length ? (
          <TablaScroll>
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="!text-right">Remisiones</th>
                <th className="!text-right">Total neto</th>
                <th className="!text-right">Costo</th>
                <th className="!text-right">IVA</th>
                <th className="!text-right">Comisión Effi</th>
                <th className="!text-right">Utilidad</th>
                <th className="!text-right">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.cliente ?? "—"}>
                  <td className="max-w-[9rem] truncate sm:max-w-none" title={f.cliente ?? ""}>{f.cliente ?? "—"}</td>
                  <td className="num text-right">{entero(f.remisiones)}</td>
                  <td className="num text-right">{$(f.total_neto)}</td>
                  <td className="num text-right">{$(f.costo)}</td>
                  <td className="num text-right">{$(f.iva)}</td>
                  <td className="num text-right">{$(f.comision_effi)}</td>
                  <td className="num text-right">{$(f.utilidad)}</td>
                  <td className="num text-right font-semibold text-green">{$(f.comision)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total</td>
                <td className="num text-right">{entero(t.remisiones)}</td>
                <td className="num text-right">{$(t.total_neto)}</td>
                <td className="num text-right">{$(t.costo)}</td>
                <td className="num text-right">{$(t.iva)}</td>
                <td className="num text-right">{$(t.comision_effi)}</td>
                <td className="num text-right">{$(t.utilidad)}</td>
                <td className="num text-right text-green">{$(t.comision)}</td>
              </tr>
            </tbody>
          </TablaScroll>
        ) : (
          <Vacio>No hay remisiones liquidadas en este periodo.</Vacio>
        )}
      </Panel>
    </div>
  );
}
