"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Loader2, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dinero, entero } from "@/lib/formato";

// Piezas de la lista de órdenes "estilo Effi" del agente (pedido del dueño, 11-nov-2026): el cliente con su centro de costos,
// documento, teléfono y dirección en una sola celda; totales; pago; historial del cliente (huella) y las transportadoras a la
// vista con su % de entrega en esa ciudad. Cambiar la dirección y anular la orden van a Effi por auto-convertir.

export type Huella = {
  entregadas: number; devoluciones: number; en_curso: number; ultima?: string;
  propias?: { entregadas: number; devoluciones: number }; matriz?: { total: number; entregadas: number; devoluciones: number };
};
export type TransporteCiudad = {
  id: number; nombre: string; entregadas: number; devoluciones: number;
  // Flete cobrado en la wallet (promedio de nuestras guías, 120 días): en la ciudad y en el departamento.
  flete?: number; flete_n?: number; flete_dev?: number; flete_dev_n?: number; flete_depto?: number; flete_depto_n?: number; flete_dev_depto?: number;
};
// Lo que se muestra al lado del % de entrega: el flete de ida (entregada) y el de devolución, y de dónde sale.
export type FleteOpcion = { ida: number | null; dev: number | null; fuente: string };

// Propuesta logística (tarifas en la tabla auto_propuesta_flete, que no va al repositorio), para cuando no hay guías propias
// ni de la matriz: flete con el descuento por volumen, más manejo y comisión de recaudo según el valor de la orden.
export type ParametrosPropuesta = {
  flete: number; manejo_pct?: number; manejo_decl_min?: number; manejo_min?: number; manejo_extra_recaudo?: number;
  rec_pct?: number; rec_min?: number; rec_fijo_hasta?: number; rec_fijo?: number; dev_recaudo?: boolean;
};
export function fletePropuesta(p: ParametrosPropuesta | undefined, valor: number, recaudo: boolean): FleteOpcion | null {
  if (!p?.flete) return null;
  const v = Math.max(0, valor || 0);
  const manejo = Math.max(p.manejo_min ?? 0, Math.max(v, p.manejo_decl_min ?? 0) * (p.manejo_pct ?? 0)) + (recaudo ? p.manejo_extra_recaudo ?? 0 : 0);
  const com = !recaudo ? 0 : p.rec_fijo_hasta != null && v <= p.rec_fijo_hasta ? p.rec_fijo ?? 0 : Math.max(p.rec_min ?? 0, v * (p.rec_pct ?? 0));
  return { ida: Math.round(p.flete + manejo + com), dev: Math.round(p.flete + manejo + (p.dev_recaudo ? com : 0)), fuente: "≈ propuesta" };
}
export type ExtraOrden = { huella?: Huella | null; transportadoras: TransporteCiudad[] };
export type AccionReciente = { tipo: "direccion" | "anular"; estado: "pendiente" | "ok" | "error"; mensaje: string | null; por: string | null; en: string };

// Lo que la celda necesita de la orden (subconjunto de OrdenAuto).
export type OrdenCelda = {
  sucursal: number; id: number; cliente: string | null; ciudad: string | null; provincia: string | null; total: number | null;
  recuperado: boolean; id_remision: number | null; estado: string; direccion_marcada?: string | null;
  centro_orden?: string | null; documento?: string | null; telefono?: string | null; direccion?: string | null;
  subtotal?: number | null; impuestos?: number | null; recaudo?: boolean | null; est_orden?: string | null;
  plan?: { remision?: Record<string, unknown>; guia?: Record<string, unknown>; resumen?: Record<string, unknown> } | null;
};

const pctTxt = (v: number) => `${v.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
export const direccionDe = (o: OrdenCelda) =>
  String(o.direccion ?? o.plan?.remision?.direccion_cliente ?? (o.plan?.guia?.direccion_destinatario as unknown[] | undefined)?.[0] ?? "").trim();

// Centro de costos por donde entró la orden: el de Effi; si todavía no llega, el que dice el cliente (*, +, **).
export function centroDe(o: OrdenCelda) {
  if (o.centro_orden) return o.centro_orden;
  const c = o.cliente?.trim() ?? "";
  return c.startsWith("**") ? "Abono" : c.startsWith("+") ? "Sin confirmar" : o.recuperado ? "Recuperado" : "Principal";
}
const colorCentro = (centro: string) => {
  const c = centro.toLowerCase();
  if (c.includes("abono")) return { background: "rgba(245,166,35,.15)", color: "#d9992b" };
  if (c.includes("sin confirmar")) return { background: "rgba(245,180,70,.15)", color: "#d9992b" };
  if (c.includes("recuper")) return { background: "rgba(180,140,255,.15)", color: "#b48cff" };
  return { background: "color-mix(in srgb, var(--tinte) 6%, transparent)", color: "var(--muted)" };
};

// Celda del cliente (como en Effi): nombre y centro de costos, identificación, teléfono (uno solo si son el mismo número),
// la dirección completa y, abajo, "Enviar a modificar dirección" (manda la orden a la pestaña donde se corrige). En esa
// pestaña la celda trae el formulario para cambiarla en Effi.
export function CeldaCliente({ o, cuenta, modo, accion, onCambio }: {
  o: OrdenCelda; cuenta: string; modo: "enviar" | "editar" | "ninguno"; accion?: AccionReciente | null; onCambio: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const centro = centroDe(o);
  const dir = direccionDe(o);
  const nombre = o.cliente?.replace(/^[\s*+]+/, "") || "—";
  const [tipoDoc, ...numDoc] = (o.documento ?? "").split(" ");
  const documento = numDoc.join(" ") || tipoDoc;
  const digitos = (t: string) => t.replace(/\D/g, "");
  const mismoNumero = !!documento && !!o.telefono && digitos(documento).slice(-8) === digitos(o.telefono).slice(-8);
  async function marcar(si: boolean) {
    setGuardando(true); setError(null);
    const { error: e } = await createClient().rpc("auto_marcar_direccion", { p_cuenta: cuenta, p_sucursal: o.sucursal, p_id: o.id, p_marcar: si });
    setGuardando(false);
    if (e) return setError(e.message);
    onCambio();
  }
  return (
    <div className="min-w-[16rem] max-w-[22rem] whitespace-normal text-xs leading-relaxed">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold">{nombre}</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={colorCentro(centro)} title="Centro de costos de la orden">{centro}</span>
      </div>
      {mismoNumero ? (
        <div><b>Identificación y teléfono:</b> {o.telefono}</div>
      ) : (
        <>
          {o.documento && <div><b>Identificación:</b> {numDoc.length ? `${tipoDoc} ${documento}` : documento}</div>}
          {o.telefono && <div><b>Teléfono:</b> {o.telefono}</div>}
        </>
      )}
      <div><b>Dirección:</b> {[o.provincia, o.ciudad, dir].filter(Boolean).join(" / ") || "—"}</div>
      {accion?.tipo === "direccion" && accion.estado === "pendiente" && <div className="mt-1 text-blue-2">⏳ Cambiando la dirección en Effi…</div>}
      {accion?.tipo === "direccion" && accion.estado === "error" && <div className="mt-1 text-red">⚠ {accion.mensaje}</div>}
      {accion?.tipo === "direccion" && accion.estado === "ok" && <div className="mt-1 text-green">✓ Dirección cambiada en Effi por {accion.por?.split("@")[0] ?? "una persona"}</div>}
      {error && <div className="mt-1 text-red">{error}</div>}
      {modo === "enviar" && (o.direccion_marcada ? (
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-blue/10 px-2 py-0.5 text-[11px] text-blue-2">
          📍 En «Modificar dirección»
          <button type="button" onClick={() => marcar(false)} disabled={guardando} className="text-muted underline hover:text-text">quitar</button>
        </div>
      ) : (
        <button type="button" onClick={() => marcar(true)} disabled={guardando}
          className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:border-tinte/30 hover:text-text disabled:opacity-60">
          <Pencil size={11} aria-hidden /> Enviar a modificar dirección
        </button>
      ))}
      {modo === "editar" && !editando && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1 rounded-md bg-blue px-2.5 py-1 text-[11px] font-semibold text-white">
            <Pencil size={11} aria-hidden /> Modificar dirección
          </button>
          {o.direccion_marcada && (
            <button type="button" onClick={() => marcar(false)} disabled={guardando} className="text-[11px] text-muted underline hover:text-text">Quitar de esta lista</button>
          )}
        </div>
      )}
      {editando && <EditarDireccion o={o} cuenta={cuenta} onCerrar={() => setEditando(false)} onCambio={onCambio} />}
    </div>
  );
}

type Ciudad = { pais_id: number; provincia_id: number; provincia: string; ciudad_id: number; ciudad: string };

function EditarDireccion({ o, cuenta, onCerrar, onCambio }: { o: OrdenCelda; cuenta: string; onCerrar: () => void; onCambio: () => void }) {
  const [q, setQ] = useState(o.ciudad ?? "");
  const [opciones, setOpciones] = useState<Ciudad[]>([]);
  const [ciudad, setCiudad] = useState<Ciudad | null>(null);
  const [direccion, setDireccion] = useState(direccionDe(o));
  const [referencia, setReferencia] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ciudad && q === `${ciudad.ciudad} (${ciudad.provincia})`) return;
    const t = setTimeout(async () => {
      if (q.trim().length < 2) return setOpciones([]);
      setBuscando(true);
      const { data } = await createClient().rpc("effi_ciudades_buscar", { p_cuenta: cuenta, p_q: q.replace(/\s*\(.*$/, "") });
      setBuscando(false);
      const lista = (data ?? []) as Ciudad[];
      setOpciones(lista);
      // Si la ciudad actual de la orden aparece tal cual, queda escogida.
      if (!ciudad) {
        const misma = lista.find((c) => c.ciudad.toLowerCase() === (o.ciudad ?? "").toLowerCase() && c.provincia.toLowerCase() === (o.provincia ?? "").toLowerCase());
        if (misma) { setCiudad(misma); setQ(`${misma.ciudad} (${misma.provincia})`); setOpciones([]); }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  async function guardar() {
    if (!ciudad) return setError("Escoge la ciudad de la lista.");
    if (direccion.trim().length < 5) return setError("Escribe la dirección completa.");
    setGuardando(true); setError(null);
    const { error: e } = await createClient().rpc("auto_orden_accion", {
      p_cuenta: cuenta, p_sucursal: o.sucursal, p_id: o.id, p_tipo: "direccion",
      p_datos: { ...ciudad, direccion: direccion.trim(), referencia: referencia.trim() || null },
    });
    setGuardando(false);
    if (e) return setError(e.message);
    onCerrar(); onCambio();
  }

  const campo = "w-full rounded-lg border border-line bg-bg px-2 py-1 text-xs text-text outline-none focus:border-blue/60";
  return (
    <div className="mt-2 space-y-1.5 rounded-xl border border-blue/40 bg-blue/5 p-2">
      <label className="block text-[10px] text-muted">Ciudad
        <input value={q} onChange={(e) => { setQ(e.target.value); setCiudad(null); }} className={`${campo} mt-0.5`} placeholder="Escribe la ciudad" />
      </label>
      {buscando && <div className="text-[10px] text-muted">Buscando…</div>}
      {!ciudad && opciones.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-line bg-bg">
          {opciones.map((c) => (
            <button key={c.ciudad_id} type="button" onClick={() => { setCiudad(c); setQ(`${c.ciudad} (${c.provincia})`); setOpciones([]); }}
              className="block w-full px-2 py-1 text-left text-xs hover:bg-tinte/5">{c.ciudad} <span className="text-muted">· {c.provincia}</span></button>
          ))}
        </div>
      )}
      {!ciudad && !buscando && q.trim().length >= 2 && !opciones.length && (
        <div className="text-[10px] text-amber">No encuentro esa ciudad en el catálogo de Effi de este país.</div>
      )}
      <label className="block text-[10px] text-muted">Dirección
        <textarea value={direccion} onChange={(e) => setDireccion(e.target.value)} rows={2} maxLength={255} className={`${campo} mt-0.5 resize-y`} />
      </label>
      <label className="block text-[10px] text-muted">Referencia (opcional)
        <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={255} className={`${campo} mt-0.5`} />
      </label>
      {error && <div className="text-[11px] text-red" role="alert">{error}</div>}
      <div className="flex gap-2">
        <button type="button" onClick={guardar} disabled={guardando}
          className="inline-flex items-center gap-1 rounded-full bg-blue px-3 py-1 text-[11px] font-bold text-white disabled:opacity-60">
          {guardando && <Loader2 size={11} className="animate-spin" aria-hidden />} Guardar en Effi
        </button>
        <button type="button" onClick={onCerrar} className="rounded-full border border-line px-3 py-1 text-[11px] font-semibold text-muted hover:text-text">Cancelar</button>
      </div>
      <div className="text-[10px] text-muted">Se cambia en la orden de Effi y el agente vuelve a preparar la remisión con la dirección nueva.</div>
    </div>
  );
}

// Valor de la venta: solo el total de la orden (con el desglose al pasar el mouse cuando hay impuestos).
export function CeldaTotales({ o, cuenta }: { o: OrdenCelda; cuenta: string }) {
  const desglose = o.subtotal != null && Number(o.impuestos) > 0
    ? `Subtotal ${dinero(Number(o.subtotal), cuenta)} + impuestos ${dinero(Number(o.impuestos), cuenta)}` : undefined;
  return <div className="num whitespace-nowrap text-right text-sm font-bold" title={desglose}>{dinero(o.total, cuenta)}</div>;
}

export function CeldaPago({ o }: { o: OrdenCelda }) {
  const abono = centroDe(o).toLowerCase().includes("abono");
  const recaudo = o.recaudo ?? !abono;
  return (
    <div className="whitespace-nowrap text-xs">
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${recaudo ? "bg-tinte/5 text-text" : "bg-amber/15 text-amber"}`}>
        {recaudo ? "Contraentrega" : abono ? "Abono" : "Pago anticipado"}
      </span>
      <div className="mt-1 text-muted">guía {recaudo ? "CON" : "SIN"} recaudo</div>
      {abono && <div className="mt-0.5 text-amber">Tesorería verifica el pago</div>}
    </div>
  );
}

export function CeldaHistorial({ h, duplicada }: { h?: Huella | null; duplicada?: number }) {
  const total = h ? Number(h.entregadas) + Number(h.devoluciones) : 0;
  return (
    <div className="min-w-[8rem] whitespace-normal text-xs leading-snug">
      {!h || (total === 0 && !h.en_curso) ? <span className="font-semibold text-blue-2">Nuevo</span> : (
        <>
          <div className="font-semibold">{entero(total)} {total === 1 ? "pedido" : "pedidos"}{total ? ` · ${pctTxt((h.entregadas / total) * 100)} entrega` : ""}</div>
          <div><span className="text-green">{entero(h.entregadas)} entregados</span> · <span className={h.devoluciones ? "text-red" : "text-muted"}>{entero(h.devoluciones)} devol.</span></div>
          {h.en_curso > 0 && <div className="text-blue-2">{entero(h.en_curso)} en curso</div>}
          <div className="text-[10px] text-muted">{[h.matriz && "huella histórica", h.propias && "nuestras guías"].filter(Boolean).join(" + ")}</div>
        </>
      )}
      {!!duplicada && <div className="mt-1 rounded-full bg-red/15 px-2 py-0.5 text-center text-[10px] font-semibold text-red">Duplicado · {duplicada + 1} órdenes abiertas</div>}
    </div>
  );
}

// Transportadoras a la vista: % de entrega y guías en esa ciudad. La recomendada es la de mayor % con al menos 10 guías.
export function CeldaTransportadoras({ ciudad, opciones, delPlan, recaudo, cuenta }: {
  ciudad: string | null; opciones: { id: number; nombre: string; entrega: number | null; guias: number | null; detalle?: string; flete?: FleteOpcion | null }[];
  delPlan: number | null; recaudo: boolean; cuenta: string;
}) {
  const conDato = opciones.filter((x) => x.entrega != null);
  const fuertes = conDato.filter((x) => (x.guias ?? 0) >= 10);
  const mejor = [...(fuertes.length ? fuertes : conDato)].sort((a, b) => Number(b.entrega) - Number(a.entrega) || Number(b.guias) - Number(a.guias))[0];
  const color = (p: number) => (p >= 80 ? "text-green" : p >= 65 ? "text-amber" : "text-red");
  // De arriba a abajo por % de entrega; las que no han ido a la ciudad, al final.
  const orden = [...opciones].sort((a, b) => Number(b.entrega ?? -1) - Number(a.entrega ?? -1));
  return (
    <div className="min-w-[17rem] max-w-[22rem] whitespace-normal text-xs">
      <div className="mb-1 flex justify-between gap-2 text-[10px] uppercase tracking-wider text-muted">
        <span>% entrega en {ciudad ?? "la ciudad"} · {recaudo ? "contraentrega" : "sin recaudo"}</span>
        <span className="shrink-0">Flete</span>
      </div>
      {orden.length ? (
        <div className="flex flex-col gap-1.5">
          {orden.map((t) => {
            const top = mejor?.id === t.id;
            const f = t.flete;
            return (
              <div key={t.id} title={[t.detalle, f && `Flete: ${f.fuente}`].filter(Boolean).join(" · ")}
                className={`relative flex items-center justify-between gap-2 rounded-lg border px-2 py-1 leading-tight ${top ? "mt-1.5 border-green bg-green/10" : "border-line bg-bg"}`}>
                {top && <span className="absolute -top-2 left-1 rounded-full bg-green px-1.5 text-[8px] font-bold uppercase text-black">Recomendada</span>}
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase">{t.nombre}{delPlan === t.id ? " 🤖" : ""}</div>
                  <div className={`text-[10px] ${t.entrega == null ? "text-muted" : color(t.entrega)}`}>
                    {t.entrega == null ? "sin envíos" : `${pctTxt(t.entrega)}${t.guias ? ` · ${entero(t.guias)} guías` : ""}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {f?.ida != null ? (
                    <>
                      <div className="text-[11px] font-bold tabular-nums">{dinero(f.ida, cuenta)}</div>
                      <div className="text-[9px] text-muted">{f.dev != null ? `dev. ${dinero(f.dev, cuenta)} · ` : ""}{f.fuente}</div>
                    </>
                  ) : <div className="text-[10px] text-muted">sin flete</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : <span className="text-muted">Sin datos de esta ciudad</span>}
      {mejor && <div className="mt-1 text-[10px] text-muted">Mejor entrega en {ciudad ?? "esta ciudad"}: <b className="text-text">{mejor.nombre}</b>{delPlan ? " · 🤖 la del plan del agente" : ""}</div>}
    </div>
  );
}

// Motivos de anulación: se escoge uno (para poder medirlos) y se puede agregar el detalle. Va a la observación de anulación
// de la orden en Effi y queda guardado en el Centro de Control.
const MOTIVOS_ANULAR = ["Cliente canceló", "Pedido duplicado", "No contesta / no confirma", "Dirección errada o incompleta",
  "Sin cobertura", "Sin stock", "Pedido de prueba", "Otro"];

export function AnularOrden({ o, cuenta, accion }: { o: OrdenCelda; cuenta: string; accion?: AccionReciente | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (accion?.tipo === "anular" && accion.estado === "pendiente") return <div className="text-[11px] text-blue-2">⏳ Anulando en Effi…</div>;
  async function anular() {
    if (!motivo) return setError("Escoge el motivo.");
    if (motivo === "Otro" && detalle.trim().length < 3) return setError("Escribe el motivo.");
    const texto = [motivo === "Otro" ? "" : motivo, detalle.trim()].filter(Boolean).join(": ");
    setGuardando(true); setError(null);
    const { error: e } = await createClient().rpc("auto_orden_accion", {
      p_cuenta: cuenta, p_sucursal: o.sucursal, p_id: o.id, p_tipo: "anular", p_datos: { motivo: texto, categoria: motivo },
    });
    setGuardando(false);
    if (e) return setError(e.message);
    setAbierto(false); router.refresh();
  }
  return (
    <div>
      {accion?.tipo === "anular" && accion.estado === "error" && <div className="mb-1 max-w-[14rem] whitespace-normal text-[11px] text-red">⚠ {accion.mensaje}</div>}
      {!abierto ? (
        <button type="button" onClick={() => setAbierto(true)}
          className="rounded-full border border-red/40 px-2.5 py-1 text-xs font-semibold text-red hover:bg-red/10">Anular</button>
      ) : (
        <div className="w-[15rem] space-y-1.5 whitespace-normal rounded-xl border border-red/40 bg-red/5 p-2">
          <div className="text-[11px] font-semibold text-red">Anular la orden {o.id} en Effi</div>
          {cuenta === "TIENDA_EC" && <div className="text-[10px] text-amber">Ecuador: anular la orden puede descuadrar LucidBot.</div>}
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo de la anulación"
            className="w-full rounded-md border border-line bg-bg px-2 py-1 text-[11px] text-text outline-none focus:border-red/60">
            <option value="">Motivo…</option>
            {MOTIVOS_ANULAR.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={180} placeholder={motivo === "Otro" ? "Escribe el motivo" : "Detalle (opcional)"}
            className="w-full rounded-md border border-line bg-bg px-2 py-1 text-[11px] text-text outline-none focus:border-red/60" />
          {error && <div className="text-[10px] text-red">{error}</div>}
          <div className="flex gap-1.5">
            <button type="button" onClick={anular} disabled={guardando} className="rounded-full bg-red px-2.5 py-0.5 text-[11px] font-bold text-white disabled:opacity-60">Sí, anular</button>
            <button type="button" onClick={() => { setAbierto(false); setError(null); }} className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted">No</button>
          </div>
          <div className="text-[10px] text-muted">El motivo queda escrito en la orden de Effi.</div>
        </div>
      )}
    </div>
  );
}

// Detalle de la orden al abrir la flecha de la fecha, como los conceptos de la remisión: ID del producto, producto, cantidad y
// total. Sale de la remisión que va a crear el agente; si todavía no hay plan, de los productos de la orden.
export function ProductosOrden({ o, articulos, cuenta }: { o: OrdenCelda; articulos?: { id: number; nombre: string }[] | null; cuenta: string }) {
  const rem = o.plan?.remision as { articulo?: number[]; descripcion?: string[]; cantidad?: number[]; precio?: number[] } | undefined;
  const filas = rem?.descripcion?.length
    ? rem.descripcion.map((d, i) => ({ id: rem.articulo?.[i] ?? null, nombre: d, cantidad: rem.cantidad?.[i] ?? null, precio: rem.precio?.[i] ?? null }))
    : (articulos ?? []).map((a) => ({ id: a.id, nombre: a.nombre, cantidad: null as number | null, precio: null as number | null }));
  if (!filas.length) return <div className="text-xs text-muted">La orden todavía no trae el detalle de productos.</div>;
  const total = filas.reduce((a, f) => a + (f.precio != null ? Number(f.precio) * Number(f.cantidad ?? 1) : 0), 0);
  return (
    <div className="max-w-2xl overflow-x-auto rounded-xl border border-line bg-bg">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-muted">
            <th className="px-3 py-2">ID producto</th><th className="px-3 py-2">Producto</th>
            <th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filas.map((f, i) => (
            <tr key={i}>
              <td className="px-3 py-1.5 font-mono">{f.id ?? "—"}</td>
              <td className="px-3 py-1.5 font-semibold">{f.nombre}</td>
              <td className="num px-3 py-1.5 text-right">{f.cantidad != null ? entero(f.cantidad) : "—"}</td>
              <td className="num px-3 py-1.5 text-right">{f.precio != null ? dinero(Number(f.precio) * Number(f.cantidad ?? 1), cuenta) : "—"}</td>
            </tr>
          ))}
          {filas.length > 1 && total > 0 && (
            <tr className="font-semibold"><td className="px-3 py-1.5" colSpan={3}>Total</td><td className="num px-3 py-1.5 text-right">{dinero(total, cuenta)}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
