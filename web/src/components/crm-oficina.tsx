"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, MessageCircle, PhoneCall, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dinero, entero, minutosDesde, transCorta, nombrePropio } from "@/lib/formato";
import { CON_FECHA, OBSERVACIONES, PREFIJO_OTRO, textoObservacion, type CodigoObs } from "@/lib/oficina";
import { infoCuenta } from "@/lib/paises";
import { BarraHorizontal } from "./barra-horizontal";

// CRM de "Disponible en oficina" con el mismo formato que el equipo usaba en Drive: por guía, Contacto 1, 2 y 3
// por llamada, cada uno Contactado / No contesta / No aplica, más una Observación de una lista cerrada (sin texto
// libre, para poder medirla). El WhatsApp lo envía el bot.
// Cada contacto queda guardado con hora y usuario, así se puede medir la efectividad; quién llenó cada casilla solo lo
// ve el dueño. La lista se actualiza sola cada minuto: lo que pasa a devolución o a entregada sale de aquí (la medición
// de qué pasó con lo que llegó a oficina está en el cuadre).
// "Hacer seguimiento" guarda el día en que el cliente pidió que lo llamen: desde ese día la guía va siempre arriba de la
// lista, resaltada, hasta que alguien cambie la observación (o la guía se entregue o se devuelva y salga sola).
// Pedido del dueño (19-nov-2026), para que las asesoras sepan por dónde empezar:
// - "🤝 Compromiso de retiro": toda guía con "realizará el retiro el…" sale de la lista inicial y queda en este filtro,
//   que se revisa cada día. Arriba las vencidas (el día prometido ya pasó y sigue en oficina): hay que volver a llamar.
// - "Ya realizó el retiro": 7 días arriba de la lista ("🔁 Volver a llamar") desde el día en que se marcó; si pasan los
//   7 días y Effi no la muestra entregada, sale de la lista inicial y va a "🚫 Dijo que fue y no fue".
// Buscando por guía, cliente o teléfono se encuentran en cualquier filtro.
// Arreglo del 20-nov-2026: la fila que la asesora está trabajando ya no desaparece al escoger la fecha de retiro o al marcar
// un contacto; se queda en la vista actual (con un aviso de a qué filtro pasa) hasta cambiar de filtro o recargar.

type Resultado = "contesto" | "no_contesto" | "telefono_malo";
export type Llamada = { id: number; intento: number; resultado: Resultado; canal: "llamada" | "whatsapp"; nota: string | null; usuario: string | null; creado_en: string };
export type GuiaOficina = {
  guia: string; transportadora: string | null; destinatario: string | null; id_destinatario: string | null; telefono: string | null;
  pais: string | null; ciudad: string | null; provincia: string | null; direccion: string | null; valor: number | null;
  contenido: string | null; centro_costos: string | null; remitente: string | null; estado: string | null; estado_efficommerce: string | null;
  fecha_trans: string | null; llegada: string | null;
  llamadas: Llamada[];
  observacion: { codigo: CodigoObs | null; fecha: string | null; texto: string | null; usuario: string | null; actualizado_en: string } | null;
};

export const RESULTADOS: Record<Resultado, { label: string; color: string }> = {
  contesto: { label: "CONTACTADO", color: "var(--green)" },
  no_contesto: { label: "NO CONTESTA", color: "var(--red)" },
  telefono_malo: { label: "NO APLICA", color: "#b48cff" },
};
const CONTACTOS = [
  { intento: 1, label: "C1", canal: "llamada" },
  { intento: 2, label: "C2", canal: "llamada" },
  { intento: 3, label: "C3", canal: "llamada" },
] as const;
const FILTROS = [
  { id: "todas", label: "Todas" },
  { id: "volver", label: "🔁 Volver a llamar" },
  { id: "seguimiento", label: "📌 Seguimiento hoy" },
  { id: "compromiso", label: "🤝 Compromiso de retiro" },
  { id: "no_fue", label: "🚫 Dijo que fue y no fue" },
  { id: "sin_llamar", label: "Sin contactar" },
  { id: "contesto", label: "Contactado" },
  { id: "no_contesto", label: "No contesta" },
  { id: "telefono_malo", label: "No aplica" },
] as const;
const POR_PAGINA = 60;
const DIAS_YA_RETIRO = 7; // "ya realizó el retiro": días arriba de la lista antes de pasar a "Dijo que fue y no fue"
const MORADO = "#b48cff";
// Hora local de cada tienda e indicativo para abrir WhatsApp.

// Un campo puede traer varios teléfonos: "300 123 4567 / 311..." → cada uno con su botón (sin repetir).
const telefonos = (t: string | null) => [...new Set((t ?? "").split(/[,;/|]| - /).map((x) => x.replace(/[^\d+]/g, "")).filter((x) => x.length >= 7))];
const whatsapp = (tel: string, cuenta: string) => {
  const d = tel.replace(/\D/g, ""), ind = infoCuenta(cuenta).indicativo;
  return `https://wa.me/${d.startsWith(ind) && d.length > 10 ? d : ind + d.replace(/^0+/, "")}`;
};

// Efectividad del contacto medida por entregas (oficina_efectividad): de las guías contactadas en 14 días, cuántas se
// entregaron, y cuántas de ellas se entregaron hoy.
export type Efectividad = { contactadas: number; entregadas: number; entregadas_hoy: number };

export function CrmOficina({ cuenta, guias, verEquipo = false, ingresaronHoy, efectividad, plataforma = "Effi", desde, hasta, personas }: {
  cuenta: string; guias: GuiaOficina[]; ingresaronHoy?: number; efectividad?: Efectividad | null;
  // Dueño, socios y la encargada con «Gestiones del equipo»: ven quién hizo cada contacto y filtran por persona y día.
  verEquipo?: boolean; desde?: string; hasta?: string; personas?: { email: string; nombre: string }[];
  plataforma?: string; // de dónde salen las guías: Effi, u Others en «Disp. en oficina (Others)» (24-nov-2026)
}) {
  const router = useRouter();
  // Cada minuto se vuelve a pedir la lista: las guías que Effi pasó a devolución o a entregada desaparecen sin que nadie
  // las llame.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [router]);
  const quien = (email: string | null) => (email ? email.split("@")[0] : "");
  const zona = infoCuenta(cuenta).zona;
  const hora = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: zona, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const dia = (iso: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(iso));
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todas");
  const [buscar, setBuscar] = useState("");
  const [persona, setPersona] = useState(""); // «Gestiones de»: solo las guías que esa persona trabajó en los días del calendario
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  // Cambios guardados en esta sesión, para verlos al instante antes de que la página se refresque.
  const [locales, setLocales] = useState<Record<string, Llamada[]>>({});
  // Guías tocadas en esta vista (contacto u observación): no se esconden mientras la asesora sigue trabajándolas.
  const [quedan, setQuedan] = useState<Set<string>>(new Set());
  const quedarse = (guia: string) => setQuedan((x) => (x.has(guia) ? x : new Set(x).add(guia)));
  useEffect(() => { setQuedan(new Set()); }, [filtro]);
  const [obs, setObs] = useState<Record<string, { codigo: CodigoObs | ""; fecha: string | null; texto?: string }>>({});
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set()); // fichas con todos los datos a la vista (celular)
  const [copiada, setCopiada] = useState<string | null>(null);

  const llamadasDe = (g: GuiaOficina) => {
    const m = new Map(g.llamadas.map((l) => [l.intento, l]));
    (locales[g.guia] ?? []).forEach((l) => m.set(l.intento, l));
    return [...m.values()].sort((a, b) => a.intento - b.intento);
  };
  const hoy = dia(new Date());
  // Seguimiento que ya toca (su día es hoy o ya pasó): con lo recién guardado en esta sesión.
  const seguimiento = (g: GuiaOficina) => {
    const o = obs[g.guia] ?? { codigo: g.observacion?.codigo ?? "", fecha: g.observacion?.fecha ?? null };
    return o.codigo === "seguimiento" && !!o.fecha && o.fecha <= hoy ? o.fecha : null;
  };
  // Lo que el cliente dijo sobre el retiro, con la etiqueta de la fila. Lo cambiado en esta sesión manda.
  //   tipo "compromiso": dio un día para retirar (vencida = el día ya pasó y sigue en oficina, o la fecha quedó mal puesta).
  //   tipo "ya_retiro": dijo que ya retiró hace 7 días o menos (va arriba de la lista).
  //   tipo "no_fue": dijo que ya retiró hace más de 7 días y la guía sigue en oficina.
  type Marca = { tipo: "compromiso" | "ya_retiro" | "no_fue"; vencida: boolean; orden: number; etiqueta: string; titulo: string };
  const marca = (g: GuiaOficina): Marca | null => {
    const o = g.observacion, local = obs[g.guia];
    const codigo = local ? local.codigo : o?.codigo ?? "", fecha = local ? local.fecha : o?.fecha ?? null;
    if (codigo === "ya_retiro") {
      const desde = !local && o?.codigo === "ya_retiro" ? o.actualizado_en : new Date().toISOString();
      const h = (Date.now() - Date.parse(desde)) / 3_600_000;
      const d = Math.round((Date.parse(hoy) - Date.parse(dia(desde))) / 86_400_000);
      const cuando = h >= 48 ? `${Math.floor(h / 24)} d` : `${Math.floor(h)} h`;
      return d > DIAS_YA_RETIRO
        ? { tipo: "no_fue", vencida: true, orden: -h, etiqueta: `🚫 Dijo que retiró · hace ${cuando}`,
            titulo: `Marcado "ya retiró" el ${hora(desde)} y en ${DIAS_YA_RETIRO} días ${plataforma} no la mostró entregada: volver a llamar` }
        : { tipo: "ya_retiro", vencida: false, orden: -h, etiqueta: `❓ Dijo que retiró · hace ${cuando}`,
            titulo: `Marcado "ya retiró" el ${hora(desde)}; ${plataforma} todavía no la muestra entregada` };
    }
    if (codigo !== "retira_fecha" || !fecha) return null;
    // Fecha imposible (año mal escrito o anterior al día en que se marcó): hay que llamar y corregirla.
    const marcado = local || !o ? hoy : dia(o.actualizado_en);
    if (fecha < marcado || fecha.slice(0, 4) < hoy.slice(0, 4))
      return { tipo: "compromiso", vencida: true, orden: Date.parse(fecha), etiqueta: `⚠️ Fecha mal puesta: ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`,
        titulo: "La fecha de retiro quedó mal escrita: llama al cliente y vuelve a escoger el día" };
    const dm = `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
    if (fecha < hoy) {
      const d = Math.round((Date.parse(hoy) - Date.parse(fecha)) / 86_400_000);
      return { tipo: "compromiso", vencida: true, orden: Date.parse(fecha), etiqueta: `⏰ Prometió ${dm} · no ha ido`,
        titulo: `Dijo que retiraba el ${dm} (hace ${d} ${d === 1 ? "día" : "días"}) y sigue en oficina: volver a llamar` };
    }
    return { tipo: "compromiso", vencida: false, orden: Date.parse(fecha), etiqueta: `🤝 Retira ${fecha === hoy ? "hoy" : dm}`,
      titulo: `Se comprometió a retirar el ${dm}` };
  };
  // "Volver a llamar" (arriba de la lista inicial): solo "ya retiró" de los últimos 7 días.
  const volverALlamar = (g: GuiaOficina) => { const m = marca(g); return m?.tipo === "ya_retiro" ? m : null; };
  // Gestiones de una persona en los días del calendario (hoy si no hay calendario): contactos marcados u observación.
  const ini = desde ?? hoy, fin = hasta ?? hoy;
  const gestiono = (g: GuiaOficina, em: string) => {
    const en = (iso: string) => { const d = dia(iso); return d >= ini && d <= fin; };
    return llamadasDe(g).some((l) => l.usuario === em && en(l.creado_en)) || (g.observacion?.usuario === em && en(g.observacion.actualizado_en));
  };
  // A quién se puede escoger: la gente de «Quién hizo qué» y, si no llegó, quien aparezca en las guías.
  const gente = useMemo(() => {
    if (!verEquipo) return [];
    const m = new Map((personas ?? []).map((p) => [p.email, p.nombre]));
    for (const g of guias) {
      for (const l of g.llamadas) if (l.usuario && !m.has(l.usuario)) m.set(l.usuario, l.usuario.split("@")[0]);
      if (g.observacion?.usuario && !m.has(g.observacion.usuario)) m.set(g.observacion.usuario, g.observacion.usuario.split("@")[0]);
    }
    return [...m].map(([email, nombre]) => ({ email, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [verEquipo, personas, guias]);
  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return guias.filter((g) => {
      // Escogida una persona, se ven todas sus guías del periodo, también las de compromiso o «dijo que fue».
      if (persona && !gestiono(g, persona)) return false;
      if (!q && quedan.has(g.guia)) return true;
      const ult = llamadasDe(g).at(-1);
      const m = marca(g);
      if (filtro === "compromiso") { if (m?.tipo !== "compromiso") return false; }
      else if (filtro === "no_fue") { if (m?.tipo !== "no_fue") return false; }
      // Las de compromiso y las de "dijo que fue y no fue" no salen en la lista inicial ni en los otros filtros (sí al buscar).
      else if (!q && !persona && (m?.tipo === "compromiso" || m?.tipo === "no_fue")) return false;
      if (filtro === "seguimiento" && !seguimiento(g)) return false;
      if (filtro === "volver" && !volverALlamar(g)) return false;
      if (filtro === "sin_llamar" && ult) return false;
      if (["contesto", "no_contesto", "telefono_malo"].includes(filtro) && ult?.resultado !== filtro) return false;
      return !q || [g.guia, g.destinatario, g.telefono, g.ciudad, g.contenido, g.transportadora, g.observacion?.texto].some((x) => (x ?? "").toLowerCase().includes(q));
    // Arriba: primero lo que toca volver a llamar ("ya retiró" reciente, compromisos vencidos y "dijo que fue y no fue"; lo
    // más atrasado primero), luego los seguimientos que ya tocan; en Compromiso, después de las vencidas, por día prometido.
    }).map((g, i) => { const m = marca(g); return { g, i, m, r: m && (m.tipo !== "compromiso" || m.vencida) ? m.orden : null, s: seguimiento(g) }; })
      .sort((a, b) => (a.r != null ? 0 : 1) - (b.r != null ? 0 : 1) || (a.r != null && b.r != null ? a.r - b.r : 0)
        || (a.s ? 0 : 1) - (b.s ? 0 : 1) || (a.s && b.s ? a.s.localeCompare(b.s) : 0)
        || (a.m && b.m ? a.m.orden - b.m.orden : 0) || a.i - b.i)
      .map((x) => x.g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guias, filtro, buscar, locales, obs, hoy, quedan, persona, ini, fin]);
  const marcas = guias.map((g) => marca(g));
  const fuera = (i: number) => marcas[i]?.tipo === "compromiso" || marcas[i]?.tipo === "no_fue";
  const porSeguir = guias.filter((g, i) => !fuera(i) && seguimiento(g)).length;
  const porVolver = marcas.filter((m) => m?.tipo === "ya_retiro").length;
  const porCompromiso = marcas.filter((m) => m?.tipo === "compromiso").length;
  const vencidos = marcas.filter((m) => m?.tipo === "compromiso" && m.vencida).length;
  const porNoFue = marcas.filter((m) => m?.tipo === "no_fue").length;

  const todas = guias.flatMap((g) => llamadasDe(g));
  const deHoy = todas.filter((l) => dia(l.creado_en) === hoy);
  const sinContactar = guias.filter((g) => !llamadasDe(g).length).length;

  async function marcar(g: GuiaOficina, intento: number, canal: "llamada" | "whatsapp", resultado: Resultado | "") {
    if (!resultado) return;
    quedarse(g.guia);
    setGuardando(`${g.guia}|${intento}`); setError(null);
    const supabase = createClient();
    const actual = llamadasDe(g).find((l) => l.intento === intento);
    const q = actual
      ? supabase.from("oficina_llamadas").update({ resultado }).eq("id", actual.id)
      : supabase.from("oficina_llamadas").insert({ cuenta, guia: g.guia, resultado, canal });
    const { data, error: e } = await q.select("id,intento,resultado,canal,nota,usuario_email,creado_en").single();
    setGuardando(null);
    if (e || !data) { setError(e?.message ?? "No se pudo guardar el contacto"); return; }
    setLocales((x) => ({ ...x, [g.guia]: [...(x[g.guia] ?? []).filter((l) => l.intento !== data.intento), { ...data, usuario: data.usuario_email } as Llamada] }));
    router.refresh();
  }
  // Guarda la observación elegida. "Retirará el…" espera a que se escoja la fecha en el calendario y "Otro" a que se
  // escriba lo que dijo el cliente.
  async function guardarObs(g: GuiaOficina, codigo: CodigoObs | "", fecha: string | null, texto?: string) {
    setObs((o) => ({ ...o, [g.guia]: { codigo, fecha, texto } }));
    quedarse(g.guia);
    if (CON_FECHA.includes(codigo as CodigoObs) && !fecha) return;
    // El calendario no deja escoger días pasados, pero escribiendo la fecha sí: se frena aquí (y años mal escritos).
    if (fecha && (fecha < hoy || fecha.slice(0, 4) > String(Number(hoy.slice(0, 4)) + 1))) { setError("Esa fecha no sirve: escoge un día de hoy en adelante."); return; }
    if (codigo === "otro" && !(texto ?? "").trim()) return;
    setGuardando(`${g.guia}|obs`); setError(null);
    const supabase = createClient();
    const fila: { cuenta: string; guia: string; codigo: CodigoObs | null; fecha_compromiso: string | null; observacion: string | null } = codigo
      ? { cuenta, guia: g.guia, codigo, fecha_compromiso: CON_FECHA.includes(codigo) ? fecha : null, observacion: textoObservacion(codigo, fecha, texto).slice(0, 1000) }
      : { cuenta, guia: g.guia, codigo: null, fecha_compromiso: null, observacion: null };
    const { error: e } = await supabase.from("oficina_observaciones").upsert(fila);
    setGuardando(null);
    if (e) setError(e.message); else router.refresh();
  }
  const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); setCopiada(t); setTimeout(() => setCopiada(null), 1200); } catch { /* sin portapapeles */ } };

  return (
    <div className="space-y-3">
      {/* Compromisos de retiro vencidos: la tarea de cada día (están en su propio filtro, no en la lista inicial). */}
      {vencidos > 0 && (
        <button onClick={() => { setFiltro("compromiso"); setMostrar(POR_PAGINA); }}
          className="w-full flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-left"
          style={{ borderColor: `${MORADO}80`, background: `${MORADO}1a` }}>
          <span className="text-2xl">🤝</span>
          <span className="font-display text-lg font-semibold" style={{ color: MORADO }}>
            {vencidos === 1 ? "1 compromiso de retiro vencido" : `${entero(vencidos)} compromisos de retiro vencidos`}
          </span>
          <span className="text-xs text-muted">Dijeron que retiraban un día que ya pasó y la guía sigue en oficina: volver a llamar. Están en el filtro «Compromiso de retiro».</span>
        </button>
      )}
      {/* Dijo que ya retiró (últimos 7 días) y la guía sigue en oficina: arriba de la lista. */}
      {porVolver > 0 && (
        <button onClick={() => { setFiltro("volver"); setMostrar(POR_PAGINA); }}
          className="w-full flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-left"
          style={{ borderColor: `${MORADO}80`, background: `${MORADO}1a` }}>
          <span className="text-2xl">🔁</span>
          <span className="font-display text-lg font-semibold" style={{ color: MORADO }}>
            {porVolver === 1 ? "1 cliente dijo que ya retiró" : `${entero(porVolver)} clientes dijeron que ya retiraron`}
          </span>
          <span className="text-xs text-muted">La guía sigue en oficina. Van de primeras en la lista por {DIAS_YA_RETIRO} días; después pasan a «Dijo que fue y no fue».</span>
        </button>
      )}
      {/* Clientes que pidieron que los llamen hoy (o antes y siguen pendientes): siempre a la vista. */}
      {porSeguir > 0 && (
        <button onClick={() => { setFiltro("seguimiento"); setMostrar(POR_PAGINA); }}
          className="w-full flex flex-wrap items-center gap-3 rounded-2xl border border-naranja/50 bg-naranja/10 px-4 py-3 text-left hover:bg-naranja/15">
          <span className="text-2xl">📌</span>
          <span className="font-display text-lg font-semibold text-naranja">
            {porSeguir === 1 ? "1 cliente para hacer seguimiento hoy" : `${entero(porSeguir)} clientes para hacer seguimiento hoy`}
          </span>
          <span className="text-xs text-muted">Pidieron que los llamaran hoy o antes y la guía sigue en oficina. Van de primeras en la lista.</span>
        </button>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Indicador titulo="En oficina ahora" valor={entero(guias.length)} color="var(--blue-2)" />
        <Indicador titulo="Sin contactar" valor={entero(sinContactar)} color="var(--amber)" />
        <Indicador titulo="Ingresaron a oficina hoy" valor={ingresaronHoy != null ? entero(ingresaronHoy) : "—"} color="var(--blue)" />
        <Indicador titulo="Contactados hoy" valor={entero(deHoy.filter((l) => l.resultado === "contesto").length)} color="var(--green)"
          sub={`de ${entero(deHoy.length)} contactos marcados hoy`} />
        {/* Lo que importa: de lo que se contactó, cuánto se entregó. Sube con cada entrega. */}
        <Indicador titulo="Efectividad del contacto" color="var(--green)" destacado
          valor={efectividad?.contactadas ? `${Math.round((efectividad.entregadas / efectividad.contactadas) * 100)}%` : "—"}
          sub={efectividad ? `${entero(efectividad.entregadas)} de ${entero(efectividad.contactadas)} contactadas ya entregadas · +${entero(efectividad.entregadas_hoy)} hoy` : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => {
          // Lo urgente (hay que llamar ya) zumba y va en rojo mientras no esté elegido.
          const pendientes = f.id === "volver" ? porVolver : f.id === "seguimiento" ? porSeguir : f.id === "compromiso" ? vencidos : f.id === "no_fue" ? porNoFue : 0;
          const activo = filtro === f.id, urgente = pendientes > 0 && !activo;
          return (
            // Tocar el filtro elegido lo quita y vuelve a «Todas».
            <button key={f.id} aria-pressed={activo} onClick={() => { setFiltro((x) => (x === f.id ? "todas" : f.id)); setMostrar(POR_PAGINA); }}
              title={activo && f.id !== "todas" ? "Tocar otra vez para quitar el filtro" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${activo ? "border-blue/50 bg-blue/15 text-text"
                : urgente ? "zumbido border-red/50 bg-red/10 text-text hover:bg-red/15" : "border-line text-muted hover:text-text"}`}>
              {urgente && <span className="pulso size-1.5 rounded-full bg-red shadow-[0_0_8px_var(--red)]" />}
              {f.label}{f.id === "seguimiento" ? ` (${entero(porSeguir)})` : f.id === "volver" ? ` (${entero(porVolver)})`
                : f.id === "compromiso" ? ` (${entero(porCompromiso)}${vencidos ? ` · ${entero(vencidos)} vencidos` : ""})` : f.id === "no_fue" ? ` (${entero(porNoFue)})` : ""}
              {activo && f.id !== "todas" && <span aria-hidden className="ml-0.5 text-muted">✕</span>}
            </button>
          );
        })}
        {verEquipo && gente.length > 0 && (
          <select value={persona} onChange={(e) => { setPersona(e.target.value); setMostrar(POR_PAGINA); }}
            title={`Las guías en oficina que esa persona contactó o gestionó ${ini === fin ? (ini === hoy ? "hoy" : `el ${ini}`) : `del ${ini} al ${fin}`}`}
            className={`h-8 rounded-full border px-3 text-xs font-semibold max-md:h-10 max-md:w-full ${persona ? "border-blue/50 bg-blue/15 text-text" : "border-line bg-transparent text-muted"}`}>
            <option value="" className="bg-bg">Gestiones de: todo el equipo</option>
            {gente.map((p) => <option key={p.email} value={p.email} className="bg-bg">{nombrePropio(p.nombre)}</option>)}
          </select>
        )}
        <label className="ml-auto flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm max-md:w-full">
          <Search size={14} className="text-muted" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Guía, cliente, teléfono, ciudad, producto u observación"
            className="bg-transparent outline-none w-72 min-w-0 max-md:flex-1 placeholder:text-muted" />
        </label>
      </div>
      {error && <p className="text-sm text-red">{error}</p>}

      <BarraHorizontal>
        <table className="fichas w-full min-w-max text-sm">
          <thead>
            <tr className="bg-green/15 text-left text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">
              <th className="sticky left-0 z-10 bg-verde-fondo px-2 py-3">Llegó</th>
              <th className="px-2 py-3">C. costos</th>
              <th className="px-2 py-3">Creada</th>
              <th className="px-2 py-3">Destinatario</th>
              <th className="px-2 py-3">Depto.</th>
              <th className="px-2 py-3">Ciudad</th>
              <th className="px-2 py-3">Dirección</th>
              <th className="px-2 py-3">Teléfonos</th>
              <th className="px-2 py-3">Trans.</th>
              <th className="px-2 py-3">Guía</th>
              <th className="px-2 py-3 text-right">Recaudo</th>
              <th className="px-2 py-3">Contenido</th>
              <th className="px-2 py-3">Est. guía</th>
              <th className="px-2 py-3">Est. global</th>
              {CONTACTOS.map((c) => <th key={c.intento} className="px-2 py-3">{c.label}</th>)}
              <th className="px-2 py-3 min-w-[14rem]">Observación</th>
              {verEquipo && <th className="px-2 py-3">Quién lo hizo</th>}
            </tr>
          </thead>
          <tbody className="md:divide-y md:divide-line">
            {lista.slice(0, mostrar).map((g) => {
              const ls = llamadasDe(g);
              const dias = g.llegada ? (Date.now() - Date.parse(g.llegada)) / 86_400_000 : 0;
              const tels = telefonos(g.telefono);
              const seg = seguimiento(g);
              // Etiqueta morada: "ya retiró", compromiso vencido o "dijo que fue y no fue". Compromiso por venir: etiqueta verde.
              const m = marca(g);
              const ret = m && (m.tipo !== "compromiso" || m.vencida) ? m : null;
              const porVenir = m && m.tipo === "compromiso" && !m.vencida ? m : null;
              // En celular, lo que casi no se usa al llamar queda detrás de "Ver más datos".
              const extra = abiertas.has(g.guia) ? "" : "max-md:hidden";
              return (
                <tr key={g.guia} className={`align-middle ${seg && !ret ? "bg-naranja/[0.07] hover:bg-naranja/[0.11]" : "hover:bg-tinte/[0.02]"}`}
                  style={ret ? { background: `${MORADO}12` } : undefined}>
                  <td data-l="Llegó" className={`max-md:order-1 sticky left-0 z-10 px-2 py-2 whitespace-nowrap text-xs font-mono ${seg && !ret ? "bg-naranja-fondo shadow-[inset_3px_0_0_var(--naranja)]" : "bg-panel"} ${dias >= 3 ? "text-red" : dias >= 1 ? "text-amber" : "text-muted"}`}
                    style={ret ? { boxShadow: `inset 3px 0 0 ${MORADO}` } : undefined} title={g.llegada ? hora(g.llegada) : ""}>
                    {ret && (
                      <div className="mb-1 inline-block rounded-full px-2 py-0.5 font-sans text-[10px] font-bold text-black" style={{ background: MORADO }} title={ret.titulo}>
                        {ret.etiqueta}
                      </div>
                    )}
                    {porVenir && (
                      <div className="mb-1 inline-block rounded-full bg-green px-2 py-0.5 font-sans text-[10px] font-bold text-black" title={porVenir.titulo}>
                        {porVenir.etiqueta}
                      </div>
                    )}
                    {m && (m.tipo === "compromiso" || m.tipo === "no_fue") && filtro !== m.tipo && quedan.has(g.guia) && (
                      <div className="mb-1 max-w-[9rem] whitespace-normal font-sans text-[10px] leading-tight text-muted">
                        Queda guardada en {m.tipo === "compromiso" ? "«🤝 Compromiso de retiro»" : "«🚫 Dijo que fue y no fue»"}
                      </div>
                    )}
                    {seg && !ret && (
                      <div className="mb-1 inline-block rounded-full bg-naranja px-2 py-0.5 font-sans text-[10px] font-bold text-black">
                        📌 {seg === hoy ? "Hoy" : `${seg.slice(8, 10)}/${seg.slice(5, 7)}`}
                      </div>
                    )}
                    <div suppressHydrationWarning>{minutosDesde(g.llegada)}</div>
                  </td>
                  <td data-l="C. costos" className={`max-md:order-16 ${extra} px-2 py-2 whitespace-nowrap`}>{g.centro_costos ?? "—"}</td>
                  <td data-l="Creada" className={`max-md:order-17 ${extra} px-2 py-2 whitespace-nowrap text-xs text-muted`}>{g.fecha_trans ? hora(g.fecha_trans) : "—"}</td>
                  <td data-l="Destinatario" className="max-md:order-3 max-md:col-span-6 px-2 py-2 max-w-[9rem] truncate font-semibold" title={g.destinatario ?? ""}>{g.destinatario ?? "—"}</td>
                  <td data-l="Depto." className="max-md:order-9 px-2 py-2 max-w-[5.5rem] truncate" title={g.provincia ?? ""}>{g.provincia ?? "—"}</td>
                  <td data-l="Ciudad" className="max-md:order-8 px-2 py-2 max-w-[5.5rem] truncate" title={g.ciudad ?? ""}>{g.ciudad ?? "—"}</td>
                  <td data-l="Dirección" className="max-md:order-10 max-md:col-span-6 px-2 py-2 min-w-[9rem] max-w-[11rem] text-xs text-muted"><div className="md:line-clamp-2" title={g.direccion ?? ""}>{g.direccion ?? "—"}</div></td>
                  <td data-l="Teléfonos" className="max-md:order-5 max-md:col-span-6 px-2 py-2">
                    <div className="flex flex-col gap-1 max-md:gap-2">
                      {tels.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 max-md:gap-2">
                          <a href={`tel:${t}`} title="Llamar" className="inline-flex items-center gap-1 rounded-lg border border-green/40 bg-green/10 px-2 py-0.5 max-md:flex-1 max-md:justify-center max-md:py-2 max-md:text-sm font-mono text-xs font-semibold text-green hover:bg-green/20">
                            <PhoneCall size={12} />{t}
                          </a>
                          <a href={whatsapp(t, cuenta)} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp" className="rounded-lg border border-green/40 p-1 max-md:p-2.5 text-green hover:bg-green/20">
                            <MessageCircle size={12} />
                          </a>
                        </span>
                      ))}
                      {!tels.length && <span className="text-xs text-red">Sin teléfono</span>}
                    </div>
                  </td>
                  <td data-l="Trans." className="max-md:order-12 px-2 py-2 whitespace-nowrap" title={g.transportadora ?? ""}>{transCorta(g.transportadora)}</td>
                  <td data-l="Guía" className="max-md:order-11 px-2 py-2 whitespace-nowrap">
                    <button onClick={() => copiar(g.guia)} title="Copiar guía" className="group inline-flex items-center gap-1 font-mono font-semibold hover:text-blue-2">
                      {g.guia}<Copy size={11} className="opacity-40 group-hover:opacity-100" />
                    </button>
                    {copiada === g.guia && <span className="ml-1 text-[10px] text-green">copiada</span>}
                  </td>
                  <td data-l="Recaudo" className="max-md:order-2 px-2 py-2 text-right num whitespace-nowrap max-md:font-semibold">{dinero(g.valor, cuenta)}</td>
                  <td data-l="Contenido" className="max-md:order-4 max-md:col-span-6 px-2 py-2 min-w-[7rem] max-w-[10rem] font-semibold text-blue-2"><div className="md:line-clamp-2" title={g.contenido ?? ""}>{g.contenido ?? "—"}</div></td>
                  <td data-l="Est. guía" className={`max-md:order-13 ${extra} px-2 py-2 max-w-[7rem] truncate text-xs`} title={g.estado ?? ""}>{g.estado ?? "—"}</td>
                  <td data-l="Est. global" className={`max-md:order-14 ${extra} px-2 py-2 max-w-[7rem] truncate text-xs`} title={g.estado_efficommerce ?? ""}>{g.estado_efficommerce ?? "—"}</td>
                  {CONTACTOS.map((c) => {
                    const l = ls.find((x) => x.intento === c.intento);
                    // Se llena en orden: el contacto 2 se habilita cuando ya hay contacto 1, y así.
                    const habilitado = !!l || ls.length === c.intento - 1;
                    const col = l ? RESULTADOS[l.resultado].color : null;
                    return (
                      <td key={c.intento} data-l={c.label} className="max-md:order-6 max-md:col-span-2 px-2 py-2">
                        <div className="relative">
                        <select value={l?.resultado ?? ""} disabled={!habilitado || guardando === `${g.guia}|${c.intento}`}
                          onChange={(e) => marcar(g, c.intento, c.canal, e.target.value as Resultado | "")}
                          title={l ? `${hora(l.creado_en)}${l.usuario ? ` · ${l.usuario}` : ""}` : habilitado ? `Marcar ${c.label}` : "Primero el contacto anterior"}
                          className="w-[7.5rem] rounded-full border px-2 py-1 text-xs font-semibold outline-none disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed max-md:appearance-none max-md:text-transparent!"
                          style={col ? { color: col, borderColor: `color-mix(in srgb, ${col} 50%, transparent)`, background: `color-mix(in srgb, ${col} 14%, transparent)` } : { borderColor: "var(--line)", background: "color-mix(in srgb, var(--tinte) 3%, transparent)" }}>
                          <option value="" className="bg-bg text-text">—</option>
                          {(Object.keys(RESULTADOS) as Resultado[]).map((r) => <option key={r} value={r} className="bg-bg text-text">{RESULTADOS[r].label}</option>)}
                        </select>
                        <span className={`pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[11px] font-semibold leading-tight md:hidden ${habilitado ? "" : "opacity-35"}`} style={{ color: col ?? "var(--muted)" }}>
                          {l ? RESULTADOS[l.resultado].label : "—"}
                        </span>
                        </div>
                        {verEquipo && l?.usuario && <div className="mt-0.5 max-w-[7.5rem] truncate text-center text-[10px] text-muted">{quien(l.usuario)} · {hora(l.creado_en)}</div>}
                      </td>
                    );
                  })}
                  <td data-l="Observación" className="max-md:order-7 max-md:col-span-6 px-2 py-2">
                    {(() => {
                      const actual = obs[g.guia] ?? {
                        codigo: g.observacion?.codigo ?? "", fecha: g.observacion?.fecha ?? null,
                        texto: g.observacion?.codigo === "otro" ? (g.observacion.texto ?? "").replace(PREFIJO_OTRO, "") : undefined,
                      };
                      const guardado = g.observacion?.codigo === "otro" ? (g.observacion.texto ?? "").replace(PREFIJO_OTRO, "") : "";
                      const col = actual.codigo ? OBSERVACIONES[actual.codigo].color : null;
                      return (
                        <div className="flex max-w-[17rem] flex-wrap items-center gap-1.5"
                          title={g.observacion?.usuario ? `Última edición: ${hora(g.observacion.actualizado_en)} · ${g.observacion.usuario}` : undefined}>
                          <select value={actual.codigo} onChange={(e) => guardarObs(g, e.target.value as CodigoObs | "", null)}
                            className="max-w-full rounded-lg border px-2 py-1 text-xs outline-none cursor-pointer"
                            style={col ? { color: col, borderColor: `color-mix(in srgb, ${col} 45%, transparent)`, background: `color-mix(in srgb, ${col} 10%, transparent)` } : { borderColor: "var(--line)", background: "color-mix(in srgb, var(--tinte) 3%, transparent)" }}>
                            <option value="" className="bg-bg text-text">— Seleccionar observación —</option>
                            {(Object.keys(OBSERVACIONES) as CodigoObs[]).map((c) => <option key={c} value={c} className="bg-bg text-text">{OBSERVACIONES[c].label}</option>)}
                          </select>
                          {/* "Realizará el retiro" y "Hacer seguimiento" despliegan el calendario: de hoy en adelante. */}
                          {actual.codigo && CON_FECHA.includes(actual.codigo) && (
                            <input type="date" min={hoy} value={actual.fecha ?? ""} onChange={(e) => guardarObs(g, actual.codigo as CodigoObs, e.target.value || null)}
                              className={`rounded-lg border px-2 py-1 text-xs outline-none ${actual.fecha ? "border-green/50 text-green" : "border-amber/60 text-amber"}`} />
                          )}
                          {actual.codigo && CON_FECHA.includes(actual.codigo) && !actual.fecha && (
                            <span className="text-[10px] text-amber">{actual.codigo === "seguimiento" ? "¿Qué día lo llamamos?" : "Elige el día"}</span>
                          )}
                          {/* "Otro": se escribe lo que dijo el cliente; se guarda al salir de la casilla o con Enter. */}
                          {actual.codigo === "otro" && (
                            <input autoFocus={!guardado} value={actual.texto ?? ""} maxLength={990} placeholder="¿Qué dijo el cliente?"
                              onChange={(e) => setObs((o) => ({ ...o, [g.guia]: { codigo: "otro", fecha: null, texto: e.target.value } }))}
                              onBlur={(e) => e.target.value.trim() !== guardado && guardarObs(g, "otro", null, e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                              enterKeyHint="done" className={`basis-full min-w-0 rounded-lg border bg-tinte/[0.03] px-2 py-1 text-xs outline-none ${(actual.texto ?? "").trim() ? "border-line text-text" : "border-amber/60"}`} />
                          )}
                          {actual.codigo === "otro" && !(actual.texto ?? "").trim() && <span className="text-[10px] text-amber">Escribe lo que dijo el cliente</span>}
                          {guardando === `${g.guia}|obs` && <span className="text-[10px] text-muted">Guardando…</span>}
                        </div>
                      );
                    })()}
                  </td>
                  {/* Quién hizo la observación (o, si aún no hay, el último contacto) y cuándo. */}
                  {verEquipo && (() => {
                    const ultimo = ls.at(-1);
                    const u = g.observacion?.usuario ? { email: g.observacion.usuario, en: g.observacion.actualizado_en }
                      : ultimo?.usuario ? { email: ultimo.usuario, en: ultimo.creado_en } : null;
                    return (
                      <td data-l="Quién lo hizo" className={`max-md:order-15 max-md:col-span-6 ${extra} px-2 py-2 whitespace-nowrap text-xs`}>
                        {u ? <><div className="font-semibold">{quien(u.email)}</div><div className="text-[10px] text-muted">{hora(u.en)}</div></> : <span className="text-muted">—</span>}
                      </td>
                    );
                  })()}
                  <td className="max-md:order-last max-md:col-span-6 md:hidden">
                    <button onClick={() => setAbiertas((a) => { const n = new Set(a); if (!n.delete(g.guia)) n.add(g.guia); return n; })}
                      aria-expanded={abiertas.has(g.guia)} className="w-full rounded-lg border border-line py-2 text-xs text-muted">
                      {abiertas.has(g.guia) ? "Ver menos" : "Ver más datos"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!lista.length && <p className="text-sm text-muted text-center py-6">Nada con ese filtro.</p>}
      </BarraHorizontal>
      {lista.length > mostrar && (
        <button onClick={() => setMostrar((m) => m + POR_PAGINA)} className="w-full rounded-xl border border-line py-2 text-sm text-muted hover:text-text">
          Ver {entero(Math.min(POR_PAGINA, lista.length - mostrar))} más ({entero(lista.length - mostrar)} restantes)
        </button>
      )}
    </div>
  );
}

function Indicador({ titulo, valor, color, sub, destacado }: { titulo: string; valor: string; color: string; sub?: string; destacado?: boolean }) {
  return (
    <div className={`card p-4 border-t-2 ${destacado ? "border border-green/50" : ""}`}
      style={{ borderTopColor: color, ...(destacado ? { background: "linear-gradient(160deg, rgb(47 210 143 / 0.16), transparent 70%)", boxShadow: "0 0 24px rgb(47 210 143 / 0.18)" } : {}) }}>
      <div className={`text-[11px] uppercase tracking-widest font-mono ${destacado ? "text-green" : "text-muted"}`}>{titulo}</div>
      <div className={`num font-semibold mt-1 ${destacado ? "text-4xl" : "text-3xl"}`} style={{ color, ...(destacado ? { textShadow: `0 0 16px ${color}` } : {}) }}>{valor}</div>
      {sub && <div className="mt-1 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
