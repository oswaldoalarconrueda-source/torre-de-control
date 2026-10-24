import type { NextConfig } from "next";

// Dashboard por usuario y en vivo: renderizado dinámico clásico (sin Cache Components),
// para no cachear datos de un usuario en el shell de otro.
const nextConfig: NextConfig = {
  experimental: {
    // Caché del navegador de 1 minuto: volver a una pestaña ya vista (mismo filtro) es instantáneo.
    // Es por usuario (vive en su navegador) y los datos de Effi se refrescan cada minuto de todas formas.
    staleTimes: { dynamic: 60 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
