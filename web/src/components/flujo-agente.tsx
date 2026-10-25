"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, ShoppingCart, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { entero } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";

// Flujo en vivo del Agente, en horizontal: órdenes por convertir → remisiones creadas → guías creadas (hoy, hora
// local del país). Los paquetes corren por las conexiones; cuando el agente está creando algo, la etapa activa late
// y una etiqueta muestra la orden y el paso. Abajo, los errores de hoy con sus variables (lo enviado y lo respondido
// por Effi), o el aviso verde de que no hubo errores. Consulta auto_eventos cada 3 segundos.

type Evento = { id: number; id_orden: number | null; paso: string; ok: boolean | null; mensaje: string; datos: Record<string, unknown> | null; creado_en: string };
type Resumen = { sin_remision: number; sin_guia: number; listas?: number; plan_revision?: number };


export function FlujoAgente({ cuenta, resumen, proxima, onNuevo, completas }: {
  cuenta: string; resumen: Resumen; proxima: { hora: string; corte: string | null; en: number } | null; onNuevo: () => void;
  completas?: number[]; // órdenes que ya tienen remisión y guía
}) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
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
    cargar();
    const t = setInterval(cargar, 3000);
    return () => { vivo = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta]);

  const dia = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(ms));
  const hora = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: zona, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
  const hoy = useMemo(() => eventos.filter((e) => dia(Date.parse(e.creado_en)) === dia(ahora)), [eventos, ahora]); // eslint-disable-line react-hooks/exhaustive-deps
  const remisiones = hoy.filter((e) => e.paso === "remision" && e.ok === true).length;
  const guias = hoy.filter((e) => e.paso === "guia" && e.ok === true).length;
  // Errores que siguen pendientes: no cuenta el de una orden que después quedó completa (la creó la Torre en un
  // intento siguiente o alguien a mano).
  const errores = hoy.filter((e) => e.ok === false && !(e.id_orden != null && (
    completas?.includes(e.id_orden) ||
    hoy.some((x) => x.id_orden === e.id_orden && x.id > e.id && x.ok === true && (x.paso === "fin" || x.paso === "guia")))));

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
        </div>
        {errores.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {errores.map((e) => (
              <div key={e.id} className="sube rounded-xl border border-red/40 bg-red/[0.08] p-3 text-xs">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-red">OV {e.id_orden} · {e.paso === "guia" ? "guía" : e.paso === "remision" ? "remisión" : e.paso}</span>
                      <span className="font-mono text-[10px] text-muted">{hora(e.creado_en)}</span>
                    </div>
                    <div className="mt-1 text-text/90">{e.mensaje}</div>
                    {e.datos && (
                      <button onClick={() => setAbierto(abierto === e.id ? null : e.id)} className="mt-1 text-blue-2 underline">
                        {abierto === e.id ? "ocultar variables" : "ver variables"}
                      </button>
                    )}
                    {abierto === e.id && e.datos && (
                      <pre className="sube mt-2 max-h-72 overflow-auto rounded-lg border border-line bg-black/30 p-2 text-[11px] whitespace-pre-wrap break-all font-mono">{JSON.stringify(e.datos, null, 2)}</pre>
                    )}
                  </div>
                </div>
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
