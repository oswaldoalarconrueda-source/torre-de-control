import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { hoyBogota, rangosRapidos, type Filtros } from "@/lib/filtros";
import { FiltrosBar } from "./filtros-bar";

// Título de la pantalla + filtros de país y calendario (solo muestra las cuentas que el usuario puede ver).
export async function Encabezado({ titulo, subtitulo, f, conFechas = true, varios = false }: { titulo: string; subtitulo: string; f: Filtros; conFechas?: boolean; varios?: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.from("effi_accounts").select("slug").eq("activa", true).order("slug");
  const orden = ["TIENDA_CO", "TIENDA_EC", "TIENDA_GT", "TIENDA_CR"];
  const pos = (s: string) => (orden.includes(s) ? orden.indexOf(s) : 99);
  const cuentas = (data ?? []).map((c) => c.slug as string).sort((a, b) => pos(a) - pos(b));
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
