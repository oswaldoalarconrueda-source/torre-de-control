"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { MENU_EN_VIVO, MENU_JOALIX, type ItemMenu } from "@/lib/menu";
import { tieneModulo, type Acceso } from "@/lib/modulos";
import { Logo } from "./ui";
import { Salir } from "./salir";

export function Sidebar({ acceso, email, ultimoSync, sociedad }: { acceso: Acceso; email: string; ultimoSync: string; sociedad: string }) {
  const esOwner = acceso.rol === "owner";
  const path = usePathname();
  const sp = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  useEffect(() => setAbierto(false), [path]);

  const item = (it: ItemMenu) => {
    if (it.soloOwner && !esOwner) return null;
    if (it.modulo && !tieneModulo(acceso, it.modulo)) return null;
    const activo = it.href === "/" ? path === "/" : path.startsWith(it.href);
    return (
      <Link
        key={it.href}
        href={`${it.href}${qs}`}
        aria-current={activo ? "page" : undefined}
        className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
          activo ? "bg-blue/15 text-text shadow-[inset_2px_0_0_var(--blue-2)]" : "text-muted hover:text-text hover:bg-white/[0.04]"
        }`}
      >
        <span className="w-5 text-center text-base leading-none" aria-hidden>{it.emoji}</span>
        <span className="flex-1 truncate">{it.label}</span>
        {it.estado === "pronto" && <span className="text-[10px] rounded-full border border-line px-1.5 py-0.5 text-muted">pronto</span>}
      </Link>
    );
  };

  const contenido = (
    <>
      <div className="flex items-center gap-2.5 px-3 pt-5 pb-4">
        <Logo />
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold tracking-tight leading-tight">Torre de Control</div>
          <div className="text-[11px] text-muted truncate">{sociedad}</div>
        </div>
        {tieneModulo(acceso, "guias") && <Link href="/en-vivo" title="Ver la operación en vivo"
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            path.startsWith("/en-vivo") ? "border-red/60 bg-red/15 text-text" : "border-red/40 text-red hover:bg-red/10"
          }`}>
          <span className="pulso size-1.5 rounded-full bg-red shadow-[0_0_8px_var(--red)]" />
          En vivo
        </Link>}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 space-y-5">
        <div className="space-y-0.5">{MENU_JOALIX.filter((it) => !it.soloOwner).map(item)}</div>
        {MENU_EN_VIVO.some((it) => !it.modulo || tieneModulo(acceso, it.modulo)) && (
          <div>
            <div className="px-3 pb-1.5 text-[11px] uppercase tracking-wider text-muted/70">En vivo</div>
            <div className="space-y-0.5">{MENU_EN_VIVO.map(item)}</div>
          </div>
        )}
        {/* Usuario maestro: lo que nadie más puede ver, sin importar la sociedad. */}
        {esOwner && (
          <div className="rounded-xl border border-amber/25 bg-amber/[0.04] py-1.5">
            <div className="px-3 pb-1.5 pt-0.5 text-[11px] uppercase tracking-wider text-amber/90">👑 Solo para ti</div>
            <div className="space-y-0.5">{MENU_JOALIX.filter((it) => it.soloOwner).map(item)}</div>
          </div>
        )}
      </nav>
      <div className="border-t border-line p-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted" title="Última sincronización con Effi">
          <span className="pulso size-1.5 rounded-full bg-green shadow-[0_0_8px_var(--green)]" />
          Effi {ultimoSync}
        </span>
        <Salir email={email} />
      </div>
    </>
  );

  return (
    <>
      {/* Celular: barra superior con botón de menú */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b border-line bg-bg/85 backdrop-blur">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-display font-semibold tracking-tight">Torre de Control</span>
        </div>
        <button onClick={() => setAbierto(!abierto)} className="rounded-xl border border-line p-2 text-muted hover:text-text" aria-label={abierto ? "Cerrar menú" : "Abrir menú"} aria-expanded={abierto}>
          {abierto ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {abierto && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-72 max-w-[85vw] h-full flex flex-col bg-panel border-r border-line">{contenido}</div>
          <button className="flex-1 bg-black/50" onClick={() => setAbierto(false)} aria-label="Cerrar menú" />
        </div>
      )}

      {/* Escritorio: menú lateral fijo */}
      <aside className="hidden lg:flex sticky top-0 h-dvh w-60 shrink-0 flex-col border-r border-line bg-panel/60 backdrop-blur">
        {contenido}
      </aside>
    </>
  );
}
