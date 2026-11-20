import { createClient, exigirModulo } from "@/lib/supabase/server";
import { NOMBRE_TIPO, type TipoCarga } from "@/lib/cargas";
import { entero, fechaHora } from "@/lib/formato";
import { infoCuenta, nombreConSociedad, ordenCuenta } from "@/lib/paises";
import { Panel, TablaScroll, Vacio } from "@/components/ui";
import { Cargador } from "@/components/cargador";
import { DocumentosCarga, type Documento } from "@/components/documentos-carga";

// 📤 Cargar archivos: Dropi (órdenes, productos, cartera) y Meta (CSV por BM) mientras no hay API.
export default async function CargasPage() {
  // El dueño, o quien tenga el módulo «Cargar archivos» (solo en las tiendas que se le asignaron).
  const u = await exigirModulo("cargas");
  const dueno = u.rol === "owner";
  const supabase = await createClient();
  // Tiendas de la sociedad que el dueño está viendo (la base filtra effi_accounts por esa sociedad).
  const [{ data: cargas }, { data: estado }, { data: documentos }, { data: tiendasData }, { data: permitidas }] = await Promise.all([
    supabase.from("app_cargas").select("id,tipo,cuenta,archivo,filas,resumen,creado_en").order("id", { ascending: false }).limit(30),
    supabase.rpc("app_estado_cargas"),
    dueno ? supabase.from("app_documentos").select("id,tipo,cuenta,mes,nota,archivo,ruta,bytes,subido_por,creado_en").order("id", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    supabase.from("effi_accounts").select("slug").eq("tipo", "tienda").eq("activa", true),
    dueno ? Promise.resolve({ data: null }) : supabase.rpc("app_cuentas_visibles", { p_modulo: "cargas" }),
  ]);
  const conCargas = new Set((permitidas as string[] | null) ?? []);
  const tiendas = (tiendasData ?? []).map((t) => t.slug as string).filter((s) => dueno || conCargas.has(s))
    .sort((a, b) => ordenCuenta(a) - ordenCuenta(b));
  const filasEstado = (estado ?? []) as { cuenta: string; fuente: string; filas: number; desde: string | null; hasta: string | null }[];

  return (
    <div className="pt-8 space-y-3">
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">📤 Cargar archivos</h1>
        <p className="text-sm text-muted mt-1.5">
          Sube aquí los archivos que todavía no llegan por API. Se leen en tu navegador, se guarda solo lo necesario (sin nombres, teléfonos ni direcciones de clientes)
          y si un dato ya existía se actualiza con el archivo más reciente.
        </p>
      </div>

      <Cargador tiendas={tiendas} />

      {/* Documentos financieros (extractos, facturas de Meta): solo el dueño. */}
      {dueno && <DocumentosCarga documentos={(documentos ?? []) as Documento[]} usuario={u?.email ?? null} />}

      <Panel titulo="Qué hay cargado" detalle="Por tienda y fuente">
        {filasEstado.length ? (
          <TablaScroll>
            <thead><tr><th>Tienda</th><th>Fuente</th><th className="text-right">Filas</th><th>Desde</th><th>Hasta</th></tr></thead>
            <tbody>
              {filasEstado.map((e) => (
                <tr key={`${e.cuenta}-${e.fuente}`}>
                  <td>{nombreConSociedad(e.cuenta)}</td>
                  <td>{/^(Órdenes|Historial de cartera)/.test(e.fuente) ? `O.A. · ${e.fuente}` : e.fuente}</td>
                  <td className="text-right num">{entero(e.filas)}</td>
                  <td className="text-muted font-mono text-xs">{e.desde ?? "—"}</td>
                  <td className="font-mono text-xs">{e.hasta ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </TablaScroll>
        ) : <Vacio>Aún no hay archivos cargados.</Vacio>}
      </Panel>

      <Panel titulo="Últimas cargas">
        {cargas?.length ? (
          <TablaScroll>
            <thead><tr><th>Cuándo</th><th>Tipo</th><th>Tienda</th><th>Archivo</th><th className="text-right">Filas</th><th>Fechas del archivo</th></tr></thead>
            <tbody>
              {cargas.map((c) => {
                const r = c.resumen as { desde?: string; hasta?: string } | null;
                return (
                  <tr key={c.id}>
                    <td className="text-muted whitespace-nowrap">{fechaHora(c.creado_en)}</td>
                    <td className="whitespace-nowrap">{NOMBRE_TIPO[c.tipo as TipoCarga] ?? c.tipo}</td>
                    <td>{c.cuenta ? nombreConSociedad(c.cuenta) : "Varias"}</td>
                    <td className="max-w-[18rem] truncate" title={c.archivo}>{c.archivo}</td>
                    <td className="text-right num">{entero(c.filas)}</td>
                    <td className="font-mono text-xs text-muted whitespace-nowrap">{r?.desde ? `${r.desde} → ${r.hasta}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </TablaScroll>
        ) : <Vacio>Sin cargas todavía.</Vacio>}
      </Panel>
    </div>
  );
}
