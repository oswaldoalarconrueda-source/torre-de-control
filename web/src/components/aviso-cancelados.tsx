"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dinero } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";

// ⚠️ Pedido cancelado con guía (pedido del dueño, 25-nov-2026): cuando el cliente pide cancelar por el chat y el bot o la
// asesora pasan el pedido a «Cancelado» en icomfly, pero el pedido ya tiene guía en Effi, sale este aviso en cualquier
// pantalla. «Anular guía» revisa en Effi que no tenga relación de despacho y la anula; si ya salió, se gestiona como
// devolución. Datos: cancelados_pendientes (icomfly de Colombia cada 10 minutos). La API de icomfly no trae los mensajes
// del cliente, solo el estado del pedido.
type Cancelado = {
  cuenta: string; pedido: string; guia: string; motivo: string | null; cancelado: string | null; sucursal: number; id_guia: number;
  cliente: string | null; ciudad: string | null; valor: number | null; transportadora: string | null; estado_guia: string | null;
  sin_salir: boolean; remision: number | null; decision: "anulando" | "ya_salio" | null; mensaje: string | null;
};
const CADA_MS = 60_000;
const POSPONER_MS = 30 * 60_000;
const CLAVE = "aviso-cancelados-pospuesto";

export function AvisoCancelados() {
  const [lista, setLista] = useState<Cancelado[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await createClient().rpc("cancelados_pendientes");
    const l = (data ?? []) as Cancelado[];
    setLista(l);
    // Se abre solo si hay algo nuevo por decidir y no se pospuso hace menos de 30 minutos.
    let pospuesto = 0;
    try { pospuesto = Number(sessionStorage.getItem(CLAVE) ?? 0); } catch { /* sin almacenamiento */ }
    if (l.some((c) => !c.decision) && Date.now() - pospuesto > POSPONER_MS) setAbierto(true);
  }, []);
  useEffect(() => {
    const inicio = setTimeout(cargar, 3000);
    const t = setInterval(cargar, CADA_MS);
    return () => { clearTimeout(inicio); clearInterval(t); };
  }, [cargar]);

  async function decidir(c: Cancelado, decision: "anular" | "gestionado") {
    setConfirmar(null); setOcupada(c.guia); setError(null);
    const { error: e } = await createClient().rpc("cancelado_decidir", { p_cuenta: c.cuenta, p_guia: c.guia, p_decision: decision });
    if (e) { setOcupada(null); setError(e.message); return; }
    // La anulación la hace el agente en Effi: se revisa unos segundos hasta que cambie.
    for (const espera of decision === "anular" ? [3000, 4000, 6000, 8000] : [500]) {
      await new Promise((r) => setTimeout(r, espera));
      await cargar();
    }
    setOcupada(null);
  }
  const posponer = () => {
    try { sessionStorage.setItem(CLAVE, String(Date.now())); } catch { /* sin almacenamiento */ }
    setAbierto(false);
  };

  const porDecidir = lista.filter((c) => !c.decision).length;
  if (!lista.length) return null;
  return (
    <>
      {/* Botón para volver a abrirlo mientras haya avisos. */}
      {!abierto && (
        <button type="button" onClick={() => setAbierto(true)}
          className="fixed bottom-36 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-red/60 bg-panel px-3 py-2 text-xs font-semibold text-red shadow-lg md:bottom-24">
          <span className="pulso size-2 rounded-full bg-red" /> {lista.length} cancelado{lista.length === 1 ? "" : "s"} con guía
        </button>
      )}
      {abierto && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="aviso-cancelados-titulo">
          <div className="card w-full max-w-2xl max-h-[88vh] overflow-y-auto p-4 sm:p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden>⚠️</span>
              <div className="min-w-0 flex-1">
                <h2 id="aviso-cancelados-titulo" className="font-display text-lg font-semibold">
                  {porDecidir === 1 ? "1 pedido cancelado ya tiene guía" : `${porDecidir || lista.length} pedidos cancelados ya tienen guía`}
                </h2>
                <p className="text-xs text-muted">El cliente canceló en icomfly (chat) y la guía de Effi sigue vigente. Anúlala antes de que se despache.</p>
              </div>
              <button type="button" onClick={posponer} aria-label="Cerrar el aviso" className="rounded-full p-1 text-muted hover:text-text"><X size={18} /></button>
            </div>
            {error && <p className="text-sm text-red">{error}</p>}
            <ul className="space-y-2">
              {lista.map((c) => {
                const yaSalio = !c.sin_salir || c.decision === "ya_salio";
                const trabajando = ocupada === c.guia || c.decision === "anulando";
                return (
                  <li key={c.cuenta + c.guia} className={`rounded-xl border p-3 ${yaSalio ? "border-amber/50 bg-amber/5" : "border-red/40 bg-red/5"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{infoCuenta(c.cuenta).bandera} Pedido {c.pedido} · {c.cliente ?? "—"}</div>
                        <div className="text-xs text-muted">{c.ciudad ?? "—"} · {c.valor != null ? dinero(c.valor, c.cuenta) : "—"}</div>
                        <div className="font-mono text-xs">Guía {c.guia} · {c.transportadora ?? "—"} · {c.estado_guia ?? "—"}{c.remision ? ` · RV ${c.remision}` : ""}</div>
                        <div className="mt-0.5 text-xs"><b className="text-red">Canceló:</b> {c.motivo ?? "sin motivo"}{c.cancelado ? ` · ${c.cancelado.slice(8, 10)}/${c.cancelado.slice(5, 7)}` : ""}</div>
                        {c.mensaje && <div className="mt-0.5 text-xs text-amber">{c.mensaje}</div>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {trabajando ? <span className="text-xs text-muted">Anulando en Effi…</span>
                          : confirmar === c.guia ? (
                            <>
                              <span className="text-xs text-muted">¿Anular la guía en Effi? No se puede deshacer.</span>
                              <button type="button" onClick={() => decidir(c, "anular")} className="rounded-full bg-red px-3 py-1.5 text-xs font-bold text-white">Sí, anular</button>
                              <button type="button" onClick={() => setConfirmar(null)} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">No</button>
                            </>
                          ) : (
                            <>
                              {!yaSalio && (
                                <button type="button" onClick={() => setConfirmar(c.guia)} disabled={!!ocupada}
                                  className="rounded-full border border-red/50 bg-red/10 px-3 py-1.5 text-xs font-semibold text-red hover:bg-red/20 disabled:opacity-60">Anular guía</button>
                              )}
                              {yaSalio && !c.mensaje && <span className="text-xs text-amber">Ya salió: gestionar devolución</span>}
                              <button type="button" onClick={() => decidir(c, "gestionado")} disabled={!!ocupada}
                                className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-text disabled:opacity-60">Ya lo gestioné</button>
                            </>
                          )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-end">
              <button type="button" onClick={posponer} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted hover:text-text">Ver después (30 min)</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
