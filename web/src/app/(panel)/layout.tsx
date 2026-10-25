import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUsuario } from "@/lib/supabase/server";
import { haceCuanto } from "@/lib/formato";
import { Sidebar } from "@/components/sidebar";
import { SinAcceso } from "@/components/sin-acceso";

export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  // En paralelo: quién es el usuario, cuándo fue el último sync y las sociedades que puede ver.
  const [usuario, { data: ultimo }, { data: cuentas }, { data: lista }] = await Promise.all([
    getUsuario(),
    supabase.rpc("app_ultimo_sync"),
    supabase.from("effi_accounts").select("sociedad"),
    supabase.from("app_sociedades").select("nombre").order("orden"),
  ]);
  if (!usuario) redirect("/login");
  // Recién registrado (espera aprobación), rechazado o desactivado: no entra al panel.
  if (usuario.rol === "pendiente" || usuario.rol === "rechazado" || !usuario.activo) {
    return <SinAcceso motivo={usuario.rol === "pendiente" ? "pendiente" : "sin_acceso"} nombre={usuario.nombre} email={usuario.email} />;
  }
  const sociedades = [...new Set((cuentas ?? []).map((c) => c.sociedad as string))];
  const sociedad = sociedades.join(" · ") || "Sin tiendas asignadas";
  // El dueño escoge qué Torre mira (todas o una sociedad); los demás ven solo la suya.
  const esOwner = usuario.rol === "owner";
  const { data: yo } = esOwner ? await supabase.from("app_usuarios").select("sociedad_vista").eq("user_id", usuario.id).maybeSingle() : { data: null };
  const opciones = esOwner ? (lista ?? []).map((x) => x.nombre as string) : null;

  return (
    <div className="lg:flex">
      <Suspense>
        <Sidebar acceso={usuario} email={usuario.email} sociedad={sociedad} ultimoSync={haceCuanto(ultimo as string | null)}
          sociedades={opciones} vista={(yo?.sociedad_vista as string | null) ?? null} />
      </Suspense>
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 pb-16 max-w-[1400px]">{children}</main>
    </div>
  );
}
