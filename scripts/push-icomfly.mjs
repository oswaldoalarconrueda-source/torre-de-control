// Prueba los tokens de icomfly del .env contra la API y los sube cifrados al Vault de Supabase (icomfly_guardar_token).
// ICOMFLY_TOKEN_HN → AUNCLIC_HN, ICOMFLY_TOKEN_SV → AUNCLIC_SV, ICOMFLY_TOKEN_CO → TIENDA_CO (Joalix Colombia)
// (scripts/guardar-icomfly.sh hn|sv|co).
// Uso: node --env-file=.env scripts/push-icomfly.mjs
// Nunca imprime los tokens ni datos de clientes: solo cuántos pedidos ve el token y de qué país/moneda son.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sync = process.env.EFFI_SYNC_TOKEN;
if (!url || !anon || !sync) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o EFFI_SYNC_TOKEN en el .env'); process.exit(1); }
const TIENDA = { HN: 'AUNCLIC_HN', SV: 'AUNCLIC_SV', CO: 'TIENDA_CO' };
const PAIS = { HN: 'Honduras', SV: 'El Salvador', CO: 'Colombia' };
const tokens = Object.entries(process.env).filter(([k]) => /^ICOMFLY_TOKEN_(HN|SV|CO)$/.test(k));
if (!tokens.length) { console.error('No hay ICOMFLY_TOKEN_HN ni ICOMFLY_TOKEN_SV en el .env (scripts/guardar-icomfly.sh hn)'); process.exit(1); }

// Busca en la respuesta el total de pedidos y los campos de país/moneda/tienda, sin tocar datos personales.
const campos = (o, re, out = {}, prof = 0) => {
  if (!o || typeof o !== 'object' || prof > 3) return out;
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object') campos(v, re, out, prof + 1);
    else if (re.test(k) && (typeof v === 'string' || typeof v === 'number') && String(v).length < 40 && !(k in out)) out[k] = v;
  }
  return out;
};

let fallas = 0;
for (const [k, token] of tokens) {
  const p = k.slice(-2), cuenta = TIENDA[p];
  const res = await fetch('https://api.icomfly.com/api/orders?limit=3', { headers: { Authorization: `Bearer ${token.trim()}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { fallas++; console.error(`✗ ${k}: icomfly respondió HTTP ${res.status} (${res.status === 401 ? 'token inválido o revocado' : 'revisa el token'}). No se guardó.`); continue; }
  const lista = Array.isArray(body) ? body : body.data?.orders ?? body.data?.data ?? body.orders ?? (Array.isArray(body.data) ? body.data : []);
  const total = campos(body, /^(total|totalItems|total_items|count|totalCount|total_pedidos)$/i);
  const pais = campos(lista[0] ?? {}, /^(pais|country|country_code|moneda|currency|divisa|store_id|tienda_id|storeId|store_name|tienda)$/i);
  const prueba = { pedidos_total: Object.values(total)[0] ?? null, muestra: lista.length, ...pais, probado_en: new Date().toISOString() };
  console.log(`✓ ${k}: el token funciona. Pedidos que ve: ${prueba.pedidos_total ?? '(sin total)'} · ${Object.entries(pais).map(([a, b]) => `${a}: ${b}`).join(' · ') || 'sin campos de país'}`);
  // icomfly a veces ata el token a otra tienda del mismo usuario: si la tienda no es la del país, no se guarda.
  const nombreTienda = String(pais.store_name ?? pais.tienda ?? '');
  // Colombia: basta con que no sea una tienda de A un clic (Honduras o El Salvador).
  const esperado = p === 'HN' ? /\bHN\b|hondur/i : p === 'SV' ? /\bSV\b|salvador/i : null;
  const ajena = p === 'CO' && /\bHN\b|hondur|\bSV\b|salvador|a un clic/i.test(nombreTienda);
  if (nombreTienda && ((esperado && !esperado.test(nombreTienda)) || ajena)) {
    fallas++;
    console.error(`  ✗ Este token es de la tienda «${nombreTienda}», no de ${PAIS[p]}. No se guardó. Genera el token estando dentro de la tienda de ${PAIS[p]}.`);
    continue;
  }
  const r = await fetch(`${url}/rest/v1/rpc/icomfly_guardar_token`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_sync: sync, p_cuenta: cuenta, p_token: token.trim(), p_prueba: prueba }),
  });
  if (r.ok) console.log(`  ✓ Guardado cifrado en el Vault para ${cuenta}.`);
  else { fallas++; const e = await r.json().catch(() => ({})); console.error(`  ✗ No se pudo guardar en el Vault: HTTP ${r.status} ${e.message ?? ''}`); }
}
process.exit(fallas ? 1 : 0);
