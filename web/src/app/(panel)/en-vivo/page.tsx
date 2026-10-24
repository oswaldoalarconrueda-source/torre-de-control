import { EnVivo } from "@/components/en-vivo";

// ⚡ En vivo: la operación de todas las tiendas (o de una) latiendo con cada cambio de estado.
export default function EnVivoPage() {
  return (
    <div className="pt-8">
      <div className="mb-5">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">⚡ En vivo</h1>
        <p className="text-sm text-muted mt-1.5">
          Toda la operación palpitando: cada cambio de estado viaja del país a su estado. Elige todas las tiendas o una sola.
        </p>
      </div>
      <EnVivo />
    </div>
  );
}
