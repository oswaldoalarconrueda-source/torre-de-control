import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUsuario } from "@/lib/supabase/server";
import { haceCuanto } from "@/lib/formato";
import { Sidebar } from "@/components/sidebar";
import { SinAcceso } from "@/components/sin-acceso";

export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  // En paralelo: quién es el usuario, cuándo fue el último sync y las sociedades que puede ver.
  const [usuario, { data: ultimo }, { data: cuentas }] = await Promise.all([
    getUsuario(),
    supabase.rpc("app_ultimo_sync"),
    supabase.from("effi_accounts").select("sociedad"),
  ]);
  if (!usuario) redirect("/login");
  // Recién registrado (espera aprobación), rechazado o desactivado: no entra al panel.
  if (usuario.rol === "pendiente" || usuario.rol === "rechazado" || !usuario.activo) {
    return <SinAcceso motivo={usuario.rol === "pendiente" ? "pendiente" : "sin_acceso"} nombre={usuario.nombre} email={usuario.email} />;
  }
  const sociedades = [...new Set((cuentas ?? []).map((c) => c.sociedad as string))];
  const sociedad = usuario.rol === "owner" ? "Todas las sociedades" : sociedades.join(" · ") || "Sin tiendas asignadas";

  return (
    <div className="lg:flex">
      <Suspense>
        <Sidebar acceso={usuario} email={usuario.email} sociedad={sociedad} ultimoSync={haceCuanto(ultimo as string | null)} />
      </Suspense>
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 pb-16 max-w-[1400px]">{children}</main>
    </div>
  );
}
