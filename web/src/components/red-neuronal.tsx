"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Red neuronal en vivo (canvas, ~60 cuadros por segundo). Las neuronas nacen en el centro y fluyen hacia
// afuera, conectándose con sus vecinas. Toda la constelación se inclina hacia donde hay movimiento: cada cambio
// de estado tira de las neuronas hacia ese país (más fuerte con entregas, oficina y devoluciones) y, sin
// eventos, la red se recuesta suavemente hacia los países con más actividad. Cada cambio viaja como una señal
// por el axón del país a su estado; al llegar, el estado palpita, y las entregas y devoluciones lanzan una onda.

export type NodoEstado = { id: string; label: string; x: number; y: number; n: number; hoy: number; color: string };
export type NodoPais = { cuenta: string; bandera: string; x: number; y: number; total: number; estados: NodoEstado[] };
export type RedNeuronalApi = { disparar: (cuenta: string, estado: string | null) => void };

type Props = { ancho: number; alto: number; centro: { x: number; y: number } | null; total: number; paises: NodoPais[]; maxNodo: number };

type Neurona = { x: number; y: number; vx: number; vy: number; vida: number; max: number; brillo: number; color: string | null };
type Senal = { de: { x: number; y: number }; a: { x: number; y: number }; cx: number; cy: number; t: number; color: string; estado: string; key: string };
type Onda = { x: number; y: number; r: number; max: number; color: string; grosor: number };
type Texto = { x: number; y: number; vida: number; txt: string; color: string };
type Tiron = { x: number; y: number; t: number; fuerza: number };

const AZUL = "120,160,255";
const N_NEURONAS = 230;
const ENLACE = 92; // distancia máxima para que dos neuronas se conecten
const TIRON_MS = 2600; // cuánto dura el tirón de un evento hacia su país
const TIRON = 0.00004; // aceleración del tirón (px/ms²)
const RECOSTAR = 0.000007; // inclinación permanente hacia la actividad
const VMAX = 0.2; // velocidad máxima de una neurona (px/ms)

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
    latido: new Map<string, number>(), // clave → momento del último latido (ms)
    torre: 0,
  });

  useImperativeHandle(ref, () => ({
    disparar(cuenta, estadoId) {
      const p = datos.current.paises.find((x) => x.cuenta === cuenta);
      if (!p) return;
      const s = p.estados.find((e) => e.id === estadoId);
      const st = estado.current, ahora = performance.now();
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
      if (s) st.senales.push({ de: { x: p.x, y: p.y }, a: { x: s.x, y: s.y }, ...xy(control(p, s)), t: -0.25, color: hexRgb(s.color), estado: s.id, key: `${cuenta}|${s.id}` });
    },
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

    const cuadro = (ahora: number) => {
      const dt = Math.min(50, ahora - ultimo) * (reducir ? 0.3 : 1);
      ultimo = ahora;
      const { ancho: W, alto: H, centro, paises, maxNodo, total } = datos.current;
      const cx = centro?.x ?? W / 2, cy = centro?.y ?? H / 2;
      ctx.clearRect(0, 0, W, H);

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
          const k = s.n / maxNodo, c = control(p, s), rgb = hexRgb(s.color);
          ctx.setLineDash([]); ctx.strokeStyle = `rgba(${rgb},${0.08 + 0.2 * k})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(c.x, c.y, s.x, s.y); ctx.stroke();
          if (s.n > 0) {
            ctx.setLineDash([2, 10]); ctx.lineDashOffset = flujo * (1 + k);
            ctx.strokeStyle = `rgba(${rgb},${0.45 + 0.5 * k})`; ctx.lineWidth = 1 + 2.5 * k;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(c.x, c.y, s.x, s.y); ctx.stroke();
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
          if (s.estado === "ENTREGADO" || s.estado === "DEVOLUCION") {
            st.ondas.push({ x: s.a.x, y: s.a.y, r: 10, max: 260, color: s.color, grosor: 3 });
            st.ondas.push({ x: s.a.x, y: s.a.y, r: 4, max: 120, color: s.color, grosor: 1.5 });
            st.textos.push({ x: s.a.x, y: s.a.y - 30, vida: 0, txt: s.estado === "ENTREGADO" ? "+1 entregada" : "+1 devolución", color: s.color });
            for (let i = 0; i < 10; i++) st.neuronas.push({ ...nueva(s.a.x, s.a.y, s.color, 2.2), brillo: 1 });
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

      // Ondas de choque.
      st.ondas = st.ondas.filter((o) => {
        o.r += dt * 0.32;
        const k = 1 - o.r / o.max;
        if (k <= 0) return false;
        ctx.strokeStyle = `rgba(${o.color},${k * 0.8})`; ctx.lineWidth = o.grosor * k + 0.5;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();
        return true;
      });

      // Hexágonos: estados (tamaño por volumen), países y la Torre. Laten al recibir una señal.
      const late = (key: string) => { const t = st.latido.get(key); return t ? Math.max(0, 1 - (ahora - t) / 700) : 0; };
      const respira = (frec: number) => 0.5 + 0.5 * Math.sin(ahora / frec);
      for (const p of paises) {
        for (const s of p.estados) {
          const k = s.n / maxNodo, l = late(`${p.cuenta}|${s.id}`), rgb = hexRgb(s.color);
          const r = (12 + 20 * Math.sqrt(k)) * (paises.length === 1 ? 1.6 : 1) * (1 + 0.25 * l) * (1 + 0.04 * respira(500 + 900 * (1 - k)));
          ctx.save();
          ctx.shadowColor = `rgba(${rgb},0.9)`; ctx.shadowBlur = 8 + 30 * l + 10 * k;
          hexagono(ctx, s.x, s.y, r, (ahora / 9000) * (k + 0.2));
          ctx.fillStyle = `rgba(${rgb},${0.1 + 0.25 * k + 0.4 * l})`; ctx.fill();
          ctx.strokeStyle = `rgba(${rgb},0.95)`; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.restore();
          ctx.fillStyle = "#e8eefc"; ctx.textAlign = "center";
          ctx.font = `600 ${paises.length === 1 ? 20 : 12}px ui-sans-serif, system-ui`;
          ctx.fillText(s.n.toLocaleString("es-CO"), s.x, s.y + (paises.length === 1 ? 7 : 4));
          ctx.fillStyle = "rgba(160,172,200,0.85)"; ctx.font = "600 9px ui-monospace, monospace";
          ctx.fillText(s.label.toUpperCase(), s.x, s.y + r + 13);
        }
        const l = late(p.cuenta), R = (paises.length === 1 ? 64 : 40) * (1 + 0.12 * l);
        ctx.save();
        ctx.shadowColor = `rgba(${AZUL},0.9)`; ctx.shadowBlur = 14 + 30 * l;
        hexagono(ctx, p.x, p.y, R, 0);
        ctx.fillStyle = "rgba(8,12,22,0.94)"; ctx.fill();
        ctx.strokeStyle = `rgba(${AZUL},${0.6 + 0.4 * l})`; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.restore();
        hexagono(ctx, p.x, p.y, R + 9, -(ahora / 6000));
        ctx.setLineDash([3, 6]); ctx.strokeStyle = `rgba(${AZUL},0.3)`; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
        ctx.textAlign = "center";
        ctx.font = `${paises.length === 1 ? 34 : 22}px system-ui`;
        ctx.fillText(p.bandera, p.x, p.y + (paises.length === 1 ? -4 : -2));
        ctx.fillStyle = "#e8eefc"; ctx.font = `600 ${paises.length === 1 ? 15 : 11}px ui-sans-serif, system-ui`;
        ctx.fillText(p.total.toLocaleString("es-CO"), p.x, p.y + (paises.length === 1 ? 26 : 17));
      }
      if (centro) {
        const l = st.torre ? Math.max(0, 1 - (ahora - st.torre) / 600) : 0;
        ctx.save();
        ctx.shadowColor = `rgba(${AZUL},1)`; ctx.shadowBlur = 20 + 25 * l;
        hexagono(ctx, cx, cy, 50 * (1 + 0.08 * l), ahora / 12000);
        ctx.fillStyle = `rgba(47,123,255,${0.12 + 0.2 * l})`; ctx.fill();
        ctx.strokeStyle = `rgba(${AZUL},0.85)`; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.restore();
        ctx.fillStyle = "rgba(160,172,200,0.9)"; ctx.font = "600 9px ui-monospace, monospace"; ctx.textAlign = "center";
        ctx.fillText("T O R R E", cx, cy - 8);
        ctx.fillStyle = "#e8eefc"; ctx.font = "600 20px ui-sans-serif, system-ui";
        ctx.fillText(total.toLocaleString("es-CO"), cx, cy + 15);
      }

      // "+1 entregada" / "+1 devolución" que suben y se desvanecen.
      st.textos = st.textos.filter((t) => {
        t.vida += dt;
        const k = 1 - t.vida / 1400;
        if (k <= 0) return false;
        ctx.fillStyle = `rgba(${t.color},${k})`; ctx.font = "700 12px ui-monospace, monospace"; ctx.textAlign = "center";
        ctx.fillText(t.txt, t.x, t.y - (1 - k) * 30);
        return true;
      });

      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvas} className="block w-full" style={{ aspectRatio: `${props.ancho} / ${props.alto}` }} role="img" aria-label="Red neuronal en vivo de cambios de estado por país" />;
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
