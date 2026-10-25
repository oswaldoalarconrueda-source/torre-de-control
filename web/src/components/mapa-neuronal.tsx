"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

// 🗺️ Mapa neuronal de un país: cada departamento (Natural Earth, web/public/mapas/<PAÍS>.json) es una constelación de
// neuronas dentro de su borde. Cada movimiento se enciende en su departamento con el color de su etapa: las órdenes,
// remisiones y guías generadas, y los estados de la guía. Las entregas estallan en verde y las devoluciones laten en
// rojo. El número de cada departamento son sus movimientos en la ventana de tiempo de En vivo.

export type MapaApi = { disparar: (provincia: string | null, cat: string) => void };
type Provincia = { nombre: string; anillos: [number, number][][] };
type Datos = Record<string, Record<string, number>>;
type Props = { pais: string; datos: Datos; colores: Record<string, string>; ancho: number; alto: number };

type Dep = { nombre: string; clave: string; path: Path2D; anillos: [number, number][][]; cx: number; cy: number; puntos: Punto[]; enlaces: [number, number][] };
type Punto = { x: number; y: number; fase: number; brillo: number; color: string | null };
type Onda = { x: number; y: number; r: number; max: number; color: string; grosor: number };
type Chispa = { x: number; y: number; vx: number; vy: number; vida: number; max: number; color: string };
type Texto = { x: number; y: number; vida: number; txt: string; color: string };

const AZUL = "120,160,255";
const PUNTOS_PAIS = 900;

// Nombres de Effi y del mapa a una misma clave: sin tildes, minúsculas, sin "D.C." ni "departamento de".
export const claveProvincia = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(departamento|provincia) (de|del)\b/g, "").replace(/\bd\.?\s?c\.?$/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^quezaltenango$/, "quetzaltenango").replace(/^bogota distrito capital$/, "bogota");
const rgb = (hex: string) => `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;

export const MapaNeuronal = forwardRef<MapaApi, Props>(function MapaNeuronal({ pais, datos, colores, ancho: W, alto: H }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const deps = useRef<Dep[]>([]);
  const vivo = useRef({ ondas: [] as Onda[], chispas: [] as Chispa[], textos: [] as Texto[], latido: new Map<string, { t: number; color: string }>() });
  // Los nombres de Effi ("Atlantico", "Bogotá D.C.") y los del mapa ("Atlántico", "Bogotá") se cruzan por clave.
  const porClave: Datos = {};
  for (const [k, cats] of Object.entries(datos)) {
    const c = claveProvincia(k), acc = (porClave[c] ??= {});
    for (const [cat, n] of Object.entries(cats)) acc[cat] = (acc[cat] ?? 0) + n;
  }
  const props = useRef({ porClave, colores });
  props.current = { porClave, colores };
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
      setCargado(true);
    });
    return () => { vigente = false; };
  }, [pais, W, H]);

  useImperativeHandle(ref, () => ({
    disparar(provincia, cat) {
      if (!provincia) return;
      const d = deps.current.find((x) => x.clave === claveProvincia(provincia));
      const hex = props.current.colores[cat];
      if (!d || !hex) return;
      const color = rgb(hex), st = vivo.current, ahora = performance.now();
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
