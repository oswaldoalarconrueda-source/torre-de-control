import { createClient, exigirModulo } from "@/lib/supabase/server";
import { ordenCuenta } from "@/lib/paises";
import { EnVivo } from "@/components/en-vivo";

// ⚡ En vivo: la operación de todas las tiendas (o de una) latiendo con cada cambio de estado.
export default async function EnVivoPage() {
  await exigirModulo("guias");
  const supabase = await createClient();
  const [{ data }, { data: soc }] = await Promise.all([
    supabase.from("effi_accounts").select("slug,sociedad").eq("activa", true).eq("tipo", "tienda"),
    supabase.from("app_sociedades").select("nombre,logo"),
  ]);
  const cuentas = (data ?? []).map((c) => c.slug as string).sort((a, b) => ordenCuenta(a) - ordenCuenta(b));
  // Logo al centro solo si todo lo que se ve es de una sola sociedad y esa sociedad tiene logo.
  const sociedades = [...new Set((data ?? []).map((c) => c.sociedad as string))];
  const logo = sociedades.length === 1 ? ((soc ?? []).find((x) => x.nombre === sociedades[0])?.logo as string | null) ?? null : null;
  return (
    <div className="pt-8">
      <div className="mb-5">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">⚡ En vivo</h1>
        <p className="text-sm text-muted mt-1.5">
          Toda la operación palpitando: cada cambio de estado viaja del país a su estado. Elige todas las tiendas o una sola.
        </p>
      </div>
      {/* key: al cambiar de sociedad, En vivo arranca de nuevo con las cuentas de esa sociedad. */}
      <EnVivo key={cuentas.join(",")} cuentas={cuentas} logo={logo} />
    </div>
  );
}
