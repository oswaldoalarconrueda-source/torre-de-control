// correo: envía un correo suelto desde el Gmail del Centro de Control (el mismo de los informes), p. ej. una invitación.
// POST /functions/v1/correo   (cabecera x-sync-token)   body {"para": ["a@x.com"], "asunto": "...", "texto": "...", "html": "..."}
// La cuenta y la contraseña de aplicación de Gmail salen del Vault (informe_credenciales); nunca se devuelven.

import nodemailer from 'npm:nodemailer@6.9.16';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function rpc(fn: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${fn} HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const token = req.headers.get('x-sync-token') || '';
  if (!token || !(await rpc('effi_check_sync_token', { p_token: token }))) return json(401, { ok: false, mensaje: 'Token inválido' });
  try {
    const b = await req.json().catch(() => ({})) as { para?: string[]; asunto?: string; texto?: string; html?: string };
    const para = (b.para ?? []).map((x) => String(x).trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (!para.length || para.length > 10) return json(400, { ok: false, mensaje: 'Destinatarios inválidos (1 a 10)' });
    if (!b.asunto?.trim() || !(b.texto?.trim() || b.html?.trim())) return json(400, { ok: false, mensaje: 'Falta asunto o cuerpo' });
    const cred = await rpc('informe_credenciales', {}) as { user: string | null; pass: string | null };
    if (!cred?.user || !cred?.pass) return json(400, { ok: false, mensaje: 'Falta la cuenta de Gmail en el Vault' });
    const transporte = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: cred.user, pass: cred.pass } });
    const info = await transporte.sendMail({ from: `Centro de Control <${cred.user}>`, to: para.join(', '), subject: b.asunto.trim(),
      text: b.texto, html: b.html });
    return json(200, { ok: true, enviados: para.length, id: info.messageId, aceptados: info.accepted?.length ?? 0, rechazados: info.rejected?.length ?? 0 });
  } catch (e) {
    return json(500, { ok: false, mensaje: String((e as Error).message ?? e).slice(0, 300) });
  }
});
