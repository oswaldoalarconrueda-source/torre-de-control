"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// ☀️/🌙 Modo claro u oscuro: cada empleado escoge cómo trabaja. Se guarda en su navegador (torre-tema) y el script del
// layout raíz lo aplica antes de pintar, para que no haya destello al abrir.
type Tema = "dark" | "light";
const CLAVE = "torre-tema";

export function SelectorTema({ className = "" }: { className?: string }) {
  const [tema, setTema] = useState<Tema>("dark");
  useEffect(() => {
    setTema(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  const poner = (t: Tema) => {
    setTema(t);
    if (t === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem(CLAVE, t); } catch { /* sin almacenamiento: vale solo por esta visita */ }
  };
  const boton = (t: Tema, Icono: typeof Sun, texto: string) => (
    <button onClick={() => poner(t)} aria-pressed={tema === t}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors ${tema === t ? "bg-blue/15 text-text font-semibold" : "text-muted hover:text-text"}`}>
      <Icono size={13} /> {texto}
    </button>
  );
  return (
    <div className={`inline-flex rounded-xl border border-line bg-panel p-0.5 text-xs ${className}`} role="group" aria-label="Modo de color">
      {boton("dark", Moon, "Oscuro")}
      {boton("light", Sun, "Claro")}
    </div>
  );
}
