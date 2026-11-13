import { redirect } from "next/navigation";
import { getUsuario } from "@/lib/supabase/server";
import { primeraRuta } from "@/lib/modulos";

// 🏠 Inicio se quitó (pedido del dueño, 12-nov-2026); su bloque de tiempo del equipo pasó a "Gestión tiempo empleados".
// La dirección se deja para no romper enlaces ni el ingreso: manda a la primera pantalla que la persona puede ver.
export default async function InicioPage() {
  const u = await getUsuario();
  if (!u) redirect("/login");
  redirect(primeraRuta(u));
}
