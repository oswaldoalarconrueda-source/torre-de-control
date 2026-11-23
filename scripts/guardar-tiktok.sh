#!/bin/zsh
# Guarda en el Vault de Supabase el App ID y el Secret de la app de TikTok Ads (Marketing API) de A un clic, sin mostrarlos
# ni dejarlos en el .env. Pasa por la función tiktok-auth (?accion=app) autenticándose con EFFI_SYNC_TOKEN del .env.
# Uso: scripts/guardar-tiktok.sh
# Después: en el Centro de Control, /tiktok → «Conectar TikTok».
cd "$(dirname "$0")/.." || exit 1
[[ -f .env ]] || { echo "No encuentro el .env en $(pwd)"; exit 1; }
read "a?App ID de TikTok (solo números): "
read -s "s?Secret de TikTok (no se ve al escribir): "
echo
a="${a//[[:space:]]/}"; s="${s//[[:space:]]/}"
[[ -z "$a" || -z "$s" ]] && { echo "Falta el App ID o el Secret; no se guardó nada."; exit 1; }
TIKTOK_APP_ID="$a" TIKTOK_APP_SECRET="$s" node --env-file=.env --input-type=module -e '
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, sync = process.env.EFFI_SYNC_TOKEN;
if (!url || !sync) { console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o EFFI_SYNC_TOKEN en el .env"); process.exit(1); }
const res = await fetch(`${url}/functions/v1/tiktok-auth?accion=app`, {
  method: "POST", headers: { "x-sync-token": sync, "Content-Type": "application/json" },
  body: JSON.stringify({ app_id: process.env.TIKTOK_APP_ID, secret: process.env.TIKTOK_APP_SECRET }),
});
const b = await res.json().catch(() => ({}));
if (res.ok) console.log("✓ App de TikTok guardada en el Vault. Ahora: Centro de Control → /tiktok → Conectar TikTok");
else { console.error(`✗ HTTP ${res.status}: ${b.mensaje ?? "sin detalle"}`); process.exit(1); }
'
