import { ImageResponse } from "next/og";
import { dibujoIcono } from "@/lib/icono-app";

// Ícono de 512 px del manifiesto (app instalada).
export function GET() {
  return new ImageResponse(dibujoIcono(512), { width: 512, height: 512 });
}
