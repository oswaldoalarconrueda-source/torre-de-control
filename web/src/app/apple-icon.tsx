import { ImageResponse } from "next/og";
import { dibujoIcono } from "@/lib/icono-app";

// Ícono del iPhone al agregar el Centro de Control a la pantalla de inicio.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(dibujoIcono(180), { ...size });
}
