import "server-only";
import { cookies } from "next/headers";
import { getUsuario } from "@/lib/supabase/server";
import { DEMO_COOKIE } from "@/lib/demo";

// ¿Esta página se está viendo en modo demostración? Solo el dueño puede estar en ese modo.
export async function enDemo() {
  const u = await getUsuario();
  return u?.rol === "owner" && (await cookies()).get(DEMO_COOKIE)?.value === "1";
}
