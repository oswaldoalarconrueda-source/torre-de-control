import { dinero, entero } from "@/lib/formato";
import { Panel, TablaScroll } from "./ui";

// Comisión por las ventas por mayor ya pagadas: las remisiones del Excel revisado que se sube en «Por mayor», con su costo y su porcentaje.
// Regla del Excel: utilidad = venta con IVA − costo con IVA (12 %); comisión = utilidad × porcentaje.
type FilaMayor = {
  id: number; fecha: string; cliente: string | null; venta_iva: number; costo_iva: number; utilidad: number; tasa: number; comision: number; nota: string | null;
};
export type DatosMayor = {
  filas: FilaMayor[]; totales: { remisiones: number; venta_iva: number; costo_iva: number; utilidad: number; comision: number };
};

const pct = (t: number) => `${Math.round(Number(t) * 100)} %`;

export function ComisionesMayor({ cuenta, datos }: { cuenta: string; datos: DatosMayor }) {
  const { filas, totales: t } = datos;
  if (!filas.length) return null;
  const $ = (v: number) => dinero(v, cuenta);
  const tasas = [...new Set(filas.map((f) => pct(f.tasa)))];
  return (
    <Panel titulo="Ventas por mayor" detalle={`Remisiones por mayor pagas, tal como vienen en el Excel revisado. ${tasas.length === 1 ? `Comisión: ${tasas[0]} de la utilidad.` : "Cada una con su porcentaje."}`}>
      <TablaScroll>
        <thead>
          <tr>
            <th>Remisión</th>
            <th>Fecha</th>
            <th>Cliente</th>
            <th className="!text-right">Venta con IVA</th>
            <th className="!text-right">Costo con IVA</th>
            <th className="!text-right">Utilidad</th>
            <th className="!text-right">%</th>
            <th className="!text-right">Comisión</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td className="num">
                {f.id}
                {f.nota && <span className="ml-1 cursor-help text-amber" title={f.nota}>*</span>}
              </td>
              <td className="num">{f.fecha.split("-").reverse().join("/")}</td>
              <td className="max-w-[9rem] truncate sm:max-w-none" title={f.cliente ?? ""}>{f.cliente ?? "—"}</td>
              <td className="num text-right">{$(f.venta_iva)}</td>
              <td className="num text-right">{$(f.costo_iva)}</td>
              <td className="num text-right">{$(f.utilidad)}</td>
              <td className="num text-right">{pct(f.tasa)}</td>
              <td className="num text-right font-semibold text-green">{$(f.comision)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td colSpan={3}>Total · {entero(t.remisiones)} {t.remisiones === 1 ? "remisión" : "remisiones"}</td>
            <td className="num text-right">{$(t.venta_iva)}</td>
            <td className="num text-right">{$(t.costo_iva)}</td>
            <td className="num text-right">{$(t.utilidad)}</td>
            <td />
            <td className="num text-right text-green">{$(t.comision)}</td>
          </tr>
        </tbody>
      </TablaScroll>
      {filas.some((f) => f.nota) && <p className="mt-2 text-xs text-muted"><span className="text-amber">*</span> El costo del Excel es distinto al de Effi; se usa el del Excel (pasa el mouse para ver el detalle).</p>}
    </Panel>
  );
}
