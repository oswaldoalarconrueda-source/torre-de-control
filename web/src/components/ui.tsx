import type { ReactNode } from "react";
import { COLOR_SEMAFORO, type Semaforo } from "@/lib/paises";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative inline-flex size-6 items-center justify-center rounded-full border-[3px] border-blue-2 border-t-transparent rotate-45 shadow-[0_0_18px_rgb(47_123_255/0.6)] ${className}`}
      aria-hidden
    />
  );
}

export function Panel({ titulo, detalle, accion, children, className = "" }: { titulo: string; detalle?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 min-w-0 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">{titulo}</h2>
          {detalle && <p className="text-xs text-muted mt-0.5">{detalle}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}

export function Kpi({ etiqueta, valor, nota, acento, semaforo }: { etiqueta: string; valor: ReactNode; nota?: ReactNode; acento?: boolean; semaforo?: Semaforo }) {
  return (
    <div className={`card p-4 ${acento ? "card-glow" : ""}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {semaforo && semaforo !== "nada" && <Punto s={semaforo} />}
        {etiqueta}
      </div>
      <div className="num text-2xl sm:text-[1.7rem] font-semibold mt-1.5 leading-none">{valor}</div>
      {nota && <div className="text-xs text-muted mt-2">{nota}</div>}
    </div>
  );
}

export function Punto({ s }: { s: Semaforo }) {
  return <span className="inline-block size-2 rounded-full shrink-0" style={{ background: COLOR_SEMAFORO[s], boxShadow: `0 0 8px ${COLOR_SEMAFORO[s]}` }} aria-label={s} />;
}

export function Chip({ s, children }: { s: Semaforo; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 num" style={{ color: s === "nada" ? undefined : COLOR_SEMAFORO[s] }}>
      {s !== "nada" && <Punto s={s} />}
      {children}
    </span>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="text-sm text-muted py-8 text-center">{children}</div>;
}

export function TablaScroll({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
      <table className="tabla w-full min-w-max">{children}</table>
    </div>
  );
}

export function Barra({ valor, color = "var(--blue)" }: { valor: number; color?: string }) {
  return (
    <div className="h-1.5 w-20 rounded-full bg-tinte/5 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, valor)) * 100}%`, background: color }} />
    </div>
  );
}
