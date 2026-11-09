import { nombrePais } from "@/lib/paises";

// * rojo junto a una campaña o producto cuya pauta se entregó (toda o en parte) en otro país y se carga a esta tienda
// (p. ej. A un clic en Colombia → Honduras). paises: códigos separados por coma, como los da Meta ("CO" o "CO,US").
export function MarcaOtroPais({ paises }: { paises?: string | null }) {
  if (!paises) return null;
  const nombres = [...new Set(paises.split(","))].map(nombrePais).join(", ");
  return (
    <span className="ml-1 font-bold text-red" title={`Pauta entregada en ${nombres}: se carga a esta tienda`} aria-label={`Pauta de ${nombres}`}>*</span>
  );
}
