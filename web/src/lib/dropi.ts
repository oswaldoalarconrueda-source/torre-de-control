import type { SupabaseClient } from "@supabase/supabase-js";

// Tiendas con datos de Dropi cargados (las que venden por las dos plataformas). Solo en ellas tiene sentido el selector
// Ambas / Effi / Dropi; en las demás todo es Effi y el selector no se muestra.
export async function conDropi(supabase: SupabaseClient, cuentas: string[]) {
  const r = await Promise.all(cuentas.map((c) => supabase.from("dropi_ordenes").select("cuenta").eq("cuenta", c).limit(1)));
  return cuentas.filter((_, i) => (r[i].data?.length ?? 0) > 0);
}
