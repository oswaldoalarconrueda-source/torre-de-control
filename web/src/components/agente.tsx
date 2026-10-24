"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dinero, entero, haceCuanto } from "@/lib/formato";

// Agente de órdenes de venta: la Torre vigila cada orden de venta (remisión con su convenio, guía, centro de costos
// Recuperado si el cliente empieza con *). El dueño decide el modo; "Automático" y "Ejecutar" quedan bloqueados
// hasta activar la creación en Effi.

type Estado = "completa" | "revision" | "sin_guia" | "sin_remision" | "anulada";
type Modo = "apagado" | "vigilar" | "automatico";
export type OrdenAuto = {
  sucursal: number; id: number; fecha: string; cliente: string | null; ciudad: string | null; provincia: string | null;
  total: number | null; ecommerce: string | null; pedido: string | null; convenio: string | null; recuperado: boolean;
  id_remision: number | null; rem_fecha: string | null; rem_centro: string | null; rem_convenio: string | null; rem_responsable: string | null;
  guia: string | null; estado: Estado; motivos: string[]; minutos: number;
  decision: "ejecutar" | "descartar" | null; decision_por: string | null; decision_en: string | null;
};
export type DatosAuto = {
  config: { modo: Modo; minutos_alerta: number; ultima_corrida: string | null; ultimo_error: string | null; actualizado_por: string | null } | null;
  es_owner: boolean;
  resumen: { total: number; completa: number; revision: number; sin_guia: number; sin_remision: number; anulada: number; recuperado: number; min_remision: number | null };
  ordenes: OrdenAuto[];
};

const ESTADOS: Record<Estado, { label: string; color: string }> = {
  completa: { label: "Completa", color: "var(--green)" },
  revision: { label: "Revisar", color: "var(--amber)" },
  sin_guia: { label: "Sin guía", color: "var(--blue-2)" },
  sin_remision: { label: "Sin remisión", color: "var(--red)" },
  anulada: { label: "Anulada", color: "var(--muted)" },
};
const MODOS: { id: Modo; label: string; ayuda: string }[] = [
  { id: "apagado", label: "Apagado", ayuda: "La Torre no revisa las órdenes." },
  { id: "vigilar", label: "Vigilar", ayuda: "Cada 2 minutos revisa las órdenes de los últimos 3 días y marca lo que falta. No crea nada en Effi." },
  { id: "automatico", label: "Automático", ayuda: "Crea remisión y guía sin intervención. Se activa cuando apruebes la creación en Effi." },
];
const FILTROS = [
  { id: "atencion", label: "Requieren atención" },
  { id: "todas", label: "Todas" },
  { id: "completa", label: "Completas" },
  { id: "descartadas", label: "Descartadas" },
] as const;

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Guatemala", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const duracion = (min: number) => (min < 60 ? `${Math.round(min)} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.floor(min / 1440)} d`);

export function Agente({ cuenta, datos }: { cuenta: string; datos: DatosAuto }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("atencion");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const modo = datos.config?.modo ?? "apagado";
  const alerta = datos.config?.minutos_alerta ?? 30;
  const r = datos.resumen;

  // La vigilancia corre en Supabase; la pantalla se refresca sola cada minuto.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [router]);

  // Una orden sin remisión solo es alerta cuando pasa el tiempo de espera (normalmente se convierte en minutos).
  const atrasada = (o: OrdenAuto) => o.estado === "sin_remision" && o.minutos >= alerta;
  const requiereAtencion = (o: OrdenAuto) =>
    o.decision !== "descartar" && (o.estado === "revision" || o.estado === "sin_guia" || o.estado === "sin_remision");

  const lista = useMemo(
    () =>
      datos.ordenes.filter((o) =>
        filtro === "todas" ? true
        : filtro === "completa" ? o.estado === "completa"
        : filtro === "descartadas" ? o.decision === "descartar"
        : requiereAtencion(o),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos.ordenes, filtro],
  );

  async function cambiarModo(m: Modo) {
    if (m === modo || m === "automatico") return;
    setGuardando("modo"); setError(null);
    const { error: e } = await createClient().rpc("auto_cambiar_modo", { p_cuenta: cuenta, p_modo: m });
    setGuardando(null);
    if (e) setError(e.message); else router.refresh();
  }
  async function decidir(o: OrdenAuto, decision: "descartar" | null) {
    setGuardando(`${o.sucursal}-${o.id}`); setError(null);
    const { error: e } = await createClient().rpc("auto_decidir", { p_cuenta: cuenta, p_sucursal: o.sucursal, p_id: o.id, p_decision: decision });
    setGuardando(null);
    if (e) setError(e.message); else router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full border border-line p-1 bg-panel-2">
            {MODOS.map((m) => (
              <button
                key={m.id}
                onClick={() => cambiarModo(m.id)}
                disabled={!datos.es_owner || guardando === "modo" || m.id === "automatico"}
                title={m.ayuda}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  modo === m.id ? "bg-blue/20 text-text" : "text-muted hover:text-text"
                } ${m.id === "automatico" ? "cursor-not-allowed opacity-60" : ""}`}
              >
                {m.id === "automatico" && <Lock size={12} />}
                {m.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted max-w-md">{MODOS.find((m) => m.id === modo)?.ayuda}</span>
        </div>
        <div className="text-xs text-muted text-right">
          {datos.config?.ultima_corrida ? <>Última revisión {haceCuanto(datos.config.ultima_corrida)}</> : "Aún no ha corrido la vigilancia"}
          {datos.config?.ultimo_error && <div className="text-red mt-0.5">{datos.config.ultimo_error}</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Indicador titulo="Órdenes 3 días" valor={entero(r.total)} color="var(--blue-2)" />
        <Indicador titulo="Completas" valor={entero(r.completa)} color="var(--green)" />
        <Indicador titulo="Requieren revisión" valor={entero(r.revision)} color="var(--amber)" />
        <Indicador titulo="Sin remisión" valor={entero(r.sin_remision)} color="var(--red)" />
        <Indicador titulo="Sin guía" valor={entero(r.sin_guia)} color="var(--blue)" />
        <Indicador titulo="Orden → remisión" valor={r.min_remision != null ? duracion(r.min_remision) : "—"} color="var(--blue-2)" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filtro === f.id ? "border-blue/50 bg-blue/15 text-text" : "border-line text-muted hover:text-text"}`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-xs text-muted ml-auto">{entero(lista.length)} {lista.length === 1 ? "orden" : "órdenes"}</span>
      </div>
      {error && <p className="text-sm text-red">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="bg-blue/10 text-left text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">
              <th className="px-3 py-3">Orden</th>
              <th className="px-3 py-3">Cliente</th>
              <th className="px-3 py-3">Ciudad</th>
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-3 py-3">Convenio</th>
              <th className="px-3 py-3">Remisión</th>
              <th className="px-3 py-3">Guía</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Decisión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lista.map((o) => {
              const est = ESTADOS[o.estado];
              const clave = `${o.sucursal}-${o.id}`;
              return (
                <tr key={clave} className="align-middle hover:bg-white/[0.02]">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-mono font-semibold">OV {o.id}</div>
                    <div className="text-[11px] text-muted">{hora(o.fecha)}{o.pedido ? ` · ${o.ecommerce ?? ""} #${o.pedido}` : ""}</div>
                  </td>
                  <td className="px-3 py-2 min-w-[11rem]">
                    <div className="font-semibold">{o.cliente ?? "—"}</div>
                    <span
                      className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={o.recuperado ? { background: "rgba(180,140,255,.15)", color: "#b48cff" } : { background: "rgba(255,255,255,.05)", color: "var(--muted)" }}
                    >
                      {o.recuperado ? "Recuperado" : "Principal"}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {o.ciudad ?? "—"}
                    <div className="text-muted">{o.provincia}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right num">{dinero(o.total, cuenta)}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{o.convenio ?? <span className="text-red">Sin convenio</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {o.id_remision ? (
                      <>
                        <div className="font-mono font-semibold text-sm">RV {o.id_remision}</div>
                        <div className="text-muted">
                          {o.rem_centro ?? "—"}
                          {o.rem_fecha ? ` · ${duracion((Date.parse(o.rem_fecha) - Date.parse(o.fecha)) / 60_000)}` : ""}
                        </div>
                        {o.rem_convenio && <div className="text-muted">{o.rem_convenio}</div>}
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{o.guia ?? "—"}</td>
                  <td className="px-3 py-2 min-w-[12rem]">
                    <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ color: est.color, background: "rgba(255,255,255,.05)" }}>
                      {o.estado === "sin_remision" && !atrasada(o) ? "Esperando remisión" : est.label}
                    </span>
                    {o.estado === "sin_remision" && <div className="text-[11px] text-muted mt-0.5">hace {duracion(o.minutos)}</div>}
                    {o.motivos.map((m) => (
                      <div key={m} className="text-[11px] text-amber mt-0.5">{m}</div>
                    ))}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {o.estado === "completa" || o.estado === "anulada" ? (
                      <span className="text-xs text-muted">—</span>
                    ) : o.decision === "descartar" ? (
                      <div className="text-xs">
                        <span className="text-muted">Descartada</span>
                        {datos.es_owner && (
                          <button onClick={() => decidir(o, null)} disabled={guardando === clave} className="ml-2 text-blue-2 hover:underline">
                            Restaurar
                          </button>
                        )}
                      </div>
                    ) : datos.es_owner ? (
                      <div className="flex items-center gap-2">
                        <button
                          disabled
                          title="Se activa cuando apruebes la creación de remisiones y guías en Effi"
                          className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted opacity-60 cursor-not-allowed"
                        >
                          <Play size={12} /> Ejecutar
                        </button>
                        <button
                          onClick={() => decidir(o, "descartar")}
                          disabled={guardando === clave}
                          className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text"
                        >
                          Descartar
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!lista.length && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted">
                  {filtro === "atencion" ? "Todo en orden: ninguna orden requiere atención." : "No hay órdenes en este filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Indicador({ titulo, valor, color }: { titulo: string; valor: string; color: string }) {
  return (
    <div className="card p-4 border-t-2" style={{ borderTopColor: color }}>
      <div className="text-[11px] uppercase tracking-widest font-mono text-muted">{titulo}</div>
      <div className="num text-3xl font-semibold mt-1" style={{ color }}>{valor}</div>
    </div>
  );
}
