"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Play, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { entero, fechaHora, haceCuanto } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";
import { Panel, Vacio } from "./ui";

export type ConfigAdmin = { cuenta: string; modo: "apagado" | "revisar" | "automatico"; ultima_corrida: string | null; ultimo_error: string | null; remisiones_completas: boolean; remisiones_pagina: number };
type Comp = { n: number; recurso: "ingreso" | "egreso"; tipo: "recaudos" | "efficommerce" | "compra"; mes: string; fecha: string; tercero: number; nombre: string; total: number; lineas: number; detalle?: Record<string, number>; effi_id?: number | null; error?: string | null };
export type Cierre = {
  id: number; desde: string | null; hasta: string; estado: "borrador" | "creando" | "hecho" | "error"; origen: string;
  resumen: { movimientos?: number; ingresos?: number; egresos?: number; comprobantes?: number; compras_sin_remision?: number; compras_sin_remision_valor?: number };
  comprobantes: Comp[]; creado_en: string; creado_por: string | null; aprobado_en: string | null; aprobado_por: string | null; error: string | null;
};
export type NovedadAdmin = { id: number; tipo: string; guia: string | null; valor: number | null; detalle: string | null; creado_en: string; actualizado_en: string };

const MODOS = [
  { id: "apagado", label: "Apagado", nota: "No corre" },
  { id: "revisar", label: "Revisar", nota: "Prepara y tú le das Crear en Effi" },
  { id: "automatico", label: "Automático", nota: "Lo crea solo en Effi" },
] as const;
const ESTADO: Record<Cierre["estado"], { label: string; cls: string }> = {
  borrador: { label: "Por revisar", cls: "bg-amber/15 text-amber border-amber/40" },
  creando: { label: "Creando en Effi…", cls: "bg-blue/15 text-blue-2 border-blue/40" },
  hecho: { label: "Creado en Effi", cls: "bg-green/15 text-green border-green/40" },
  error: { label: "Con errores", cls: "bg-red/15 text-red border-red/40" },
};
const TIPO_COMP: Record<Comp["tipo"], string> = { recaudos: "Ingreso · recaudos de venta", efficommerce: "Egreso · cobros de Efficommerce", compra: "Egreso · compra de mercancía" };
const TIPO_NOV: Record<string, { label: string; cls: string }> = {
  compra_sin_remision: { label: "Compra sin remisión", cls: "text-amber" },
  reliquidada: { label: "Guía re-liquidada", cls: "text-blue-2" },
  proveedor_sin_mapa: { label: "Proveedor sin asignar", cls: "text-red" },
  error_effi: { label: "Error de Effi", cls: "text-red" },
};
// Contabilidad: siempre con centavos.
const dinero = (v: number | null | undefined, cuenta: string) =>
  v == null ? "—" : new Intl.NumberFormat("es-CO", { style: "currency", currency: infoCuenta(cuenta).divisa || "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function AgenteAdmin({ cuenta, configs, cierres, novedades }: { cuenta: string; configs: ConfigAdmin[]; cierres: Cierre[]; novedades: NovedadAdmin[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [abierto, setAbierto] = useState<number | null>(cierres[0]?.id ?? null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false);
  const cfg = configs.find((c) => c.cuenta === cuenta);
  const enCurso = esperando || cierres.some((c) => c.estado === "creando");

  // Mientras el agente trabaja (corrida pedida o creando en Effi), la pantalla se actualiza sola.
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [enCurso, router]);
  useEffect(() => { if (esperando) { const t = setTimeout(() => setEsperando(false), 300_000); return () => clearTimeout(t); } }, [esperando]);
  useEffect(() => { setEsperando(false); }, [cfg?.ultima_corrida]);

  async function pedir(accion: string, valor?: string) {
    setOcupado(`${accion}${valor ?? ""}`); setAviso(null);
    const { error } = await supabase.rpc("admin_agente_dueno", { p_cuenta: cuenta, p_accion: accion, p_valor: valor ?? null });
    setOcupado(null);
    if (error) { setAviso(error.message); return; }
    if (accion === "correr") setEsperando(true);
    router.refresh();
  }

  return (
    <div className="pt-8 space-y-5">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">🧾 Agente admin</h1>
        <p className="text-sm text-muted mt-1.5 max-w-3xl">
          Pasa la wallet de Effi a comprobantes: un ingreso con los recaudos de venta, un egreso a Efficommerce (fletes, fulfillment y comisiones) y un
          egreso por proveedor que paga la remisión de compra de cada guía. Ignora lo anulado o revertido, los retiros y las indemnizaciones.
          Corre martes, jueves y sábado a las 8 a. m. y el 1.º de cada mes a la 1 a. m. (cierre del mes).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {configs.map((c) => (
          <Link key={c.cuenta} href={`/agente-admin?c=${c.cuenta}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${c.cuenta === cuenta ? "border-blue/60 bg-blue/15 font-semibold" : "border-line text-muted hover:text-text"}`}>
            {infoCuenta(c.cuenta).bandera} {infoCuenta(c.cuenta).nombre}
            <span className={`ml-2 text-[10px] uppercase tracking-wider ${c.modo === "apagado" ? "text-muted" : c.modo === "automatico" ? "text-green" : "text-amber"}`}>{c.modo === "automatico" ? "automático" : c.modo}</span>
          </Link>
        ))}
      </div>

      {cfg && (
        <div className="card p-4 flex flex-wrap items-center gap-4">
          <div className="inline-flex rounded-xl border border-line bg-tinte/[0.02] p-0.5 text-sm" role="group" aria-label="Modo del agente">
            {MODOS.map((m) => (
              <button key={m.id} onClick={() => m.id !== cfg.modo && pedir("modo", m.id)} disabled={!!ocupado} title={m.nota}
                className={`rounded-lg px-3 py-1.5 transition-colors ${cfg.modo === m.id ? "bg-blue/15 font-semibold text-text" : "text-muted hover:text-text"}`}>
                {m.label}
              </button>
            ))}
          </div>
          <button onClick={() => pedir("correr")} disabled={!!ocupado || cfg.modo === "apagado" || enCurso}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:border-blue/50 disabled:opacity-40">
            <Play size={14} /> {esperando ? "Corriendo…" : "Correr ahora"}
          </button>
          <div className="text-xs text-muted">
            Última corrida: {cfg.ultima_corrida ? `${fechaHora(cfg.ultima_corrida)} (${haceCuanto(cfg.ultima_corrida)})` : "nunca"}
            {!cfg.remisiones_completas && cfg.modo !== "apagado" && <> · cargando remisiones de compra (página {cfg.remisiones_pagina})</>}
          </div>
          {cfg.ultimo_error && <div className="basis-full text-xs text-red">Último error: {cfg.ultimo_error}</div>}
          {aviso && <div className="basis-full text-xs text-red">{aviso}</div>}
        </div>
      )}

      <Panel titulo="Cierres" detalle="Cada corrida reemplaza el borrador que no se haya creado, así nunca hay dos con lo mismo">
        {cierres.length ? (
          <div className="space-y-2">
            {cierres.map((c) => {
              const abiertoAqui = abierto === c.id, e = ESTADO[c.estado];
              return (
                <div key={c.id} className="rounded-xl border border-line">
                  <button onClick={() => setAbierto(abiertoAqui ? null : c.id)} className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left hover:bg-tinte/[0.02]">
                    {abiertoAqui ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span className="font-semibold">Cierre {c.desde ? `${dia(c.desde)} – ` : "hasta "}{dia(c.hasta)}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${e.cls}`}>{e.label}</span>
                    <span className="text-sm text-muted">{entero(c.resumen.movimientos)} movimientos · {entero(c.resumen.comprobantes)} comprobantes</span>
                    <span className="text-sm"><span className="text-green num">+{dinero(c.resumen.ingresos, cuenta)}</span> · <span className="text-red num">−{dinero(c.resumen.egresos, cuenta)}</span></span>
                    <span className="ml-auto text-xs text-muted">{c.origen === "programado" ? "Horario" : c.creado_por} · {fechaHora(c.creado_en)}</span>
                  </button>
                  {abiertoAqui && (
                    <div className="border-t border-line px-3 py-3 space-y-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                            <th className="py-1.5 pr-3">Comprobante</th><th className="py-1.5 pr-3">Tercero</th><th className="py-1.5 pr-3">Fecha</th>
                            <th className="py-1.5 pr-3 text-right">Líneas</th><th className="py-1.5 pr-3 text-right">Total</th><th className="py-1.5">En Effi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.comprobantes.map((x) => (
                            <tr key={x.n} className="border-t border-line/60 align-top">
                              <td className="py-1.5 pr-3">
                                {TIPO_COMP[x.tipo]}
                                {x.detalle && <div className="text-[11px] text-muted">{Object.entries(x.detalle).map(([k, v]) => `${k}: ${dinero(v, cuenta)}`).join(" · ")}</div>}
                              </td>
                              <td className="py-1.5 pr-3">{x.nombre}</td>
                              <td className="py-1.5 pr-3 whitespace-nowrap">{dia(x.fecha)}</td>
                              <td className="py-1.5 pr-3 text-right num">{entero(x.lineas)}{x.tipo === "compra" ? " remisiones" : ""}</td>
                              <td className={`py-1.5 pr-3 text-right num ${x.recurso === "ingreso" ? "text-green" : ""}`}>{dinero(x.total, cuenta)}</td>
                              <td className="py-1.5">
                                {x.effi_id ? <span className="font-semibold text-green">{x.recurso === "ingreso" ? "Ingreso" : "Egreso"} #{x.effi_id}</span>
                                  : x.error ? <span className="text-xs text-red">{x.error}</span> : <span className="text-muted">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!!c.resumen.compras_sin_remision && (
                        <p className="text-xs text-amber">
                          {entero(c.resumen.compras_sin_remision)} compras ({dinero(c.resumen.compras_sin_remision_valor, cuenta)}) quedaron por fuera: no tienen remisión de compra pendiente en Effi. Están abajo en novedades y entran solas cuando aparezca la remisión.
                        </p>
                      )}
                      {c.error && <p className="text-xs text-red">{c.error}</p>}
                      {(c.estado === "borrador" || c.estado === "error") && (
                        <button onClick={() => window.confirm(`¿Crear en Effi ${c.comprobantes.filter((x) => !x.effi_id).length} comprobantes? En Effi no se pueden deshacer.`) && pedir("crear", String(c.id))}
                          disabled={!!ocupado} className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                          <Send size={14} /> {c.estado === "error" ? "Reintentar los que faltan" : "Crear en Effi"}
                        </button>
                      )}
                      {c.aprobado_por && <p className="text-xs text-muted">Aprobado por {c.aprobado_por}{c.aprobado_en ? ` · ${fechaHora(c.aprobado_en)}` : ""}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : <Vacio>Todavía no hay cierres. Con "Correr ahora" el agente arma el primero.</Vacio>}
      </Panel>

      {/* Lo que el agente no pudo cerrar o conviene mirar: queda aquí hasta que se resuelva o lo marques como visto. */}
      <Panel titulo={`🔎 Novedades (${entero(novedades.length)})`} detalle="Lo que el agente encontró y no pudo cerrar, o que conviene revisar">
        {novedades.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="py-1.5 pr-3">Tipo</th><th className="py-1.5 pr-3">Guía</th><th className="py-1.5 pr-3 text-right">Valor</th>
                  <th className="py-1.5 pr-3">Qué pasa</th><th className="py-1.5 pr-3">Visto por el agente</th><th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {novedades.map((n) => {
                  const t = TIPO_NOV[n.tipo] ?? { label: n.tipo, cls: "" };
                  return (
                    <tr key={n.id} className="border-t border-line/60 align-top">
                      <td className={`py-1.5 pr-3 whitespace-nowrap font-semibold ${t.cls}`}>{t.label}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap">{n.guia ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-right num whitespace-nowrap">{n.valor != null ? dinero(n.valor, cuenta) : "—"}</td>
                      <td className="py-1.5 pr-3 text-xs text-muted max-w-[32rem]">{n.detalle}</td>
                      <td className="py-1.5 pr-3 text-xs text-muted whitespace-nowrap">{fechaHora(n.actualizado_en)}</td>
                      <td className="py-1.5 text-right">
                        <button onClick={() => pedir("resolver", String(n.id))} disabled={!!ocupado} className="rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:text-text">Visto</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Vacio>Sin novedades.</Vacio>}
      </Panel>
    </div>
  );
}
