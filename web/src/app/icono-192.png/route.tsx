import { ImageResponse } from "next/og";
import { dibujoIcono } from "@/lib/icono-app";

// Ícono de 192 px del manifiesto (app instalada).
export function GET() {
  return new ImageResponse(dibujoIcono(192), { width: 192, height: 192 });
}
