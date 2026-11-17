// push: manda las notificaciones al celular (Web Push) de lo que esté pendiente en app_push_cola.
//
// POST /functions/v1/push   (cabecera x-sync-token) ← push_despachar() al encolar un aviso, y el cron push-pendientes cada minuto.
//   Toma lo pendiente (push_pendientes), lo envía a cada celular de la persona y anota el resultado (push_resultado).
//   Un celular que el servicio de Apple/Google da por vencido (404/410) se desactiva solo.
// Las llaves VAPID se generan aquí la primera vez y quedan cifradas en el Vault (push_guardar_claves); nunca salen de Supabase,
// salvo la pública, que el navegador necesita para suscribirse.

import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CONTACTO = 'https://torre-de-control-inky.vercel.app'; // Apple y Google piden un contacto (mailto o https)

async function rpc(fn: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${fn} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Sus = { id: number; endpoint: string; p256dh: string; auth: string };
type Aviso = { id: number; tipo: string; titulo: string; cuerpo: string | null; url: string | null; suscripciones: Sus[] };

async function claves() {
  let c = (await rpc('push_claves', {})) as { publica: string | null; privada: string | null };
  if (!c?.publica || !c?.privada) {
    const k = webpush.generateVAPIDKeys();
    await rpc('push_guardar_claves', { p_publica: k.publicKey, p_privada: k.privateKey });
    c = { publica: k.publicKey, privada: k.privateKey };
  }
  return c as { publica: string; privada: string };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  try {
    const c = await claves();
    webpush.setVapidDetails(CONTACTO, c.publica, c.privada);
    const avisos = ((await rpc('push_pendientes', {})) ?? []) as Aviso[];
    let total = 0;
    for (const a of avisos) {
      const carga = JSON.stringify({ titulo: a.titulo, cuerpo: a.cuerpo ?? '', url: a.url ?? '/', tipo: a.tipo, id: a.id });
      const bien: number[] = [], malas: number[] = [];
      let error: string | null = null;
      for (const s of a.suscripciones) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga,
            { TTL: 6 * 3600, urgency: 'high', topic: a.tipo.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined });
          bien.push(s.id);
        } catch (e) {
          const st = (e as { statusCode?: number }).statusCode;
          if (st === 404 || st === 410) malas.push(s.id);
          error = `${st ?? ''} ${(e as { body?: string; message?: string }).body ?? (e as Error).message ?? e}`.trim().slice(0, 300);
        }
      }
      total += bien.length;
      await rpc('push_resultado', { p_cola: a.id, p_enviados: bien.length, p_error: bien.length ? null : (error ?? 'Sin celulares activos'), p_malas: malas, p_bien: bien });
    }
    return json(200, { ok: true, avisos: avisos.length, enviados: total });
  } catch (e) {
    return json(500, { ok: false, mensaje: String((e as Error).message ?? e) });
  }
});
