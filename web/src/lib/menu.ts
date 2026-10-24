// Menú lateral: las pestañas del Dashboard Joalix Group (mismo orden, nombre y emoji)
// más las vistas en vivo que ya tiene la Torre de Control.

export type ItemMenu = {
  href: string;
  label: string;
  emoji: string;
  estado: "vivo" | "pronto";
  soloOwner?: boolean;
};

export const MENU_JOALIX: ItemMenu[] = [
  { href: "/", label: "Datos", emoji: "🛒", estado: "vivo" },
  { href: "/productos", label: "Productos", emoji: "📦", estado: "pronto" },
  { href: "/global", label: "Global", emoji: "🌎", estado: "pronto" },
  { href: "/flujo-caja", label: "Flujo de Caja", emoji: "💵", estado: "pronto" },
  { href: "/oficina", label: "Disp. en Oficina", emoji: "🏤", estado: "vivo" },
  { href: "/publicidad", label: "Publicidad", emoji: "📢", estado: "pronto" },
  { href: "/pagos-publicidad", label: "Pagos de publicidad", emoji: "💳", estado: "pronto" },
  { href: "/sin-liquidar", label: "Guías sin liquidar", emoji: "⏳", estado: "vivo" },
  { href: "/agente", label: "Agente", emoji: "🤖", estado: "vivo", soloOwner: true },
  { href: "/sync", label: "Estado de los datos", emoji: "🔄", estado: "vivo", soloOwner: true },
  { href: "/cargas", label: "Cargar archivos", emoji: "📤", estado: "vivo", soloOwner: true },
  { href: "/utilidad", label: "Utilidad", emoji: "📈", estado: "pronto" },
  { href: "/glosario", label: "Glosario", emoji: "📖", estado: "vivo" },
];

export const MENU_EN_VIVO: ItemMenu[] = [
  { href: "/guias", label: "Transportadoras y ciudades", emoji: "🚚", estado: "vivo" },
  { href: "/novedades", label: "Novedades", emoji: "⚠️", estado: "vivo" },
  { href: "/wallet-en-vivo", label: "Wallet en vivo", emoji: "🪙", estado: "vivo" },
  { href: "/dinero", label: "Wallet y PyG Effi", emoji: "💰", estado: "vivo" },
];
