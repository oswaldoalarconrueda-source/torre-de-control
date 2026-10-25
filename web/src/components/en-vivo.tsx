"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dinero, entero } from "@/lib/formato";
import { CUENTAS, infoCuenta } from "@/lib/paises";
import { COLOR_ESTADO } from "./charts";
import { RedNeuronal, type RedNeuronalApi } from "./red-neuronal";

// ⚡ En vivo: la operación como un "segundo cerebro" con el proceso completo de la empresa. Alrededor de cada país:
// orden de venta → remisión → guía generada → estados de la guía (en tránsito, en oficina, novedad, entregada,
// devolución). Cada cambio de estado que llega de Effi viaja como un impulso desde "guía generada" hasta su estado, y
// las órdenes, remisiones y guías nuevas recorren su tramo de la cadena. Effi se sincroniza cada minuto, así que los
// cambios de cada lote se reproducen en orden, repartidos en el minuto siguiente. Al centro, el logo de Joalix.

type Cat = "ENTREGADO" | "EN_TRANSITO" | "NOVEDAD" | "EN_OFICINA" | "DEVOLUCION";
type Etapa = "ORDEN" | "REMISION" | "GENERADA";
type Evento = {
  cuenta: string; guia: string | null; fecha_hist_est: string; estado_new_efficommerce: string | null; estado_new: string | null;
  nombre_transportadora_efficommerce: string | null; nombre_ciudad_destinatario: string | null; valor_recaudo: number | null;
  est_guia_new_efficommerce: number | null; pagada: boolean | null;
};
type Pulso = {
  ahora: string; minutos: number; hoy?: boolean;
  cuentas: {
    cuenta: string; agente?: boolean; hoy: Record<string, number>; ventana: Record<string, number>;
    proceso_hoy?: Record<string, number>; proceso_ventana?: Record<string, number>;
    serie: number[]; recaudo_hoy: number; pagos_hoy: number; ultimo: string | null;
  }[];
};

const TIENDAS = Object.keys(CUENTAS);
// Ventana "Hoy": desde las 00:00 del día local de cada país.
const HOY = 0;
const ZONA: Record<string, string> = { TIENDA_CO: "America/Bogota", TIENDA_EC: "America/Guayaquil", TIENDA_GT: "America/Guatemala", TIENDA_CR: "America/Costa_Rica" };
const diaLocal = (cuenta: string, ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA[cuenta] ?? "America/Bogota" }).format(new Date(ms));
// Minutos desde la medianoche más temprana de los países elegidos (Colombia y Ecuador amanecen antes).
const minutosHoy = (cuentas: string[]) => Math.max(1, ...cuentas.map((c) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA[c] ?? "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
  return h * 60 + m + 1;
}));
const ESTADOS: { id: Cat; label: string }[] = [
  { id: "EN_TRANSITO", label: "En tránsito" },
  { id: "EN_OFICINA", label: "En oficina" },
  { id: "NOVEDAD", label: "Novedad" },
  { id: "ENTREGADO", label: "Entregada" },
  { id: "DEVOLUCION", label: "Devolución" },
];
// El proceso en orden: cada etapa cuelga de la anterior (las órdenes del país; los estados de la guía generada).
const ETAPAS: { id: Etapa; label: string; color: string }[] = [
  { id: "ORDEN", label: "Órdenes", color: "#d4a64a" },
  { id: "REMISION", label: "Remisiones", color: "#b48cff" },
  { id: "GENERADA", label: "Guías generadas", color: "#c9d3ea" },
];
const NODOS = [
  ...ETAPAS.map((e, i) => ({ id: e.id as string, label: e.label, color: e.color, padre: i ? ETAPAS[i - 1].id : undefined })),
  ...ESTADOS.map((e) => ({ id: e.id as string, label: e.label, color: COLOR_ESTADO[e.id], padre: "GENERADA" })),
];
const esEtapa = (id: string): id is Etapa => ETAPAS.some((e) => e.id === id);
const VENTANAS = [
  { min: 1, label: "1 min" }, { min: 5, label: "5 min" }, { min: 10, label: "10 min" }, { min: 30, label: "30 min" },
  { min: 60, label: "1 h" }, { min: 1440, label: "24 h" }, { min: HOY, label: "Hoy" },
];
const CAT: Record<number, Cat> = { 4: "ENTREGADO", 5: "DEVOLUCION", 2: "EN_TRANSITO", 8: "EN_TRANSITO", 3: "NOVEDAD", 9: "EN_OFICINA" };
const ANCHO = 1000, ALTO = 760, CX = 500, CY = 380;
const GUARDADO = "torre.envivo";
const claveEv = (e: Evento) => `${e.cuenta}|${e.guia}|${e.fecha_hist_est}|${e.est_guia_new_efficommerce}`;
const AZUL = "rgb(120 160 255)";
// Coordenadas redondeadas: el servidor y el navegador calculan los decimales distinto.
const q = (n: number) => Math.round(n * 100) / 100;

// Cada país tiene su lugar fijo alrededor de la Torre: Colombia arriba, Guatemala a la derecha, Costa Rica abajo
// y Ecuador a la izquierda (no cambia al filtrar países).
const ANGULO: Record<string, number> = { TIENDA_CO: -Math.PI / 2, TIENDA_GT: 0, TIENDA_CR: Math.PI / 2, TIENDA_EC: Math.PI };

// Con una tienda: el proceso de izquierda a derecha, como una línea (país → órdenes → remisiones → guías generadas →
// estados en abanico). Con varias: el logo al centro, los países en cruz y su proceso en arco alrededor de cada uno.
function geometria(cuentas: string[]) {
  const sola = cuentas.length === 1;
  const paises = cuentas.map((c, i) => {
    const a = ANGULO[c] ?? -Math.PI / 2 + (2 * Math.PI * i) / cuentas.length;
    if (sola) {
      const linea = [250, 405, 560];
      const estados = NODOS.map((n, j) => j < ETAPAS.length
        ? { ...n, x: linea[j], y: CY }
        : { ...n, x: 830, y: q(CY + (j - ETAPAS.length - 2) * 140) });
      return { cuenta: c, x: 95, y: CY, estados };
    }
    const x = q(CX + Math.cos(a) * 300), y = q(CY + Math.sin(a) * 225);
    const estados = NODOS.map((n, j) => {
      const b = a + ((j - (NODOS.length - 1) / 2) * Math.PI) / 7.6;
      return { ...n, x: q(x + Math.cos(b) * 132), y: q(y + Math.sin(b) * 112) };
    });
    return { cuenta: c, x, y, estados };
  });
  return { sola, paises };
}

export function EnVivo() {
  const [sel, setSel] = useState<string[]>(TIENDAS);
  const [ventana, setVentana] = useState(60);
  const [pulso, setPulso] = useState<Pulso | null>(null);
  const [stream, setStream] = useState<Evento[]>([]);
  const [cola, setCola] = useState(0);
  const [copiada, setCopiada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const colaRef = useRef<Evento[]>([]);
  const procesoAntes = useRef<Record<string, number>>({});
  const vistos = useRef(new Set<string>());
  const red = useRef<RedNeuronalApi>(null);

  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(GUARDADO) ?? "null");
      if (Array.isArray(g?.sel) && g.sel.length && g.sel.every((c: string) => TIENDAS.includes(c))) setSel(g.sel);
      if (VENTANAS.some((v) => v.min === g?.ventana)) setVentana(g.ventana);
    } catch { /* sin almacenamiento: valores por defecto */ }
  }, []);
  const guardar = (s: string[], v: number) => { try { localStorage.setItem(GUARDADO, JSON.stringify({ sel: s, ventana: v })); } catch { /* ignorar */ } };
  const elegir = (cs: string[]) => { setSel(cs); guardar(cs, ventana); };
  const elegirVentana = (v: number) => { setVentana(v); guardar(sel, v); };

  const geo = useMemo(() => geometria(sel), [sel]);
  const clave = `${sel.join(",")}|${ventana}`;

  // Pulso (resumen por país) cada 15 s y eventos de la ventana cada 10 s.
  useEffect(() => {
    const supabase = createClient();
    let vivo = true, primera = true;
    vistos.current = new Set();
    procesoAntes.current = {};
    colaRef.current = [];
    setStream([]);
    setPulso(null);
    const cargarPulso = async () => {
      const { data, error: e } = await supabase.rpc("envivo_pulso", { p_cuentas: sel, p_minutos: ventana });
      if (!vivo) return;
      if (e) { setError("Sin señal de la base de datos; se reintenta solo."); return; }
      setError(null);
      const p = data as Pulso;
      // Órdenes, remisiones y guías nuevas desde el pulso anterior: cada una recorre su tramo de la cadena,
      // repartidas en los próximos segundos.
      for (const c of p.cuentas) for (const et of ETAPAS) {
        const k = `${c.cuenta}|${et.id}`, n = c.proceso_ventana?.[et.id] ?? 0, antes = procesoAntes.current[k];
        procesoAntes.current[k] = n;
        if (antes == null || n <= antes) continue;
        for (let i = 0; i < Math.min(12, n - antes); i++) setTimeout(() => red.current?.disparar(c.cuenta, et.id), Math.random() * 14_000);
      }
      setPulso(p);
    };
    const cargarEventos = async () => {
      const { data, error: e } = await supabase
        .from("v_feed_estados")
        .select("cuenta,guia,fecha_hist_est,estado_new_efficommerce,estado_new,nombre_transportadora_efficommerce,nombre_ciudad_destinatario,valor_recaudo,est_guia_new_efficommerce,pagada")
        .in("cuenta", sel)
        .gte("fecha_hist_est", new Date(Date.now() - Math.max(ventana === HOY ? minutosHoy(sel) : ventana, 2) * 60_000).toISOString())
        .order("fecha_hist_est", { ascending: false })
        .limit(500);
      if (!vivo || e || !data) return;
      const nuevos = (data as Evento[]).filter((x) => !vistos.current.has(claveEv(x)));
      nuevos.forEach((x) => vistos.current.add(claveEv(x)));
      // Al abrir, se reproducen los últimos 12 cambios reales para que se vea el pulso de inmediato.
      if (primera) setStream(nuevos.slice(12, 200));
      colaRef.current.push(...(primera ? nuevos.slice(0, 12) : nuevos).reverse());
      primera = false;
      setCola(colaRef.current.length);
    };
    cargarPulso();
    cargarEventos();
    const t1 = setInterval(cargarPulso, 15_000), t2 = setInterval(cargarEventos, 10_000);
    return () => { vivo = false; clearInterval(t1); clearInterval(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Cada cambio reproducido dispara una señal en la red y entra a la lista.
  const disparar = useCallback((e: Evento) => {
    red.current?.disparar(e.cuenta, CAT[e.est_guia_new_efficommerce ?? -1] ?? null);
    setStream((s) => [e, ...s].slice(0, 200));
  }, []);

  // Reproductor: saca un cambio de la cola a un ritmo que reparte el lote en ~1 minuto.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const paso = () => {
      const e = colaRef.current.shift();
      if (e) disparar(e);
      setCola(colaRef.current.length);
      const n = colaRef.current.length;
      t = setTimeout(paso, n ? Math.min(3000, Math.max(200, 55_000 / n)) : 800);
    };
    t = setTimeout(paso, 600);
    return () => clearTimeout(t);
  }, [disparar]);

  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t); }, []);

  const copiar = async (guia: string) => {
    try { await navigator.clipboard.writeText(guia); setCopiada(guia); setTimeout(() => setCopiada(null), 1500); } catch { /* sin permiso de portapapeles */ }
  };

  const datos = (c: string) => pulso?.cuentas.find((x) => x.cuenta === c);
  const enVentana = (c: string, cat?: Cat) => {
    const v = datos(c)?.ventana ?? {};
    return cat ? v[cat] ?? 0 : Object.values(v).reduce((a, n) => a + n, 0);
  };
  const enProceso = (c: string, et: Etapa) => datos(c)?.proceso_ventana?.[et] ?? 0;
  const nodo = (c: string, id: string) => esEtapa(id) ? enProceso(c, id) : enVentana(c, id as Cat);
  const suma = (cat?: Cat) => sel.reduce((a, c) => a + enVentana(c, cat), 0);
  const sumaEtapa = (et: Etapa) => sel.reduce((a, c) => a + enProceso(c, et), 0);
  // Órdenes y remisiones solo existen donde el Agente vigila; se dice de qué países salen.
  const conAgente = sel.filter((c) => datos(c)?.agente).map((c) => infoCuenta(c).nombre);
  const origenProceso = conAgente.length === 0 ? "sin agente aún"
    : conAgente.length === sel.length ? (sel.length === 1 ? "" : conAgente.join(" y "))
    : `solo ${conAgente.join(" y ")}`;
  const maxNodo = Math.max(1, ...sel.flatMap((c) => NODOS.map((n) => nodo(c, n.id))));
  const ultimo = pulso?.cuentas.map((c) => c.ultimo).filter(Boolean).sort().pop() ?? null;
  const hace = ultimo ? Math.max(0, Math.round((ahora - Date.parse(ultimo)) / 1000)) : null;
  const serie = Array.from({ length: 60 }, (_, i) => sel.reduce((a, c) => a + (datos(c)?.serie?.[i] ?? 0), 0));
  const esHoy = ventana === HOY;
  const etiquetaVentana = VENTANAS.find((v) => v.min === ventana)?.label ?? "";
  // Frases: "cambios en 30 min" / "cambios de hoy".
  const enVentanaTxt = esHoy ? "de hoy" : `en ${etiquetaVentana}`;
  const minutos = esHoy ? pulso?.minutos ?? minutosHoy(sel) : ventana;
  const corte = minutos; // 60 puntos en la ventana: cada punto dura (minutos × 60 s) / 60 = minutos segundos
  const corteTxt = corte < 60 ? `${corte} s` : corte < 3600 ? `${Math.round(corte / 60)} min` : `${Math.round(corte / 360) / 10} h`;
  const lista = stream.filter((e) => {
    const t = Date.parse(e.fecha_hist_est);
    return esHoy ? diaLocal(e.cuenta, t) === diaLocal(e.cuenta, ahora) : t >= ahora - (ventana + 1) * 60_000;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => elegir(TIENDAS)} className={chip(sel.length === TIENDAS.length)}>🌎 Todas</button>
        {TIENDAS.map((c) => (
          <button key={c} onClick={() => elegir([c])} className={chip(sel.length === 1 && sel[0] === c)}>
            {infoCuenta(c).bandera} {infoCuenta(c).nombre}
          </button>
        ))}
        <div className="ml-auto inline-flex rounded-xl border border-line bg-white/[0.02] p-0.5 font-mono text-[11px]">
          {VENTANAS.map((v) => (
            <button key={v.min} onClick={() => elegirVentana(v.min)}
              className={`rounded-lg px-2.5 py-1 font-semibold uppercase tracking-wider transition-colors ${ventana === v.min ? "bg-blue/25 text-text shadow-[inset_0_0_0_1px_rgb(47_123_255_/_0.6)]" : "text-muted hover:text-text"}`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* El proceso de punta a punta, en el mismo orden del cerebro. */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">
        {ETAPAS.map((e) => (
          <Contador key={e.id} titulo={e.label} valor={sumaEtapa(e.id)} color={e.color}
            sub={e.id === "GENERADA" || !origenProceso ? etiquetaVentana : `${etiquetaVentana} · ${origenProceso}`} />
        ))}
        {ESTADOS.map((e) => (
          <Contador key={e.id} titulo={e.label} valor={suma(e.id)} color={COLOR_ESTADO[e.id]}
            sub={suma() ? `${Math.round((suma(e.id) / suma()) * 100)}% de los cambios` : "—"} />
        ))}
      </div>
      {error && <p className="text-xs text-amber" role="status">{error}</p>}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_23rem] items-start">
        <div className="card relative overflow-hidden p-0 min-w-0">
          <RedNeuronal ref={red} ancho={ANCHO} alto={ALTO} centro={geo.sola ? null : { x: CX, y: CY }} total={suma()} maxNodo={maxNodo}
            paises={geo.paises.map((p) => ({
              cuenta: p.cuenta, bandera: infoCuenta(p.cuenta).bandera, x: p.x, y: p.y, total: enVentana(p.cuenta),
              estados: p.estados.map((e) => ({
                ...e, n: nodo(p.cuenta, e.id),
                hoy: esEtapa(e.id) ? datos(p.cuenta)?.proceso_hoy?.[e.id] ?? 0 : datos(p.cuenta)?.hoy[e.id] ?? 0,
              })),
            }))} />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2">
          <div className="text-[11px] text-muted max-w-xl">
            Proceso de cada país: órdenes → remisiones → guías generadas → estados. Número y tamaño de cada hexágono = movimientos {enVentanaTxt}. Cada movimiento viaja como señal por su tramo; entregas y devoluciones lanzan una onda.
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted">
            <span className="pulso size-2 rounded-full bg-red shadow-[0_0_10px_var(--red)]" />
            {hace == null ? "ESPERANDO SEÑAL" : `ÚLTIMO CAMBIO HACE ${hace < 60 ? `${hace} S` : `${Math.floor(hace / 60)} MIN`}`}
            {cola > 0 && <span className="rounded-full border border-line px-2 py-0.5">{cola} EN COLA</span>}
          </div>
          </div>
        </div>

        <div className="card p-3 min-w-0 flex flex-col max-h-[44rem]">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="font-display font-semibold">Cambios en vivo</span>
            <span className="text-[11px] font-mono text-muted">{entero(lista.length)} · {etiquetaVentana}</span>
          </div>
          <ul className="flex-1 overflow-y-auto space-y-1 pr-1">
            {lista.map((e) => {
              const cat = CAT[e.est_guia_new_efficommerce ?? -1];
              const c = cat ? COLOR_ESTADO[cat] : COLOR_ESTADO.PENDIENTE;
              const hora = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(e.fecha_hist_est));
              return (
                <li key={claveEv(e)} className="entra flex items-center gap-2.5 rounded-xl border-l-2 px-2 py-1.5" style={{ borderColor: c }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm truncate" style={{ color: c }}>{e.estado_new_efficommerce ?? e.estado_new ?? "—"}</span>
                      <span className="text-[11px]">{infoCuenta(e.cuenta).bandera}</span>
                      {e.pagada && <span className="text-[10px] text-green border border-green/30 rounded-full px-1.5">pagada</span>}
                    </div>
                    {e.guia && (
                      <button onClick={() => copiar(e.guia!)} title="Copiar número de guía para buscarla en Effi"
                        className="group inline-flex items-center gap-1 font-mono text-[13px] font-semibold tracking-wide text-text hover:text-blue-2">
                        {e.guia}
                        <Copy size={11} className="opacity-40 group-hover:opacity-100" />
                        {copiada === e.guia && <span className="text-[10px] text-green font-sans font-normal">copiada</span>}
                      </button>
                    )}
                    <div className="text-[11px] text-muted truncate font-mono">{e.nombre_transportadora_efficommerce ?? "—"} · {e.nombre_ciudad_destinatario ?? ""}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-mono text-muted">{hora}</div>
                    {e.valor_recaudo != null && <div className="text-[11px] num">{dinero(e.valor_recaudo, e.cuenta)}</div>}
                  </div>
                </li>
              );
            })}
            {!lista.length && <li className="text-sm text-muted text-center py-8">Sin cambios {enVentanaTxt}…</li>}
          </ul>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[11px] uppercase tracking-widest font-mono text-muted">Latido · cambios cada {corteTxt}, {esHoy ? "desde las 00:00" : `últimos ${etiquetaVentana}`}</span>
          <span className="text-[11px] text-muted num">{entero(serie.reduce((a, n) => a + n, 0))} cambios</span>
        </div>
        <Latido valores={serie} />
      </div>

      <div className={`grid gap-3 ${sel.length > 1 ? "sm:grid-cols-2 xl:grid-cols-4" : ""}`}>
        {sel.map((c) => {
          const d = datos(c), info = infoCuenta(c);
          return (
            <div key={c} className="card p-4">
              <div className="flex items-center justify-between font-semibold">
                <span>{info.bandera} {info.nombre}</span>
                <span className="text-[11px] font-mono text-muted">{entero(enVentana(c))} {enVentanaTxt}</span>
              </div>
              {/* Sigue el filtro de tiempo; "hoy" va aparte porque cada país tiene su propia medianoche. */}
              <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                <Dato titulo="Entregadas" valor={entero(enVentana(c, "ENTREGADO"))} color={COLOR_ESTADO.ENTREGADO} />
                <Dato titulo="En tránsito" valor={entero(enVentana(c, "EN_TRANSITO"))} color={COLOR_ESTADO.EN_TRANSITO} />
                <Dato titulo="Novedades" valor={entero(enVentana(c, "NOVEDAD"))} color={COLOR_ESTADO.NOVEDAD} />
                <Dato titulo="Devoluciones" valor={entero(enVentana(c, "DEVOLUCION"))} color={COLOR_ESTADO.DEVOLUCION} />
              </div>
              <div className="mt-3 border-t border-dashed border-line pt-2 text-xs text-muted space-y-0.5">
                <div>
                  Hoy desde las 00:00 hora {info.nombre}: <span className="text-text font-semibold num">{entero(Object.values(d?.hoy ?? {}).reduce((a, n) => a + n, 0))}</span> cambios ·{" "}
                  {entero(d?.hoy.ENTREGADO ?? 0)} entregadas
                </div>
                <div>Recaudo acreditado hoy: <span className="text-text font-semibold num">{dinero(d?.recaudo_hoy ?? 0, c)}</span> · {entero(d?.pagos_hoy ?? 0)} pagos</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? "border-blue/50 bg-blue/15 text-text" : "border-line text-muted hover:text-text"}`;

function Contador({ titulo, valor, color, sub }: { titulo: string; valor: number; color: string; sub: string }) {
  return (
    <div className="card relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
      <div className="text-[10px] uppercase tracking-[0.2em] font-mono text-muted">{titulo}</div>
      <div className="num text-4xl font-semibold mt-1 tabular-nums" style={{ color, textShadow: `0 0 18px ${color}` }}>{entero(valor)}</div>
      <div className="text-[11px] font-mono text-muted mt-1">{sub}</div>
    </div>
  );
}

function Dato({ titulo, valor, color }: { titulo: string; valor: string; color: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2 py-2">
      <div className="num text-xl font-semibold" style={{ color }}>{valor}</div>
      <div className="text-[10px] text-muted">{titulo}</div>
    </div>
  );
}

// Línea tipo electrocardiograma con los cambios de cada corte (el último punto es el más reciente).
function Latido({ valores }: { valores: number[] }) {
  const w = 1000, h = 70, max = Math.max(1, ...valores);
  const pts = valores.map((v, i) => `${(i / (valores.length - 1)) * w},${h - 6 - (v / max) * (h - 14)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16 block" preserveAspectRatio="none" aria-label="Cambios por corte de tiempo">
      {Array.from({ length: 11 }, (_, i) => <line key={i} x1={(i * w) / 10} y1={0} x2={(i * w) / 10} y2={h} stroke="rgb(140 170 255 / 0.07)" vectorEffect="non-scaling-stroke" />)}
      <polyline points={pts} fill="none" stroke="var(--green)" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 0 4px var(--green))" }} />
    </svg>
  );
}
