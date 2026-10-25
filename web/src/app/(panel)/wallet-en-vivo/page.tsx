import { exigirModulo } from "@/lib/supabase/server";
import { WalletEnVivo } from "@/components/wallet-en-vivo";

// 🪙 Wallet en vivo: el saldo de la wallet Effi de cada país, en su moneda, subiendo con cada entrega pagada.
export default async function WalletEnVivoPage() {
  await exigirModulo("dinero");
  return (
    <div className="pt-8">
      <div className="mb-5">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">🪙 Wallet en vivo</h1>
        <p className="text-sm text-muted mt-1.5">
          Saldo de cada wallet Effi en su moneda, en tiempo real: cada entrega pagada lo sube y cada flete, costo o retiro lo baja.
        </p>
      </div>
      <WalletEnVivo />
    </div>
  );
}
