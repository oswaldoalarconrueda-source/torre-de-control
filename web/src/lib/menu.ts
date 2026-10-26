// Menú lateral: las pestañas del Dashboard Joalix Group (mismo orden, nombre y emoji)
// más las vistas en vivo que ya tiene la Torre de Control.

import type { ModuloId } from "./modulos";

// Cada pantalla pide un módulo (lib/modulos); las de solo dueño no se pueden dar a nadie más.
export type ItemMenu = {
  href: string;
  label: string;
  emoji: string;
  estado: "vivo" | "pronto";
  soloOwner?: boolean;
  modulo?: ModuloId;
};

export const MENU_JOALIX: ItemMenu[] = [
  { href: "/", label: "Datos", emoji: "🛒", estado: "vivo", modulo: "resumen" },
  { href: "/productos", label: "Productos", emoji: "📦", estado: "pronto", modulo: "resumen" },
  { href: "/global", label: "Global", emoji: "🌎", estado: "vivo", modulo: "global" },
  { href: "/flujo-caja", label: "Flujo de Caja", emoji: "💵", estado: "pronto", modulo: "dinero" },
  { href: "/oficina", label: "Disp. en Oficina", emoji: "🏤", estado: "vivo", modulo: "oficina" },
  { href: "/novedades", label: "Novedades", emoji: "⚠️", estado: "vivo", modulo: "novedades" },
  { href: "/publicidad", label: "Publicidad", emoji: "📢", estado: "pronto", modulo: "resumen" },
  { href: "/pagos-publicidad", label: "Pagos de publicidad", emoji: "💳", estado: "pronto", modulo: "dinero" },
  { href: "/sin-liquidar", label: "Guías sin liquidar", emoji: "⏳", estado: "vivo", modulo: "dinero" },
  { href: "/agente", label: "Agente", emoji: "🤖", estado: "vivo", modulo: "automatizacion" },
  { href: "/sync", label: "Estado de los datos", emoji: "🔄", estado: "vivo", soloOwner: true },
  { href: "/cargas", label: "Cargar archivos", emoji: "📤", estado: "vivo", soloOwner: true },
  { href: "/usuarios", label: "Usuarios y permisos", emoji: "👥", estado: "vivo", soloOwner: true },
  { href: "/utilidad", label: "Utilidad", emoji: "📈", estado: "pronto", modulo: "resumen" },
  { href: "/glosario", label: "Glosario", emoji: "📖", estado: "vivo" },
];

export const MENU_EN_VIVO: ItemMenu[] = [
  { href: "/guias", label: "Transportadoras y ciudades", emoji: "🚚", estado: "vivo", modulo: "guias" },
  { href: "/wallet-en-vivo", label: "Wallet en vivo", emoji: "🪙", estado: "vivo", modulo: "dinero" },
  { href: "/dinero", label: "Wallet y PyG Effi", emoji: "💰", estado: "vivo", modulo: "dinero" },
];
