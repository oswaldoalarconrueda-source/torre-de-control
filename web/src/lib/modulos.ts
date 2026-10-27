// Módulos de la Torre que el dueño le puede dar a un empleado o a un proveedor (los socios ven todos los de sus
// tiendas y el dueño ve todo). Cada módulo abre una o varias pantallas del menú.

export const MODULOS = [
  { id: "resumen", nombre: "Datos", detalle: "Ventas, despachos, PyG y utilidad", rutas: ["/"] },
  { id: "global", nombre: "Global", detalle: "Todos los países juntos", rutas: ["/global"] },
  { id: "oficina", nombre: "Disponible en oficina", detalle: "CRM para llamar a los clientes", rutas: ["/oficina"] },
  { id: "guias", nombre: "Guías y En vivo", detalle: "Transportadoras, ciudades y la operación en vivo", rutas: ["/guias", "/en-vivo"] },
  { id: "novedades", nombre: "Novedades", detalle: "Novedades de las guías", rutas: ["/novedades"] },
  { id: "dinero", nombre: "Dinero", detalle: "Wallet y PyG, Wallet en vivo y guías sin liquidar", rutas: ["/dinero", "/wallet-en-vivo", "/sin-liquidar"] },
  { id: "automatizacion", nombre: "Agente", detalle: "Órdenes de venta y novedades del agente", rutas: ["/agente"] },
  { id: "proveeduria", nombre: "Proveeduría", detalle: "Tablero de Distrilatam: ventas a las tiendas, inventario, compras y cartera", rutas: ["/proveeduria"] },
] as const;
export type ModuloId = (typeof MODULOS)[number]["id"];

export type Rol = "owner" | "socio" | "empleado" | "proveedor" | "pendiente" | "rechazado";
export const ROLES: Record<"socio" | "empleado" | "proveedor", { nombre: string; detalle: string }> = {
  socio: { nombre: "Socio", detalle: "Entra a las tiendas de su sociedad y ve todos los módulos" },
  empleado: { nombre: "Empleado", detalle: "Entra a las tiendas que le asignes y solo a los módulos que marques" },
  proveedor: { nombre: "Proveeduría", detalle: "Entra a las cuentas de proveeduría que le asignes, con los módulos que marques" },
};

export type Acceso = { rol: Rol; activo: boolean; modulos: string[] };

export const tieneModulo = (u: Acceso, m: ModuloId) =>
  u.activo && (u.rol === "owner" || u.rol === "socio" || ((u.rol === "empleado" || u.rol === "proveedor") && u.modulos.includes(m)));

// Dueño y socios: pantallas que no se le dan a empleados ni proveedores (p. ej. 📢 Publicidad).
export const esSocio = (u: Acceso) => u.activo && (u.rol === "owner" || u.rol === "socio");

// Primera pantalla a la que el usuario sí puede entrar (para mandarlo ahí si abre una que no tiene).
export function primeraRuta(u: Acceso) {
  const m = MODULOS.find((x) => tieneModulo(u, x.id));
  return m ? m.rutas[0] : "/glosario";
}
