// registro: alta de usuarios desde el link /registro de la Torre (pública, sin sesión).
// POST { nombre, cedula, email, clave } → crea la cuenta YA confirmada (el correo de confirmación de Supabase no le
// llega a gente externa) con nombre y cédula en sus datos; el trigger app_nuevo_usuario la deja como 'pendiente',
// sin acceso a nada, hasta que el dueño la apruebe en /usuarios.
// Freno contra abuso: un campo trampa (`sitio`) y un máximo de solicitudes pendientes nuevas por hora.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_POR_HORA = 30;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { ok: false, mensaje: 'Solo POST' });
  const b = await req.json().catch(() => ({}));
  if (b.sitio) return json(200, { ok: true }); // trampa para robots: se ignora en silencio

  const nombre = String(b.nombre ?? '').trim().replace(/\s+/g, ' ');
  const cedula = String(b.cedula ?? '').trim().replace(/[\s.]/g, '');
  const email = String(b.email ?? '').trim().toLowerCase();
  const clave = String(b.clave ?? '');
  if (nombre.length < 3 || nombre.length > 120) return json(400, { ok: false, mensaje: 'Escribe tu nombre completo.' });
  if (!/^[A-Za-z0-9-]{5,20}$/.test(cedula)) return json(400, { ok: false, mensaje: 'Escribe tu número de cédula o documento (solo números y letras).' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(400, { ok: false, mensaje: 'Escribe un correo válido.' });
  if (clave.length < 8) return json(400, { ok: false, mensaje: 'La clave debe tener mínimo 8 caracteres.' });

  const cab = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_usuarios?rol=eq.pendiente&creado_en=gte.${desde}&select=user_id`, { headers: { ...cab, Prefer: 'count=exact', Range: '0-0' } });
  const total = Number(r.headers.get('content-range')?.split('/')[1] ?? 0);
  if (total >= MAX_POR_HORA) return json(429, { ok: false, mensaje: 'Hay muchas solicitudes en este momento. Intenta de nuevo en una hora.' });

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: cab,
    body: JSON.stringify({ email, password: clave, email_confirm: true, user_metadata: { nombre, cedula } }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 422 || /already|registered|exists/i.test(t)) {
      return json(409, { ok: false, mensaje: 'Ese correo ya está registrado. Si olvidaste la clave, usa “Olvidé mi clave” en la entrada.' });
    }
    if (/password/i.test(t)) return json(400, { ok: false, mensaje: 'La clave es muy débil: usa letras y números.' });
    console.error('registro', res.status, t.slice(0, 300));
    return json(500, { ok: false, mensaje: 'No se pudo crear la cuenta. Intenta de nuevo.' });
  }
  return json(200, { ok: true });
});
