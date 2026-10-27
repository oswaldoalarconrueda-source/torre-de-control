"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Red neuronal en vivo (canvas, ~60 cuadros por segundo). Las neuronas nacen en el centro y fluyen hacia
// afuera, conectándose con sus vecinas. Toda la constelación se inclina hacia donde hay movimiento: cada cambio
// de estado tira de las neuronas hacia ese país (más fuerte con entregas, oficina y devoluciones) y, sin
// eventos, la red se recuesta suavemente hacia los países con más actividad. Cada cambio viaja como una señal
// por el axón del país a su estado; al llegar, el estado palpita, y las entregas y devoluciones lanzan una onda.
// Los nodos forman el proceso: cada uno cuelga de su "padre" (órdenes del país, remisiones de órdenes, guías de
// remisiones y los estados de las guías generadas), y la señal recorre ese tramo. Al centro va el logo de la sociedad
// que se está mirando (hoy solo Joalix tiene); sin logo, el centro queda vacío.
// Lo más importante son las entregas: cada una estalla como una supernova (destello, rayos, ondas de choque, chispas
// y una sacudida) y lanza un cometa que lleva la buena noticia hasta el logo. Varias seguidas en un país suman combo.
// Las órdenes y remisiones nuevas también chispean, más pequeño. Al abrir hay una "puesta al día" (alDia): lo que ya
// pasó se enciende de una vez y desde ahí solo estalla lo nuevo.

export type NodoEstado = { id: string; label: string; x: number; y: number; n: number; hoy: number; color: string; padre?: string };
export type NodoPais = { cuenta: string; bandera: string; x: number; y: number; total: number; estados: NodoEstado[] };
// alDia: la "puesta al día" al abrir o al cambiar el filtro: todo lo que ya pasó se enciende de una vez, y desde ahí
// solo estallan los cambios nuevos.
export type RedNeuronalApi = { disparar: (cuenta: string, estado: string | null) => void; alDia: () => void };

type Props = {
  ancho: number; alto: number; centro: { x: number; y: number } | null; total: number; paises: NodoPais[]; maxNodo: number; logo: string | null;
  onPais?: (cuenta: string, x: number, y: number) => void; // clic en la bandera de un país (x, y en coordenadas del lienzo)
};

type Neurona = { x: number; y: number; vx: number; vy: number; vida: number; max: number; brillo: number; color: string | null };
type Senal = { de: { x: number; y: number }; a: { x: number; y: number }; cx: number; cy: number; t: number; color: string; estado: string; key: string };
type Onda = { x: number; y: number; r: number; max: number; color: string; grosor: number };
type Texto = { x: number; y: number; vida: number; txt: string; color: string; tam?: number; dur?: number };
type Tiron = { x: number; y: number; t: number; fuerza: number };
type Chispa = { x: number; y: number; px: number; py: number; vx: number; vy: number; vida: number; max: number; color: string; grosor: number };
type Destello = { x: number; y: number; t: number; dur: number; R: number; color: string; giro: number };

const AZUL = "120,160,255";
const N_NEURONAS = 230;
const ENLACE = 92; // distancia máxima para que dos neuronas se conecten
const TIRON_MS = 2600; // cuánto dura el tirón de un evento hacia su país
const TIRON = 0.00004; // aceleración del tirón (px/ms²)
const RECOSTAR = 0.000007; // inclinación permanente hacia la actividad
const VMAX = 0.2; // velocidad máxima de una neurona (px/ms)
const MAX_CHISPAS = 1400;
const ORO = "255,214,120";
const BLANCO = "255,255,255";
const COMBO_MS = 6000; // entregas del mismo país dentro de este tiempo suman combo

const hexRgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
};
// Punto de control de la curva del axón: se abomba hacia un lado para que no sea una recta.
const control = (a: { x: number; y: number }, b: { x: number; y: number }, k = 0.18) => {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
  return { x: mx - dy * k, y: my + dx * k };
};
const bezier = (a: { x: number; y: number }, c: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
  x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});
function hexagono(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, giro = 0) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3 + giro;
    const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

export const RedNeuronal = forwardRef<RedNeuronalApi, Props>(function RedNeuronal(props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const datos = useRef(props);
  datos.current = props;
  const estado = useRef({
    neuronas: [] as Neurona[], senales: [] as Senal[], ondas: [] as Onda[], textos: [] as Texto[], tirones: [] as Tiron[],
    chispas: [] as Chispa[], destellos: [] as Destello[],
    latido: new Map<string, number>(), // clave → momento del último latido (ms)
    combo: new Map<string, { n: number; t: number }>(), // país → entregas seguidas
    torre: 0, torreEntrega: 0, sacudida: 0, encima: null as string | null,
  });
  const logo = useRef<HTMLImageElement | null>(null);
  const alDia = useRef<() => void>(() => {});
  // El logo cambia con la sociedad elegida; sin logo se borra el anterior.
  useEffect(() => {
    logo.current = null;
    if (!props.logo) return;
    const img = new Image();
    img.src = props.logo;
    img.onload = () => { logo.current = img; };
  }, [props.logo]);

  useImperativeHandle(ref, () => ({
    disparar(cuenta, estadoId) {
      const p = datos.current.paises.find((x) => x.cuenta === cuenta);
      if (!p) return;
      const s = p.estados.find((e) => e.id === estadoId);
      const st = estado.current, ahora = performance.now();
      const desde = (s?.padre && p.estados.find((e) => e.id === s.padre)) || p;
      st.latido.set(cuenta, ahora);
      st.torre = ahora;
      // La constelación se va hacia el país del movimiento; entregas, oficina y devoluciones tiran más.
      const fuerte = estadoId === "ENTREGADO" || estadoId === "DEVOLUCION" || estadoId === "EN_OFICINA";
      st.tirones.push({ x: p.x, y: p.y, t: ahora, fuerza: fuerte ? 1.6 : 1 });
      if (st.tirones.length > 12) st.tirones.shift();
      // Ráfaga de neuronas que salen del país.
      for (let i = 0; i < 6; i++) st.neuronas.push(nueva(p.x, p.y, s?.color ?? null, 1.6));
      if (datos.current.centro) {
        const c = datos.current.centro;
        st.senales.push({ de: c, a: { x: p.x, y: p.y }, ...xy(control(c, p, 0.12)), t: 0, color: AZUL, estado: "", key: cuenta });
      }
      if (s) st.senales.push({ de: { x: desde.x, y: desde.y }, a: { x: s.x, y: s.y }, ...xy(control(desde, s)), t: -0.25, color: hexRgb(s.color), estado: s.id, key: `${cuenta}|${s.id}` });
    },
    alDia() { alDia.current(); },
  }));

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, ultimo = performance.now(), escala = 1;
    const st = estado.current;

    const ajustar = () => {
      const w = cv.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
      escala = w / datos.current.ancho;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(datos.current.alto * escala * dpr);
      ctx.setTransform(dpr * escala, 0, 0, dpr * escala, 0, 0);
    };
    const ro = new ResizeObserver(ajustar);
    ro.observe(cv);
    ajustar();
    for (let i = 0; i < N_NEURONAS; i++) {
      const n = nueva(datos.current.ancho / 2, datos.current.alto / 2, null, 1);
      n.vida = Math.random() * n.max; // repartidas desde el inicio
      n.x += n.vx * n.vida; n.y += n.vy * n.vida;
      st.neuronas.push(n);
    }

    function chispear(x: number, y: number, colores: string[], n: number, vel: number, grosor: number) {
      for (let i = 0; i < n && st.chispas.length < MAX_CHISPAS; i++) {
        const a = Math.random() * Math.PI * 2, v = vel * (0.35 + Math.random());
        const col = colores[i % colores.length];
        st.chispas.push({ x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0, max: 700 + Math.random() * 900,
          color: col.startsWith("#") ? hexRgb(col) : col, grosor: grosor * (0.6 + Math.random() * 0.8) });
      }
    }
    // Una entrega: supernova en el hexágono, ondas de choque escalonadas, metralla, sacudida, combo y cometa al logo.
    const entrega = (x: number, y: number, color: string, cuenta: string, ahora: number) => {
      st.destellos.push({ x, y, t: ahora, dur: 1100, R: 150, color, giro: Math.random() * Math.PI });
      if (st.destellos.length > 8) st.destellos.shift();
      st.ondas.push({ x, y, r: 12, max: 420, color, grosor: 4.5 });
      st.ondas.push({ x, y, r: -40, max: 300, color: BLANCO, grosor: 2.5 });
      st.ondas.push({ x, y, r: -110, max: 520, color: ORO, grosor: 3 });
      chispear(x, y, [color, BLANCO, ORO], 80, 0.55, 2.2);
      for (let i = 0; i < 16; i++) st.neuronas.push({ ...nueva(x, y, color, 3), brillo: 1 });
      st.sacudida = ahora;
      const c = st.combo.get(cuenta), n = c && ahora - c.t < COMBO_MS ? c.n + 1 : 1;
      st.combo.set(cuenta, { n, t: ahora });
      st.textos.push({ x, y: y - 38, vida: 0, txt: n > 1 ? `¡×${n} ENTREGADAS!` : "¡+1 ENTREGADA!", color: n > 2 ? ORO : color, tam: Math.min(26, 16 + n * 2), dur: 2200 });
      const centro = datos.current.centro;
      if (centro) st.senales.push({ de: { x, y }, a: centro, ...xy(control({ x, y }, centro, 0.22)), t: 0, color: ORO, estado: "TORRE", key: "torre" });
    };

    // Puesta al día: supernova dorada en el centro, ondas que barren toda la red, "¡AL DÍA!" y cada tramo del proceso
    // de cada país se enciende en cascada.
    alDia.current = () => {
      const ahora = performance.now(), { centro, paises, ancho, alto } = datos.current;
      const c = centro ?? { x: ancho / 2, y: alto / 2 };
      st.destellos.push({ x: c.x, y: c.y, t: ahora, dur: 1700, R: 330, color: ORO, giro: Math.random() * Math.PI });
      [AZUL, BLANCO, ORO, AZUL].forEach((col, i) => st.ondas.push({ x: c.x, y: c.y, r: -i * 90, max: 900, color: col, grosor: 5 - i }));
      chispear(c.x, c.y, [AZUL, BLANCO, ORO], 260, 0.75, 2.4);
      st.sacudida = ahora; st.torre = ahora; st.torreEntrega = ahora;
      st.textos.push({ x: c.x, y: c.y - 90, vida: 0, txt: "¡AL DÍA!", color: ORO, tam: 36, dur: 2800 });
      for (const p of paises) {
        st.senales.push({ de: c, a: { x: p.x, y: p.y }, ...xy(control(c, p, 0.12)), t: -0.2, color: AZUL, estado: "", key: p.cuenta });
        p.estados.forEach((s, j) => {
          const o = (s.padre && p.estados.find((e) => e.id === s.padre)) || p;
          st.senales.push({ de: { x: o.x, y: o.y }, a: { x: s.x, y: s.y }, ...xy(control(o, s)), t: -0.45 - j * 0.12, color: hexRgb(s.color), estado: "ALDIA", key: `${p.cuenta}|${s.id}` });
        });
      }
    };

    const cuadro = (ahora: number) => {
      const dt = Math.min(50, ahora - ultimo) * (reducir ? 0.3 : 1);
      ultimo = ahora;
      const { ancho: W, alto: H, centro, paises, maxNodo, total } = datos.current;
      const cx = centro?.x ?? W / 2, cy = centro?.y ?? H / 2;
      ctx.clearRect(0, 0, W, H);
      // Sacudida corta con cada entrega (la pantalla "tiembla" como en una batalla espacial).
      const sac = st.sacudida && !reducir ? Math.max(0, 1 - (ahora - st.sacudida) / 450) : 0;
      ctx.save();
      if (sac) ctx.translate((Math.random() - 0.5) * 9 * sac, (Math.random() - 0.5) * 9 * sac);

      // Fondo: resplandor central y anillos que se expanden de dentro hacia afuera.
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.55);
      g.addColorStop(0, "rgba(47,123,255,0.13)"); g.addColorStop(1, "rgba(47,123,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let k = 0; k < 4; k++) {
        const r = ((ahora / 40 + k * 110) % 440);
        ctx.strokeStyle = `rgba(${AZUL},${0.07 * (1 - r / 440)})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }

      // Hacia dónde se recuesta la red: tirones recientes de eventos y, de fondo, el centro de la actividad.
      st.tirones = st.tirones.filter((t) => ahora - t.t < TIRON_MS);
      const activos = st.tirones.map((t) => ({ x: t.x, y: t.y, w: t.fuerza * (1 - (ahora - t.t) / TIRON_MS) }));
      const totalPaises = paises.reduce((a, p) => a + p.total, 0);
      const fondo = totalPaises && paises.length > 1
        ? { x: paises.reduce((a, p) => a + p.x * p.total, 0) / totalPaises, y: paises.reduce((a, p) => a + p.y * p.total, 0) / totalPaises }
        : null;

      // Neuronas: fluyen hacia afuera y se inclinan hacia el movimiento; al morir renacen en el centro o en un
      // país con actividad.
      const vivas: Neurona[] = [];
      for (const n of st.neuronas) {
        n.vida += dt;
        n.x += n.vx * dt; n.y += n.vy * dt;
        for (const t of activos) {
          const dx = t.x - n.x, dy = t.y - n.y, d = Math.hypot(dx, dy) || 1;
          n.vx += (dx / d) * TIRON * t.w * dt; n.vy += (dy / d) * TIRON * t.w * dt;
        }
        if (fondo) {
          const dx = fondo.x - n.x, dy = fondo.y - n.y, d = Math.hypot(dx, dy) || 1;
          n.vx += (dx / d) * RECOSTAR * dt; n.vy += (dy / d) * RECOSTAR * dt;
        }
        const v = Math.hypot(n.vx, n.vy);
        if (v > VMAX) { n.vx *= VMAX / v; n.vy *= VMAX / v; }
        n.brillo = Math.max(0, n.brillo - dt / 900);
        if (n.vida < n.max && n.x > -40 && n.x < W + 40 && n.y > -40 && n.y < H + 40) vivas.push(n);
      }
      const conActividad = paises.filter((p) => p.total > 0);
      while (vivas.length < N_NEURONAS) {
        const p = conActividad.length && Math.random() < 0.35 ? conActividad[Math.floor(Math.random() * conActividad.length)] : null;
        vivas.push(nueva(p ? p.x : cx, p ? p.y : cy, null, 1));
      }
      if (vivas.length > N_NEURONAS + 60) vivas.splice(0, vivas.length - N_NEURONAS - 60);
      st.neuronas = vivas;

      // Las neuronas cerca de una señal se encienden con su color.
      const cabezas = st.senales.filter((s) => s.t > 0 && s.t < 1).map((s) => ({ ...bezier(s.de, { x: s.cx, y: s.cy }, s.a, s.t), color: s.color }));
      for (const n of vivas) for (const c of cabezas) {
        const d = Math.hypot(n.x - c.x, n.y - c.y);
        if (d < 70) { n.brillo = Math.max(n.brillo, 1 - d / 70); n.color = c.color; }
      }

      // Sinapsis entre neuronas vecinas.
      ctx.lineWidth = 0.7;
      for (let i = 0; i < vivas.length; i++) {
        const a = vivas[i], fa = alfa(a);
        for (let j = i + 1; j < vivas.length; j++) {
          const b = vivas[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 > ENLACE * ENLACE) continue;
          const k = 1 - Math.sqrt(d2) / ENLACE, br = Math.max(a.brillo, b.brillo);
          const col = br > 0.05 ? (a.brillo >= b.brillo ? a.color : b.color) ?? AZUL : AZUL;
          ctx.strokeStyle = `rgba(${col},${k * Math.min(fa, alfa(b)) * (0.32 + 0.68 * br)})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      for (const n of vivas) {
        const col = n.brillo > 0.05 && n.color ? n.color : AZUL;
        ctx.fillStyle = `rgba(${col},${alfa(n) * (0.75 + 0.25 * n.brillo)})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, 1.7 + 2.4 * n.brillo, 0, Math.PI * 2); ctx.fill();
      }

      // Axones: Torre → país → estado, con flujo continuo hacia afuera.
      const flujo = -(ahora / 28) % 24;
      for (const p of paises) {
        if (centro) {
          const c = control(centro, p, 0.12);
          ctx.setLineDash([2, 10]); ctx.lineDashOffset = flujo;
          ctx.strokeStyle = `rgba(${AZUL},${p.total ? 0.55 : 0.15})`; ctx.lineWidth = p.total ? 1.6 : 1;
          ctx.beginPath(); ctx.moveTo(centro.x, centro.y); ctx.quadraticCurveTo(c.x, c.y, p.x, p.y); ctx.stroke();
        }
        for (const s of p.estados) {
          const o = (s.padre && p.estados.find((e) => e.id === s.padre)) || p;
          const k = s.n / maxNodo, c = control(o, s, 0.1), rgb = hexRgb(s.color);
          ctx.setLineDash([]); ctx.strokeStyle = `rgba(${rgb},${0.12 + 0.2 * k})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.quadraticCurveTo(c.x, c.y, s.x, s.y); ctx.stroke();
          if (s.n > 0) {
            ctx.setLineDash([2, 10]); ctx.lineDashOffset = flujo * (1 + k);
            ctx.strokeStyle = `rgba(${rgb},${0.45 + 0.5 * k})`; ctx.lineWidth = 1 + 2.5 * k;
            ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.quadraticCurveTo(c.x, c.y, s.x, s.y); ctx.stroke();
          }
        }
      }
      ctx.setLineDash([]);

      // Señales viajando, con estela.
      const siguen: Senal[] = [];
      for (const s of st.senales) {
        s.t += dt / 950;
        if (s.t >= 1) {
          st.latido.set(s.key, ahora);
          if (s.estado === "ENTREGADO") {
            entrega(s.a.x, s.a.y, s.color, s.key.split("|")[0], ahora);
          } else if (s.estado === "TORRE") {
            // El cometa de una entrega llega al logo: el halo dorado se enciende y suelta polvo de oro.
            st.torreEntrega = ahora;
            st.ondas.push({ x: s.a.x, y: s.a.y, r: 66, max: 200, color: ORO, grosor: 3 });
            chispear(s.a.x, s.a.y, [ORO, BLANCO], 24, 0.32, 1.6);
          } else if (s.estado === "DEVOLUCION") {
            st.ondas.push({ x: s.a.x, y: s.a.y, r: 10, max: 200, color: s.color, grosor: 2.5 });
            st.textos.push({ x: s.a.x, y: s.a.y - 30, vida: 0, txt: "+1 devolución", color: s.color });
            for (let i = 0; i < 8; i++) st.neuronas.push({ ...nueva(s.a.x, s.a.y, s.color, 2.2), brillo: 1 });
          } else if (s.estado === "ALDIA") {
            st.ondas.push({ x: s.a.x, y: s.a.y, r: 6, max: 130, color: s.color, grosor: 2.5 });
            chispear(s.a.x, s.a.y, [s.color, BLANCO], 30, 0.35, 1.6);
          } else if (s.estado === "ORDEN" || s.estado === "REMISION") {
            // Venta nueva o remisión hecha: un chispazo de su color.
            st.ondas.push({ x: s.a.x, y: s.a.y, r: 6, max: 110, color: s.color, grosor: 2 });
            chispear(s.a.x, s.a.y, [s.color, BLANCO], s.estado === "ORDEN" ? 22 : 16, 0.26, 1.4);
            st.textos.push({ x: s.a.x, y: s.a.y - 24, vida: 0, txt: s.estado === "ORDEN" ? "+1 orden" : "+1 remisión", color: s.color });
          } else if (s.estado) {
            st.ondas.push({ x: s.a.x, y: s.a.y, r: 6, max: 70, color: s.color, grosor: 1.5 });
          }
          continue;
        }
        siguen.push(s);
        if (s.t <= 0) continue;
        const c = { x: s.cx, y: s.cy };
        for (let k = 0; k < 8; k++) {
          const tt = s.t - k * 0.025;
          if (tt <= 0) break;
          const q = bezier(s.de, c, s.a, tt);
          ctx.fillStyle = `rgba(${s.color},${(1 - k / 8) * 0.8})`;
          ctx.beginPath(); ctx.arc(q.x, q.y, 4.5 - k * 0.45, 0, Math.PI * 2); ctx.fill();
        }
        const h = bezier(s.de, c, s.a, s.t);
        const gl = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 16);
        gl.addColorStop(0, `rgba(${s.color},0.55)`); gl.addColorStop(1, `rgba(${s.color},0)`);
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(h.x, h.y, 16, 0, Math.PI * 2); ctx.fill();
      }
      st.senales = siguen;

      // Ondas de choque (las que empiezan con radio negativo salen un instante después).
      st.ondas = st.ondas.filter((o) => {
        o.r += dt * 0.32;
        const k = 1 - o.r / o.max;
        if (k <= 0) return false;
        if (o.r <= 0) return true;
        ctx.strokeStyle = `rgba(${o.color},${k * 0.8})`; ctx.lineWidth = o.grosor * k + 0.5;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();
        return true;
      });

      // Supernovas de las entregas: núcleo blanco que se apaga, halo de color y rayos que giran hacia afuera.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      st.destellos = st.destellos.filter((d) => {
        // Un destello creado fuera del cuadro (la puesta al día) puede tener una hora apenas posterior a la del cuadro.
        const u = Math.max(0, (ahora - d.t) / d.dur);
        if (u >= 1) return false;
        const k = 1 - u, R = d.R * (0.35 + 0.65 * Math.sqrt(u));
        const gr = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, R);
        gr.addColorStop(0, `rgba(${BLANCO},${0.95 * k})`);
        gr.addColorStop(0.18, `rgba(${ORO},${0.7 * k})`);
        gr.addColorStop(0.45, `rgba(${d.color},${0.45 * k})`);
        gr.addColorStop(1, `rgba(${d.color},0)`);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(d.x, d.y, R, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 14; i++) {
          const a = d.giro + (i * Math.PI * 2) / 14 + u * 0.6, largo = R * (i % 2 ? 1.25 : 1.9);
          const lg = ctx.createLinearGradient(d.x, d.y, d.x + Math.cos(a) * largo, d.y + Math.sin(a) * largo);
          lg.addColorStop(0, `rgba(${BLANCO},${0.8 * k})`); lg.addColorStop(1, `rgba(${d.color},0)`);
          ctx.strokeStyle = lg; ctx.lineWidth = (i % 2 ? 1.2 : 2.4) * k + 0.3;
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + Math.cos(a) * largo, d.y + Math.sin(a) * largo); ctx.stroke();
        }
        return true;
      });
      // Chispas: metralla que sale disparada, se frena y deja estela.
      st.chispas = st.chispas.filter((c) => {
        c.vida += dt;
        const k = 1 - c.vida / c.max;
        if (k <= 0) return false;
        c.px = c.x; c.py = c.y;
        const fr = Math.pow(0.9965, dt);
        c.vx *= fr; c.vy *= fr;
        c.x += c.vx * dt; c.y += c.vy * dt;
        ctx.strokeStyle = `rgba(${c.color},${k})`; ctx.lineWidth = c.grosor * k + 0.4;
        ctx.beginPath(); ctx.moveTo(c.px - c.vx * 26, c.py - c.vy * 26); ctx.lineTo(c.x, c.y); ctx.stroke();
        return true;
      });
      ctx.restore();

      // Hexágonos: estados (tamaño por volumen), países y la Torre. Laten al recibir una señal.
      const late = (key: string) => { const t = st.latido.get(key); return t ? Math.max(0, 1 - (ahora - t) / 700) : 0; };
      const respira = (frec: number) => 0.5 + 0.5 * Math.sin(ahora / frec);
      for (const p of paises) {
        for (const s of p.estados) {
          const k = s.n / maxNodo, l = late(`${p.cuenta}|${s.id}`), rgb = hexRgb(s.color);
          const boom = s.id === "ENTREGADO" ? 0.7 : 0.25; // el hexágono de entregadas se infla más al estallar
          const r = (paises.length === 1 ? 20 + 26 * Math.sqrt(k) : 9 + 15 * Math.sqrt(k)) * (1 + boom * l) * (1 + 0.04 * respira(500 + 900 * (1 - k)));
          ctx.save();
          ctx.shadowColor = `rgba(${rgb},0.9)`; ctx.shadowBlur = 8 + 30 * l + 10 * k;
          hexagono(ctx, s.x, s.y, r, (ahora / 9000) * (k + 0.2));
          ctx.fillStyle = `rgba(${rgb},${0.1 + 0.25 * k + 0.4 * l})`; ctx.fill();
          ctx.strokeStyle = `rgba(${rgb},0.95)`; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.restore();
          ctx.fillStyle = "#e8eefc"; ctx.textAlign = "center";
          ctx.font = `600 ${paises.length === 1 ? 18 : 11}px ui-sans-serif, system-ui`;
          ctx.fillText(s.n.toLocaleString("es-CO"), s.x, s.y + (paises.length === 1 ? 6 : 4));
          ctx.fillStyle = `rgba(${rgb},0.9)`; ctx.font = `600 ${paises.length === 1 ? 10 : 8}px ui-monospace, monospace`;
          ctx.fillText(s.label.toUpperCase(), s.x, s.y + r + (paises.length === 1 ? 15 : 11));
        }
        // La bandera de cada país es un poco más grande y se puede pulsar para entrar a su mapa.
        const encima = st.encima === p.cuenta ? 1 : 0;
        const l = late(p.cuenta), R = RADIO_PAIS(paises.length) * (1 + 0.12 * l + 0.08 * encima);
        ctx.save();
        ctx.shadowColor = `rgba(${AZUL},0.9)`; ctx.shadowBlur = 14 + 30 * l;
        hexagono(ctx, p.x, p.y, R, 0);
        ctx.fillStyle = "rgba(8,12,22,0.94)"; ctx.fill();
        ctx.strokeStyle = `rgba(${AZUL},${0.6 + 0.4 * l})`; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.restore();
        hexagono(ctx, p.x, p.y, R + 9, -(ahora / 6000));
        ctx.setLineDash([3, 6]); ctx.strokeStyle = `rgba(${AZUL},0.3)`; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
        ctx.textAlign = "center";
        ctx.font = `${paises.length === 1 ? 40 : 28}px system-ui`;
        ctx.fillText(p.bandera, p.x, p.y + (paises.length === 1 ? -4 : -3));
        ctx.fillStyle = "#e8eefc"; ctx.font = `700 ${paises.length === 1 ? 16 : 13}px ui-sans-serif, system-ui`;
        ctx.fillText(p.total.toLocaleString("es-CO"), p.x, p.y + (paises.length === 1 ? 28 : 21));
        if (encima) {
          ctx.fillStyle = `rgba(${AZUL},0.95)`; ctx.font = "600 10px ui-sans-serif, system-ui";
          ctx.fillText("Clic para entrar al mapa", p.x, p.y - R - 14);
        }
      }
      if (centro) {
        // Logo de Joalix en un círculo con halo dorado que late con cada movimiento.
        const l = Math.max(st.torre ? Math.max(0, 1 - (ahora - st.torre) / 600) : 0,
          st.torreEntrega ? 1.8 * Math.max(0, 1 - (ahora - st.torreEntrega) / 1200) : 0);
        const R = 66 * (1 + 0.05 * Math.min(l, 1.5));
        ctx.save();
        ctx.shadowColor = `rgba(212,166,74,${0.7 + 0.3 * l})`; ctx.shadowBlur = 24 + 30 * l;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = "#0a0a0c"; ctx.fill();
        ctx.restore();
        if (logo.current) {
          ctx.save();
          ctx.beginPath(); ctx.arc(cx, cy, R - 2, 0, Math.PI * 2); ctx.clip();
          const z = R * 1.9; // el logo (sobre el mismo fondo oscuro) cabe completo dentro del círculo, con un poco de aire
          ctx.drawImage(logo.current, cx - z / 2, cy - z / 2, z, z);
          ctx.restore();
        }
        ctx.strokeStyle = `rgba(212,166,74,${0.75 + 0.25 * l})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([2, 8]); ctx.lineDashOffset = -(ahora / 40);
        ctx.strokeStyle = "rgba(212,166,74,0.35)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, R + 10, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#e8eefc"; ctx.font = "600 12px ui-sans-serif, system-ui"; ctx.textAlign = "center";
        ctx.fillText(`${total.toLocaleString("es-CO")} movimientos`, cx, cy + R + 24);
      }

      // "+1 entregada" / "+1 devolución" que suben y se desvanecen.
      st.textos = st.textos.filter((t) => {
        t.vida += dt;
        const k = 1 - t.vida / (t.dur ?? 1400);
        if (k <= 0) return false;
        ctx.save();
        if (t.tam) { ctx.shadowColor = `rgba(${t.color},0.9)`; ctx.shadowBlur = 14; }
        ctx.fillStyle = `rgba(${t.color},${k})`; ctx.font = `800 ${t.tam ?? 12}px ui-monospace, monospace`; ctx.textAlign = "center";
        ctx.fillText(t.txt, t.x, t.y - (1 - k) * (t.tam ? 46 : 30));
        ctx.restore();
        return true;
      });
      ctx.restore(); // fin de la sacudida

      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  // Clic y mouse encima de la bandera de un país.
  const paisEn = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvas.current!, k = props.ancho / cv.clientWidth, x = e.nativeEvent.offsetX * k, y = e.nativeEvent.offsetY * k;
    const R = RADIO_PAIS(props.paises.length) + 10;
    const p = props.paises.find((q) => Math.hypot(q.x - x, q.y - y) <= R);
    return p ? { p, x, y } : null;
  };
  return (
    <canvas ref={canvas} className="block w-full" style={{ aspectRatio: `${props.ancho} / ${props.alto}`, cursor: estado.current.encima ? "pointer" : "default" }}
      role="img" aria-label="Red neuronal en vivo de cambios de estado por país"
      onMouseMove={(e) => { const h = paisEn(e)?.p.cuenta ?? null; if (h !== estado.current.encima) { estado.current.encima = h; e.currentTarget.style.cursor = h && props.onPais ? "pointer" : "default"; } }}
      onMouseLeave={() => { estado.current.encima = null; }}
      onClick={(e) => { const h = paisEn(e); if (h) props.onPais?.(h.p.cuenta, h.p.x, h.p.y); }} />
  );
});

function nueva(x: number, y: number, color: string | null, fuerza: number): Neurona {
  const a = Math.random() * Math.PI * 2, v = (0.025 + Math.random() * 0.06) * fuerza;
  return { x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0, max: 6000 + Math.random() * 9000, brillo: color ? 0.8 : 0, color: color && color.startsWith("#") ? hexRgb(color) : color };
}
// Aparecen y se desvanecen suavemente al nacer y al morir.
function alfa(n: Neurona) {
  return Math.min(1, n.vida / 600, (n.max - n.vida) / 1200);
}
const xy = (p: { x: number; y: number }) => ({ cx: p.x, cy: p.y });
const RADIO_PAIS = (n: number) => (n === 1 ? 62 : 44);
