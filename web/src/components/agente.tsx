"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Clock, Pause, Play, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dinero, entero, haceCuanto } from "@/lib/formato";
import { infoCuenta, nombreAgente } from "@/lib/paises";
import { FleteAlto } from "./flete-alto";
import { FlujoAgente, type Periodo } from "./flujo-agente";
import { RemisionesDirectas } from "./remisiones-directas";
import type { DatosFabrica } from "./fabrica-agente";
import { AnularOrden, CeldaCliente, CeldaHistorial, CeldaTotales, CeldaTransportadoras, ProductosOrden, centroDe, type AccionReciente, type ExtraOrden } from "./orden-effi";

// Agente de órdenes de venta: la Torre vigila cada orden de venta (remisión con su convenio, guía, centro de costos
// Recuperado si el cliente empieza con *). En "Simular" arma, cada X minutos y antes de cada corte de despacho, la
// remisión y la guía de cada orden pendiente y muestra qué crearía. "Automático" y "Ejecutar" quedan bloqueados
// hasta activar la creación en Effi.

type Estado = "completa" | "revision" | "sin_guia" | "sin_remision" | "anulada" | "resuelta";
type Modo = "apagado" | "vigilar" | "simular" | "automatico";
type Plan = {
  resumen?: Record<string, string | number | boolean>; remision?: Record<string, unknown>; guia?: Record<string, unknown>;
  remision_existente?: { sucursal: number; id: number }; articulos?: { id: number; nombre: string }[]; resultado?: Record<string, unknown>;
};
export type OrdenAuto = {
  sucursal: number; id: number; fecha: string; cliente: string | null; ciudad: string | null; provincia: string | null;
  total: number | null; ecommerce: string | null; pedido: string | null; convenio: string | null; recuperado: boolean;
  id_remision: number | null; rem_fecha: string | null; rem_centro: string | null; rem_convenio: string | null; rem_responsable: string | null;
  guia: string | null; estado: Estado; motivos: string[]; minutos: number;
  decision: "ejecutar" | "descartar" | null; decision_por: string | null; decision_en: string | null;
  plan: Plan | null; plan_estado: "lista" | "revision" | "creada" | "error" | null; plan_motivo: string | null; plan_en: string | null;
  restriccion?: Restriccion | null;
  // Lista "estilo Effi" (11-nov): lo que trae Effi de la orden.
  centro_orden?: string | null; documento?: string | null; telefono?: string | null; direccion?: string | null;
  subtotal?: number | null; impuestos?: number | null; est_orden?: string | null; recaudo?: boolean | null;
  articulos?: { id: number; nombre: string }[] | null; direccion_marcada?: string | null;
};
// Condición de envío de la ciudad que dieron las asesoras logísticas (auto_restricciones; Colombia desde el 28-oct).
type Restriccion = { tipo: keyof typeof CONDICIONES; motivo: string; lugar: string };
const CONDICIONES = {
  anticipado: "💳 Solo pago anticipado",
  anticipado_flete: "💳 Anticipado + $20.000 de flete",
  sin_cobertura: "🚫 Sin cobertura",
  flete_alto: "💸 Flete muy alto",
  solo_envia: "🚚 Inter solo anticipado · Envía sí",
  inter_oficina: "🏢 Solo a oficina Interrapidísimo",
  validar: "📞 Validar con el cliente",
  trato_especial: "⭐ Trato especial: no se remisiona",
  transportadora_fija: "🚚 Transportadora fija: se hace manual",
  revision: "👤 La revisa una persona: no va sola",
} as const;
// Transportadoras que usa el país (aprendidas de sus guías): id → nombre y cuántas guías tuvo en los últimos 10 días.
export type Transportes = Record<string, { nombre?: string; guias?: number }>;
type Paso = "ambas" | "remision" | "guia";
// Lo que el agente calcula en Colombia para cada orden (plan.resumen.recomendacion).
type Recomendacion = {
  asesora: { id: number; regla: string; deMatriz?: boolean } | null;
  coincide?: number | null; // la regla de las asesoras y la ⭐ de la matriz dicen la misma: va sola
  // Matriz de entrega (nivel "matriz", desde el 28-oct): % de entrega y flete por ciudad. Los planes de antes traen el
  // % de devolución histórico de Effi y sus guías (nivel "ciudad" o "departamento").
  numeros: { nivel: string | null; recomendada: number | null; opciones: { id: number; guias?: number; devol: number; entrega?: number; flete?: number | null }[] };
};
const CO_HABILITADAS = [1, 4, 6, 10];
const quienCrea = (cuenta: string) => (nombreAgente(cuenta) === "ValerIA" ? "ValerIA" : "el agente");
// Transportadora con la que Effi creó la guía: "ENVÍA EFFI | CON RECAUDO | FLETE CRÉDITO" → "ENVÍA".
const transportadoraDeGuia = (o: { plan: Plan | null }) =>
  String((o.plan?.resultado as { guia?: { nombre_transportadora?: string } } | undefined)?.guia?.nombre_transportadora ?? "").split("|")[0].replace(" EFFI", "").trim();
// Igual que oficinaCO del agente (auto-convertir): entrega en oficina de Inter (4) o Servientrega (6).
const oficinaCO = (direccion: unknown) => {
  const d = String(direccion ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (!/OFICINA|\bOF\b|RECLAM/.test(d)) return null;
  return /INTER ?RAPIDISIMO/.test(d) ? 4 : /SERVIENTREGA/.test(d) ? 6 : null;
};
const pct = (n: number) => `${Number(n).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
// Trayecto de cada transportadora desde la ciudad del remitente (matrices de cobertura): de local a nacional es más
// económico; lo demás (reexpedido, difícil acceso, especial…) no se recomienda.
type ClaseTrayecto = "local" | "regional" | "nacional" | "otro";
type Trayectos = {
  origen: string | null; opciones: { id: number; clase: ClaseTrayecto; etiqueta: string; recaudo: boolean | null }[];
  fletes?: { id: number; flete: number; guias: number }[]; // de las guías propias a esa ciudad
};
const ORDEN_TRAYECTO: Record<ClaseTrayecto | "sin", number> = { local: 0, regional: 1, nacional: 2, sin: 3, otro: 4 };
const ESTILO_TRAYECTO: Record<ClaseTrayecto | "sin", string> = {
  local: "border-green/50 bg-green/15 text-green",
  regional: "border-blue-2/50 bg-blue/15 text-blue-2",
  nacional: "border-line bg-bg text-text",
  otro: "border-amber/50 bg-amber/10 text-amber",
  sin: "border-dashed border-line text-muted",
};
const TITULO_TRAYECTO: Record<ClaseTrayecto, string> = { local: "Local", regional: "Regional", nacional: "Nacional", otro: "" };
export type DatosAuto = {
  config: {
    modo: Modo; minutos_alerta: number; ultima_corrida: string | null; ultimo_error: string | null; actualizado_por: string | null;
    cada_min: number; cortes: string[]; antes_min: number; ultima_conversion: string | null; error_conversion: string | null;
  } | null;
  es_owner: boolean;
  resumen: {
    total: number; completa: number; revision: number; sin_guia: number; sin_remision: number; anulada: number; recuperado: number;
    min_remision: number | null; listas: number; plan_revision: number;
    mes_total?: number; mes_completas?: number; hoy_total?: number; hoy_completas?: number;
    mes_anuladas?: number; mes_remisionadas?: number; mes_rem_anuladas?: number; hoy_remisiones?: number; hoy_guias?: number;
  };
  ordenes: OrdenAuto[];
};

const ESTADOS: Record<Estado, { label: string; color: string }> = {
  completa: { label: "Completa", color: "var(--green)" },
  revision: { label: "Revisar", color: "var(--amber)" },
  sin_guia: { label: "Sin guía", color: "var(--blue-2)" },
  sin_remision: { label: "Sin remisión", color: "var(--red)" },
  anulada: { label: "Anulada", color: "var(--muted)" },
  resuelta: { label: "Resuelta", color: "var(--muted)" },
};

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Guatemala", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
// Próxima corrida del agente en hora local: el siguiente minuto múltiplo de cada_min o `antes_min` antes de un corte.
function proxima(zona: string, cadaMin: number, cortes: string[], antesMin: number) {
  const ahora = new Date();
  for (let i = 1; i <= 24 * 60; i++) {
    const t = new Date(ahora.getTime() + i * 60_000);
    const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t).split(":").map(Number);
    const mas = (h * 60 + m + antesMin) % 1440;
    const hhmm = `${String(Math.floor(mas / 60)).padStart(2, "0")}:${String(mas % 60).padStart(2, "0")}`;
    if (m % cadaMin === 0 || cortes.includes(hhmm)) return { hora: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, corte: cortes.includes(hhmm) ? hhmm : null, en: i };
  }
  return null;
}
// Errores pasajeros de Effi: se arreglan reintentando, y eso lo hace el agente solo (auto_reintentar_automatico).
const pasajero = (m: string) => /transacci[oó]n Dropshipping|demasiadas peticiones|no respondi[oó]|HTTP 5\d\d/i.test(m);
const duracion = (min: number) => (min < 60 ? `${Math.round(min)} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.floor(min / 1440)} d`);

// rango: días del calendario (hora local del país); sin rango es hoy, en vivo. Con rango la pantalla es el historial
// de esos días: el resumen del agente, sus errores y todas las órdenes del periodo, sin los controles de operación.
// huella: la lista "Huella del cliente" de las guías de hoy (Guatemala), debajo del Agente en vivo.
export function Agente({ cuenta, datos, transportes = {}, fabrica, rango = null, huella = null, extra = {}, acciones = {} }: {
  cuenta: string; datos: DatosAuto; transportes?: Transportes; fabrica?: DatosFabrica | null; rango?: Periodo | null; huella?: ReactNode;
  extra?: Record<string, ExtraOrden>; acciones?: Record<string, AccionReciente>;
}) {
  const router = useRouter();
  const [confirmarModo, setConfirmarModo] = useState(false);
  const [confirmarOrden, setConfirmarOrden] = useState<string | null>(null);
  // Lo que el dueño escoge al pulsar "Ejecutar" en una orden: qué paso hacer y por qué transportadora.
  const [eleccion, setEleccion] = useState<{ paso: Paso; transportadora: number | null }>({ paso: "ambas", transportadora: null });
  const [trayectos, setTrayectos] = useState<(Trayectos & { clave: string }) | null>(null);
  const opcionesTransporte = Object.entries(transportes)
    .map(([id, t]) => ({ id: Number(id), nombre: String(t.nombre ?? id).split("|").map((s) => s.trim()).join(" · "), guias: Number(t.guias ?? 0) }))
    .sort((a, b) => b.guias - a.guias);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const modo = datos.config?.modo ?? "apagado";
  const alerta = datos.config?.minutos_alerta ?? 30;
  const r = datos.resumen;
  const cfg = datos.config;
  const zona = infoCuenta(cuenta).zona;
  const [abierta, setAbierta] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [horario, setHorario] = useState({ cada: cfg?.cada_min ?? 10, cortes: (cfg?.cortes ?? []).join(", "), antes: cfg?.antes_min ?? 2 });
  const sig = cfg && modo !== "apagado" && modo !== "vigilar" ? proxima(zona, cfg.cada_min, cfg.cortes, cfg.antes_min) : null;

  // La vigilancia corre en Supabase; la pantalla se refresca sola cada minuto (y además cuando ValerIA hace algo, desde
  // FlujoAgente). En una pestaña escondida no se refresca: se pone al día apenas vuelve a verse.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, 60_000);
    const alVolver = () => { if (!document.hidden) router.refresh(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
  }, [router]);

  // Una orden sin remisión solo es alerta cuando pasa el tiempo de espera (normalmente se convierte en minutos).
  const atrasada = (o: OrdenAuto) => o.estado === "sin_remision" && o.minutos >= alerta;
  // Novedad en la orden: lo que el agente no pudo resolver y alguien debe revisar a mano (por ejemplo cambiar de
  // proveedor porque se le acabó la mercancía): error al crear, regla que no cumple, sin antecedentes, o una orden
  // que lleva más del tiempo de espera sin remisión o sin guía.
  // Un pendiente (sin cobertura o pedido repetido) se resuelve solo cuando la remisión se anula en Effi o ya tiene
  // guía: sale de aquí sin que nadie lo borre.
  const pendienteResuelto = (o: OrdenAuto) =>
    !!o.plan_motivo?.startsWith("Pendiente:") && (o.estado === "completa" || o.motivos.some((m) => m.startsWith("La remisión está anulada")));
  // No son novedad: lo que la Torre ya creó (sale solo cuando la sincronización trae la remisión y la guía, en minutos)
  // ni lo que el agente todavía no alcanza a preparar (se prepara en la próxima vuelta, de a 15 cada 10 minutos).
  const esperandoAgente = (o: OrdenAuto) => !o.plan_estado && (o.estado === "sin_remision" || o.estado === "sin_guia") && o.minutos < 180;
  const novedad = (o: OrdenAuto) => !pendienteResuelto(o) && o.plan_estado !== "creada" && !esperandoAgente(o) && (
    o.plan_estado === "error" || o.estado === "revision" ||
    (o.estado === "sin_remision" && (o.plan_estado === "revision" || o.minutos >= alerta)) ||
    (o.estado === "sin_guia" && (o.plan_estado === "revision" || o.minutos >= alerta)));

  // Listas para crear: el agente ya sabe qué hacer (remisión y guía, o solo la guía de una remisión hecha a mano). No
  // son novedad aunque lleven rato esperando: salen con "Ejecutar ahora" o con "Ejecutar" en cada una.
  // Colombia: va sola (la crea el agente en la próxima corrida) la entrega en oficina de Inter o Servientrega y la orden
  // en que la regla de las asesoras y la ⭐ de la matriz coinciden (también la guía de una remisión hecha a mano).
  // Si la ciudad tiene una condición de las asesoras, la orden no va sola (salvo "solo a oficina de Inter" yendo a Inter).
  // La condición se cumple (la orden puede ir sola): "solo a oficina de Inter" con entrega en oficina de Inter, y la
  // transportadora fija con entrega en cualquier oficina.
  const cumpleCondicion = (o: OrdenAuto) => {
    if (!o.restriccion) return true;
    const ofi = oficinaCO(o.plan?.remision?.direccion_cliente ?? (o.plan?.guia?.direccion_destinatario as unknown[] | undefined)?.[0]);
    return (o.restriccion.tipo === "inter_oficina" && ofi === 4) || (o.restriccion.tipo === "transportadora_fija" && ofi !== null);
  };
  const coincide = (o: OrdenAuto) =>
    Number(((o.plan?.resumen as Record<string, unknown> | undefined)?.recomendacion as { coincide?: number } | undefined)?.coincide) || null;
  const oficinaDeOrden = (o: OrdenAuto) => oficinaCO(o.plan?.remision?.direccion_cliente ?? (o.plan?.guia?.direccion_destinatario as unknown[] | undefined)?.[0]);
  const vaSola = (o: OrdenAuto) => cuenta === "TIENDA_CO" && o.plan_estado === "lista" && o.decision !== "descartar" && cumpleCondicion(o) && (
    (o.estado === "sin_remision" && (oficinaCO(o.plan?.remision?.direccion_cliente) !== null || !!coincide(o))) ||
    (o.estado === "sin_guia" && !!o.plan?.remision_existente && (oficinaDeOrden(o) !== null || !!coincide(o))));
  // Las de remisión → guía que van solas siguen en su lista (con el aviso) hasta que el agente haga la guía.
  const paraCrear = (o: OrdenAuto) =>
    o.plan_estado === "lista" && (o.estado === "sin_remision" || o.estado === "sin_guia") && o.decision !== "descartar" && !(vaSola(o) && o.estado === "sin_remision");
  // Una orden que ya tiene remisión y guía está resuelta: el error de un intento anterior (por ejemplo una guía que
  // falló y se hizo después) ya no cuenta como novedad ni se muestra. Igual el error de la remisión cuando alguien la
  // hizo a mano en Effi (la sincronización ya la trae) o cuando anularon la orden.
  const conRemision = (o: OrdenAuto) => o.id_remision != null && !o.motivos.some((m) => m.startsWith("La remisión está anulada"));
  const errorDeRemision = (o: OrdenAuto) => /^(Effi no dej[oó] crear la remisi[oó]n|La orden ya tiene la remisi[oó]n)/i.test(o.plan_motivo ?? "");
  // Si anularon la remisión, el error de un intento anterior ya no aplica: queda solo el aviso de la anulación.
  const remisionAnulada = (o: OrdenAuto) => o.motivos.some((m) => m.startsWith("La remisión está anulada"));
  const ordenes = useMemo(() => datos.ordenes.map((o) =>
    o.plan_estado === "error" && (o.estado === "completa" || o.estado === "anulada" || remisionAnulada(o) || (errorDeRemision(o) && conRemision(o)))
      ? { ...o, plan_estado: null, plan_motivo: null } : o), [datos.ordenes]); // eslint-disable-line react-hooks/exhaustive-deps
  const requierePersona = (o: OrdenAuto) => novedad(o) && !paraCrear(o) && !vaSola(o) && !remisionAnulada(o);
  // Regla del dueño (3-nov): la orden que el agente acaba de crear se ve unos segundos con su transportadora, se desvanece y
  // sale de la lista. La de remisión anulada no: el pedido sigue sin salir y alguien debe decidir qué hacer.
  const vistasHechas = useRef(new Set<string>());
  const [desvaneciendo, setDesvaneciendo] = useState<Set<string>>(new Set());
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (rango) return;
    for (const o of ordenes) {
      const clave = `${o.sucursal}-${o.id}`;
      if (o.plan_estado !== "creada" || remisionAnulada(o) || vistasHechas.current.has(clave)) continue;
      vistasHechas.current.add(clave);
      setTimeout(() => setDesvaneciendo((x) => new Set(x).add(clave)), 8000);
      setTimeout(() => setOcultas((x) => new Set(x).add(clave)), 9000);
    }
  }, [ordenes, rango]); // eslint-disable-line react-hooks/exhaustive-deps
  // Las órdenes sin remisión van todas en su lista (la que cuenta "sin remisión" en Agente en vivo): las que necesitan
  // a una persona, de primeras y con su aviso. Novedad queda para las que ya tienen remisión.
  const lista = useMemo(() => ordenes.filter((o) => requierePersona(o) && o.estado !== "sin_remision"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordenes]);
  // Remisión anulada (el proveedor rechazó el dropshipping o alguien la anuló): no es novedad del agente, va aparte.
  const anuladasRem = useMemo(() => ordenes.filter((o) => remisionAnulada(o) && o.estado !== "completa" && o.estado !== "anulada"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordenes]);
  const listas = useMemo(() => ordenes.filter(paraCrear),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordenes]);
  // Dos listas: órdenes que pasan a remisión (y luego a guía) y remisiones ya hechas que solo esperan la guía.
  const listasRemision = listas.filter((o) => o.estado === "sin_remision");
  const sinRemision = useMemo(() => {
    const t = ordenes.filter((o) => o.estado === "sin_remision");
    return [...t.filter(requierePersona), ...t.filter((o) => !requierePersona(o))];
  }, [ordenes]); // eslint-disable-line react-hooks/exhaustive-deps
  const sinRemisionRevisar = sinRemision.filter(requierePersona).length;
  // Órdenes de hoy (hora local del país) para Agente en vivo, del mismo listado que las tablas de abajo.
  const diaLocal = (iso: string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(iso));
  const hoyOrdenes = ordenes.filter((o) => rango ? diaLocal(o.fecha) >= rango.desde && diaLocal(o.fecha) <= rango.hasta : diaLocal(o.fecha) === diaLocal(Date.now()));
  const conteoOrdenes = {
    total: hoyOrdenes.length,
    remisionadas: hoyOrdenes.filter((o) => o.id_remision != null).length,
    anuladas: hoyOrdenes.filter((o) => o.estado === "anulada").length,
    sinRemision: sinRemision.length,
    sinRemisionAntes: sinRemision.filter((o) => diaLocal(o.fecha) !== diaLocal(Date.now())).length,
  };
  const listasGuia = listas.filter((o) => o.estado === "sin_guia");
  const solas = ordenes.filter(vaSola);
  // Pedidos con abono (cliente con ** al inicio): el agente no los toca, se quedan en orden y los hace una persona.
  const conAbono = ordenes.filter((o) => o.estado === "sin_remision" && !!o.cliente?.trim().startsWith("**"));
  // Órdenes sin remisión en una ciudad con condición de envío (pago anticipado, sin cobertura…): recordatorio.
  const conCondicion = ordenes.filter((o) => o.estado === "sin_remision" && !cumpleCondicion(o));

  // Mismo mando para todas las tiendas de todas las sociedades (30-oct; la proveeduría DistriLatam no tiene agente): la
  // Torre hace la remisión desde la orden y después la guía, en Automático, con "Ejecutar ahora" o con "Ejecutar".
  // Activar el automático y pasarlo a manual piden confirmación en pantalla (el navegador de la app bloquea las ventanas
  // de confirmación). "Manual" = simular: arma lo que haría sin crear (Colombia igual crea solas las de oficina y las
  // de coincidencia asesora-matriz).
  const esTienda = !cuenta.startsWith("DISTRI_");
  const automaticoPosible = esTienda;
  const creaRemision = esTienda;
  async function cambiarModo(m: Modo) {
    if (m === modo || (m === "automatico" && !automaticoPosible)) return;
    setGuardando("modo"); setError(null);
    const { error: e } = await createClient().rpc("auto_cambiar_modo", { p_cuenta: cuenta, p_modo: m });
    setGuardando(null);
    if (e) setError(e.message); else router.refresh();
  }
  // "Ejecutar ahora": la misma corrida del horario, disparada en el momento. Mientras corre, la pantalla se refresca
  // cada pocos segundos para ver en la bitácora lo que va creando.
  const [corriendo, setCorriendo] = useState<string | null>(null);
  const [confirmarAhora, setConfirmarAhora] = useState(false);
  async function ejecutarAhora() {
    setConfirmarAhora(false);
    setGuardando("ahora"); setError(null);
    const { data, error: e } = await createClient().rpc("auto_ejecutar_ahora", { p_cuenta: cuenta });
    setGuardando(null);
    if (e) return setError(e.message);
    setCorriendo(data === "ocupado" ? "Ya hay una corrida en curso; la bitácora muestra lo que va haciendo." : "Creando en Effi… mira la bitácora del agente.");
    // La pantalla se pone al día sola con cada movimiento de ValerIA (FlujoAgente, máximo cada 20 s).
    router.refresh();
    setTimeout(() => setCorriendo(null), 60_000);
  }
  // "Pasar de remisión a guía": solo las guías de las remisiones ya hechas, en tandas de 10 hasta acabarlas. En Ecuador
  // es el paso que sí se puede hacer (las remisiones las hace una persona porque la API de Effi falla al crearlas).
  const [confirmarGuias, setConfirmarGuias] = useState(false);
  async function pasarAGuia() {
    setConfirmarGuias(false);
    setGuardando("guias"); setError(null);
    const { data, error: e } = await createClient().rpc("auto_pasar_a_guia", { p_cuenta: cuenta });
    setGuardando(null);
    if (e) return setError(e.message);
    setCorriendo(data === "ocupado" ? "Ya hay una corrida en curso; la bitácora muestra lo que va haciendo." : "Haciendo las guías de a 10… mira la bitácora del agente.");
    router.refresh();
    setTimeout(() => setCorriendo(null), 180_000);
  }
  async function guardarHorario() {
    setGuardando("horario"); setError(null);
    const cortes = horario.cortes.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean).map((x) => (x.length === 4 ? `0${x}` : x));
    const { error: e } = await createClient().rpc("auto_guardar_horario", { p_cuenta: cuenta, p_cada_min: Number(horario.cada), p_cortes: cortes, p_antes_min: Number(horario.antes) });
    setGuardando(null);
    if (e) setError(e.message); else { setEditando(false); router.refresh(); }
  }
  // Todas las tiendas crean en tanda ("Ejecutar ahora", automático) y orden por orden. La orden debe tener la remisión
  // lista, o la guía de una remisión ya hecha (o un error para reintentar).
  const creaEnEffi = esTienda;
  const porOrden = esTienda;
  // "Ejecutar" orden por orden lo puede pulsar cualquiera que vea el agente de este país (tiene el módulo); el modo y
  // las tandas siguen siendo solo del dueño.
  // Si la creación se corta a medias, la orden queda marcada "ejecutar": a los 3 minutos el botón vuelve a quedar libre.
  const creando = (o: OrdenAuto) => o.decision === "ejecutar" && Date.now() - Date.parse(o.decision_en ?? "") < 3 * 60_000;
  const puedeEjecutar = (o: OrdenAuto) =>
    porOrden && (o.plan_estado === "lista" || o.plan_estado === "error") &&
    ((!!o.plan?.remision && creaRemision) || (!!o.plan?.remision_existente && !!o.plan?.guia));
  // Colombia: lo que dice la asesora y la ⭐ de la matriz de entrega (mayor % de entrega a esa ciudad). Solo se ofrecen
  // Envía, Inter, Servientrega y Coordinadora con recaudo, cada una con su % de entrega y su flete hacia ese destino.
  const recomendacion = (o: OrdenAuto) => (o.plan?.resumen as Record<string, unknown> | undefined)?.recomendacion as Recomendacion | undefined;
  // ⭐: la de mayor % de entrega con trayecto local, regional o nacional; una sin dato en la matriz de cobertura solo si
  // ninguna otra lo confirma. Igual que recomendacionCO en auto-convertir.
  const estrellaCO = (o: OrdenAuto, t: Trayectos | null) => {
    const clase = (id: number) => t?.opciones.find((y) => y.id === Number(id))?.clase;
    const ops = [...(recomendacion(o)?.numeros.opciones ?? [])].filter((x) => x.flete != null).sort((a, b) => Number(b.entrega) - Number(a.entrega));
    return (ops.find((x) => clase(x.id) && clase(x.id) !== "otro") ?? ops.find((x) => !clase(x.id)))?.id ?? null;
  };
  const opcionesPara = (o: OrdenAuto) => {
    if (cuenta !== "TIENDA_CO") return opcionesTransporte.map((t) => ({ ...t, etiqueta: t.nombre }));
    const rec = recomendacion(o);
    return opcionesTransporte.filter((t) => CO_HABILITADAS.includes(t.id))
      .map((t) => {
        const ruta = rec?.numeros.opciones.find((x) => Number(x.id) === t.id);
        const marcas = `${t.id === rec?.asesora?.id ? " · asesora" : ""}${t.id === rec?.numeros.recomendada ? " ⭐" : ""}`;
        const matriz = ruta?.entrega != null;
        const conDatos = matriz ? ruta.flete != null : !!ruta;
        return { ...t, entrega: !conDatos ? -1 : matriz ? Number(ruta.entrega) : 100 - Number(ruta!.devol),
          etiqueta: `${t.nombre.split(" · ")[0].replace(" EFFI", "")}${marcas} — ${!conDatos ? "sin datos"
            : matriz ? `${pct(Number(ruta.entrega))} entrega · flete ${dinero(Number(ruta.flete), cuenta)}`
            : `${pct(ruta!.devol)} dev.`}` };
      })
      .sort((a, b) => b.entrega - a.entrega);
  };
  // Al pulsar "Ejecutar": por defecto los dos pasos (o solo la guía si la remisión ya existe) y la transportadora del plan.
  function abrirEjecutar(o: OrdenAuto) {
    const clave = `${o.sucursal}-${o.id}`;
    const delPlan = Number(o.plan?.guia?.transportadora) || null;
    setConfirmarOrden(clave);
    setEleccion({ paso: o.plan?.remision ? "ambas" : "guia", transportadora: delPlan });
    if (cuenta !== "TIENDA_CO") return;
    // Se pide al abrir, no en la lista: son pocas consultas y no le pesan a la lista del agente.
    setTrayectos(null);
    const ruta = { p_cuenta: cuenta, p_remitente: Number(o.plan?.resumen?.remitente) || 0, p_ciudad: o.ciudad ?? "", p_dpto: o.provincia ?? "" };
    const supabase = createClient();
    Promise.all([supabase.rpc("auto_trayectos_ruta", ruta), supabase.rpc("auto_fletes_reales", ruta)])
      .then(([{ data }, { data: fletes }]) => {
        const t = data as Trayectos | null;
        setTrayectos(t && { clave, ...t, fletes: fletes ?? [] });
        // Si el plan trae una transportadora con trayecto caro, queda marcada la ⭐ (la entrega en oficina no cambia).
        const estrella = t && estrellaCO(o, t);
        const direccion = o.plan?.remision?.direccion_cliente ?? (o.plan?.guia?.direccion_destinatario as unknown[] | undefined)?.[0];
        if (estrella && !oficinaCO(direccion) && t.opciones.find((x) => x.id === delPlan)?.clase === "otro") {
          setEleccion((x) => (x.transportadora === delPlan ? { ...x, transportadora: estrella } : x));
        }
      });
  }
  async function ejecutar(o: OrdenAuto) {
    const clave = `${o.sucursal}-${o.id}`;
    setConfirmarOrden(null);
    setGuardando(clave); setError(null);
    const { error: e } = await createClient().rpc("auto_ejecutar_orden", {
      p_cuenta: cuenta, p_sucursal: o.sucursal, p_id: o.id, p_paso: eleccion.paso,
      p_transportadora: eleccion.paso === "remision" ? null : eleccion.transportadora,
    });
    setGuardando(null);
    if (e) setError(e.message); else router.refresh();
  }
  // "Ya está resuelta": la orden se arregló fuera de la Torre (el cliente canceló, salió con otra orden…). Sale de la
  // lista y el agente no la crea; "Volver a la lista" lo deshace.
  const [confirmarResuelta, setConfirmarResuelta] = useState<string | null>(null);
  async function marcarResuelta(o: OrdenAuto, resuelta: boolean) {
    const clave = `${o.sucursal}-${o.id}`;
    setConfirmarResuelta(null);
    setGuardando(clave); setError(null);
    const { error: e } = await createClient().rpc("auto_marcar_resuelta", { p_cuenta: cuenta, p_sucursal: o.sucursal, p_id: o.id, p_resuelta: resuelta });
    setGuardando(null);
    if (e) setError(e.message); else router.refresh();
  }
  const resueltas = ordenes.filter((o) => o.estado === "resuelta");

  // Lista "estilo Effi" (11-nov): pestañas, buscador, huella y duplicados por teléfono.
  const tel8 = (t?: string | null) => (t ?? "").replace(/\D/g, "").slice(-8);
  const esAbierta = (o: OrdenAuto) => o.estado === "sin_remision" || o.estado === "sin_guia" || o.estado === "revision";
  const abiertas = ordenes.filter(esAbierta);
  const porTelefono = new Map<string, number>();
  for (const o of abiertas) { const t = tel8(o.telefono); if (t.length === 8) porTelefono.set(t, (porTelefono.get(t) ?? 0) + 1); }
  const otrasAbiertas = (o: OrdenAuto) => { const t = tel8(o.telefono); return t.length === 8 ? (porTelefono.get(t) ?? 1) - 1 : 0; };
  const huellaDe = (o: OrdenAuto) => extra[`${o.sucursal}-${o.id}`]?.huella ?? null;
  // Filtros principales (pedido del dueño, 11-nov): Órdenes pendientes (vigentes, sin remisión), Remisiones pendientes por
  // guía, Órdenes con errores y Modificar dirección. Lo que ya tiene remisión y guía no sale aquí.
  const esAbono = (o: OrdenAuto) => centroDe(o).toLowerCase().includes("abono") || !!o.cliente?.trim().startsWith("**");
  // Orden con error = no se dejó hacer la remisión (Effi la rechazó o necesita a una persona). Si la remisión ya existe y
  // después se anuló, no es error: tiene su motivo de anulación y va a una estadística aparte (pedido del dueño, 11-nov).
  const tieneError = (o: OrdenAuto) => o.id_remision == null && o.estado !== "completa" && o.estado !== "anulada" && o.estado !== "resuelta" &&
    !pendienteResuelto(o) && (o.plan_estado === "error" || (o.plan_estado === "revision" && !esAbono(o)));
  const errorDe = (o: OrdenAuto) => remisionAnulada(o)
    ? o.motivos.find((m) => m.startsWith("La remisión está anulada")) ?? "La remisión está anulada"
    : o.plan_motivo ?? (o.motivos.length ? o.motivos.join(" · ") : "Requiere revisión");
  const pendientes = ordenes.filter((o) => o.estado === "sin_remision" && !tieneError(o));
  // Remisiones vigentes sin guía (si la guía falló, el error sale en rojo en Estado).
  const porGuia = ordenes.filter((o) => o.estado === "sin_guia");
  const conError = ordenes.filter(tieneError);
  // "Modificar dirección": las enviadas desde la lista (siguen sin remisión) y las que se cambiaron en Effi en las últimas 24 h.
  const conCambioDireccion = ordenes.filter((o) => (!!o.direccion_marcada && o.id_remision == null && o.estado !== "anulada") || acciones[`${o.sucursal}-${o.id}`]?.tipo === "direccion");
  // Sub-filtros de Órdenes pendientes.
  const subfiltros: { clave: string; titulo: string; cumple: (o: OrdenAuto) => boolean }[] = [
    { clave: "todas", titulo: "Todas", cumple: () => true },
    { clave: "pagos", titulo: "Verificar pagos", cumple: esAbono },
    { clave: "recompra", titulo: "Recompra", cumple: (o) => { const h = huellaDe(o); return !!h && Number(h.entregadas) + Number(h.devoluciones) > 0; } },
    { clave: "duplicados", titulo: "Duplicados", cumple: (o) => otrasAbiertas(o) > 0 || Number(huellaDe(o)?.en_curso ?? 0) > 0 },
    { clave: "sin_convenio", titulo: "Sin convenio", cumple: (o) => !o.convenio },
    { clave: "sin_confirmar", titulo: "Sin confirmar", cumple: (o) => centroDe(o).toLowerCase().includes("sin confirmar") || !!o.cliente?.trim().startsWith("+") },
  ];
  const [subfiltro, setSubfiltro] = useState("todas");
  const secciones: { clave: string; titulo: string; filas: OrdenAuto[]; vacio: string; conRemision: boolean; conGuia: boolean; texto: string }[] = rango ? [
    { clave: "periodo", titulo: "Órdenes del periodo", filas: ordenes.slice(0, 300), vacio: "No hubo órdenes en esos días.", conRemision: true, conGuia: true,
      texto: `${ordenes.length > 300 ? `Las 300 más recientes de ${entero(ordenes.length)} órdenes` : "Todas las órdenes"} de ${rango.etiqueta}, con su remisión, su guía y quién la hizo (🤖 agente o 👤 persona). Para ver menos, elige un solo día.` },
  ] : [
    { clave: "sin_remision", titulo: "Órdenes pendientes", filas: pendientes, vacio: "Ninguna orden pendiente.", conRemision: false, conGuia: false,
      texto: "Órdenes de venta vigentes que todavía no tienen remisión. Salen de aquí apenas se remisionan (las haga el agente o una persona)." },
    { clave: "guia", titulo: "Remisiones pendientes por guía", filas: porGuia, vacio: "Ninguna remisión esperando guía.", conRemision: true, conGuia: false,
      texto: "Remisiones ya hechas que solo esperan la guía." },
    { clave: "errores", titulo: "Órdenes con errores", filas: conError, vacio: "Sin errores: todas las órdenes van bien.", conRemision: false, conGuia: false,
      texto: "Órdenes a las que no se les pudo hacer la remisión (Effi no dejó o necesita a una persona), con el error. Las remisiones anuladas no salen aquí." },
    { clave: "direccion", titulo: "Modificar dirección", filas: conCambioDireccion, vacio: "Ninguna orden para modificar dirección.", conRemision: false, conGuia: false,
      texto: "Órdenes enviadas a corregir la dirección: «Modificar dirección» la cambia en la orden de Effi y el agente rehace la remisión con la nueva. Salen de aquí al cambiarla." },
  ];
  const [pestana, setPestana] = useState<string>("sin_remision");
  const [busqueda, setBusqueda] = useState("");
  const seccionActiva = secciones.find((x) => x.clave === pestana) ?? secciones[0];
  const normal = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const coincideBusqueda = (o: OrdenAuto) => {
    const q = normal(busqueda.trim());
    if (!q) return true;
    return [o.id, o.cliente, o.documento, o.telefono, o.ciudad, o.provincia, o.direccion, o.pedido].some((v) => normal(v).includes(q));
  };
  const soloHora = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: zona, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const fechaCorta = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: zona, day: "numeric", month: "short" }).format(new Date(iso)).replace(".", "").replace(" de ", " ");
  // Transportadoras a la vista: todas las que usa el país. Colombia: % de la matriz de entrega del plan; los demás países
  // (y Colombia sin matriz): % de nuestras guías a esa ciudad en los últimos 120 días.
  const transportesDe = (o: OrdenAuto) => {
    const propias = extra[`${o.sucursal}-${o.id}`]?.transportadoras ?? [];
    const matriz = (recomendacion(o)?.numeros.opciones ?? []) as { id: number; entrega?: number; flete?: number | null; nombre?: string }[];
    const ids = new Set<number>([...opcionesTransporte.map((t) => t.id), ...propias.map((t) => Number(t.id)), ...matriz.map((t) => Number(t.id))]);
    const lista = [...ids].filter((id) => cuenta !== "TIENDA_CO" || CO_HABILITADAS.includes(id)).map((id) => {
      const p = propias.find((x) => Number(x.id) === id);
      const m = matriz.find((x) => Number(x.id) === id);
      const guias = p ? Number(p.entregadas) + Number(p.devoluciones) : null;
      const deMatriz = m?.entrega != null;
      const nombre = (m?.nombre ?? p?.nombre ?? opcionesTransporte.find((t) => t.id === id)?.nombre.split(" · ")[0] ?? String(id)).replace(/ EFFI/i, "").trim();
      return {
        id, nombre,
        entrega: deMatriz ? Number(m!.entrega) : guias ? (Number(p!.entregadas) / guias) * 100 : null,
        guias: deMatriz ? null : guias,
        detalle: deMatriz
          ? `Matriz de entrega${m!.flete != null ? ` · flete ${dinero(Number(m!.flete), cuenta)}` : ""}${guias ? ` · nuestras guías: ${entero(p!.entregadas)} de ${entero(guias)} entregadas` : ""}`
          : guias ? `Nuestras guías a esta ciudad (120 días): ${entero(p!.entregadas)} entregadas, ${entero(p!.devoluciones)} devoluciones` : "Sin envíos a esta ciudad",
      };
    });
    return lista.sort((a, b) => Number(b.entrega ?? -1) - Number(a.entrega ?? -1));
  };
  // Check de la izquierda: despliega los productos de la orden (varias a la vez).
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const alternarMarcada = (k: string) => setMarcadas((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="space-y-4">
      {/* Modo: Automático (la Torre crea sola remisión y guía, solo Guatemala) o Manual (crea cuando el dueño pulsa
          "Ejecutar ahora" o "Ejecutar" en una orden). */}
      {cfg && !rango && (
        <div className={`card p-4 flex flex-wrap items-center justify-between gap-3 ${modo === "automatico" ? "border border-green/40" : ""}`}
          style={modo === "automatico" ? { background: "linear-gradient(90deg, rgb(47 210 143 / 0.12), transparent)" } : undefined}>
          <div className="flex items-center gap-3">
            <span className="relative flex size-3">
              {modo === "automatico" && <span className="absolute inline-flex h-full w-full rounded-full bg-green onda" />}
              <span className={`relative inline-flex size-3 rounded-full ${modo === "automatico" ? "bg-green" : "bg-muted"}`} />
            </span>
            <div>
              <div className={`font-semibold ${modo === "automatico" ? "text-green" : ""}`}>Modo: {modo === "automatico" ? "Automático" : "Manual"}</div>
              <div className="text-xs text-muted">
                {modo === "automatico"
                  ? creaRemision
                    ? "El Centro de Control crea sola en Effi la remisión y la guía de cada orden, según el horario."
                    : "El Centro de Control crea sola en Effi la guía de cada remisión, según el horario (la remisión se hace en Effi)."
                  : creaEnEffi
                    ? "El Centro de Control no crea nada sola en Effi: crea cuando pulsas “Ejecutar ahora” o “Ejecutar” en una orden."
                    : porOrden
                      ? "El Centro de Control no crea nada sola en Effi: crea solo cuando pulsas “Ejecutar” en una orden, con el paso y la transportadora que escojas."
                      : "El Centro de Control solo revisa: la creación en Effi aún no está montada para este país."}
                {datos.config?.ultima_corrida && <> · última revisión {haceCuanto(datos.config.ultima_corrida)}</>}
              </div>
              {datos.config?.ultimo_error && <div className="text-xs text-red mt-0.5">{datos.config.ultimo_error}</div>}
              {corriendo && <div className="text-xs text-green mt-0.5">{corriendo}</div>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {/* Ejecutar ahora: crea ya en Effi lo que esté listo, sin esperar el horario. En Colombia (creación orden por
              orden) trae y prepara ya las órdenes y manda las de oficina que van solas. */}
          {datos.es_owner && creaEnEffi && (confirmarAhora ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">
                {creaEnEffi ? `¿Crear ya en Effi lo que está listo (${entero(listas.length)})?` : "¿Traer y preparar ya las órdenes? Las de oficina que van solas se crean en Effi."}
              </span>
              <button onClick={ejecutarAhora} disabled={guardando === "ahora"} className="rounded-full bg-green px-4 py-2 text-sm font-bold text-black">Sí, ejecutar</button>
              <button onClick={() => setConfirmarAhora(false)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted hover:text-text">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmarAhora(true)} disabled={guardando === "ahora" || !!corriendo}
              className="inline-flex items-center gap-2 rounded-full bg-green px-5 py-2.5 text-sm font-bold text-black shadow-[0_0_24px_-6px_var(--green)] hover:brightness-110 disabled:opacity-60">
              <Play size={16} /> {corriendo ? "Ejecutando…" : "Ejecutar ahora"}
            </button>
          ))}
          {datos.es_owner && creaEnEffi && (confirmarGuias ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">¿Hacer ya en Effi las guías de las remisiones hechas ({entero(listasGuia.length)}), de a 10?</span>
              <button onClick={pasarAGuia} disabled={guardando === "guias"} className="rounded-full bg-blue px-4 py-2 text-sm font-bold text-white">Sí, hacer guías</button>
              <button onClick={() => setConfirmarGuias(false)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted hover:text-text">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmarGuias(true)} disabled={guardando === "guias" || !!corriendo}
              className="inline-flex items-center gap-2 rounded-full bg-blue px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_24px_-6px_var(--blue)] hover:brightness-110 disabled:opacity-60">
              <Truck size={16} /> Pasar de remisión a guía{listasGuia.length ? ` (${entero(listasGuia.length)})` : ""}
            </button>
          ))}
          {datos.es_owner && automaticoPosible && (confirmarModo ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{modo === "automatico" ? "¿Pasar a modo manual?" : "¿Activar el modo automático?"}</span>
              <button onClick={() => { setConfirmarModo(false); cambiarModo(modo === "automatico" ? "simular" : "automatico"); }}
                disabled={guardando === "modo"}
                className={`rounded-full px-4 py-2 text-sm font-bold ${modo === "automatico" ? "bg-red text-white" : "bg-green text-black"}`}>
                Sí
              </button>
              <button onClick={() => setConfirmarModo(false)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted hover:text-text">No</button>
            </div>
          ) : modo === "automatico" ? (
            <button onClick={() => setConfirmarModo(true)} disabled={guardando === "modo"}
              className="inline-flex items-center gap-2 rounded-full bg-red px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_24px_-6px_var(--red)] hover:brightness-110 disabled:opacity-60">
              <Pause size={16} /> Poner modo manual
            </button>
          ) : (
            <button onClick={() => setConfirmarModo(true)} disabled={guardando === "modo"}
              className="inline-flex items-center gap-2 rounded-full border border-green/50 bg-green/15 px-5 py-2.5 text-sm font-bold text-green hover:bg-green/25 disabled:opacity-60">
              <Play size={16} /> Activar automático
            </button>
          ))}
          </div>
        </div>
      )}

      {cfg && !rango && (
        <div className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Clock size={18} className="text-blue-2 mt-0.5" />
              <div>
                <div className="font-semibold text-sm">Horario del agente</div>
                <div className="text-xs text-muted mt-0.5">
                  Cada {cfg.cada_min} minutos y {cfg.antes_min} minutos antes de cada corte de despacho:{" "}
                  <span className="text-text font-mono">{cfg.cortes.join(" · ")}</span> (hora local)
                </div>
                <div className="text-xs mt-1">
                  {modo === "simular" || modo === "automatico" ? (
                    <>
                      {sig ? <span className="text-blue-2">Próxima corrida a las {sig.hora}{sig.corte ? ` (antes del corte de las ${sig.corte})` : ""} · en {sig.en} min</span> : null}
                      <span className="text-muted"> · última {cfg.ultima_conversion ? haceCuanto(cfg.ultima_conversion) : "aún no ha corrido"}</span>
                    </>
                  ) : (
                    <span className="text-muted">El agente no está corriendo.</span>
                  )}
                </div>
                {cfg.error_conversion && <div className="text-xs text-red mt-1">{cfg.error_conversion}</div>}
              </div>
            </div>
            {datos.es_owner && !editando && (
              <button onClick={() => setEditando(true)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text">Cambiar horario</button>
            )}
          </div>
          {editando && (
            <div className="mt-3 flex flex-wrap items-end gap-3 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-muted">Cada (minutos)</span>
                <input type="number" min={2} max={60} value={horario.cada} onChange={(e) => setHorario({ ...horario, cada: Number(e.target.value) })}
                  className="w-24 rounded-lg bg-panel-2 border border-line px-2 py-1.5 num" />
              </label>
              <label className="flex flex-col gap-1 flex-1 min-w-[14rem]">
                <span className="text-muted">Cortes de despacho (HH:MM, separados por coma)</span>
                <input value={horario.cortes} onChange={(e) => setHorario({ ...horario, cortes: e.target.value })}
                  className="rounded-lg bg-panel-2 border border-line px-2 py-1.5 font-mono" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted">Minutos antes del corte</span>
                <input type="number" min={0} max={30} value={horario.antes} onChange={(e) => setHorario({ ...horario, antes: Number(e.target.value) })}
                  className="w-24 rounded-lg bg-panel-2 border border-line px-2 py-1.5 num" />
              </label>
              <button onClick={guardarHorario} disabled={guardando === "horario"} className="btn-primary rounded-full px-4 py-1.5 font-semibold text-white">Guardar</button>
              <button onClick={() => setEditando(false)} className="rounded-full border border-line px-3 py-1.5 font-semibold text-muted hover:text-text">Cancelar</button>
            </div>
          )}
        </div>
      )}

      {rango && (
        <div className="card flex flex-wrap items-center gap-2 border border-blue/30 p-3 text-sm">
          <span className="font-semibold text-blue-2">📅 Historial · {rango.etiqueta}</span>
          <span className="text-muted">Lo que hizo el agente esos días y en qué quedó cada orden. Para operar (Ejecutar, modo, horario) vuelve a <b>Hoy</b> en el calendario.</span>
        </div>
      )}

      {/* Agente en vivo (orden → remisión → guía de hoy, por agente y por humano) y, debajo, los errores de hoy. */}
      <FlujoAgente cuenta={cuenta} fabrica={fabrica} conteoOrdenes={conteoOrdenes} proxima={rango ? null : sig} rango={rango} onNuevo={() => router.refresh()} esDueno={!!datos.es_owner}
        completas={ordenes.filter((o) => o.estado === "completa" || o.estado === "anulada" || pendienteResuelto(o) || remisionAnulada(o)).map((o) => o.id)}
        remisionadas={ordenes.filter(conRemision).map((o) => o.id)} />

      {/* Filtros principales, cada uno con su conteo; Órdenes pendientes trae sus sub-filtros. Buscador por orden, cliente,
          identificación, teléfono o ciudad. */}
      {secciones.length > 1 && (
        <div className="card p-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {secciones.map((x) => {
              const n = x.filas.filter((o) => !ocultas.has(`${o.sucursal}-${o.id}`)).length;
              const on = x.clave === seccionActiva.clave;
              const rojo = x.clave === "errores" && n > 0;
              return (
                <button key={x.clave} type="button" onClick={() => { setPestana(x.clave); setSubfiltro("todas"); }} aria-pressed={on}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${on ? "border-text bg-text text-bg" : rojo ? "border-red/50 text-red hover:bg-red/10" : "border-line text-muted hover:text-text"}`}>
                  {x.titulo} · {entero(n)}
                </button>
              );
            })}
          </div>
          {seccionActiva.clave === "sin_remision" && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
              <span className="text-[11px] uppercase tracking-wider text-muted">Filtrar:</span>
              {subfiltros.map((f) => {
                const n = seccionActiva.filas.filter(f.cumple).length;
                const on = f.clave === subfiltro;
                return (
                  <button key={f.clave} type="button" onClick={() => setSubfiltro(f.clave)} aria-pressed={on}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-blue-2 bg-blue/15 text-text" : "border-line text-muted hover:text-text"}`}>
                    {f.titulo} · {entero(n)}
                  </button>
                );
              })}
            </div>
          )}
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar orden, cliente, identificación, teléfono o ciudad"
            aria-label="Buscar en la lista" className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-blue/60" />
        </div>
      )}
      {[seccionActiva].map((s0) => ({ ...s0, filas: s0.filas.filter((o) => coincideBusqueda(o) && (s0.clave !== "sin_remision" || (subfiltros.find((f) => f.clave === subfiltro) ?? subfiltros[0]).cumple(o))) })).map((s) => (
      <Fragment key={s.clave}>
      <div className="flex flex-wrap items-baseline gap-2 pt-2">
        <span className="font-display text-lg font-semibold">{s.titulo}</span>
        <span className="text-xs text-muted">{s.texto}</span>
        <span className="text-xs text-muted ml-auto">{entero(s.filas.filter((o) => !ocultas.has(`${o.sucursal}-${o.id}`)).length)} {s.filas.filter((o) => !ocultas.has(`${o.sucursal}-${o.id}`)).length === 1 ? "orden" : "órdenes"}</span>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="bg-blue/10 text-left text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap">
              <th className="px-3 py-3">Fecha</th>
              <th className="px-3 py-3">Orden de venta</th>
              <th className="px-3 py-3">Cliente</th>
              <th className="px-3 py-3 text-right">Valor de la venta</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Historial cliente</th>
              <th className="px-3 py-3">Transportadora</th>
              <th className="px-3 py-3 sticky right-0 z-10 bg-panel border-l border-line">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.filas.map((o) => {
              const est = ESTADOS[o.estado];
              const clave = `${o.sucursal}-${o.id}`;
              const abierto = abierta === clave;
              if (ocultas.has(clave)) return null;
              return (
                <Fragment key={clave}>
                <tr className={`align-middle hover:bg-tinte/[0.02] ${desvaneciendo.has(clave) ? "desvanece" : ""}`}>
                  {/* Fecha y, debajo, el número de la orden (sin "OV": ya se sabe que es orden de venta). El check despliega los productos. */}
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    <button type="button" onClick={() => alternarMarcada(clave)} aria-expanded={marcadas.has(clave)} aria-label={`Ver productos de la orden ${o.id}`}
                      className="flex items-start gap-1.5 text-left">
                      <span className={`mt-0.5 rounded-md border p-0.5 ${marcadas.has(clave) ? "border-blue-2 bg-blue/10 text-blue-2" : "border-line text-muted"}`}>
                        {marcadas.has(clave) ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                      </span>
                      <span>
                        <span className="block text-xs font-semibold">{fechaCorta(o.fecha)}</span>
                        <span className="block text-[11px] text-muted">{soloHora(o.fecha)}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    <div className="font-mono text-sm font-bold">{o.id}</div>
                    {o.pedido && <div className="text-[11px] text-muted">pedido {nombreEcommerce(o.ecommerce)} {o.pedido}</div>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <CeldaCliente o={o} cuenta={cuenta} accion={acciones[clave]} onCambio={() => router.refresh()}
                      modo={rango || o.id_remision != null || o.estado === "anulada" || o.estado === "completa" ? "ninguno" : s.clave === "direccion" ? "editar" : "enviar"} />
                    <div className="text-xs">
                      {o.restriccion && (
                        <div className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cumpleCondicion(o) ? "bg-green/15 text-green" : "bg-red/15 text-red"}`}
                          title={`${o.restriccion.lugar}: ${o.restriccion.motivo}`}>
                          {CONDICIONES[o.restriccion.tipo]}{cumpleCondicion(o) ? " ✓" : ""}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top"><CeldaTotales o={o} cuenta={cuenta} /></td>
                  {/* Estado: solo el de Effi y lo que se vende (producto y unidades). En "Órdenes con errores", además el error. */}
                  <td className="px-3 py-2 align-top min-w-[12rem] max-w-[20rem] whitespace-normal">
                    {o.est_orden && <span className="inline-block rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold" title="Estado de la orden en Effi">{o.est_orden}</span>}
                    <div className="mt-1 space-y-0.5 text-xs font-semibold">
                      {productosPlan(o).map((x, i) => (
                        <div key={i}>{x.nombre}{x.cantidad != null ? ` · ${entero(x.cantidad)} ${x.cantidad === 1 ? "unidad" : "unidades"}` : ""}</div>
                      ))}
                    </div>
                    {(s.clave === "errores" || (s.clave === "guia" && o.plan_estado === "error")) && (
                      <div className={`mt-1 text-[11px] font-semibold ${o.plan_estado === "error" && pasajero(o.plan_motivo ?? "") ? "text-amber" : "text-red"}`}>
                        {o.plan_estado === "error" && pasajero(o.plan_motivo ?? "") ? "↻ " : "⚠ "}{errorDe(o)}
                        {datos.es_owner && o.plan?.resultado && (
                          <button onClick={() => setAbierta(abierto ? null : clave)} className="ml-1 underline">ver variables</button>
                        )}
                      </div>
                    )}
                    {o.decision === "ejecutar" && creando(o) && <div className="mt-1 text-[11px] text-blue-2">Creando en Effi…</div>}
                  </td>
                  <td className="px-3 py-2 align-top"><CeldaHistorial h={huellaDe(o)} duplicada={otrasAbiertas(o)} /></td>
                  <td className="px-3 py-2 align-top">
                    <CeldaTransportadoras ciudad={o.ciudad} opciones={transportesDe(o)} recaudo={o.recaudo !== false}
                      delPlan={Number(o.plan?.guia?.transportadora) || null} />
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap sticky right-0 z-10 bg-panel border-l border-line">
                    {o.estado === "completa" || o.estado === "anulada" ? (
                      <span className="text-xs text-muted">—</span>
                    ) : (
                      <div className="flex flex-col items-start gap-1.5">
                        {puedeEjecutar(o) && confirmarOrden === clave ? (
                          // Qué paso hacer y por qué transportadora; nada se crea hasta "Sí, crear".
                          <div className="flex w-[18rem] flex-col gap-1.5 whitespace-normal rounded-xl border border-green/40 bg-green/5 p-2 sm:w-[23rem]">
                            {o.plan?.remision && o.id_remision == null && !o.plan?.resultado?.remision ? (
                              <select value={eleccion.paso} onChange={(e) => setEleccion((x) => ({ ...x, paso: e.target.value as Paso }))}
                                className="rounded-lg border border-line bg-bg px-2 py-1 text-xs outline-none">
                                <option value="ambas">Orden → remisión → guía</option>
                                <option value="remision">Solo orden → remisión</option>
                              </select>
                            ) : (
                              <span className="text-[11px] font-semibold text-blue-2">Remisión → guía</span>
                            )}
                            {eleccion.paso !== "remision" && (() => {
                              const opciones = opcionesPara(o);
                              const rec = recomendacion(o);
                              const nombre = (id: number | null | undefined) => opciones.find((t) => t.id === id)?.etiqueta.split(" — ")[0].replace(/ · asesora| ⭐/g, "") ?? "—";
                              const tray = trayectos?.clave === clave ? trayectos : null;
                              const idEstrella = tray ? estrellaCO(o, tray) : rec?.numeros.recomendada;
                              const estrella = rec?.numeros.opciones.find((x) => Number(x.id) === idEstrella);
                              return (
                                <>
                                  {rec && (
                                    <div className="space-y-0.5 text-[11px] leading-snug">
                                      <div><span className="text-muted">Asesora:</span>{" "}
                                        {rec.asesora ? <b>{nombre(rec.asesora.id)}</b> : <span className="text-muted">sin regla para esta ciudad</span>}
                                        {rec.asesora && <span className="text-muted"> ({rec.asesora.regla})</span>}</div>
                                      {rec.numeros.nivel === "matriz" || !rec.numeros.nivel ? (
                                        <div><span className="text-muted">⭐ Matriz de entrega:</span>{" "}
                                          {estrella?.entrega != null ? <><b>{nombre(idEstrella)}</b> <span className="text-muted">{pct(estrella.entrega)} entrega{estrella.flete != null ? ` · flete ${dinero(estrella.flete, cuenta)}` : ""}</span></>
                                            : <span className="text-muted">{rec.numeros.opciones.length ? "ninguna con trayecto local, regional o nacional" : "esta ciudad no está en la matriz"}</span>}</div>
                                      ) : (
                                        <div><span className="text-muted">⭐ Números:</span>{" "}
                                          {estrella ? <><b>{nombre(rec.numeros.recomendada)}</b> <span className="text-muted">{pct(estrella.devol)} dev. · {rec.numeros.nivel === "departamento" ? "por departamento" : "en la ciudad"}</span></>
                                            : <span className="text-muted">pocos datos de esta ruta</span>}</div>
                                      )}
                                    </div>
                                  )}
                                  {cuenta === "TIENDA_CO" ? (
                                    <div className="space-y-1 whitespace-normal">
                                      <div className="text-[10px] text-muted">
                                        {!tray ? "Buscando el trayecto de cada transportadora…" : tray.origen ? `Trayecto desde ${({ BOGOTA: "Bogotá", BUCARAMANGA: "Bucaramanga", FLORIDABLANCA: "Floridablanca", SABANETA: "Sabaneta" } as Record<string, string>)[tray.origen] ?? tray.origen}: de local a nacional es más económico` : "No conozco la ciudad de este remitente: sin trayectos"}
                                      </div>
                                      <div role="radiogroup" aria-label="Transportadora" className="space-y-1">
                                        {opciones.map((t) => {
                                          const ruta = tray?.opciones.find((x) => x.id === t.id);
                                          return { t, ruta, orden: ORDEN_TRAYECTO[ruta?.clase ?? "sin"] };
                                        }).sort((a, b) => a.orden - b.orden).map(({ t, ruta }) => {
                                          const elegida = eleccion.transportadora === t.id;
                                          const real = tray?.fletes?.find((x) => x.id === t.id);
                                          // Flete real de las guías propias; el de la matriz de entrega es promedio de otros clientes y orígenes.
                                          const dato = t.etiqueta.split(" — ")[1]?.replace(/ · flete .*/, (m) => (real ? "" : m.replace("flete", "flete matriz")));
                                          return (
                                            <button key={t.id} type="button" role="radio" aria-checked={elegida} onClick={() => setEleccion((x) => ({ ...x, transportadora: t.id }))}
                                              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${elegida ? "border-green bg-green/10" : "border-line bg-bg hover:border-muted"}`}>
                                              <span className="min-w-0 flex-1">
                                                <span className="block text-xs font-semibold">{nombre(t.id)}{t.id === idEstrella ? " ⭐" : ""}{t.id === rec?.asesora?.id ? <span className="font-normal text-muted"> · asesora</span> : null}</span>
                                                <span className="block text-[10px] leading-snug text-muted">{dato}{real ? <> · <b className="text-text">flete {dinero(real.flete, cuenta)}</b> en {entero(real.guias)} {real.guias === 1 ? "guía" : "guías"}</> : null}{ruta?.recaudo === false ? <span className="text-amber"> · sin contraentrega</span> : null}</span>
                                              </span>
                                              <span title={ruta ? `En la matriz: ${ruta.etiqueta}` : "Esta transportadora no trae este destino en la matriz de cobertura"}
                                                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${ESTILO_TRAYECTO[ruta?.clase ?? "sin"]}`}>
                                                {ruta ? TITULO_TRAYECTO[ruta.clase] || ruta.etiqueta : "Sin dato"}
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                      {!opciones.some((t) => t.id === eleccion.transportadora) && <div className="text-[10px] text-muted">Si no escoges otra, va la del plan.</div>}
                                    </div>
                                  ) : <label className="text-[10px] text-muted">
                                    Transportadora
                                    <select value={eleccion.transportadora ?? ""} onChange={(e) => setEleccion((x) => ({ ...x, transportadora: Number(e.target.value) || null }))}
                                      className="mt-0.5 block w-full rounded-lg border border-line bg-bg px-2 py-1 text-xs text-text outline-none">
                                      {!opciones.some((t) => t.id === eleccion.transportadora) && <option value="">— La del plan —</option>}
                                      {opciones.map((t) => <option key={t.id} value={t.id}>{t.etiqueta}</option>)}
                                    </select>
                                  </label>}
                                </>
                              );
                            })()}
                            <div className="flex gap-2">
                              <button onClick={() => ejecutar(o)} disabled={guardando === clave}
                                className="rounded-full bg-green px-3 py-1 text-xs font-bold text-black">Sí, crear</button>
                              <button onClick={() => setConfirmarOrden(null)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text">No</button>
                            </div>
                          </div>
                        ) : puedeEjecutar(o) ? (
                          <button
                            onClick={() => abrirEjecutar(o)}
                            disabled={guardando === clave || creando(o)}
                            title={o.plan_estado === "error" ? "Vuelve a intentar con Effi (si la remisión ya se creó, solo reintenta la guía)" : "Crea en Effi la remisión y la guía que muestra la simulación"}
                            className="inline-flex items-center gap-1 rounded-full border border-green/50 bg-green/10 px-3 py-1 text-xs font-semibold text-green hover:bg-green/20 disabled:opacity-60"
                          >
                            <Play size={12} /> {creando(o) ? "Creando…" : "Ejecutar"}
                          </button>
                        ) : (
                          <button
                            disabled
                            title={porOrden ? "Necesita una simulación lista para crear" : "La creación en Effi aún no está montada para este país"}
                            className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted opacity-60 cursor-not-allowed"
                          >
                            <Play size={12} /> Ejecutar
                          </button>
                        )}
                        {o.estado === "sin_remision" && confirmarOrden !== clave && (confirmarResuelta === clave ? (
                          <span className="inline-flex items-center gap-1 text-[11px]">
                            <span className="text-muted">¿Quitar de la lista?</span>
                            <button onClick={() => marcarResuelta(o, true)} disabled={guardando === clave}
                              className="rounded-full bg-blue px-2 py-0.5 font-bold text-white">Sí</button>
                            <button onClick={() => setConfirmarResuelta(null)} className="rounded-full border border-line px-2 py-0.5 font-semibold text-muted hover:text-text">No</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmarResuelta(clave)} disabled={guardando === clave}
                            title="Se arregló fuera de el Centro de Control (el cliente canceló, salió con otra orden…): sale de la lista y el agente no la crea"
                            className="rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:text-text hover:border-tinte/30">
                            Ya está resuelta
                          </button>
                        ))}
                        {/* Anular la orden en Effi, con el motivo (queda en la observación de anulación de la orden para medirlo). */}
                        {!rango && o.id_remision == null && confirmarOrden !== clave && (
                          <AnularOrden o={o} cuenta={cuenta} accion={acciones[clave]} />
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                {(marcadas.has(clave) || (abierto && o.plan)) && (
                  <tr>
                    <td colSpan={8} className="px-3 pb-4 bg-tinte/[0.015]">
                      {marcadas.has(clave) && (
                        <div className="pt-2">
                          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">Lo que se está vendiendo · orden {o.id}{o.pedido ? ` · pedido ${o.pedido}` : ""}</div>
                          <ProductosOrden o={o} articulos={o.articulos} cuenta={cuenta} />
                        </div>
                      )}
                      {abierto && o.plan && datos.es_owner && o.plan.resultado && (
                        <div className="grid lg:grid-cols-2 gap-3 pt-2">
                          <Envio titulo={`Lo que se envió a Effi (${String(o.plan.resultado.paso ?? "")})`} datos={(o.plan.resultado.enviado as Record<string, unknown>) ?? undefined} />
                          <Envio titulo="Lo que respondió Effi" datos={(o.plan.resultado.respuesta as Record<string, unknown>) ?? (o.plan.resultado as Record<string, unknown>)} />
                        </div>
                      )}
                      {abierto && o.plan && (
                        <div className="grid lg:grid-cols-2 gap-3 pt-2">
                          <Envio titulo="Remisión de venta que se crearía (POST api/remision_v)" datos={o.plan.remision} />
                          <Envio titulo="Guía que se crearía después (POST api/guia_transporte)" datos={o.plan.guia} />
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
            {!s.filas.length && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted">
                  {s.vacio}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </Fragment>
      ))}


      {huella}

      {/* Remisiones que llegan sin orden de venta (Lucid) y solo esperan la guía: no salen en las listas de órdenes. */}
      <RemisionesDirectas cuenta={cuenta} zona={zona} rango={rango} />

      {!rango && cuenta === "TIENDA_CO" && <FleteAlto cuenta={cuenta} onCambio={() => router.refresh()} />}

      {!rango && conAbono.length > 0 && (
        <div className="card border border-amber/50 p-4" style={{ background: "linear-gradient(90deg, rgb(245 166 35 / 0.12), transparent)" }}>
          <div className="font-semibold text-amber">💰 {entero(conAbono.length)} {conAbono.length === 1 ? "pedido con abono" : "pedidos con abono"}: hacer el proceso</div>
          <div className="text-xs text-muted mt-0.5">El cliente empieza con ** y el agente no los toca: se quedan en orden de venta para hacerlos a mano en Effi.</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {conAbono.map((o) => (
              <span key={`${o.sucursal}-${o.id}`} className="rounded-full border border-amber/40 px-2.5 py-0.5 text-[11px]">
                OV {o.id} · {o.cliente?.replace(/^\s*\*+\s*/, "")} · {o.ciudad ?? "—"}{o.total ? ` · ${entero(o.total)}` : ""} · hace {duracion(o.minutos)}
              </span>
            ))}
          </div>
        </div>
      )}

      {!rango && conCondicion.length > 0 && (
        <div className="card border border-red/40 p-4" style={{ background: "linear-gradient(90deg, rgb(255 92 92 / 0.10), transparent)" }}>
          <div className="font-semibold text-red">📍 {entero(conCondicion.length)} {conCondicion.length === 1 ? "pedido va" : "pedidos van"} a una ciudad con condición de envío</div>
          <div className="text-xs text-muted mt-0.5">Recordatorio de las asesoras logísticas: revisar con el cliente antes de despachar. Estas no se crean solas.</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {conCondicion.map((o) => (
              <span key={`${o.sucursal}-${o.id}`} className="rounded-full border border-red/40 px-2.5 py-0.5 text-[11px]" title={o.restriccion?.motivo}>
                OV {o.id} · {o.ciudad ?? "—"} · <b>{o.restriccion ? CONDICIONES[o.restriccion.tipo] : ""}</b> · hace {duracion(o.minutos)}
              </span>
            ))}
          </div>
        </div>
      )}

      {!rango && (
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
        {/* Mes como el listado de Effi; hoy: órdenes, cuántas ya tienen remisión y cuántas ya tienen guía. */}
        <Indicador titulo="Órdenes del mes" valor={entero(r.mes_total ?? 0)} color="var(--blue-2)"
          sub={r.mes_anuladas ? `${entero(r.mes_anuladas)} anuladas sin remisión` : undefined} />
        <Indicador titulo="Remisionadas del mes" valor={entero(r.mes_remisionadas ?? 0)} color="var(--green)"
          sub={r.mes_rem_anuladas ? `${entero(r.mes_rem_anuladas)} remisiones anuladas` : undefined} />
        <Indicador titulo="Órdenes de hoy" valor={entero(r.hoy_total ?? 0)} color="var(--blue-2)" />
        <Indicador titulo="Remisiones hoy" valor={entero(r.hoy_remisiones ?? 0)} color="var(--green)"
          sub={(r.hoy_total ?? 0) > (r.hoy_remisiones ?? 0) ? `${entero((r.hoy_total ?? 0) - (r.hoy_remisiones ?? 0))} sin remisionar` : undefined} />
        <Indicador titulo="Guías hoy" valor={entero(r.hoy_guias ?? 0)} color="var(--green)"
          sub={(r.hoy_remisiones ?? 0) > (r.hoy_guias ?? 0) ? `${entero((r.hoy_remisiones ?? 0) - (r.hoy_guias ?? 0))} sin guía` : undefined} />
        <Indicador titulo="Requieren revisión" valor={entero(lista.length + sinRemisionRevisar)} color="var(--amber)" />
        <Indicador titulo="Listas para crear" valor={entero(listas.length)} color="var(--green)"
          sub={`${entero(listasRemision.length)} a remisión · ${entero(listasGuia.length)} a guía`} />
      </div>
      )}

      {error && <p className="text-sm text-red">{error}</p>}

      {/* Columnas Remisión y Guía solo donde dicen algo: en "orden → remisión" siempre están vacías y empujaban "Acción"
          fuera de la pantalla; en "remisión → guía" la guía todavía no existe. */}
      {/* Las que una persona marcó como resueltas: fuera de la lista y sin que el agente las cree; se pueden devolver. */}
      {resueltas.length > 0 && (
        <details className="card p-3 text-sm">
          <summary className="cursor-pointer text-muted">Marcadas como resueltas ({entero(resueltas.length)})</summary>
          <div className="mt-2 divide-y divide-line">
            {resueltas.map((o) => (
              <div key={`${o.sucursal}-${o.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-mono font-semibold">{o.id}</span>
                <span>{o.cliente ?? "—"}</span>
                <span className="text-muted">{o.ciudad ?? ""}</span>
                <span className="text-xs text-muted">por {o.decision_por ?? "una persona"}{o.decision_en ? ` · ${hora(o.decision_en)}` : ""}</span>
                <button onClick={() => marcarResuelta(o, false)} disabled={guardando === `${o.sucursal}-${o.id}`}
                  className="ml-auto rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:text-text">
                  Volver a la lista
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Indicador({ titulo, valor, color, sub }: { titulo: string; valor: string; color: string; sub?: string }) {
  return (
    <div className="card p-4 border-t-2" style={{ borderTopColor: color }}>
      <div className="text-[11px] uppercase tracking-widest font-mono text-muted">{titulo}</div>
      <div className="num text-3xl font-semibold mt-1" style={{ color }}>{valor}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// Plataforma de donde viene el pedido, corta: LUCIDBOT → Lucid; las demás como vienen de Effi.
const nombreEcommerce = (e: string | null) => {
  const t = (e ?? "").trim();
  if (!t) return "";
  if (/lucid/i.test(t)) return "Lucid";
  return t.charAt(0) + t.slice(1).toLowerCase();
};

// Productos de la remisión que va a crear el agente (o, si no hay plan, los de la orden).
function productosPlan(o: OrdenAuto) {
  const rem = o.plan?.remision as { descripcion?: string[]; cantidad?: number[] } | undefined;
  if (rem?.descripcion?.length) return rem.descripcion.map((d, i) => ({ nombre: d, cantidad: rem.cantidad?.[i] != null ? Number(rem.cantidad[i]) : null }));
  const r = o.plan?.resumen ?? {};
  if (r.producto) return [{ nombre: String(r.producto), cantidad: r.varios ? null : Number(r.cantidad) || null }];
  return (o.articulos ?? []).map((a) => ({ nombre: a.nombre, cantidad: null }));
}

// Lo que armó la simulación para una orden pendiente: listo para crear (producto, cantidad, centro, remitente) o el
// motivo por el que necesita revisión.
function Simulacion({ o, cuenta, abierto, onAlternar }: { o: OrdenAuto; cuenta: string; abierto: boolean; onAlternar: () => void }) {
  if (o.plan_estado === "creada") {
    const res = (o.plan?.resultado ?? {}) as { remision?: { id_transaccion?: string; id?: number }; guia?: { guia?: string } };
    const anulada = o.motivos.some((m) => m.startsWith("La remisión está anulada"));
    return (
      <div className="text-xs">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold bg-tinte/5 ${anulada ? "text-amber" : "text-green"}`}>
          {anulada ? `Creada por ${quienCrea(cuenta)} y anulada después` : `✓ Creada por ${quienCrea(cuenta)}`}
        </span>
        <div className="text-muted mt-1">RV {res.remision?.id_transaccion ?? res.remision?.id ?? "—"} · guía {res.guia?.guia ?? "—"}</div>
        {transportadoraDeGuia(o) && <div className="text-muted">{transportadoraDeGuia(o)}</div>}
      </div>
    );
  }
  if (o.estado !== "sin_remision" && o.estado !== "sin_guia" && o.plan_estado !== "error") return <span className="text-xs text-muted">—</span>;
  if (!o.plan_estado) return <span className="text-xs text-muted">Aún no simulada</span>;
  if (o.decision === "ejecutar") return <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-blue-2 bg-tinte/5">Creando en Effi…</span>;
  if (o.plan_estado === "error") {
    return (
      <div className="text-xs">
        <button onClick={onAlternar} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-red bg-tinte/5 hover:bg-tinte/10">
          {abierto ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Falló al crear
        </button>
        <div className="text-muted mt-1">El detalle del error está en Estado</div>
      </div>
    );
  }
  if (o.plan_estado === "revision") {
    return (
      <div className="text-xs">
        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-amber bg-tinte/5">Pendiente de revisión</span>
        <div className="text-amber mt-1 min-w-[12rem] max-w-[20rem] whitespace-normal">{o.plan_motivo}</div>
      </div>
    );
  }
  const r = o.plan?.resumen ?? {};
  // Transportadora escogida y por qué (Ecuador: oficina → Servientrega, sin cobertura de Gintracom, domicilio).
  const transporte = r.transportadora ? (
    <div className="text-blue-2 whitespace-normal">
      🚚 {String(r.transportadora).split("|")[0].trim()}{r.motivo_transportadora ? ` · ${String(r.motivo_transportadora)}` : ""}
    </div>
  ) : null;
  if (r.solo_guia) {
    return (
      <div className="text-xs">
        <button onClick={onAlternar} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-green bg-tinte/5 hover:bg-tinte/10">
          {abierto ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Guía lista para crear
        </button>
        <div className="mt-1 text-muted">Remisión {String(r.remision)} · remitente {String(r.remitente)}{r.sin_confirmar ? " · Sin confirmar" : r.recuperado ? " · Recuperado" : ""}</div>
        {transporte}
        {o.plan_en && <div className="text-[10px] text-muted">simulada {haceCuanto(o.plan_en)}</div>}
      </div>
    );
  }
  return (
    <div className="text-xs">
      <button onClick={onAlternar} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-green bg-tinte/5 hover:bg-tinte/10">
        {abierto ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Lista para crear
      </button>
      {/* Lo que se está vendiendo: el producto y las unidades (el detalle completo sale con la flecha de la fecha). */}
      <div className="mt-1 whitespace-normal font-semibold">
        {productosPlan(o).map((x, i) => (
          <div key={i}>{x.nombre}{x.cantidad != null ? ` · ${entero(x.cantidad)} ${x.cantidad === 1 ? "unidad" : "unidades"}` : ""}</div>
        ))}
      </div>
    </div>
  );
}

// Precio unitario con centavos (Q109,67): con el redondeo de la moneda se vería Q110.
const precio2 = (v: number, cuenta: string) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: infoCuenta(cuenta).divisa, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function Envio({ titulo, datos }: { titulo: string; datos?: Record<string, unknown> }) {
  return (
    <div className="rounded-xl border border-line p-3 min-w-0">
      <div className="text-[11px] uppercase tracking-wider font-mono text-muted mb-2">{titulo}</div>
      <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-all font-mono text-text/90">{datos ? JSON.stringify(datos, null, 2) : "—"}</pre>
    </div>
  );
}

