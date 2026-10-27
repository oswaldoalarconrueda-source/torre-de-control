import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { esSocio, primeraRuta, tieneModulo, type Acceso, type ModuloId, type Rol } from "@/lib/modulos";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Un cliente nuevo por render: usa la sesión del usuario (cookies), así la RLS filtra lo que ve.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        // En Server Components no se pueden escribir cookies; el proxy refresca la sesión.
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {}
      },
    },
  });
}

export type Usuario = Acceso & { id: string; email: string; nombre: string | null; cuentas: string[] };

// Quién es el usuario, su rol, si está activo y la unión de los módulos que tiene en sus cuentas.
export const getUsuario = cache(async (): Promise<Usuario | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  const [{ data: u }, { data: permisos }] = await Promise.all([
    supabase.from("app_usuarios").select("rol,email,nombre,activo").eq("user_id", sub).maybeSingle(),
    supabase.from("app_permisos").select("cuenta,modulos").eq("user_id", sub),
  ]);
  return {
    id: sub, email: u?.email ?? String(data.claims.email ?? ""), nombre: u?.nombre ?? null,
    rol: (u?.rol ?? "pendiente") as Rol, activo: u?.activo ?? false,
    modulos: [...new Set((permisos ?? []).flatMap((p) => p.modulos as string[]))],
    cuentas: (permisos ?? []).map((p) => p.cuenta as string),
  };
});

// Para las páginas: si el usuario no tiene el módulo, lo manda a la primera pantalla que sí puede ver.
export async function exigirModulo(m: ModuloId) {
  const u = await getUsuario();
  if (!u) redirect("/login");
  if (!tieneModulo(u, m)) redirect(primeraRuta(u));
  return u;
}

// Para las pantallas solo de dueño y socios: a los demás los manda a su primera pantalla.
export async function exigirSocio() {
  const u = await getUsuario();
  if (!u) redirect("/login");
  if (!esSocio(u)) redirect(primeraRuta(u));
  return u;
}
