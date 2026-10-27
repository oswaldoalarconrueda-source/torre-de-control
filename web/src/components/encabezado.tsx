import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { hoyBogota, rangosRapidos, type Filtros } from "@/lib/filtros";
import { ordenCuenta } from "@/lib/paises";
import { FiltrosBar } from "./filtros-bar";

// Título de la pantalla + filtros de país y calendario (solo muestra las cuentas que el usuario puede ver).
// tipos: qué cuentas salen en la barra (los módulos de tiendas solo tiendas; Datos también la proveeduría).
export async function Encabezado({ titulo, subtitulo, f, conFechas = true, varios = false, tipos = ["tienda"] }: {
  titulo: string; subtitulo: string; f: Filtros; conFechas?: boolean; varios?: boolean; tipos?: string[];
}) {
  const supabase = await createClient();
  const { data } = await supabase.from("effi_accounts").select("slug").eq("activa", true).in("tipo", tipos).order("slug");
  const cuentas = (data ?? []).map((c) => c.slug as string).sort((a, b) => ordenCuenta(a) - ordenCuenta(b));
  const hoy = hoyBogota();
  return (
    <div className="pt-8 mb-6 space-y-4">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">{titulo}</h1>
        <p className="text-sm text-muted mt-1.5">{subtitulo}</p>
      </div>
      <Suspense>
        <FiltrosBar cuentas={cuentas} rangos={rangosRapidos(hoy)} hoy={hoy} desde={f.desde} hasta={f.hasta} seleccion={f.cuentas} conFechas={conFechas} varios={varios} />
      </Suspense>
    </div>
  );
}
