// Módulos del Centro de Control que el dueño le puede dar a un empleado o a un proveedor (los socios ven todos los de sus
// tiendas y el dueño ve todo). Cada módulo abre una o varias pantallas del menú.

export const MODULOS = [
  { id: "resumen", nombre: "Data Experience", detalle: "Ventas, despachos, PyG y utilidad", rutas: ["/datos", "/tasa-despacho"] },
  { id: "global", nombre: "Global", detalle: "Todos los países juntos", rutas: ["/global"] },
  { id: "oficina", nombre: "Disponible en oficina", detalle: "CRM para llamar a los clientes (Effi y Others)", rutas: ["/oficina", "/oficina-others"] },
  { id: "guias", nombre: "Guías y En vivo", detalle: "Transportadoras, ciudades y la operación en vivo", rutas: ["/guias", "/en-vivo"] },
  { id: "novedades", nombre: "Novedades", detalle: "Novedades de las guías", rutas: ["/novedades"] },
  { id: "dinero", nombre: "Dinero", detalle: "Wallet y PyG, Wallet en vivo y guías sin liquidar", rutas: ["/dinero", "/wallet-en-vivo", "/sin-liquidar"] },
  { id: "automatizacion", nombre: "Agente", detalle: "Órdenes de venta y novedades del agente", rutas: ["/agente"] },
  { id: "proveeduria", nombre: "Proveeduría", detalle: "Tablero de Distrilatam: ventas a las tiendas, inventario, compras y cartera", rutas: ["/proveeduria"] },
  // Lo llenan el dueño, los socios y la empleada que tenga el módulo marcado.
  { id: "pedidos_lucid", nombre: "Pedidos plataformas", detalle: "Llenar cada día los pedidos que entran a LucidSales por país (los socios también lo llenan)", rutas: ["/pedidos-lucid"] },
  // Exclusivo: solo a quien se le marque (p. ej. la encargada que sube cada mañana la cartera de Dropi y la billetera de Drop).
  { id: "cargas", nombre: "Cargar archivos", detalle: "Subir los Excel de cartera y órdenes (Others, Drop, icomfly) de sus tiendas", rutas: ["/cargas"], exclusivo: true },
  // Pedido del dueño (21-nov-2026): Productos, Utilidad y Glosario ya no vienen con Data Experience; cada uno se da aparte.
  { id: "productos", nombre: "Productos y utilidad", detalle: "Ventas por producto, homologar campañas y la utilidad (también necesita Data Experience para ver los datos)", rutas: ["/productos", "/utilidad"] },
  // Pedido del dueño (23-nov-2026): homologar campañas aparte de Productos, para dárselo a un empleado solo con eso.
  { id: "campanas", nombre: "Campañas sin identificar", detalle: "Decir de qué producto es cada campaña de Meta que no se reconoce sola (homologar)", rutas: ["/campanas-sin-identificar"] },
  { id: "glosario", nombre: "Glosario", detalle: "Qué significa cada cifra del Centro de Control", rutas: ["/glosario"] },
  // Pedido del dueño (24-nov-2026): la encargada ve y filtra lo que hizo cada asesora en Novedades y Disp. en oficina. Sin
  // esto, cada empleada ve solo sus propias gestiones. No abre pantalla propia: se usa dentro de esas dos.
  { id: "equipo", nombre: "Gestiones del equipo", detalle: "Ver y filtrar por día lo que hizo cada asesora en Novedades y Disp. en oficina (sin esto, cada una ve solo lo suyo)", rutas: [] },
] as const;
export type ModuloId = (typeof MODULOS)[number]["id"];
// Módulos exclusivos: solo el dueño y a quien se le marquen; a los socios no les llegan solos.
const EXCLUSIVOS = new Set<string>(MODULOS.filter((m) => "exclusivo" in m && m.exclusivo).map((m) => m.id));

export type Rol = "owner" | "socio" | "empleado" | "proveedor" | "pendiente" | "rechazado";
export const ROLES: Record<"socio" | "empleado" | "proveedor", { nombre: string; detalle: string }> = {
  socio: { nombre: "Socio", detalle: "Entra a las tiendas de su sociedad y ve todos los módulos" },
  empleado: { nombre: "Empleado", detalle: "Entra a las tiendas que le asignes y solo a los módulos que marques" },
  proveedor: { nombre: "Proveeduría", detalle: "Entra a las cuentas de proveeduría que le asignes, con los módulos que marques" },
};

export type Acceso = { rol: Rol; activo: boolean; modulos: string[] };

export const tieneModulo = (u: Acceso, m: ModuloId) =>
  u.activo && (u.rol === "owner" || (u.rol === "socio" && !EXCLUSIVOS.has(m)) ||
    ((u.rol === "empleado" || u.rol === "proveedor") && u.modulos.includes(m)));

// Ve las gestiones de todo el equipo (dueño, socios y la empleada con «Gestiones del equipo»). La base lo vuelve a revisar
// por tienda (app_ve_equipo).
export const veEquipo = (u: Acceso) => tieneModulo(u, "equipo");

// Dueño y socios: pantallas que no se le dan a empleados ni proveedores (p. ej. 📢 Publicidad).
export const esSocio = (u: Acceso) => u.activo && (u.rol === "owner" || u.rol === "socio");

// Primera pantalla a la que el usuario sí puede entrar (para mandarlo ahí si abre una que no tiene).
export function primeraRuta(u: Acceso) {
  const m = MODULOS.find((x) => x.rutas.length > 0 && tieneModulo(u, x.id));
  return (m?.rutas[0] as string | undefined) ?? "/glosario";
}
