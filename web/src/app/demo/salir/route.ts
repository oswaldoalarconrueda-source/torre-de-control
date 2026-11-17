import { NextResponse, type NextRequest } from "next/server";
import { createClient, getUsuario } from "@/lib/supabase/server";
import { DEMO_COOKIE } from "@/lib/demo";

// Sale del modo demostración y vuelve al Centro de Control en vivo. Con ?ver=<sociedad> (el selector de sociedades) deja
// puesta esa sociedad; "" = todas.
export async function GET(request: NextRequest) {
  const ver = request.nextUrl.searchParams.get("ver");
  if (ver !== null && (await getUsuario())?.rol === "owner") {
    await (await createClient()).rpc("app_ver_sociedad", { p_sociedad: ver || null });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/datos";
  url.search = "";
  const res = NextResponse.redirect(url);
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
