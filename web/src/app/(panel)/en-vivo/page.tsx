import { createClient, exigirModulo } from "@/lib/supabase/server";
import { ordenCuenta } from "@/lib/paises";
import { EnVivo } from "@/components/en-vivo";

// ⚡ En vivo: la operación de todas las tiendas (o de una) latiendo con cada cambio de estado.
export default async function EnVivoPage() {
  await exigirModulo("guias");
  const supabase = await createClient();
  const { data } = await supabase.from("effi_accounts").select("slug").eq("activa", true).eq("tipo", "tienda");
  const cuentas = (data ?? []).map((c) => c.slug as string).sort((a, b) => ordenCuenta(a) - ordenCuenta(b));
  return (
    <div className="pt-8">
      <div className="mb-5">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">⚡ En vivo</h1>
        <p className="text-sm text-muted mt-1.5">
          Toda la operación palpitando: cada cambio de estado viaja del país a su estado. Elige todas las tiendas o una sola.
        </p>
      </div>
      <EnVivo cuentas={cuentas} />
    </div>
  );
}
