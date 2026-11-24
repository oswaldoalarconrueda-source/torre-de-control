import { createClient, exigirModulo } from "@/lib/supabase/server";
import { leerFiltros } from "@/lib/filtros";
import { infoCuenta } from "@/lib/paises";
import { haceCuanto } from "@/lib/formato";
import { Encabezado } from "@/components/encabezado";
import { CrmOficina, type GuiaOficina } from "@/components/crm-oficina";

// 🏤 Disp. en oficina (Others) (pedido del dueño, 24-nov-2026): los pedidos de la otra plataforma que esperan en la oficina
// de la transportadora («RECLAME EN OFICINA»), con la misma lista para llamar que «Disp. en oficina» (contactos 1, 2 y 3 y
// observación). Sale del archivo de órdenes de Others: se pone al día cada vez que se carga.
export default async function OficinaOthersPage({ searchParams }: PageProps<"/oficina-others">) {
  const u = await exigirModulo("oficina");
  const f = leerFiltros(await searchParams);
  const cuenta = f.cuentas?.[0] ?? "TIENDA_CO";
  const supabase = await createClient();
  const [{ data: lista, error }, { data: ultima }] = await Promise.all([
    supabase.rpc("oficina_others_lista", { p_cuenta: cuenta }),
    supabase.from("dropi_ordenes").select("actualizado_en").eq("cuenta", cuenta).order("actualizado_en", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const pais = infoCuenta(cuenta);
  const guias = (lista ?? []) as GuiaOficina[];
  const sinContacto = guias.filter((g) => !g.telefono).length;
  const nombre = pais.sociedad === "A un clic" ? "Dropi" : "Others";

  return (
    <>
      <Encabezado
        titulo={`🏤 Disp. en oficina (${nombre})`}
        subtitulo={`${pais.bandera} ${pais.nombre} · pedidos de ${nombre} que esperan en la oficina de la transportadora. Marca cada llamada (contacto 1, 2 y 3) y la observación, igual que en Disp. en oficina.`}
        f={f}
      />
      <p className="mb-4 text-xs text-muted">
        Sale del archivo de órdenes de {nombre}: se actualiza cada vez que se carga
        {ultima?.actualizado_en ? <> (última carga {haceCuanto(ultima.actualizado_en as string)})</> : null}.
        {sinContacto > 0 && <span className="text-amber"> {sinContacto} sin teléfono: vuelve a cargar el archivo de órdenes para traer el contacto.</span>}
      </p>
      {error && <p className="text-sm text-red mb-4">{error.message}</p>}
      <CrmOficina key={cuenta} cuenta={cuenta} guias={guias} esDueno={u.rol === "owner"} plataforma={nombre} />
    </>
  );
}
