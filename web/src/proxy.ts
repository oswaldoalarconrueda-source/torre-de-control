import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO, DEMO_COOKIE, DEMO_RUTAS, DEMO_SIN_FECHAS, rangoDemo } from "@/lib/demo";

// Refresca la sesión de Supabase en cada request y manda al login a quien no la tenga.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const ruta = request.nextUrl.pathname;
  // El enlace de "Olvidé mi clave" trae ?code=…; si Supabase lo manda a otra ruta, se lleva a /nueva-clave.
  if (ruta === "/nueva-clave") return response;
  if (request.nextUrl.searchParams.has("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/nueva-clave";
    return NextResponse.redirect(url);
  }
  const enLogin = ruta.startsWith("/login") || ruta.startsWith("/registro");
  if (!data?.claims && !enLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (data?.claims && enLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/inicio";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // 🎬 Modo demostración: solo las pantallas de la demostración y siempre dentro de septiembre de 2026.
  if (data?.claims && request.cookies.get(DEMO_COOKIE)?.value === "1" && !ruta.startsWith("/demo") && !ruta.startsWith("/api")) {
    const url = request.nextUrl.clone();
    const sp = url.searchParams;
    let cambio = false;
    if (!DEMO_RUTAS.some((r) => ruta === r || ruta.startsWith(`${r}/`))) {
      url.pathname = "/datos";
      url.search = "";
      sp.set("c", "TIENDA_CO");
      cambio = true;
    }
    if (url.pathname === "/pedidos-lucid") {
      if (sp.get("mes") !== DEMO.mes) { sp.set("mes", DEMO.mes); cambio = true; }
    } else if (!DEMO_SIN_FECHAS.some((r) => url.pathname === r || url.pathname.startsWith(`${r}/`))) {
      const r = rangoDemo(url.pathname);
      let d = sp.get("d") ?? "", h = sp.get("h") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < r.desde || d > r.hasta) d = r.desde;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(h) || h > r.hasta || h < d) h = r.hasta;
      if (sp.get("d") !== d || sp.get("h") !== h) { sp.set("d", d); sp.set("h", h); cambio = true; }
    }
    if (cambio) return NextResponse.redirect(url);
  }
  // La dirección principal abre 🏠 Inicio. Los enlaces viejos de Data Experience traen filtros (?c=…&d=…): esos siguen a /datos.
  if (ruta === "/") {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.search ? "/datos" : "/inicio";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // sw.js, el manifiesto y los íconos de la app se piden sin sesión (instalar la app en el celular).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|apple-icon|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
