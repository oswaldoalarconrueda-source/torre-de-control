"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

// 🗺️ Mapa neuronal de un país: cada departamento (Natural Earth, web/public/mapas/<PAÍS>.json) es una constelación de
// neuronas dentro de su borde. Cada movimiento se enciende en su departamento con el color de su etapa: las órdenes,
// remisiones y guías generadas, y los estados de la guía. Las entregas estallan en verde y las devoluciones laten en
// rojo. El número de cada departamento son sus movimientos en la ventana de tiempo de En vivo.
// Con «misiles» (20-nov-2026, pedido del dueño; apagado en la demostración congelada): cada movimiento vuela como un misil
// con estela entre la base del país (su capital) y el departamento: las órdenes llegan del cliente a la base, los envíos
// salen de la base al cliente. Las entregas revientan en fuegos artificiales y las devoluciones explotan en rojo y regresan.

export type MapaApi = { disparar: (provincia: string | null, cat: string) => void };
type Provincia = { nombre: string; anillos: [number, number][][] };
type Datos = Record<string, Record<string, number>>;
type Props = { pais: string; datos: Datos; colores: Record<string, string>; ancho: number; alto: number; misiles?: boolean };

type Dep = { nombre: string; clave: string; path: Path2D; anillos: [number, number][][]; cx: number; cy: number; puntos: Punto[]; enlaces: [number, number][] };
type Punto = { x: number; y: number; fase: number; brillo: number; color: string | null };
type Onda = { x: number; y: number; r: number; max: number; color: string; grosor: number };
type Chispa = { x: number; y: number; vx: number; vy: number; vida: number; max: number; color: string };
type Texto = { x: number; y: number; vida: number; txt: string; color: string };
type Misil = { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; t0: number; dur: number; color: string; cat: string; dep: Dep; estela: { x: number; y: number }[]; regreso?: boolean };
type Cohete = { x: number; y: number; vx: number; vy: number; vida: number; max: number; colores: string[] };
type Brasa = { x: number; y: number; vx: number; vy: number; vida: number; max: number; color: string; titila: boolean };

const AZUL = "120,160,255";
const PUNTOS_PAIS = 900;
const MAX_BRASAS = 1600;
// Base de cada país (de donde salen los envíos): el departamento de la capital, o el primero que exista.
const BASES: Record<string, string[]> = {
  CO: ["bogota", "cundinamarca"], EC: ["guayas", "pichincha"], GT: ["guatemala"], CR: ["san jose"], HN: ["francisco morazan", "cortes"], SV: ["san salvador"],
};
const FUEGOS = ["47,210,143", "255,214,120", "255,255,255", "90,200,255", "255,106,213", "180,140,255"];

// Nombres de Effi y del mapa a una misma clave: sin tildes, minúsculas, sin "D.C." ni "departamento de".
export const claveProvincia = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(departamento|provincia) (de|del)\b/g, "").replace(/\bd\.?\s?c\.?$/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^quezaltenango$/, "quetzaltenango").replace(/^bogota distrito capital$/, "bogota");
const rgb = (hex: string) => `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;

export const MapaNeuronal = forwardRef<MapaApi, Props>(function MapaNeuronal({ pais, datos, colores, ancho: W, alto: H, misiles = false }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const deps = useRef<Dep[]>([]);
  const base = useRef<{ x: number; y: number } | null>(null);
  const vivo = useRef({
    ondas: [] as Onda[], chispas: [] as Chispa[], textos: [] as Texto[], latido: new Map<string, { t: number; color: string }>(),
    misiles: [] as Misil[], cohetes: [] as Cohete[], brasas: [] as Brasa[], baseLatido: 0,
  });
  // Los nombres de Effi ("Atlantico", "Bogotá D.C.") y los del mapa ("Atlántico", "Bogotá") se cruzan por clave.
  const porClave: Datos = {};
  for (const [k, cats] of Object.entries(datos)) {
    const c = claveProvincia(k), acc = (porClave[c] ??= {});
    for (const [cat, n] of Object.entries(cats)) acc[cat] = (acc[cat] ?? 0) + n;
  }
  const props = useRef({ porClave, colores, misiles });
  props.current = { porClave, colores, misiles };
  const [hover, setHover] = useState<{ x: number; y: number; dep: Dep } | null>(null);
  const [cargado, setCargado] = useState(false);

  // Carga el mapa y lo proyecta (equirectangular corregida por la latitud media) al lienzo, con las neuronas de cada
  // departamento repartidas según su área.
  useEffect(() => {
    let vigente = true;
    fetch(`/mapas/${pais}.json`).then((r) => r.json()).then((m: { provincias: Provincia[] }) => {
      if (!vigente) return;
      const todos = m.provincias.flatMap((p) => p.anillos.flat());
      const lat0 = (Math.min(...todos.map((p) => p[1])) + Math.max(...todos.map((p) => p[1]))) / 2;
      const k = Math.cos((lat0 * Math.PI) / 180);
      const xs = todos.map((p) => p[0] * k), ys = todos.map((p) => -p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const pad = 40, esc = Math.min((W - 2 * pad) / (x1 - x0), (H - 2 * pad) / (y1 - y0));
      const ox = (W - (x1 - x0) * esc) / 2, oy = (H - (y1 - y0) * esc) / 2;
      const P = ([lon, lat]: [number, number]): [number, number] => [ox + (lon * k - x0) * esc, oy + (-lat - y0) * esc];
      const prueba = document.createElement("canvas").getContext("2d")!;
      const area = (r: [number, number][]) => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
      const proyectadas = m.provincias.map((p) => ({ nombre: p.nombre, anillos: p.anillos.map((r) => r.map(P)) }));
      const areaTotal = proyectadas.reduce((a, p) => a + p.anillos.reduce((b, r) => b + area(r), 0), 0);
      deps.current = proyectadas.map((p) => {
        const path = new Path2D();
        for (const r of p.anillos) { r.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y))); path.closePath(); }
        // Centro: el del anillo más grande (promedio de sus vértices, ajustado si cae fuera).
        const mayor = p.anillos.reduce((a, r) => (area(r) > area(a) ? r : a), p.anillos[0]);
        let cx = mayor.reduce((a, q) => a + q[0], 0) / mayor.length, cy = mayor.reduce((a, q) => a + q[1], 0) / mayor.length;
        const xsD = mayor.map((q) => q[0]), ysD = mayor.map((q) => q[1]);
        const [bx0, bx1, by0, by1] = [Math.min(...xsD), Math.max(...xsD), Math.min(...ysD), Math.max(...ysD)];
        if (!prueba.isPointInPath(path, cx, cy)) {
          for (let i = 0; i < 400; i++) { const x = bx0 + Math.random() * (bx1 - bx0), y = by0 + Math.random() * (by1 - by0); if (prueba.isPointInPath(path, x, y)) { cx = x; cy = y; break; } }
        }
        // Neuronas dentro del departamento.
        const a = p.anillos.reduce((b, r) => b + area(r), 0);
        const n = Math.max(6, Math.round((a / areaTotal) * PUNTOS_PAIS));
        const puntos: Punto[] = [];
        for (let i = 0; i < n * 30 && puntos.length < n; i++) {
          const x = bx0 + Math.random() * (bx1 - bx0), y = by0 + Math.random() * (by1 - by0);
          if (prueba.isPointInPath(path, x, y)) puntos.push({ x, y, fase: Math.random() * Math.PI * 2, brillo: 0, color: null });
        }
        // Cada neurona se une con sus dos vecinas más cercanas del mismo departamento.
        const enlaces: [number, number][] = [];
        puntos.forEach((q, i) => {
          puntos.map((o, j) => ({ j, d: (o.x - q.x) ** 2 + (o.y - q.y) ** 2 })).filter((o) => o.j !== i).sort((u, v) => u.d - v.d).slice(0, 2)
            .forEach((o) => { if (o.j > i) enlaces.push([i, o.j]); });
        });
        return { nombre: p.nombre, clave: claveProvincia(p.nombre), path, anillos: p.anillos, cx, cy, puntos, enlaces };
      });
      const b = (BASES[pais] ?? []).map((c) => deps.current.find((d) => d.clave === c)).find(Boolean);
      base.current = b ? { x: b.cx, y: b.cy } : { x: W / 2, y: H / 2 };
      setCargado(true);
    });
    return () => { vigente = false; };
  }, [pais, W, H]);

  // Lo que pasa en el departamento cuando llega el movimiento (al instante, o cuando el misil impacta).
  const impacto = (d: Dep, cat: string, color: string) => {
      const st = vivo.current, ahora = performance.now();
      st.latido.set(d.clave, { t: ahora, color });
      for (const q of d.puntos) if (Math.random() < 0.6) { q.brillo = 1; q.color = color; }
      const fuerte = cat === "ENTREGADO";
      st.ondas.push({ x: d.cx, y: d.cy, r: 4, max: fuerte ? 150 : 60, color, grosor: fuerte ? 3.5 : 1.8 });
      if (fuerte) {
        st.ondas.push({ x: d.cx, y: d.cy, r: -30, max: 220, color: "255,214,120", grosor: 2 });
        for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2, v = 0.15 + Math.random() * 0.35; st.chispas.push({ x: d.cx, y: d.cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0, max: 600 + Math.random() * 700, color: i % 3 ? color : "255,255,255" }); }
        st.textos.push({ x: d.cx, y: d.cy - 24, vida: 0, txt: `¡Entregada en ${d.nombre}!`, color });
      } else if (cat === "DEVOLUCION") {
        st.textos.push({ x: d.cx, y: d.cy - 20, vida: 0, txt: "Devolución", color });
      }
      if (!props.current.misiles) return;
      if (fuerte) {
        // Fuegos artificiales: cohetes que suben desde el departamento y revientan en colores.
        for (let i = 0; i < 3; i++) st.cohetes.push({ x: d.cx + (Math.random() - 0.5) * 30, y: d.cy, vx: (Math.random() - 0.5) * 0.08,
          vy: -(0.38 + Math.random() * 0.16), vida: -i * 180, max: 650 + Math.random() * 250, colores: [FUEGOS[(i * 2) % FUEGOS.length], FUEGOS[(i * 2 + 1) % FUEGOS.length], color] });
      } else if (cat === "DEVOLUCION") {
        // Explosión roja con humo y el paquete que regresa a la base.
        brasas(d.cx, d.cy, [color, "255,160,120", "120,120,130"], 50, 0.22, false);
        st.ondas.push({ x: d.cx, y: d.cy, r: 4, max: 120, color, grosor: 4 });
        if (base.current) lanzar(d, cat, color, true);
      } else if (cat !== "ORDEN") {
        brasas(d.cx, d.cy, [color, "255,255,255"], 14, 0.12, true);
      }
  };
  const brasas = (x: number, y: number, cols: string[], n: number, vel: number, titila: boolean) => {
    const st = vivo.current;
    for (let i = 0; i < n && st.brasas.length < MAX_BRASAS; i++) {
      const a = Math.random() * Math.PI * 2, v = vel * (0.4 + Math.random());
      st.brasas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0, max: 900 + Math.random() * 900, color: cols[i % cols.length], titila });
    }
  };
  // Misil entre la base y el departamento, con una curva que sube como una trayectoria balística.
  const lanzar = (d: Dep, cat: string, color: string, regreso = false) => {
    const b = base.current!;
    const hacia = cat === "ORDEN" || regreso; // la orden viene del cliente; la devolución regresa a la base
    const [x0, y0, x1, y1] = hacia ? [d.cx, d.cy, b.x, b.y] : [b.x, b.y, d.cx, d.cy];
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - 40 - dist * 0.35;
    vivo.current.misiles.push({ x0, y0, x1, y1, cx, cy, t0: performance.now() + (regreso ? 350 : 0), dur: 900 + Math.min(900, dist * 2.2),
      color, cat, dep: d, estela: [], regreso });
  };

  useImperativeHandle(ref, () => ({
    disparar(provincia, cat) {
      if (!provincia) return;
      const d = deps.current.find((x) => x.clave === claveProvincia(provincia));
      const hex = props.current.colores[cat];
      if (!d || !hex) return;
      const color = rgb(hex);
      // Con misiles, el efecto llega cuando el misil impacta; si el departamento es la base misma, al instante.
      const b = base.current;
      if (props.current.misiles && b && Math.hypot(d.cx - b.x, d.cy - b.y) > 12) { lanzar(d, cat, color); return; }
      impacto(d, cat, color);
    },
  }));

  useEffect(() => {
    if (!cargado) return;
    const cv = canvas.current!, ctx = cv.getContext("2d")!;
    let raf = 0, ultimo = performance.now();
    const ajustar = () => {
      const w = cv.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1), e = w / W;
      cv.width = Math.round(w * dpr); cv.height = Math.round(H * e * dpr);
      ctx.setTransform(dpr * e, 0, 0, dpr * e, 0, 0);
    };
    const ro = new ResizeObserver(ajustar); ro.observe(cv); ajustar();
    const cuadro = (ahora: number) => {
      const dt = Math.min(50, ahora - ultimo); ultimo = ahora;
      const st = vivo.current, { porClave: D } = props.current;
      ctx.clearRect(0, 0, W, H);
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      g.addColorStop(0, "rgba(47,123,255,0.10)"); g.addColorStop(1, "rgba(47,123,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const total = (d: Dep) => Object.values(D[d.clave] ?? {}).reduce((a, n) => a + n, 0);
      const maxT = Math.max(1, ...deps.current.map(total));
      for (const d of deps.current) {
        const t = total(d) / maxT, l = st.latido.get(d.clave), late = l ? Math.max(0, 1 - (ahora - l.t) / 1400) : 0;
        // Relleno según actividad y destello del último movimiento.
        ctx.fillStyle = `rgba(${AZUL},${0.03 + 0.12 * t})`; ctx.fill(d.path);
        if (late) { ctx.fillStyle = `rgba(${l!.color},${0.35 * late})`; ctx.fill(d.path); }
        ctx.save(); ctx.shadowColor = `rgba(${late ? l!.color : AZUL},0.9)`; ctx.shadowBlur = 6 + 18 * late;
        ctx.strokeStyle = `rgba(${late ? l!.color : AZUL},${0.35 + 0.5 * late})`; ctx.lineWidth = 0.9 + 1.5 * late; ctx.stroke(d.path); ctx.restore();
        // Constelación del departamento.
        ctx.lineWidth = 0.6;
        for (const [i, j] of d.enlaces) {
          const a = d.puntos[i], b = d.puntos[j], br = Math.max(a.brillo, b.brillo);
          ctx.strokeStyle = `rgba(${br > 0.05 ? (a.color ?? AZUL) : AZUL},${0.18 + 0.6 * br})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        for (const q of d.puntos) {
          q.brillo = Math.max(0, q.brillo - dt / 1600);
          const r = 1.2 + 0.5 * Math.sin(ahora / 700 + q.fase) + 2 * q.brillo;
          ctx.fillStyle = `rgba(${q.brillo > 0.05 && q.color ? q.color : AZUL},${0.45 + 0.5 * q.brillo})`;
          ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      // Nombre y movimientos de cada departamento (los que tienen actividad, más grandes).
      ctx.textAlign = "center";
      for (const d of deps.current) {
        const n = total(d);
        ctx.fillStyle = n ? "#e8eefc" : "rgba(232,238,252,0.45)";
        ctx.font = `600 ${n ? 11 : 9}px ui-sans-serif, system-ui`;
        ctx.fillText(d.nombre, d.cx, d.cy - (n ? 6 : 0));
        if (n) { ctx.font = "700 13px ui-sans-serif, system-ui"; ctx.fillStyle = "#ffffff"; ctx.fillText(n.toLocaleString("es-CO"), d.cx, d.cy + 9); }
      }
      if (props.current.misiles) {
        const b = base.current;
        // La base: un faro que late con cada despacho.
        if (b) {
          const lb = Math.max(0, 1 - (ahora - st.baseLatido) / 600), pul = 0.5 + 0.5 * Math.sin(ahora / 500);
          const gb = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 26 + 14 * lb);
          gb.addColorStop(0, `rgba(255,214,120,${0.55 + 0.35 * lb})`); gb.addColorStop(1, "rgba(255,214,120,0)");
          ctx.fillStyle = gb; ctx.beginPath(); ctx.arc(b.x, b.y, 26 + 14 * lb, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = `rgba(255,214,120,${0.4 + 0.3 * pul})`; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(b.x, b.y, 10 + 6 * pul, 0, Math.PI * 2); ctx.stroke();
        }
        // Misiles: cabeza brillante con estela de humo de su color.
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        st.misiles = st.misiles.filter((m) => {
          const u = (ahora - m.t0) / m.dur;
          if (u < 0) return true;
          if (u >= 1) {
            if (!m.regreso) impacto(m.dep, m.cat, m.color);
            else { st.baseLatido = ahora; st.ondas.push({ x: m.x1, y: m.y1, r: 4, max: 70, color: m.color, grosor: 2 }); }
            return false;
          }
          const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // acelera al salir y frena al llegar
          const x = (1 - e) * (1 - e) * m.x0 + 2 * (1 - e) * e * m.cx + e * e * m.x1;
          const y = (1 - e) * (1 - e) * m.y0 + 2 * (1 - e) * e * m.cy + e * e * m.y1;
          if (!m.estela.length && !m.regreso && m.cat !== "ORDEN") st.baseLatido = ahora;
          m.estela.push({ x, y }); if (m.estela.length > 30) m.estela.shift();
          for (let i = 1; i < m.estela.length; i++) {
            const a = m.estela[i - 1], c = m.estela[i], k = i / m.estela.length;
            ctx.strokeStyle = `rgba(${m.color},${0.75 * k})`; ctx.lineWidth = (m.regreso ? 1.6 : 3.6) * k + 0.4;
            if (m.regreso) ctx.setLineDash([3, 4]);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke(); ctx.setLineDash([]);
          }
          const gm = ctx.createRadialGradient(x, y, 0, x, y, m.regreso ? 9 : 15);
          gm.addColorStop(0, "rgba(255,255,255,1)"); gm.addColorStop(0.35, `rgba(${m.color},0.95)`); gm.addColorStop(1, `rgba(${m.color},0)`);
          ctx.fillStyle = gm; ctx.beginPath(); ctx.arc(x, y, m.regreso ? 9 : 15, 0, Math.PI * 2); ctx.fill();
          return true;
        });
        // Cohetes de los fuegos artificiales: suben, se frenan y revientan.
        st.cohetes = st.cohetes.filter((c) => {
          c.vida += dt;
          if (c.vida < 0) return true;
          c.vy += 0.00045 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
          if (c.vida >= c.max || c.vy >= -0.02) {
            for (const [j, col] of c.colores.entries()) {
              const n = 42, v = 0.22 + 0.06 * j;
              for (let i = 0; i < n && st.brasas.length < MAX_BRASAS; i++) {
                const a = (i / n) * Math.PI * 2 + j * 0.3, vv = v * (0.75 + Math.random() * 0.5);
                st.brasas.push({ x: c.x, y: c.y, vx: Math.cos(a) * vv, vy: Math.sin(a) * vv, vida: 0, max: 1100 + Math.random() * 900, color: col, titila: j === 1 });
              }
            }
            st.ondas.push({ x: c.x, y: c.y, r: 2, max: 60, color: "255,255,255", grosor: 1.5 });
            return false;
          }
          ctx.fillStyle = "rgba(255,240,200,0.95)"; ctx.beginPath(); ctx.arc(c.x, c.y, 2.2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(255,200,120,0.5)"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - c.vx * 40, c.y - c.vy * 40); ctx.stroke();
          return true;
        });
        // Brasas: caen con gravedad, se apagan y algunas titilan como escarcha.
        st.brasas = st.brasas.filter((p) => {
          p.vida += dt; const k = 1 - p.vida / p.max; if (k <= 0) return false;
          const fr = Math.pow(0.9975, dt); p.vx *= fr; p.vy = p.vy * fr + 0.00012 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          const brillo = p.titila ? 0.5 + 0.5 * Math.sin(p.vida / 40 + p.x) : 1;
          ctx.strokeStyle = `rgba(${p.color},${k * brillo})`; ctx.lineWidth = 2.4 * k + 0.5;
          ctx.beginPath(); ctx.moveTo(p.x - p.vx * 20, p.y - p.vy * 20); ctx.lineTo(p.x, p.y); ctx.stroke();
          return true;
        });
        ctx.restore();
      }
      st.ondas = st.ondas.filter((o) => {
        o.r += dt * 0.12; const k = 1 - o.r / o.max; if (k <= 0) return false; if (o.r <= 0) return true;
        ctx.strokeStyle = `rgba(${o.color},${k * 0.85})`; ctx.lineWidth = o.grosor * k + 0.4;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke(); return true;
      });
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      st.chispas = st.chispas.filter((c) => {
        c.vida += dt; const k = 1 - c.vida / c.max; if (k <= 0) return false;
        const fr = Math.pow(0.996, dt); c.vx *= fr; c.vy *= fr; c.x += c.vx * dt; c.y += c.vy * dt;
        ctx.strokeStyle = `rgba(${c.color},${k})`; ctx.lineWidth = 1.6 * k + 0.3;
        ctx.beginPath(); ctx.moveTo(c.x - c.vx * 18, c.y - c.vy * 18); ctx.lineTo(c.x, c.y); ctx.stroke(); return true;
      });
      ctx.restore();
      st.textos = st.textos.filter((t) => {
        t.vida += dt; const k = 1 - t.vida / 2000; if (k <= 0) return false;
        ctx.fillStyle = `rgba(${t.color},${k})`; ctx.font = "800 13px ui-monospace, monospace"; ctx.fillText(t.txt, t.x, t.y - (1 - k) * 34); return true;
      });
      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [cargado, W, H]);

  // Al pasar el mouse por un departamento, su detalle por etapa y estado.
  const mover = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvas.current!, e2 = cv.clientWidth / W, x = e.nativeEvent.offsetX / e2, y = e.nativeEvent.offsetY / e2;
    const prueba = cv.getContext("2d")!;
    prueba.save(); prueba.setTransform(1, 0, 0, 1, 0, 0);
    const d = deps.current.find((x0) => prueba.isPointInPath(x0.path, x, y));
    prueba.restore();
    setHover(d ? { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, dep: d } : null);
  };
  const det = hover ? porClave[hover.dep.clave] ?? {} : {};

  return (
    <div className="relative">
      <canvas ref={canvas} onMouseMove={mover} onMouseLeave={() => setHover(null)} className="block w-full" style={{ aspectRatio: `${W} / ${H}` }}
        role="img" aria-label="Mapa neuronal por departamento" />
      {!cargado && <div className="absolute inset-0 grid place-items-center text-sm text-muted">Cargando el mapa…</div>}
      {hover && (
        <div className="pointer-events-none absolute z-10 rounded-xl border border-line bg-bg/95 px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(hover.x + 14, (canvas.current?.clientWidth ?? 600) - 190), top: hover.y + 14 }}>
          <div className="font-semibold text-sm mb-1">{hover.dep.nombre}</div>
          {Object.keys(colores).map((c) => det[c] ? (
            <div key={c} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: colores[c] }} />
              <span className="flex-1 text-muted">{NOMBRES[c] ?? c}</span><span className="num font-semibold">{det[c].toLocaleString("es-CO")}</span></div>
          ) : null)}
          {!Object.values(det).some(Boolean) && <div className="text-muted">Sin movimientos en este periodo</div>}
        </div>
      )}
    </div>
  );
});

const NOMBRES: Record<string, string> = {
  ORDEN: "Órdenes", REMISION: "Remisiones", GENERADA: "Guías generadas", EN_TRANSITO: "En tránsito", EN_OFICINA: "En oficina",
  NOVEDAD: "Novedad", ENTREGADO: "Entregadas", DEVOLUCION: "Devoluciones",
};
