"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Tabla ancha con una barra para correrla a la derecha siempre a la vista, pegada abajo de la pantalla (para quien
// trabaja con mouse en computador de mesa), además de la barra normal al final de la tabla. La usan Disponible en
// oficina y la bandeja de Novedades.
export function BarraHorizontal({ children }: { children: ReactNode }) {
  const tabla = useRef<HTMLDivElement>(null), barra = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const t = tabla.current!;
    const medir = () => setAncho(t.scrollWidth > t.clientWidth + 2 ? t.scrollWidth : 0);
    const ro = new ResizeObserver(medir); ro.observe(t); if (t.firstElementChild) ro.observe(t.firstElementChild);
    medir();
    return () => ro.disconnect();
  }, []);
  const sincronizar = (de: HTMLDivElement | null, a: HTMLDivElement | null) => { if (de && a && Math.abs(a.scrollLeft - de.scrollLeft) > 1) a.scrollLeft = de.scrollLeft; };
  return (
    <div>
      <div ref={tabla} onScroll={() => sincronizar(tabla.current, barra.current)} className="card overflow-x-auto p-0 barra-x">{children}</div>
      {ancho > 0 && (
        <div ref={barra} onScroll={() => sincronizar(barra.current, tabla.current)} aria-label="Correr la tabla a los lados"
          className="barra-x sticky bottom-0 z-20 overflow-x-auto overflow-y-hidden rounded-b-xl border border-t-0 border-line bg-bg/90 backdrop-blur">
          <div style={{ width: ancho, height: 1 }} />
        </div>
      )}
    </div>
  );
}
