// Copia los tokens de Meta del .env al Vault de Supabase (cifrados), para la función meta-gasto. Uno por portafolio:
// META_ACCESS_TOKEN (Compras FACIL) y META_ACCESS_TOKEN_<NOMBRE> para los demás (scripts/guardar-meta.sh <nombre>).
// Uso: node --env-file=.env scripts/push-meta.mjs
// Los envía a meta-gasto (?accion=token) autenticándose con EFFI_SYNC_TOKEN, igual que push-gmail.mjs. Nunca imprime los tokens.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sync = process.env.EFFI_SYNC_TOKEN;
if (!url || !sync) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o EFFI_SYNC_TOKEN en el .env'); process.exit(1); }
const tokens = Object.entries(process.env).filter(([k]) => /^META_ACCESS_TOKEN(_[A-Z0-9]+)?$/.test(k));
if (!tokens.length) { console.error('No hay META_ACCESS_TOKEN en el .env (scripts/guardar-meta.sh)'); process.exit(1); }

let fallas = 0;
for (const [k, v] of tokens) {
  const nombre = k.toLowerCase();
  const res = await fetch(`${url}/functions/v1/meta-gasto?accion=token`, {
    method: 'POST',
    headers: { 'x-sync-token': sync, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, token: v.replace(/\s+/g, '') }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) console.log(`✓ ${k} guardado en Vault${body.portafolio ? ` (${body.portafolio})` : ''}`);
  else { fallas++; console.error(`✗ ${k}: HTTP ${res.status}: ${body.mensaje ?? 'sin detalle'}`); }
}
process.exit(fallas ? 1 : 0);
