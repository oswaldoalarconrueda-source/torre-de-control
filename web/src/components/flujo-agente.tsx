"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, RotateCw, ShoppingCart, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { entero } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";

// Flujo en vivo del Agente, en horizontal: órdenes por convertir → remisiones creadas → guías creadas (hoy, hora
// local del país). Los paquetes corren por las conexiones; cuando el agente está creando algo, la etapa activa late
// y una etiqueta muestra la orden y el paso. Abajo, los errores de hoy: una línea por documento, diciendo si el error
// es de la remisión (no se pudo hacer la guía) o de la orden (no se pudo hacer la remisión) y por qué, con sus
// variables (lo enviado y lo respondido por Effi), o el aviso verde de que no hubo errores. Consulta los últimos
// movimientos cada 3 segundos (para ver qué está haciendo) y los aciertos y errores del día completo cada 15 s: los
// conteos de hoy no pueden salir solo de los últimos movimientos (un día con mucho trabajo pasa de 300 y el número se
// quedaba quieto).

type Evento = { id: number; id_orden: number | null; paso: string; ok: boolean | null; mensaje: string; datos: Record<string, unknown> | null; creado_en: string };
type Resumen = { sin_remision: number; sin_guia: number; listas?: number; plan_revision?: number };


export function FlujoAgente({ cuenta, resumen, proxima, onNuevo, completas, remisionadas }: {
  cuenta: string; resumen: Resumen; proxima: { hora: string; corte: string | null; en: number } | null; onNuevo: () => void;
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
    cargar();
    cargarDia();
    const t = setInterval(cargar, 3000), t2 = setInterval(cargarDia, 15_000);
    return () => { vivo = false; clearInterval(t); clearInterval(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta]);

  const dia = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(ms));
  const hora = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: zona, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
  // Lo del día: aciertos y errores completos, más los últimos movimientos (para que lo recién hecho cuente al instante).
  const hoy = useMemo(() => {
    const m = new Map<number, Evento>();
    for (const e of [...delDia, ...eventos]) if (e.ok !== null && dia(Date.parse(e.creado_en)) === dia(ahora)) m.set(e.id, e);
    return [...m.values()].sort((a, b) => b.id - a.id);
  }, [delDia, eventos, ahora]); // eslint-disable-line react-hooks/exhaustive-deps
  const remisiones = hoy.filter((e) => e.paso === "remision" && e.ok === true).length;
  const guias = hoy.filter((e) => e.paso === "guia" && e.ok === true).length;
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

  const etapas = [
    { id: "orden", titulo: "Órdenes por convertir", valor: resumen.sin_remision, sub: `${entero(resumen.listas ?? 0)} listas · ${entero(resumen.plan_revision ?? 0)} en revisión`, color: "255 181 71", Icono: ShoppingCart },
    { id: "remision", titulo: "Remisiones creadas hoy", valor: remisiones, sub: "con su convenio y centro de costos", color: "90 162 255", Icono: FileText },
    { id: "guia", titulo: "Guías creadas hoy", valor: guias, sub: resumen.sin_guia ? `${entero(resumen.sin_guia)} remisiones esperan guía` : "listas para despacho", color: "47 210 143", Icono: Truck },
  ];

  return (
    <div className="card p-5 overflow-hidden relative">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(60% 120% at 50% 0%, rgb(47 123 255 / 0.10), transparent 70%)" }} />
      <div className="relative flex flex-wrap items-center justify-between gap-2 mb-5">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full ${activo ? "bg-blue-2 onda" : "bg-green/60 onda"}`} />
            <span className={`relative inline-flex size-2.5 rounded-full ${activo ? "bg-blue-2" : "bg-green"}`} />
          </span>
          <span className="font-display font-semibold">Agente en vivo</span>
          <span className="text-xs text-muted">· hoy</span>
        </div>
        <div className="text-xs text-muted">
          {activo ? (
            <span className="text-blue-2 font-semibold">Trabajando en la OV {activo.id_orden}: {activo.mensaje}</span>
          ) : proxima ? (
            <>Próxima corrida {proxima.hora}{proxima.corte ? ` · antes del corte de las ${proxima.corte}` : ""} · en {proxima.en} min</>
          ) : (
            "En espera"
          )}
        </div>
      </div>

      {/* Flujo horizontal: tres etapas unidas por conexiones con paquetes en movimiento. */}
      <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 md:gap-0">
        {etapas.map((et, i) => {
          const enEtapa = activo && ((et.id === "remision" && activo.paso === "remision") || (et.id === "guia" && activo.paso === "guia"));
          return (
            <FragmentoEtapa key={et.id} conector={i > 0} rapido={!!activo && ((i === 1 && activo.paso === "remision") || (i === 2 && activo.paso === "guia"))}
              color={etapas[i - 1]?.color ?? et.color} colorFin={et.color}>
              <div className="relative rounded-2xl border px-4 py-4 text-center transition-colors"
                style={{ borderColor: `rgb(${et.color} / ${enEtapa ? 0.8 : 0.3})`, background: `linear-gradient(180deg, rgb(${et.color} / 0.10), rgb(${et.color} / 0.02))`, boxShadow: enEtapa ? `0 0 40px -8px rgb(${et.color} / 0.8)` : `0 0 24px -14px rgb(${et.color} / 0.6)` }}>
                {enEtapa && <span className="absolute inset-0 rounded-2xl border-2 onda" style={{ borderColor: `rgb(${et.color} / 0.7)` }} />}
                <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-xl" style={{ background: `rgb(${et.color} / 0.15)`, color: `rgb(${et.color})` }}>
                  <et.Icono size={20} />
                </div>
                <div key={et.valor} className="sube num text-4xl font-bold tracking-tight" style={{ color: `rgb(${et.color})`, textShadow: `0 0 24px rgb(${et.color} / 0.45)` }}>
                  {entero(et.valor)}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-widest font-mono text-text/80">{et.titulo}</div>
                <div className="mt-0.5 text-[11px] text-muted">{et.sub}</div>
              </div>
            </FragmentoEtapa>
          );
        })}
      </div>

      {/* Errores de hoy, con lo enviado y lo respondido por Effi para corregir. */}
      <div className="relative mt-6">
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest font-mono text-muted">
          Errores de hoy
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
                  {e.intentos > 1 && <span className="whitespace-nowrap text-[10px] text-muted">{e.intentos} intentos hoy</span>}
                  <span className="whitespace-nowrap rounded-full border border-amber/50 bg-amber/10 px-2 py-0.5 text-[10px] font-semibold text-amber">Requiere verificación humana</span>
                  {e.id_orden != null && (enviada(e) ? (
                    <span className="whitespace-nowrap text-[11px] font-semibold text-blue-2">Enviada a Effi…</span>
                  ) : (
                    <button onClick={() => reintentar([e])} title="Vuelve a crear en Effi con el mismo paso y la misma transportadora"
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-green/50 bg-green/10 px-2.5 py-0.5 text-[11px] font-semibold text-green hover:bg-green/20">
                      <RotateCw size={11} /> Reintentar
                    </button>
                  ))}
                  {e.datos && (
                    <button onClick={() => setAbierto(abierto === e.id ? null : e.id)} className="whitespace-nowrap text-blue-2 underline">
                      {abierto === e.id ? "ocultar variables" : "ver variables"}
                    </button>
                  )}
                </div>
                {abierto === e.id && e.datos && (
                  <pre className="sube mt-2 max-h-72 overflow-auto rounded-lg border border-line bg-black/30 p-2 text-[11px] whitespace-pre-wrap break-all font-mono">{JSON.stringify(e.datos, null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-green/30 bg-green/[0.06] px-3 py-2 text-xs text-green">
            <CheckCircle2 size={15} /> Sin errores hoy: Effi aceptó todo lo que el agente envió.
          </div>
        )}
      </div>
    </div>
  );
}

// Una etapa con su conexión de entrada: una línea con brillo y paquetes que corren (rápido si hay trabajo en curso).
function FragmentoEtapa({ conector, rapido, color, colorFin, children }: { conector: boolean; rapido: boolean; color: string; colorFin: string; children: React.ReactNode }) {
  return (
    <>
      {conector && (
        <div className="relative mx-auto h-10 w-1 md:h-1 md:w-16 lg:w-24 rounded-full" style={{ background: `linear-gradient(90deg, rgb(${color} / 0.5), rgb(${colorFin} / 0.5))` }}>
          {[0, 1, 2].map((k) => (
            <span key={k} className={`corre hidden md:block size-2 rounded-full ${rapido ? "corre-rapido" : ""}`}
              style={{ animationDelay: `${k * (rapido ? 0.28 : 0.85)}s`, background: `rgb(${colorFin})`, boxShadow: `0 0 10px rgb(${colorFin})` }} />
          ))}
        </div>
      )}
      {children}
    </>
  );
}
