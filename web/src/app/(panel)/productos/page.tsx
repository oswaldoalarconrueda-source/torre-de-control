import { Proximamente } from "@/components/proximamente";

export default function Page() {
  return <Proximamente titulo="Productos" emoji="📦" fuentes={["effi", "archivo"]} secciones={["Resumen diario por estados y producto", "Filtro por Producto y Proveedor", "Desempeño por producto (venta, costo, fletes, fulfillment)"]} />;
}
