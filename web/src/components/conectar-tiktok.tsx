"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fechaHora } from "@/lib/formato";

export type EstadoTiktok = {
  app: boolean; token: boolean; token_en: string | null;
  cuentas: { advertiser_id: string; nombre: string | null; divisa: string | null; zona_horaria: string | null; tienda: string | null; activo: boolean; autorizado_en: string }[];
};

// Los tres pasos de la conexión con TikTok, con lo que ya está hecho en verde. «Conectar TikTok» pide el enlace de
// autorización (tiktok_iniciar) y lleva a TikTok; al volver, la página dice cuántas cuentas quedaron autorizadas.
export function ConectarTiktok({ estado, error, ok, fallo }: { estado: EstadoTiktok | null; error: string | null; ok: number | null; fallo: string | null }) {
  const [yendo, setYendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  async function conectar() {
    setYendo(true); setAviso(null);
    const { data, error: e } = await createClient().rpc("tiktok_iniciar", { p_volver: window.location.origin });
    if (e || !data) { setYendo(false); setAviso(e?.message ?? "No se pudo armar el enlace de TikTok"); return; }
    window.location.href = String(data);
  }
  const paso = (hecho: boolean, titulo: string, detalle: React.ReactNode) => (
    <div className={`card p-4 border ${hecho ? "border-green/40" : "border-line"}`}>
      <div className={`font-semibold ${hecho ? "text-green" : ""}`}>{hecho ? "✓ " : ""}{titulo}</div>
      <div className="text-sm text-muted mt-1">{detalle}</div>
    </div>
  );
  if (error) return <div className="card p-4 text-red text-sm">{error}</div>;
  const cuentas = estado?.cuentas ?? [];
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      {ok != null && <div className="card p-4 border border-green/40 text-green text-sm font-semibold">✓ TikTok quedó conectado: {ok} {ok === 1 ? "cuenta publicitaria autorizada" : "cuentas publicitarias autorizadas"}.</div>}
      {fallo && <div className="card p-4 border border-red/40 text-red text-sm">No se pudo conectar TikTok: {fallo}</div>}
      {paso(!!estado?.app, "1. App de TikTok guardada", estado?.app
        ? "El App ID y el Secret están en el Vault."
        : <>Cuando TikTok apruebe la app, corre en la terminal <code className="font-mono text-text">scripts/guardar-tiktok.sh</code> y pega el App ID y el Secret.</>)}
      {paso(!!estado?.token, "2. Cuentas autorizadas", estado?.token
        ? <>Permiso guardado{estado.token_en ? ` el ${fechaHora(estado.token_en)}` : ""}. Si agregas cuentas en TikTok, vuelve a conectar.</>
        : "Lleva a TikTok: inicia sesión con tu usuario del Business Center y marca las cuentas publicitarias de A un clic.")}
      <div>
        <button onClick={conectar} disabled={!estado?.app || yendo}
          className="rounded-full bg-green px-5 py-2 text-sm font-bold text-black disabled:opacity-50">
          {yendo ? "Abriendo TikTok…" : estado?.token ? "Volver a conectar TikTok" : "Conectar TikTok"}
        </button>
        {!estado?.app && <span className="ml-3 text-xs text-muted">Se activa cuando la app esté guardada.</span>}
        {aviso && <div className="mt-2 text-sm text-red">{aviso}</div>}
      </div>
      {cuentas.length > 0 && (
        <div className="card p-4">
          <div className="font-semibold mb-2">Cuentas publicitarias ({cuentas.length})</div>
          <div className="fichas-caja overflow-x-auto">
            <table className="fichas w-full text-sm">
              <thead><tr className="text-left text-muted text-xs"><th className="py-1 pr-3">Cuenta</th><th className="py-1 pr-3">ID</th><th className="py-1 pr-3">Moneda</th><th className="py-1">Zona horaria</th></tr></thead>
              <tbody>
                {cuentas.map((c) => (
                  <tr key={c.advertiser_id} className="border-t border-line">
                    <td className="py-1.5 pr-3" data-label="Cuenta">{c.nombre ?? "—"}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs" data-label="ID">{c.advertiser_id}</td>
                    <td className="py-1.5 pr-3" data-label="Moneda">{c.divisa ?? "—"}</td>
                    <td className="py-1.5" data-label="Zona horaria">{c.zona_horaria ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {paso(false, "3. Gasto de TikTok en Publicidad", "Con las cuentas autorizadas se monta la carga automática cada hora (gasto, clics y conversiones por campaña y día) y el gasto aparece en Publicidad, CPA real y Productos de A un clic.")}
    </div>
  );
}
