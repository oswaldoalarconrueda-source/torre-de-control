import { exigirModulo } from "@/lib/supabase/server";
import { dinero, entero } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";
import { EncabezadoComisiones, leerComisiones } from "@/components/encabezado-comisiones";
import { Panel, TablaScroll, Vacio } from "@/components/ui";

// Remisiones pagadas con el costo manual en 0 en Effi: no entran en la comisión del administrador.
type Fila = { id: number; fecha: string; cliente: string | null; distribuidor: string | null; guia: string | null; estado: string | null; contenido: string | null; total: number };

export default async function SinCostoPage({ searchParams }: PageProps<"/proveeduria/comisiones/sin-costo">) {
  await exigirModulo("proveeduria");
  const { supabase, cuentas, cuenta, desde, hasta } = await leerComisiones(await searchParams);
  const { data, error } = await supabase.rpc("prov_comisiones_sin_costo", { p_cuenta: cuenta, p_desde: desde, p_hasta: hasta });
  const filas = (data ?? []) as Fila[];
  const total = filas.reduce((a, f) => a + Number(f.total), 0);
  const $ = (v: number) => dinero(v, cuenta);
  const fecha = new Intl.DateTimeFormat("es-CO", { timeZone: infoCuenta(cuenta).zona, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="pt-8 space-y-4">
      <EncabezadoComisiones actual="sin-costo" ruta="/proveeduria/comisiones/sin-costo" cuentas={cuentas} cuenta={cuenta} desde={desde} hasta={hasta} sinCosto={filas.length}
        subtitulo="Remisiones pagadas con el costo manual en 0 en Effi: no entran en la comisión" />
      {error && <div className="card p-6 text-sm text-red">No se pudo traer la lista: {error.message}</div>}
      <Panel titulo={`${entero(filas.length)} ${filas.length === 1 ? "remisión" : "remisiones"} sin costo`}
        detalle={filas.length ? `Suman ${$(total)} de total neto. No se pagan: no entran en la comisión del administrador.` : undefined}>
        {filas.length ? (
          <TablaScroll>
            <thead>
              <tr><th>Remisión</th><th>Creada</th><th>Cliente</th><th>Distribuidor</th><th>Contenido</th><th>Guía</th><th>Estado</th><th className="!text-right">Total neto</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td className="num font-semibold">{f.id}</td>
                  <td className="text-muted">{fecha.format(new Date(f.fecha))}</td>
                  <td>{f.cliente ?? "—"}</td>
                  <td>{f.distribuidor ?? "—"}</td>
                  <td className="text-blue-2">{f.contenido ?? "—"}</td>
                  <td className="num">{f.guia ?? "—"}</td>
                  <td>{f.estado ?? "—"}</td>
                  <td className="num text-right">{$(Number(f.total))}</td>
                </tr>
              ))}
            </tbody>
          </TablaScroll>
        ) : (
          <Vacio>Todas las remisiones pagadas de este periodo tienen costo manual.</Vacio>
        )}
      </Panel>
    </div>
  );
}
