// Copia GMAIL_USER y GMAIL_APP_PASSWORD del .env al Vault de Supabase (cifrados), para el informe diario.
// Uso: node --env-file=.env scripts/push-gmail.mjs
// Los envía a la función informe-diario (?accion=credenciales) autenticándose con EFFI_SYNC_TOKEN, igual que
// push-effi-keys.mjs. Nunca imprime los valores.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const token = process.env.EFFI_SYNC_TOKEN;
const user = (process.env.GMAIL_USER ?? '').trim();
const pass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, '');
if (!url || !token) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o EFFI_SYNC_TOKEN en el .env'); process.exit(1); }
if (!user.includes('@') || pass.length !== 16) { console.error('Revisa GMAIL_USER (correo) y GMAIL_APP_PASSWORD (16 letras) en el .env'); process.exit(1); }

const res = await fetch(`${url}/functions/v1/informe-diario?accion=credenciales`, {
  method: 'POST',
  headers: { 'x-sync-token': token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ user, pass }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`✗ HTTP ${res.status}: ${body.mensaje ?? 'sin detalle'}`); process.exit(1); }
console.log(`✓ Guardados en Vault: ${body.guardados.join(', ')}`);
