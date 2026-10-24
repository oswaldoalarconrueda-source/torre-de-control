import { Proximamente } from "@/components/proximamente";

export default function Page() {
  return <Proximamente titulo="Flujo de Caja" emoji="💵" fuentes={["manual", "effi"]} secciones={["Movimientos en pesos colombianos (COP)", "Resumen por concepto", "Retiros pendientes por confirmar", "Pagos a tarjetas de otras sociedades · por cruzar", "Depósitos sin identificar"]} />;
}
