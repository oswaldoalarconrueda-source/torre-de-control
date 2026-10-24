import glosario from "@/lib/glosario.json";
import { GlosarioLista } from "./lista";

// Definiciones tomadas tal cual del Dashboard Joalix Group (constante GLOSARIO).
export default function GlosarioPage() {
  return (
    <div className="pt-8">
      <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">📖 Glosario</h1>
      <p className="text-sm text-muted mt-1.5">Qué significa cada término, cómo se calcula y dónde aparece. Las mismas definiciones de tu dashboard.</p>
      <GlosarioLista terminos={glosario as { c: string; t: string; d: string; f: string; w: string }[]} />
    </div>
  );
}
