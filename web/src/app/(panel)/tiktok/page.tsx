import { redirect } from "next/navigation";
import { createClient, getUsuario } from "@/lib/supabase/server";
import { ConectarTiktok, type EstadoTiktok } from "@/components/conectar-tiktok";

// 🎵 TikTok Ads (solo el dueño, 22-nov-2026): conexión de la app de TikTok (Marketing API) para traer solo el gasto de
// A un clic. Primero el App ID y el Secret van al Vault con scripts/guardar-tiktok.sh; aquí «Conectar TikTok» lleva a
// TikTok a autorizar las cuentas y la función tiktok-auth deja guardado el permiso. Nadie copia ni pega tokens.
export default async function TiktokPage({ searchParams }: PageProps<"/tiktok">) {
  const u = await getUsuario();
  if (u?.rol !== "owner") redirect("/");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tiktok_estado");
  return (
    <>
      <div className="pt-8 mb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">🎵 TikTok Ads</h1>
        <p className="text-sm text-muted mt-1.5">Conexión con la API de TikTok para que el gasto publicitario de A un clic llegue solo, como el de Meta.</p>
      </div>
      <ConectarTiktok estado={(data ?? null) as EstadoTiktok | null} error={error?.message ?? null}
        ok={typeof sp.ok === "string" ? Number(sp.ok) : null} fallo={typeof sp.error === "string" ? sp.error : null} />
    </>
  );
}
