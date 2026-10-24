// Receptor de webhooks de Effi → tabla public.effi_webhook_events.
// URL: https://<proyecto>.supabase.co/functions/v1/effi-webhook?cuenta=TIENDA_CO
//
// El aviso se guarda crudo y se trata como NO confiable: el procesador vuelve a consultar el
// registro en la API de Effi con la API key de la cuenta. Por eso aquí solo se valida la forma
// y se responde rápido (Effi exige 2xx en menos de 5 s o reintenta).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_BYTES = 1_000_000;
const CUENTA_RE = /^[A-Z0-9_]{3,32}$/;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cuenta = (url.searchParams.get('cuenta') || '').toUpperCase();

  if (req.method === 'GET') return json(200, { ok: true, servicio: 'effi-webhook' });
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  if (!CUENTA_RE.test(cuenta)) return json(400, { ok: false, mensaje: 'Falta ?cuenta=' });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json(413, { ok: false, mensaje: 'Cuerpo demasiado grande' });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, mensaje: 'El cuerpo no es JSON' });
  }

  const row = {
    cuenta,
    delivery_id: req.headers.get('x-effi-delivery') || `sin-delivery-${crypto.randomUUID()}`,
    evento: req.headers.get('x-effi-event'),
    firma: req.headers.get('x-effi-signature'),
    payload,
  };

  // Upsert idempotente por (cuenta, delivery_id): un reintento de Effi no duplica el evento.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/effi_webhook_events?on_conflict=cuenta,delivery_id`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const detalle = await res.text();
    // 23503 = la cuenta no existe en effi_accounts: error de configuración, no reintentable.
    if (detalle.includes('23503')) return json(404, { ok: false, mensaje: `Cuenta desconocida: ${cuenta}` });
    console.error('insert effi_webhook_events', res.status, detalle);
    return json(500, { ok: false, mensaje: 'No se pudo guardar el aviso' });
  }
  return json(200, { ok: true });
});
