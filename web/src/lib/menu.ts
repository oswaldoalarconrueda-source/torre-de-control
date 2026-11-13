// Menú lateral: las pestañas del Dashboard Joalix Group (mismo orden, nombre y emoji)
// más las vistas en vivo que ya tiene el Centro de Control.

import type { ModuloId } from "./modulos";

// Cada pantalla pide un módulo (lib/modulos); las de solo dueño no se pueden dar a nadie más.
export type ItemMenu = {
  href: string;
  label: string;
  emoji: string;
  estado: "vivo" | "pronto";
  soloOwner?: boolean;
  soloSocios?: boolean; // solo el dueño y los socios (no empleados ni proveedores, aunque tengan el módulo)
  soloProveeduria?: boolean; // solo si el usuario ve alguna empresa de proveeduría
  noProveeduria?: boolean; // oculto para socios y trabajadores que solo ven proveeduría (el dueño lo ve igual)
  modulo?: ModuloId;
  icono?: string; // imagen en lugar del emoji (p. ej. el logo de Lucid)
  hijos?: ItemMenu[]; // grupo que se abre y se cierra (el grupo sale solo si la persona ve algún hijo)
};

// Orden del menú: lo del día a día arriba (Data Experience, Novedades logística, ValerIA/Agente), luego lo en vivo y al final lo
// que todavía no está ("pronto"). Las de solo dueño van en "Solo para ti".
export const MENU_JOALIX: ItemMenu[] = [
  { href: "/datos", label: "Data Experience", emoji: "🛒", estado: "vivo", modulo: "resumen" },
  { href: "#logistica", label: "Novedades logística", emoji: "🚚", estado: "vivo", hijos: [
    { href: "/oficina", label: "Disponible en oficina", emoji: "🏤", estado: "vivo", modulo: "oficina", noProveeduria: true },
    { href: "/novedades", label: "Novedades", emoji: "⚠️", estado: "vivo", modulo: "novedades", noProveeduria: true },
  ] },
  // El nombre lo pone la barra lateral según la sociedad: ValerIA en Joalix, Agente en las demás.
  { href: "/agente", label: "Agente", emoji: "🤖", estado: "vivo", modulo: "automatizacion" },
  { href: "/pedidos-lucid", label: "Data Lucid", emoji: "📝", icono: "/lucid.svg", estado: "vivo", modulo: "pedidos_lucid", noProveeduria: true },
  { href: "/proveeduria", label: "Proveeduría", emoji: "🏭", estado: "vivo", modulo: "proveeduria", soloProveeduria: true },
  { href: "/global", label: "Global", emoji: "🌎", estado: "vivo", modulo: "global" },
  { href: "/publicidad", label: "Publicidad", emoji: "📢", estado: "vivo", modulo: "resumen", noProveeduria: true, soloSocios: true },
  { href: "/sin-liquidar", label: "Guías sin liquidar", emoji: "⏳", estado: "vivo", modulo: "dinero" },
  { href: "/tiempo-empleados", label: "Gestión tiempo empleados", emoji: "⏱️", estado: "vivo", soloOwner: true },
  { href: "/agente-admin", label: "Agente admin", emoji: "🧾", estado: "vivo", soloOwner: true },
  { href: "/sync", label: "Estado de los datos", emoji: "🔄", estado: "vivo", soloOwner: true },
  { href: "/cargas", label: "Cargar archivos", emoji: "📤", estado: "vivo", soloOwner: true },
  { href: "/usuarios", label: "Usuarios y permisos", emoji: "👥", estado: "vivo", soloOwner: true },
];

export const MENU_EN_VIVO: ItemMenu[] = [
  { href: "/guias", label: "Transportadoras y ciudades", emoji: "🚚", estado: "vivo", modulo: "guias", noProveeduria: true },
  { href: "/wallet-en-vivo", label: "Wallet en vivo", emoji: "🪙", estado: "vivo", modulo: "dinero" },
  { href: "/dinero", label: "Wallet y PyG Effi", emoji: "💰", estado: "vivo", modulo: "dinero", noProveeduria: true },
];

export const MENU_PRONTO: ItemMenu[] = [
  { href: "/productos", label: "Productos", emoji: "📦", estado: "vivo", modulo: "resumen" },
  { href: "/flujo-caja", label: "Flujo de Caja", emoji: "💵", estado: "vivo", modulo: "dinero", soloSocios: true },
  { href: "/pagos-publicidad", label: "Pagos de publicidad", emoji: "💳", estado: "pronto", modulo: "dinero" },
  { href: "/utilidad", label: "Utilidad", emoji: "📈", estado: "pronto", modulo: "resumen" },
  { href: "/glosario", label: "Glosario", emoji: "📖", estado: "vivo" },
];
