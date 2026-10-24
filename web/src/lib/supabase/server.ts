import "server-only";
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

export type Usuario = { id: string; email: string; rol: "owner" | "socio" | "empleado" };

export async function getUsuario(): Promise<Usuario | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  const { data: u } = await supabase.from("app_usuarios").select("rol,email").eq("user_id", sub).maybeSingle();
  return { id: sub, email: u?.email ?? String(data.claims.email ?? ""), rol: (u?.rol ?? "empleado") as Usuario["rol"] };
}
