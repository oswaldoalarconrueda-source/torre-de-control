// Copia META_ACCESS_TOKEN del .env al Vault de Supabase (cifrado), para la función meta-gasto.
// Uso: node --env-file=.env scripts/push-meta.mjs
// Lo envía a meta-gasto (?accion=token) autenticándose con EFFI_SYNC_TOKEN, igual que push-gmail.mjs. Nunca imprime el token.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sync = process.env.EFFI_SYNC_TOKEN;
const token = (process.env.META_ACCESS_TOKEN ?? '').replace(/\s+/g, '');
if (!url || !sync) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o EFFI_SYNC_TOKEN en el .env'); process.exit(1); }
if (!token.startsWith('EA')) { console.error('Revisa META_ACCESS_TOKEN en el .env (scripts/guardar-meta.sh)'); process.exit(1); }

const res = await fetch(`${url}/functions/v1/meta-gasto?accion=token`, {
  method: 'POST',
  headers: { 'x-sync-token': sync, 'Content-Type': 'application/json' },
  body: JSON.stringify({ token }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`✗ HTTP ${res.status}: ${body.mensaje ?? 'sin detalle'}`); process.exit(1); }
console.log(`✓ Guardado en Vault: ${body.guardados.join(', ')}`);
