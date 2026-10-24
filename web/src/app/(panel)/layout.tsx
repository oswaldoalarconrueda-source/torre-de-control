import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUsuario } from "@/lib/supabase/server";
import { haceCuanto } from "@/lib/formato";
import { Sidebar } from "@/components/sidebar";

export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  // En paralelo: quién es el usuario y cuándo fue el último sync.
  const [usuario, { data: ultimo }] = await Promise.all([getUsuario(), supabase.rpc("app_ultimo_sync")]);
  if (!usuario) redirect("/login");

  return (
    <div className="lg:flex">
      <Suspense>
        <Sidebar esOwner={usuario.rol === "owner"} email={usuario.email} ultimoSync={haceCuanto(ultimo as string | null)} />
      </Suspense>
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 pb-16 max-w-[1400px]">{children}</main>
    </div>
  );
}
