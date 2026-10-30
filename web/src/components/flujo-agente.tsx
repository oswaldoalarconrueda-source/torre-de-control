"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { infoCuenta } from "@/lib/paises";
import { FabricaAgente, type ConteoOrdenes, type DatosFabrica } from "./fabrica-agente";

// Agente en vivo y Errores de hoy. Arriba, la franja orden → remisión → guía de hoy, por agente y por humano
// (auto_fabrica); cuando el agente está creando algo, la etapa activa late y se ve la orden y el paso. Abajo, los errores
// de hoy: una línea por documento, diciendo si el error es de la remisión (no se pudo hacer la guía) o de la orden (no
// se pudo hacer la remisión) y por qué, con sus variables (lo enviado y lo respondido por Effi), o el aviso verde de que
// no hubo errores. Consulta los últimos movimientos cada 3 segundos (para ver qué está haciendo) y los aciertos y
// errores del día completo cada 15 s.

// Días elegidos en el calendario (hora local del país) y cómo se nombran ("Ayer · 29 oct").
export type Periodo = { desde: string; hasta: string; etiqueta: string };
type Evento = { id: number; id_orden: number | null; paso: string; ok: boolean | null; mensaje: string; datos: Record<string, unknown> | null; creado_en: string };


export function FlujoAgente({ cuenta, fabrica, conteoOrdenes, proxima, onNuevo, completas, remisionadas, esDueno = false, rango = null }: {
  rango?: Periodo | null; // con rango: historial de esos días (se carga una vez, sin seguir en vivo)
  cuenta: string; fabrica?: DatosFabrica | null; conteoOrdenes?: ConteoOrdenes; proxima: { hora: string; corte: string | null; en: number } | null; onNuevo: () => void;
  esDueno?: boolean; // "ver variables" (lo que se envió y respondió Effi) es solo para el dueño
  completas?: number[]; // órdenes que ya tienen remisión y guía (o que se anularon)
  remisionadas?: number[]; // órdenes que ya tienen remisión vigente, aunque falte la guía
}) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [delDia, setDelDia] = useState<Evento[]>([]); // aciertos y errores de las últimas 30 h, sin tope
  const [abierto, setAbierto] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  // Reintentar a un clic: órdenes enviadas a crear de nuevo (se ocultan hasta que llegue su resultado) y el último error.
  const [reintentando, setReintentando] = useState<Record<number, number>>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const zona = infoCuenta(cuenta).zona;

  useEffect(() => {
    const supabase = createClient();
    let vivo = true, ultimo = 0;
    const cargar = async () => {
      const { data } = await supabase.from("auto_eventos").select("id,id_orden,paso,ok,mensaje,datos,creado_en")
        .eq("cuenta", cuenta).gte("creado_en", new Date(Date.now() - 36 * 3600_000).toISOString())
        .order("id", { ascending: false }).limit(300);
      if (!vivo || !data) return;
      const max = data[0]?.id ?? 0;
      if (ultimo && max > ultimo) onNuevo();
      ultimo = max;
      setEventos(data as Evento[]);
      setAhora(Date.now());
    };
    // Aciertos sin "datos" (no se necesitan y pesan); errores con sus variables.
    const cargarDia = async () => {
      const desde = new Date(Date.now() - 30 * 3600_000).toISOString();
      const [ok, mal] = await Promise.all([
        supabase.from("auto_eventos").select("id,id_orden,paso,ok,mensaje,creado_en")
          .eq("cuenta", cuenta).eq("ok", true).in("paso", ["remision", "guia", "fin"]).gte("creado_en", desde).limit(5000),
        supabase.from("auto_eventos").select("id,id_orden,paso,ok,mensaje,datos,creado_en")
          .eq("cuenta", cuenta).eq("ok", false).gte("creado_en", desde).order("id", { ascending: false }).limit(1000),
      ]);
      if (!vivo || ok.error || mal.error) return;
      setDelDia([...(ok.data as Evento[]).map((e) => ({ ...e, datos: null })), ...(mal.data as Evento[])].sort((a, b) => b.id - a.id));
    };
    // Historial: aciertos y errores de esos días (un día de margen por la zona horaria; se filtra por día local abajo).
    const cargarRango = async (r: Periodo) => {
      const desde = new Date(Date.parse(`${r.desde}T00:00:00Z`) - 86_400_000).toISOString();
      const hasta = new Date(Date.parse(`${r.hasta}T00:00:00Z`) + 2 * 86_400_000).toISOString();
      const [ok, mal] = await Promise.all([
        supabase.from("auto_eventos").select("id,id_orden,paso,ok,mensaje,creado_en")
          .eq("cuenta", cuenta).eq("ok", true).in("paso", ["remision", "guia", "fin"]).gte("creado_en", desde).lt("creado_en", hasta).limit(10000),
        supabase.from("auto_eventos").select("id,id_orden,paso,ok,mensaje,datos,creado_en")
          .eq("cuenta", cuenta).eq("ok", false).gte("creado_en", desde).lt("creado_en", hasta).order("id", { ascending: false }).limit(2000),
      ]);
      if (!vivo || ok.error || mal.error) return;
      setEventos([]);
      setDelDia([...(ok.data as Evento[]).map((e) => ({ ...e, datos: null })), ...(mal.data as Evento[])].sort((a, b) => b.id - a.id));
    };
    if (rango) { cargarRango(rango); return () => { vivo = false; }; }
    cargar();
    cargarDia();
    const t = setInterval(cargar, 3000), t2 = setInterval(cargarDia, 15_000);
    return () => { vivo = false; clearInterval(t); clearInterval(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta, rango?.desde, rango?.hasta]);

  const dia = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(ms));
  const hora = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: zona, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
  // Lo del día: aciertos y errores completos, más los últimos movimientos (para que lo recién hecho cuente al instante).
  const hoy = useMemo(() => {
    const m = new Map<number, Evento>();
    const enPeriodo = (d: string) => rango ? d >= rango.desde && d <= rango.hasta : d === dia(ahora);
    for (const e of [...delDia, ...eventos]) if (e.ok !== null && enPeriodo(dia(Date.parse(e.creado_en)))) m.set(e.id, e);
    return [...m.values()].sort((a, b) => b.id - a.id);
  }, [delDia, eventos, ahora, rango?.desde, rango?.hasta]); // eslint-disable-line react-hooks/exhaustive-deps
  // Errores que siguen pendientes: no cuenta el de una orden que después quedó completa o anulada (la creó la Torre en
  // un intento siguiente o alguien a mano en Effi), ni el de la remisión de una orden que ya tiene remisión vigente.
  const pendientes = hoy.filter((e) => e.ok === false && !(e.id_orden != null && (
    completas?.includes(e.id_orden) || (e.paso !== "guia" && remisionadas?.includes(e.id_orden)) ||
    hoy.some((x) => x.id_orden === e.id_orden && x.id > e.id && x.ok === true && (x.paso === "fin" || x.paso === "guia")))));
  // Una línea por documento (el último error y cuántos intentos fallaron hoy). El error de la guía es de la remisión; el
  // de la remisión es de la orden de venta.
  const errores = useMemo(() => {
    const m = new Map<string, Evento & { intentos: number; doc: string; motivo: string }>();
    for (const e of pendientes) {
      const rem = e.mensaje.match(/remisi[oó]n (?:RV )?(\d+)/i)?.[1];
      const doc = e.paso === "guia" && rem ? `Remisión ${rem}` : e.id_orden != null ? `Orden de venta ${e.id_orden}` : "Agente";
      const motivo = e.mensaje.replace(/^.*?(no dej[oó] crear la (gu[ií]a|remisi[oó]n)( de la remisi[oó]n \d+)?|Remisi[oó]n \d+): /i, "");
      const ya = m.get(doc);
      if (ya) ya.intentos++;
      else m.set(doc, { ...e, intentos: 1, doc, motivo });
    }
    return [...m.values()];
  }, [pendientes]);

  // Repite la orden con el mismo paso y transportadora de la vez anterior (auto_reintentar). Mientras no llegue un
  // evento nuevo de esa orden, el botón queda en "Enviada…".
  const enviada = (e: Evento) => e.id_orden != null && (reintentando[e.id_orden] ?? 0) >= e.id;
  async function reintentar(lista: Evento[]) {
    const ids = [...new Set(lista.map((e) => e.id_orden).filter((x): x is number => x != null))];
    if (!ids.length) return;
    setFallo(null);
    setReintentando((r) => ({ ...r, ...Object.fromEntries(lista.filter((e) => e.id_orden != null).map((e) => [e.id_orden, e.id])) }));
    const supabase = createClient();
    for (const id of ids) {
      const { error } = await supabase.rpc("auto_reintentar", { p_cuenta: cuenta, p_id: id });
      if (error) {
        setFallo(`OV ${id}: ${error.message}`);
        setReintentando((r) => { const s = { ...r }; delete s[id]; return s; });
      }
    }
    onNuevo();
  }
  const reintentables = errores.filter((e) => e.id_orden != null && !enviada(e));

  // ¿Está creando algo ahora? El último paso en curso de una orden que todavía no terminó (menos de 2 minutos).
  const activo = useMemo(() => {
    const e = eventos.find((x) => x.ok === null && x.paso !== "inicio" && ahora - Date.parse(x.creado_en) < 120_000);
    if (!e) return null;
    const termino = eventos.some((x) => x.id > e.id && x.id_orden === e.id_orden && (x.ok !== null || x.paso === "fin"));
    return termino ? null : e;
  }, [eventos, ahora]);

  return (
    <>
      {fabrica && (
        <FabricaAgente d={fabrica} ordenes={conteoOrdenes} paso={activo?.paso} enVivo={!!activo} periodo={rango?.etiqueta} estado={rango ? "Historial" : activo ? (
          <span className="text-blue-2 font-semibold">Trabajando en la OV {activo.id_orden}: {activo.mensaje}</span>
        ) : proxima ? (
          <>Próxima corrida {proxima.hora}{proxima.corte ? ` · antes del corte de las ${proxima.corte}` : ""} · en {proxima.en} min</>
        ) : "En espera"} />
      )}

    <div className="card p-4">
      {/* Errores de hoy, con lo enviado y lo respondido por Effi para corregir. */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest font-mono text-muted">
          {rango ? `Errores · ${rango.etiqueta}` : "Errores de hoy"}
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${errores.length ? "bg-red/15 text-red" : "bg-green/15 text-green"}`}>{errores.length}</span>
          {errores.length > 0 && <span className="normal-case tracking-normal font-sans">· una línea por remisión u orden; desaparece cuando queda resuelta</span>}
          {reintentables.length > 1 && (
            <button onClick={() => reintentar(reintentables)}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-green/50 bg-green/10 px-3 py-1 font-sans text-[11px] font-semibold normal-case tracking-normal text-green hover:bg-green/20">
              <RotateCw size={12} /> Reintentar todos ({reintentables.length})
            </button>
          )}
        </div>
        {fallo && <div className="mb-2 text-xs text-red">No se pudo reintentar: {fallo}</div>}
        {errores.length ? (
          <div className="rounded-xl border border-red/40 overflow-hidden">
            {errores.map((e) => (
              <div key={e.doc} className="sube border-b border-red/20 bg-red/[0.06] px-3 py-2 text-xs last:border-b-0">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red" />
                  <span className="mt-0.5 shrink-0 font-mono text-[10px] text-muted">{hora(e.creado_en)}</span>
                  <span className="whitespace-nowrap rounded-full bg-red/15 px-2.5 py-0.5 font-semibold text-red">{e.doc}</span>
                  <span className="whitespace-nowrap text-muted">
                    {e.paso === "guia" ? "no se hizo la guía porque:" : e.paso === "remision" ? "no se hizo la remisión porque:" : "no se completó porque:"}
                  </span>
                  <span className="min-w-[16rem] flex-1 text-text/90">{e.motivo}</span>
                  {e.intentos > 1 && <span className="whitespace-nowrap text-[10px] text-muted">{e.intentos} intentos{rango ? "" : " hoy"}</span>}
                  <span className="whitespace-nowrap rounded-full border border-amber/50 bg-amber/10 px-2 py-0.5 text-[10px] font-semibold text-amber">Requiere verificación humana</span>
                  {e.id_orden != null && (enviada(e) ? (
                    <span className="whitespace-nowrap text-[11px] font-semibold text-blue-2">Enviada a Effi…</span>
                  ) : (
                    <button onClick={() => reintentar([e])} title="Vuelve a crear en Effi con el mismo paso y la misma transportadora"
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-green/50 bg-green/10 px-2.5 py-0.5 text-[11px] font-semibold text-green hover:bg-green/20">
                      <RotateCw size={11} /> Reintentar
                    </button>
                  ))}
                  {esDueno && e.datos && (
                    <button onClick={() => setAbierto(abierto === e.id ? null : e.id)} className="whitespace-nowrap text-blue-2 underline">
                      {abierto === e.id ? "ocultar variables" : "ver variables"}
                    </button>
                  )}
                </div>
                {esDueno && abierto === e.id && e.datos && (
                  <pre className="sube mt-2 max-h-72 overflow-auto rounded-lg border border-line bg-black/30 p-2 text-[11px] whitespace-pre-wrap break-all font-mono">{JSON.stringify(e.datos, null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-green/30 bg-green/[0.06] px-3 py-2 text-xs text-green">
            <CheckCircle2 size={15} /> Sin errores {rango ? "en esos días" : "hoy"}: Effi aceptó todo lo que el agente envió.
          </div>
        )}
      </div>
    </div>
    </>
  );
}
