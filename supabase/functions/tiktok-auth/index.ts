// tiktok-auth: conexión de la app de TikTok Ads (Marketing API) para A un clic (22-nov-2026).
//
// POST /functions/v1/tiktok-auth?accion=app  (cabecera x-sync-token)  body {"app_id": "...", "secret": "..."}
//   ← scripts/guardar-tiktok.sh: guarda el App ID y el Secret en el Vault. Nunca los devuelve.
// GET  /functions/v1/tiktok-auth?auth_code=...&state=...
//   ← TikTok, después de que el dueño autoriza en el enlace de tiktok_iniciar ("Conectar TikTok" en /tiktok). Esta es la
//   "Advertiser redirect URL" de la app. Cambia el auth_code por el token de acceso (no vence mientras no se revoque), lo
//   guarda en el Vault, registra las cuentas publicitarias autorizadas (tiktok_cuentas) y vuelve a /tiktok del Centro de
//   Control. El token nunca sale en respuestas ni en errores.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API = 'https://business-api.tiktok.com/open_api/v1.3';

async function rpc(fn: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${fn} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const texto = (status: number, t: string) => new Response(t, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
const volverA = (base: string, params: Record<string, string>) =>
  new Response(null, { status: 302, headers: { Location: `${base}/tiktok?${new URLSearchParams(params)}` } });

// Llamada a TikTok: responde { code, message, data }; code 0 = bien. Los secretos nunca salen en el error.
async function tiktok(ruta: string, init: RequestInit, ocultar: string[]) {
  const res = await fetch(`${API}${ruta}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.code !== 0) {
    let m = `TikTok ${body?.code ?? res.status}: ${String(body?.message ?? 'sin detalle')}`;
    for (const s of ocultar) if (s) m = m.replaceAll(s, '***');
    throw new Error(m.slice(0, 300));
  }
  return body.data ?? {};
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 1. Guardar la app (App ID y Secret), desde el script del dueño.
  if (req.method === 'POST') {
    const sync = req.headers.get('x-sync-token') || '';
    if (!sync || !(await rpc('effi_check_sync_token', { p_token: sync }))) return json(401, { ok: false, mensaje: 'Token inválido' });
    if (url.searchParams.get('accion') !== 'app') return json(400, { ok: false, mensaje: 'Acción desconocida' });
    const body = await req.json().catch(() => ({})) as { app_id?: string; secret?: string };
    const appId = String(body.app_id ?? '').replace(/\s+/g, '');
    const secret = String(body.secret ?? '').replace(/\s+/g, '');
    if (!/^\d{10,25}$/.test(appId)) return json(400, { ok: false, mensaje: 'El App ID de TikTok son solo números (10 a 25)' });
    if (!/^[A-Za-z0-9]{20,80}$/.test(secret)) return json(400, { ok: false, mensaje: 'El Secret no tiene el formato de TikTok' });
    await rpc('app_guardar_secreto', { p_nombre: 'tiktok_app_id', p_valor: appId });
    await rpc('app_guardar_secreto', { p_nombre: 'tiktok_app_secret', p_valor: secret });
    return json(200, { ok: true, guardados: ['tiktok_app_id', 'tiktok_app_secret'] });
  }
  if (req.method !== 'GET') return json(405, { ok: false, mensaje: 'Método no permitido' });

  // 2. Regreso de TikTok con el permiso.
  const authCode = url.searchParams.get('auth_code') ?? url.searchParams.get('code') ?? '';
  const estado = url.searchParams.get('state') ?? '';
  if (!authCode || !estado) return texto(400, 'Falta el permiso de TikTok. Vuelve a pulsar «Conectar TikTok» en el Centro de Control.');
  const volver = (await rpc('tiktok_usar_estado', { p_estado: estado })) as string | null;
  if (!volver) return texto(400, 'Este enlace ya se usó o venció (dura 30 minutos). Vuelve a pulsar «Conectar TikTok» en el Centro de Control.');

  const cred = (await rpc('tiktok_credenciales', {})) as { app_id: string | null; secret: string | null };
  if (!cred?.app_id || !cred?.secret) return volverA(volver, { error: 'Falta guardar el App ID y el Secret de la app (scripts/guardar-tiktok.sh)' });
  const ocultar = [cred.secret, authCode];
  try {
    const d = await tiktok('/oauth2/access_token/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: cred.app_id, secret: cred.secret, auth_code: authCode }),
    }, ocultar);
    const token = String(d.access_token ?? '');
    if (!token) throw new Error('TikTok no devolvió el token de acceso');
    ocultar.push(token);
    await rpc('app_guardar_secreto', { p_nombre: 'tiktok_access_token', p_valor: token });

    // Cuentas publicitarias autorizadas, con su divisa y zona horaria.
    const q = new URLSearchParams({ app_id: cred.app_id, secret: cred.secret });
    const lista = (await tiktok(`/oauth2/advertiser/get/?${q}`, { headers: { 'Access-Token': token } }, ocultar)).list as
      { advertiser_id: string | number; advertiser_name?: string }[] | undefined;
    const ids = (lista ?? []).map((x) => String(x.advertiser_id));
    const info = new Map<string, { name?: string; currency?: string; timezone?: string; display_timezone?: string }>();
    for (let i = 0; i < ids.length; i += 50) {
      const p = new URLSearchParams({ advertiser_ids: JSON.stringify(ids.slice(i, i + 50)), fields: JSON.stringify(['name', 'currency', 'timezone', 'display_timezone']) });
      const r = await tiktok(`/advertiser/info/?${p}`, { headers: { 'Access-Token': token } }, ocultar).catch(() => ({ list: [] }));
      for (const x of (r.list ?? []) as { advertiser_id: string | number }[]) info.set(String(x.advertiser_id), x as never);
    }
    const cuentas = (lista ?? []).map((x) => {
      const id = String(x.advertiser_id);
      const extra = info.get(id);
      return { advertiser_id: id, nombre: extra?.name ?? x.advertiser_name ?? null, divisa: extra?.currency ?? null,
        zona_horaria: extra?.display_timezone ?? extra?.timezone ?? null };
    });
    const n = cuentas.length ? await rpc('tiktok_guardar_cuentas', { p_cuentas: cuentas }) : 0;
    return volverA(volver, { ok: String(n) });
  } catch (e) {
    let m = String(e instanceof Error ? e.message : e);
    for (const s of ocultar) if (s) m = m.replaceAll(s, '***');
    return volverA(volver, { error: m.slice(0, 200) });
  }
});
