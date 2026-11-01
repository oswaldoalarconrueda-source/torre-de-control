import { redirect } from "next/navigation";

// La dirección principal la resuelve proxy.ts (a /inicio, o a /datos si trae filtros); esto es solo el respaldo.
export default function RaizPage() {
  redirect("/inicio");
}
