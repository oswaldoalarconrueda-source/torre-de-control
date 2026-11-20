"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CUENTAS, infoCuenta } from "@/lib/paises";
import { entero, haceCuanto } from "@/lib/formato";

// Saldo en vivo de la wallet Effi de cada país. Effi no da el saldo por API: wallet_en_vivo lo calcula sumando
// todos los movimientos, anulados incluidos, porque cada anulado tiene su reversión (historia completa en Supabase,
// al día cada minuto). Se consulta cada 15 s; cuando
// el saldo cambia, la tarjeta destella y muestra cuánto entró o salió.
// Abajo, los últimos movimientos de todas las wallets cruzados por fecha (cada uno con su bandera); al tocar una
// tarjeta se ven solo los de esa wallet, y al tocarla otra vez se vuelve a todas.
// Los países que también venden por Dropi (Joalix GT y CO, A un clic GT) muestran una segunda tarjeta con la billetera de
// Dropi, que sale del historial de cartera cargado. En la demostración no se muestran (dropi = false), para no alterarla.

type Movimiento = { fecha: string; tipo: string | null; t: number | null; valor: number; guia: string | null; anulado: boolean };
type Wallet = {
  cuenta: string; divisa: string | null; saldo: number; movimientos_total: number; desde: string | null; ultimo: string | null;
  hoy: { entradas: number; salidas: number; neto: number; movimientos: number; recaudos: number; recaudo: number };
  serie: number[]; recientes: Movimiento[];
  origen?: "drop" | "dropi";                                          // drop: A un clic HN/SV · dropi: cartera de Dropi del país (por archivo)
  retiros?: { fecha: string; concepto: string | null; monto: number }[]; // pendientes de saber cuántos pesos entraron y a qué cuenta
};
type Respuesta = { ahora: string; cuentas: Wallet[] };

const ORDEN = Object.keys(CUENTAS);
const CADA_MS = 15_000;

// Montos de wallet con 2 decimales, como los muestra Effi.
const plata = (v: number, cuenta: string, divisa?: string | null) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency", currency: divisa || infoCuenta(cuenta).divisa || "USD", currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
const conSigno = (v: number, cuenta: string, divisa?: string | null) => `${v >= 0 ? "+" : "−"}${plata(Math.abs(v), cuenta, divisa)}`;
// Un país puede tener dos wallets (Effi y Dropi): la clave las distingue.
const clave = (w: { cuenta: string; origen?: string }) => `${w.cuenta}:${w.origen ?? "effi"}`;

export function WalletEnVivo({ dropi = true }: { dropi?: boolean }) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null); // null = todas las wallets
  // Cambio de saldo por cuenta desde la consulta anterior (para el destello y el "+Q 329,01").
  const [cambio, setCambio] = useState<Record<string, { delta: number; en: number }>>({});
  const previo = useRef<Record<string, number>>({});
  const [, setTic] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let vivo = true;
    const cargar = async () => {
      const { data, error: e } = await supabase.rpc("wallet_en_vivo", { p_cuentas: null });
      if (!vivo) return;
      if (e) return setError("Sin señal de la base de datos; se reintenta solo.");
      setError(null);
      const r0 = data as Respuesta;
      const r = { ...r0, cuentas: dropi ? r0.cuentas : r0.cuentas.filter((w) => w.origen !== "dropi") };
      const nuevos: Record<string, { delta: number; en: number }> = {};
      for (const w of r.cuentas) {
        const k = clave(w);
        const antes = previo.current[k];
        if (antes != null && Math.abs(w.saldo - antes) >= 0.005) nuevos[k] = { delta: w.saldo - antes, en: Date.now() };
        previo.current[k] = w.saldo;
      }
      if (Object.keys(nuevos).length) setCambio((c) => ({ ...c, ...nuevos }));
      setDatos(r);
    };
    cargar();
    const t = setInterval(cargar, CADA_MS);
    const reloj = setInterval(() => setTic((x) => x + 1), 1000);
    return () => { vivo = false; clearInterval(t); clearInterval(reloj); };
  }, [dropi]);

  // Orden de países; dentro de cada país, primero Effi y luego Dropi.
  const cuentas = (datos?.cuentas ?? []).slice()
    .sort((a, b) => ORDEN.indexOf(a.cuenta) - ORDEN.indexOf(b.cuenta) || Number(a.origen === "dropi") - Number(b.origen === "dropi"));
  const conDropi = new Set(cuentas.filter((w) => w.origen === "dropi").map((w) => w.cuenta));
  const elegida = sel ? cuentas.find((w) => clave(w) === sel) ?? null : null;
  const nombre = (w: { cuenta: string; origen?: string }) => `${infoCuenta(w.cuenta).nombre}${w.origen === "dropi" ? " · O.A." : ""}`;
  // Todas: los recientes de cada wallet, cruzados por fecha.
  const todos = cuentas.flatMap((w) => w.recientes.map((m) => ({ ...m, cuenta: w.cuenta, origen: w.origen, divisa: w.divisa })))
    .sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 40);
  const lista = elegida ? elegida.recientes.map((m) => ({ ...m, cuenta: elegida.cuenta, origen: elegida.origen, divisa: elegida.divisa })) : todos;

  if (!datos) return <div className="card p-10 text-center text-sm text-muted">{error ?? "Calculando saldos…"}</div>;

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-amber" role="status">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cuentas.map((w) => (
          <Tarjeta key={clave(w)} w={w} cambio={cambio[clave(w)]} activa={!!elegida && clave(elegida) === clave(w)}
            marcarEffi={!w.origen && conDropi.has(w.cuenta)}
            onClick={() => setSel((s) => (s === clave(w) ? null : clave(w)))} />
        ))}
      </div>

      {lista.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="font-display font-semibold">
              Últimos movimientos · {elegida ? `${infoCuenta(elegida.cuenta).bandera} ${nombre(elegida)}` : "todas las wallets"}
            </span>
            <span className="text-[11px] font-mono text-muted">
              {elegida ? <>{entero(elegida.movimientos_total)} movimientos · toca la tarjeta otra vez para ver todas</> : "toca una tarjeta para ver solo esa wallet"}
            </span>
          </div>
          <ul className="divide-y divide-line">
            {lista.map((m, i) => {
              const hora = new Intl.DateTimeFormat("es-CO", { timeZone: infoCuenta(m.cuenta).zona, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(m.fecha));
              return (
                <li key={`${clave(m)}-${m.fecha}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm sm:flex-nowrap">
                  <span className="shrink-0 whitespace-nowrap text-[11px] font-mono text-muted sm:w-36">{hora}</span>
                  {!elegida && <span className="shrink-0 truncate text-xs sm:w-36" title={nombre(m)}>{infoCuenta(m.cuenta).bandera} {nombre(m)}</span>}
                  <span className="min-w-0 flex-1 truncate max-sm:order-last max-sm:basis-full">
                    {m.tipo ?? "—"}
                    {m.anulado && <span className="ml-2 rounded-full border border-line px-1.5 text-[10px] text-muted">anulado</span>}
                  </span>
                  {m.guia && <span className="hidden sm:inline font-mono text-[11px] text-muted">{m.guia}</span>}
                  <span className={`num shrink-0 font-semibold max-sm:ml-auto ${m.valor >= 0 ? "text-green" : "text-red"}`}>{conSigno(m.valor, m.cuenta, m.divisa)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-muted">
        El saldo es la suma de todos los movimientos de la wallet desde su primer día, como lo calcula Effi: un movimiento anulado y su reversión se cancelan entre sí. Se actualiza cada minuto con Effi y esta pantalla consulta cada 15 segundos.
        {conDropi.size > 0 && " Las tarjetas de O.A. muestran el saldo del último historial de cartera cargado: se ponen al día cada vez que se carga la cartera."}
      </p>
    </div>
  );
}

function Tarjeta({ w, cambio, activa, marcarEffi, onClick }: { w: Wallet; cambio?: { delta: number; en: number }; activa: boolean; marcarEffi: boolean; onClick: () => void }) {
  const pais = infoCuenta(w.cuenta);
  const reciente = cambio && Date.now() - cambio.en < 6000;
  const color = cambio && cambio.delta >= 0 ? "var(--green)" : "var(--red)";
  if (!w.movimientos_total) {
    return (
      <div className="card p-5 opacity-60">
        <div className="flex items-center gap-2 text-sm font-semibold">{pais.bandera} {pais.nombre}</div>
        <div className="text-sm text-muted mt-4">Sin wallet conectada todavía</div>
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`card p-5 text-left transition-all ${activa ? "ring-1 ring-blue/50" : "hover:ring-1 hover:ring-line"}`}
      style={reciente ? { boxShadow: `0 0 0 1px ${color}, 0 0 32px -6px ${color}` } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">{pais.bandera} {pais.nombre}</span>
        <span className="flex items-center gap-1">
          {w.origen === "drop" && <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-mono text-muted" title="Billetera de Drop, cargada por archivo">Drop</span>}
          {w.origen === "dropi" && <span className="rounded-full border border-blue/40 px-2 py-0.5 text-[10px] font-mono text-blue" title="Billetera de O.A.: saldo del último historial de cartera cargado">O.A.</span>}
          {marcarEffi && <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-mono text-muted" title="Wallet de Effi, al día cada minuto">Effi</span>}
          <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-mono text-muted">{w.divisa ?? pais.divisa}</span>
        </span>
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-widest font-mono text-muted">Saldo ahora</div>
      <div className="num text-3xl font-semibold tracking-tight mt-0.5">{plata(w.saldo, w.cuenta, w.divisa)}</div>
      <div className="h-5 mt-0.5 text-xs font-semibold num" style={{ color }}>
        {reciente && cambio ? `${conSigno(cambio.delta, w.cuenta, w.divisa)} recién` : ""}
      </div>
      <Linea valores={w.serie} />
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Dato titulo="Entró hoy" valor={plata(w.hoy.entradas, w.cuenta, w.divisa)} color="var(--green)" />
        <Dato titulo="Salió hoy" valor={plata(Math.abs(w.hoy.salidas), w.cuenta, w.divisa)} color="var(--red)" />
        <Dato titulo="Neto hoy" valor={conSigno(w.hoy.neto, w.cuenta, w.divisa)} color={w.hoy.neto >= 0 ? "var(--green)" : "var(--red)"} />
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted font-mono">
        <span>{entero(w.hoy.recaudos)} {w.hoy.recaudos === 1 ? "entrega pagada" : "entregas pagadas"} hoy</span>
        <span>{w.ultimo ? `último ${haceCuanto(w.ultimo)}` : ""}</span>
      </div>
      {!!w.retiros?.length && (
        <div className="mt-3 border-t border-line pt-2 text-[11px]">
          <div className="uppercase tracking-wider font-mono text-amber">Retiros pendientes de pesos y cuenta</div>
          {w.retiros.slice(0, 6).map((r) => (
            <div key={`${r.fecha}${r.concepto}`} className="mt-1 flex justify-between gap-2 text-muted">
              <span className="truncate">{r.fecha.slice(0, 10)} · {r.concepto ?? "—"}</span>
              <span className="num shrink-0 text-text">{plata(r.monto, w.cuenta, w.divisa)}</span>
            </div>
          ))}
          {w.retiros.length > 6 && <div className="mt-1 text-muted">… y {w.retiros.length - 6} más</div>}
        </div>
      )}
    </button>
  );
}

function Dato({ titulo, valor, color }: { titulo: string; valor: string; color: string }) {
  return (
    <div className="min-w-0">
      <div className="uppercase tracking-wider font-mono text-muted truncate">{titulo}</div>
      <div className="num font-semibold truncate" style={{ color }} title={valor}>{valor}</div>
    </div>
  );
}

// Saldo de las últimas 24 horas, hora por hora (el último punto es ahora).
function Linea({ valores }: { valores: number[] }) {
  if (valores.length < 2) return null;
  const w = 240, h = 44, min = Math.min(...valores), max = Math.max(...valores), r = max - min || 1;
  const pts = valores.map((v, i) => `${((i / (valores.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / r) * (h - 8)).toFixed(1)}`).join(" ");
  const sube = valores[valores.length - 1] >= valores[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11 block" preserveAspectRatio="none" aria-label="Saldo en las últimas 24 horas">
      <polyline points={pts} fill="none" stroke={sube ? "var(--green)" : "var(--red)"} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
