import { NextResponse, type NextRequest } from "next/server";
import { createClient, getUsuario } from "@/lib/supabase/server";
import { DEMO, DEMO_COOKIE } from "@/lib/demo";

// Entra al modo demostración (solo el dueño): septiembre de 2026, solo lectura y la sociedad Joalix AA Group.
export async function GET(request: NextRequest) {
  const u = await getUsuario();
  const url = request.nextUrl.clone();
  url.search = "";
  if (u?.rol !== "owner") { url.pathname = "/"; return NextResponse.redirect(url); }
  // Los datos de la demostración son de Joalix AA Group: se deja esa sociedad a la vista.
  await (await createClient()).rpc("app_ver_sociedad", { p_sociedad: "Joalix AA Group" });
  url.pathname = "/datos";
  url.searchParams.set("c", "TIENDA_CO");
  url.searchParams.set("d", DEMO.desde);
  url.searchParams.set("h", DEMO.hasta);
  const res = NextResponse.redirect(url);
  res.cookies.set(DEMO_COOKIE, "1", { path: "/", httpOnly: false, sameSite: "lax", maxAge: 60 * 60 * 24 * 7 });
  return res;
}
