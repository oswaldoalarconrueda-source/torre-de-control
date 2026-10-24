// Copia las API keys de Effi del .env al Vault de Supabase (cifradas), para que el sync las use.
// Uso: node --env-file=.env scripts/push-effi-keys.mjs
// Las envía a la función effi-sync (?accion=set_keys) autenticándose con EFFI_SYNC_TOKEN.
// Nunca imprime las keys.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const token = process.env.EFFI_SYNC_TOKEN;
if (!url || !token) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o EFFI_SYNC_TOKEN en el .env');
  process.exit(1);
}

const slugs = (process.env.EFFI_ACCOUNTS || '').split(',').map((s) => s.trim()).filter(Boolean);
const keys = {};
for (const slug of slugs) {
  const key = process.env[`EFFI_${slug}_API_KEY`];
  if (key) keys[slug] = key;
  else console.log(`- ${slug}: sin API key en .env, se omite`);
}

const res = await fetch(`${url}/functions/v1/effi-sync?accion=set_keys`, {
  method: 'POST',
  headers: { 'x-sync-token': token, 'Content-Type': 'application/json' },
  body: JSON.stringify(keys),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`✗ HTTP ${res.status}: ${body.mensaje ?? 'sin detalle'}`);
  process.exit(1);
}
console.log(`✓ Guardadas en Vault: ${body.guardadas.join(', ') || '(ninguna)'}`);
const faltan = Object.keys(keys).filter((s) => !body.guardadas.includes(s));
if (faltan.length) console.log(`✗ No se guardaron: ${faltan.join(', ')}`);
