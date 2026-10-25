"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CUENTAS, infoCuenta } from "@/lib/paises";
import { entero, haceCuanto } from "@/lib/formato";

// Saldo en vivo de la wallet Effi de cada país. Effi no da el saldo por API: wallet_en_vivo lo calcula sumando
// todos los movimientos, anulados incluidos, porque cada anulado tiene su reversión (historia completa en Supabase,
// al día cada minuto). Se consulta cada 15 s; cuando
// el saldo cambia, la tarjeta destella y muestra cuánto entró o salió.

type Movimiento = { fecha: string; tipo: string | null; t: number | null; valor: number; guia: string | null; anulado: boolean };
type Wallet = {
  cuenta: string; divisa: string | null; saldo: number; movimientos_total: number; desde: string | null; ultimo: string | null;
  hoy: { entradas: number; salidas: number; neto: number; movimientos: number; recaudos: number; recaudo: number };
  serie: number[]; recientes: Movimiento[];
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

export function WalletEnVivo() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string>("TIENDA_CO");
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
      const r = data as Respuesta;
      const nuevos: Record<string, { delta: number; en: number }> = {};
      for (const w of r.cuentas) {
        const antes = previo.current[w.cuenta];
        if (antes != null && Math.abs(w.saldo - antes) >= 0.005) nuevos[w.cuenta] = { delta: w.saldo - antes, en: Date.now() };
        previo.current[w.cuenta] = w.saldo;
      }
      if (Object.keys(nuevos).length) setCambio((c) => ({ ...c, ...nuevos }));
      setDatos(r);
    };
    cargar();
    const t = setInterval(cargar, CADA_MS);
    const reloj = setInterval(() => setTic((x) => x + 1), 1000);
    return () => { vivo = false; clearInterval(t); clearInterval(reloj); };
  }, []);

  const cuentas = (datos?.cuentas ?? []).slice().sort((a, b) => ORDEN.indexOf(a.cuenta) - ORDEN.indexOf(b.cuenta));
  const elegida = cuentas.find((w) => w.cuenta === sel) ?? cuentas.find((w) => w.movimientos_total > 0);

  if (!datos) return <div className="card p-10 text-center text-sm text-muted">{error ?? "Calculando saldos…"}</div>;

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-amber" role="status">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cuentas.map((w) => (
          <Tarjeta key={w.cuenta} w={w} cambio={cambio[w.cuenta]} activa={elegida?.cuenta === w.cuenta} onClick={() => setSel(w.cuenta)} />
        ))}
      </div>

      {elegida && elegida.movimientos_total > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="font-display font-semibold">
              Últimos movimientos · {infoCuenta(elegida.cuenta).bandera} {infoCuenta(elegida.cuenta).nombre}
            </span>
            <span className="text-[11px] font-mono text-muted">
              {entero(elegida.movimientos_total)} movimientos desde el primer día de la wallet
            </span>
          </div>
          <ul className="divide-y divide-line">
            {elegida.recientes.map((m, i) => {
              const hora = new Intl.DateTimeFormat("es-CO", { timeZone: infoCuenta(elegida.cuenta).zona, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(m.fecha));
              return (
                <li key={`${m.fecha}-${i}`} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-36 shrink-0 whitespace-nowrap text-[11px] font-mono text-muted">{hora}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {m.tipo ?? "—"}
                    {m.anulado && <span className="ml-2 rounded-full border border-line px-1.5 text-[10px] text-muted">anulado</span>}
                  </span>
                  {m.guia && <span className="hidden sm:inline font-mono text-[11px] text-muted">{m.guia}</span>}
                  <span className={`num shrink-0 font-semibold ${m.valor >= 0 ? "text-green" : "text-red"}`}>{conSigno(m.valor, elegida.cuenta, elegida.divisa)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-muted">
        El saldo es la suma de todos los movimientos de la wallet desde su primer día, como lo calcula Effi: un movimiento anulado y su reversión se cancelan entre sí. Se actualiza cada minuto con Effi y esta pantalla consulta cada 15 segundos.
      </p>
    </div>
  );
}

function Tarjeta({ w, cambio, activa, onClick }: { w: Wallet; cambio?: { delta: number; en: number }; activa: boolean; onClick: () => void }) {
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
        <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-mono text-muted">{w.divisa ?? pais.divisa}</span>
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
