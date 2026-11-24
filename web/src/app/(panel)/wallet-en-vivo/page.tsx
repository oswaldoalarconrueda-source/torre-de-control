import { exigirModulo } from "@/lib/supabase/server";
import { enDemo } from "@/lib/demo-server";
import { WalletEnVivo } from "@/components/wallet-en-vivo";

// 🪙 Wallet en vivo: el saldo de la wallet Effi de cada país, en su moneda, subiendo con cada entrega pagada; y la billetera de
// Dropi de los países que también venden por Dropi (no en la demostración, que quedó congelada el 17-nov).
export default async function WalletEnVivoPage() {
  await exigirModulo("dinero");
  const demo = await enDemo();
  // Las billeteras de Others se ocultaron el 20-nov-2026 y volvieron el 24-nov-2026 (pedido del dueño): cada país con dos o más
  // billeteras muestra una sola tarjeta con el selector Todo / Effi / Others.
  const MOSTRAR_OA = true;
  return (
    <div className="pt-8">
      <div className="mb-5">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">🪙 Wallet en vivo</h1>
        <p className="text-sm text-muted mt-1.5">
          Saldo de cada wallet en su moneda, en tiempo real: cada entrega pagada lo sube y cada flete, costo o retiro lo baja.
          Donde hay más de una billetera, elige si ves todas juntas o cada una por separado.
        </p>
      </div>
      <WalletEnVivo dropi={MOSTRAR_OA && !demo} />
    </div>
  );
}
