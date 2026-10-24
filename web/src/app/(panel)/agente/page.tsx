import { redirect } from "next/navigation";
import { createClient, getUsuario } from "@/lib/supabase/server";
import { leerFiltros } from "@/lib/filtros";
import { infoCuenta } from "@/lib/paises";
import { Encabezado } from "@/components/encabezado";
import { Agente, type DatosAuto } from "@/components/agente";

// 🤖 Agente de órdenes de venta, país por país (empieza por Guatemala). Por ahora vigila: muestra cada orden con
// su remisión y su guía, y marca lo que falta o no cumple las reglas. Crear en Effi se activa más adelante.
export default async function AgentePage({ searchParams }: PageProps<"/agente">) {
  const usuario = await getUsuario();
  if (usuario?.rol !== "owner") redirect("/");
  const sp = await searchParams;
  const f = leerFiltros({ ...sp, c: typeof sp.c === "string" ? sp.c : "TIENDA_GT" });
  const cuenta = f.cuentas?.[0] ?? "TIENDA_GT";
  const supabase = await createClient();
  const [{ data: config }, { data, error }] = await Promise.all([
    supabase.from("auto_config").select("cuenta").eq("cuenta", cuenta).maybeSingle(),
    supabase.rpc("auto_lista", { p_cuenta: cuenta, p_dias: 3 }),
  ]);
  const pais = infoCuenta(cuenta);

  return (
    <>
      <Encabezado
        titulo="🤖 Agente"
        subtitulo={`${pais.bandera} ${pais.nombre} · cada orden de venta debe pasar a remisión con su convenio y tener guía. Si el cliente empieza con *, va por el centro de costos Recuperado.`}
        f={f}
        conFechas={false}
      />
      {!config ? (
        <div className="card p-10 text-center">
          <div className="text-4xl">{pais.bandera}</div>
          <p className="font-display text-xl font-semibold mt-3">El agente de {pais.nombre} todavía no está montado</p>
          <p className="text-sm text-muted mt-1">Empezamos por Guatemala; los demás países se activan después.</p>
        </div>
      ) : (
        <>
          {error && <p className="text-sm text-red mb-4">{error.message}</p>}
          {data && <Agente key={cuenta} cuenta={cuenta} datos={data as DatosAuto} />}
        </>
      )}
    </>
  );
}
