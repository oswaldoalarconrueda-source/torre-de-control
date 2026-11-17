import type { MetadataRoute } from "next";

// App instalable (pedido del dueño, 17-nov-2026): en el iPhone, Safari → Compartir → "Agregar a pantalla de inicio".
// Instalada, abre a pantalla completa y puede recibir notificaciones push (Mis alertas).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Centro de Control",
    short_name: "Centro",
    description: "Guías, novedades, ventas y dinero en vivo, con alertas al celular.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#04060a",
    theme_color: "#04060a",
    lang: "es",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
