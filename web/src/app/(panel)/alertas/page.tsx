import { redirect } from "next/navigation";
import { getUsuario } from "@/lib/supabase/server";
import { MisAlertas } from "@/components/mis-alertas";

// 🔔 Mis alertas (pedido del dueño, 17-nov-2026): el Centro de Control instalado como app en el celular recibe notificaciones
// push, también con el celular bloqueado. Aquí se activan en cada celular y se manda una prueba. Las alertas (ventas,
// despacho, Meta, Data Lucid…) se van agregando según las pida el dueño; cada una llama push_avisar en la base.
// Por ahora solo el dueño.
export default async function AlertasPage() {
  const u = await getUsuario();
  if (u?.rol !== "owner") redirect("/");
  return (
    <>
      <div className="pt-8 mb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">🔔 Mis alertas</h1>
        <p className="text-sm text-muted mt-1.5">Notificaciones del Centro de Control en tu celular, también con la pantalla bloqueada. Actívalas en cada celular donde las quieras recibir.</p>
      </div>
      <MisAlertas />
    </>
  );
}
