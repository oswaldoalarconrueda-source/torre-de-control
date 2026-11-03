import { dinero, entero } from "@/lib/formato";
import { Panel, TablaScroll, Vacio } from "./ui";

// Liquidación de la comisión, con la estructura del Excel: una fila por cliente y arriba los totales del periodo.
type Valores = { remisiones: number; total_neto: number; costo_iva: number; comision_effi: number; utilidad: number; comision: number };
export type DatosComisiones = { filas: (Valores & { cliente: string | null })[]; totales: Valores; sin_costo: number; reversadas: number };

function Dato({ titulo, valor, nota, destacado }: { titulo: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className={`card min-w-0 p-3 sm:p-4 ${destacado ? "card-glow" : ""}`}>
      <div className={`text-xs ${destacado ? "font-semibold text-green" : "text-muted"}`}>{titulo}</div>
      <div className={`num mt-1.5 truncate font-semibold leading-tight ${destacado ? "text-xl text-green sm:text-2xl" : "text-lg sm:text-xl"}`} title={valor}>{valor}</div>
      {nota && <div className="mt-1 text-[11px] text-muted">{nota}</div>}
    </div>
  );
}

export function ComisionesProveeduria({ cuenta, datos }: { cuenta: string; datos: DatosComisiones }) {
  const { filas, totales: t, sin_costo: sinCosto, reversadas } = datos;
  const $ = (v: number) => dinero(v, cuenta);
  return (
    <div className="space-y-4">
      {sinCosto > 0 && (
        <div className="rounded-xl border border-amber/50 bg-amber/10 px-4 py-3 text-sm">
          <b className="text-amber">Faltan costos:</b> {entero(sinCosto)} de {entero(t.remisiones)} remisiones están sin costo manual, así que la utilidad y la comisión salen más altas de lo real.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Dato titulo="Remisiones" valor={entero(t.remisiones)} />
        <Dato titulo="Total neto" valor={$(t.total_neto)} />
        <Dato titulo="Costo manual + IVA" valor={$(t.costo_iva)} nota="Costo × 1,12" />
        <Dato titulo="Comisión Effi" valor={$(t.comision_effi)} nota="1% del total neto" />
        <Dato titulo="Utilidad" valor={$(t.utilidad)} />
        <Dato titulo="Comisión del encargado" valor={$(t.comision)} nota="10% de la utilidad" destacado />
      </div>
      <Panel titulo="Por cliente" detalle={`Remisiones creadas en el periodo con convenio de dropshipping y la venta en la wallet.${reversadas ? ` Sin contar ${entero(reversadas)} con liquidación reversada.` : ""}`}>
        {filas.length ? (
          <TablaScroll>
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="!text-right">Remisiones</th>
                <th className="!text-right">Total neto</th>
                <th className="!text-right">Costo + IVA</th>
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
                  <td className="num text-right">{$(f.costo_iva)}</td>
                  <td className="num text-right">{$(f.utilidad)}</td>
                  <td className="num text-right font-semibold text-green">{$(f.comision)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total</td>
                <td className="num text-right">{entero(t.remisiones)}</td>
                <td className="num text-right">{$(t.total_neto)}</td>
                <td className="num text-right">{$(t.costo_iva)}</td>
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
