"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dinero, entero } from "@/lib/formato";

// 💸 Flete alto (Colombia, regla del dueño del 4-nov): guía con recaudo menor de $150.000 y flete mayor de $30.000, sin relación
// de despacho (con relación ya no sale aquí). Una persona la aprueba (queda quién y cuándo) o la anula y resuelve en la
// remisión. Las reglas están en la base (auto_guias_flete_alto); Effi vuelve a revisar al anular.
type Alerta = {
  sucursal: number; id: number; guia: string; transportadora: string | null; cliente: string | null; ciudad: string | null; provincia: string | null;
  recaudo: number; flete: number; estado: string | null; remision: number | null; centro: string | null; relacion: string | null;
  decision: string | null; decision_por: string | null; decision_en: string | null; error: string | null; anulable?: boolean;
};
type Datos = { pendientes: Alerta[]; anuladas: Alerta[]; aprobadas: Alerta[] };

const cuando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const titulo = (a: Alerta) => `${a.transportadora ?? "—"} - Centro costos ${a.centro ?? "—"}`;
const destino = (a: Alerta) => `${a.ciudad ?? "—"}${a.provincia ? `, ${a.provincia}` : ""}`;

export function FleteAlto({ cuenta, onCambio }: { cuenta: string; onCambio: () => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await createClient().rpc("auto_fletes_lista", { p_cuenta: cuenta });
    if (data) setDatos(data as Datos);
  }, [cuenta]);
  useEffect(() => {
    const inicio = setTimeout(cargar, 0);
    const t = setInterval(cargar, 60_000);
    return () => { clearTimeout(inicio); clearInterval(t); };
  }, [cargar]);

  async function aprobar(a: Alerta) {
    const clave = `${a.sucursal}-${a.id}`;
    setOcupada(clave); setError(null);
    const { error: e } = await createClient().rpc("auto_flete_aprobar", { p_cuenta: cuenta, p_sucursal: a.sucursal, p_id: a.id });
    setOcupada(null);
    if (e) setError(e.message); else await cargar();
  }
  // La anulación la hace el agente en Effi: se revisa unos segundos hasta que deje de estar "anulando".
  async function anular(a: Alerta) {
    const clave = `${a.sucursal}-${a.id}`;
    setConfirmar(null); setOcupada(clave); setError(null);
    const { error: e } = await createClient().rpc("auto_flete_anular", { p_cuenta: cuenta, p_sucursal: a.sucursal, p_id: a.id });
    if (e) { setOcupada(null); setError(e.message); return; }
    for (const espera of [3000, 5000, 7000, 10000]) {
      await new Promise((r) => setTimeout(r, espera));
      await cargar();
    }
    setOcupada(null);
    onCambio();
  }

  if (!datos || (!datos.pendientes.length && !datos.anuladas.length && !datos.aprobadas.length)) return null;
  return (
    <div className="card border border-amber/50 p-4 space-y-3" style={{ background: "linear-gradient(90deg, rgb(245 166 35 / 0.08), transparent)" }}>
      <div>
        <div className="font-semibold text-amber">💸 Flete alto: {entero(datos.pendientes.length)} {datos.pendientes.length === 1 ? "guía por revisar" : "guías por revisar"}</div>
        <div className="text-xs text-muted">Con recaudo menor de {dinero(150000, cuenta)} y flete mayor de {dinero(30000, cuenta)}: el flete es costoso y debe intervenir una persona.</div>
      </div>
      {error && <p className="text-sm text-red">{error}</p>}

      {datos.pendientes.length > 0 && (
        <div className="space-y-2">
          {datos.pendientes.map((a) => {
            const clave = `${a.sucursal}-${a.id}`;
            const anulando = ocupada === clave || a.decision === "anulando";
            return (
              <div key={clave} className="rounded-xl border border-line bg-bg/60 p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="text-sm font-semibold">{titulo(a)}</div>
                  <div className="text-xs">{destino(a)}</div>
                  <div className="font-mono text-xs">Guía {a.guia}{a.remision ? ` · RV ${a.remision}` : ""}</div>
                  <div className="text-[11px] text-muted">{a.cliente ?? "—"} · {a.estado ?? "—"}</div>
                </div>
                <div className="text-right">
                  <div className="num text-sm font-bold text-amber">{dinero(a.flete, cuenta)}</div>
                  <div className="text-[11px] text-muted">flete, de <span className="num">{dinero(a.recaudo, cuenta)}</span> a recaudar</div>
                </div>
                <div className="flex flex-wrap items-center gap-2 basis-full sm:basis-auto">
                  {confirmar === clave ? (
                    <>
                      <span className="text-xs text-muted">¿Anular la guía en Effi? No se puede deshacer.</span>
                      <button onClick={() => anular(a)} className="rounded-full bg-red px-3 py-1.5 text-xs font-bold text-white">Sí, anular</button>
                      <button onClick={() => setConfirmar(null)} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-text">No</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => aprobar(a)} disabled={!!ocupada} className="rounded-full border border-green/50 bg-green/10 px-3 py-1.5 text-xs font-semibold text-green hover:bg-green/20 disabled:opacity-60">Aprobar</button>
                      {anulando ? <span className="text-xs text-muted">Anulando en Effi…</span> : a.anulable ? (
                        <button onClick={() => setConfirmar(clave)} disabled={!!ocupada} className="rounded-full border border-red/50 bg-red/10 px-3 py-1.5 text-xs font-semibold text-red hover:bg-red/20 disabled:opacity-60">Anular guía</button>
                      ) : (
                        <span className="text-[11px] text-muted">Ya salió: no se puede anular</span>
                      )}
                    </>
                  )}
                </div>
                {a.error && <div className="basis-full text-[11px] text-red">{a.error}</div>}
              </div>
            );
          })}
        </div>
      )}

      {datos.anuladas.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold">Guías anuladas: falta resolver la remisión</div>
          {datos.anuladas.map((a) => (
            <div key={`${a.sucursal}-${a.id}`} className="rounded-xl border border-red/40 bg-red/5 p-3 text-xs">
              <div className="font-semibold">Remisión {a.remision ?? "—"}: cambia la transportadora con Ejecutar, omite el envío o pide anticipo.</div>
              <div className="mt-0.5 text-[11px] text-muted">Guía {a.guia} · {titulo(a)} · {destino(a)} · {dinero(a.recaudo, cuenta)} · anulada por {a.decision_por ?? "una persona"}, {cuando(a.decision_en)}</div>
            </div>
          ))}
        </div>
      )}

      {datos.aprobadas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-muted hover:text-text">Aprobadas ({entero(datos.aprobadas.length)})</summary>
          <ul className="mt-2 space-y-1">
            {datos.aprobadas.map((a) => (
              <li key={`${a.sucursal}-${a.id}`} className="text-[11px] text-muted">
                <span className="font-mono text-text">{a.guia}</span> · {titulo(a)} · {destino(a)} · flete {dinero(a.flete, cuenta)} · aprobada por <b className="text-text">{a.decision_por ?? "una persona"}</b>, {cuando(a.decision_en)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
