// Autoriza una vez el MCP oficial de Drop (soydrop) para A un clic Honduras / El Salvador, solo con permisos de LECTURA.
// Abre el inicio de sesión oficial de Drop: el dueño entra con su usuario y autoriza. El permiso (client_id + refresh_token)
// se guarda cifrado en el Vault (rpc drop_guardar_oauth) y nunca se imprime.
// Uso (desde la carpeta del proyecto): node --env-file=.env scripts/autorizar-drop.mjs AUNCLIC_HN [--explorar]
//   --explorar  además deja el acceso de 1 hora en tools/.drop-acceso.json (600, fuera del repo) para revisar qué trae Drop;
//               se borra a mano al terminar.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cuenta = process.argv[2];
const explorar = process.argv.includes('--explorar');
if (!['AUNCLIC_HN', 'AUNCLIC_SV'].includes(cuenta)) { console.error('Uso: node --env-file=.env scripts/autorizar-drop.mjs AUNCLIC_HN|AUNCLIC_SV'); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, sync = process.env.EFFI_SYNC_TOKEN;
if (!url || !anon || !sync) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o EFFI_SYNC_TOKEN en el .env'); process.exit(1); }

const MCP = 'https://api.soydrop.com/mcp', AUTH = 'https://api.soydrop.com';
const SCOPE = 'drop:orders:read drop:catalog:read drop:analytics:read drop:customers:read drop:incidents:read'; // solo lectura
const PORT = 8765, REDIR = `http://localhost:${PORT}/cb`;
const tools = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools');
const archivoUrl = path.join(tools, 'drop-autorizar.txt');

const reg = await (await fetch(`${AUTH}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_name: `Centro de Control (${cuenta})`, redirect_uris: [REDIR], grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'], token_endpoint_auth_method: 'none', scope: SCOPE }) })).json();
if (!reg.client_id) { console.error('Drop no aceptó el registro:', JSON.stringify(reg).slice(0, 200)); process.exit(1); }
const ver = crypto.randomBytes(32).toString('base64url');
const chal = crypto.createHash('sha256').update(ver).digest('base64url');
const state = crypto.randomBytes(8).toString('hex');
const dir = `${AUTH}/oauth/authorize?response_type=code&client_id=${encodeURIComponent(reg.client_id)}&redirect_uri=${encodeURIComponent(REDIR)}` +
  `&code_challenge=${chal}&code_challenge_method=S256&scope=${encodeURIComponent(SCOPE)}&state=${state}&resource=${encodeURIComponent(MCP)}`;
fs.mkdirSync(tools, { recursive: true });
fs.writeFileSync(archivoUrl, dir);
console.log(`Abre la dirección de tools/drop-autorizar.txt y entra con el usuario de Drop de ${cuenta}.`);

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIR);
  if (u.pathname !== '/cb') { res.end(); return; }
  const fin = (ok, msg) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<h2>${ok ? 'Listo ✓' : 'No se pudo'}</h2><p>${msg}</p>`); fs.rmSync(archivoUrl, { force: true }); srv.close(); setTimeout(() => process.exit(ok ? 0 : 1), 100); };
  if (u.searchParams.get('state') !== state) return fin(false, 'Respuesta que no corresponde a esta autorización.');
  const code = u.searchParams.get('code');
  if (!code) { console.error('✗ Drop no autorizó:', u.searchParams.get('error')); return fin(false, 'Drop no autorizó.'); }
  const tok = await (await fetch(`${AUTH}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIR, client_id: reg.client_id, code_verifier: ver, resource: MCP }) })).json();
  if (!tok.access_token) { console.error('✗ Drop no entregó acceso (claves:', Object.keys(tok).join(','), ')'); return fin(false, 'Sin acceso.'); }
  if (explorar) fs.writeFileSync(path.join(tools, '.drop-acceso.json'), JSON.stringify({ access_token: tok.access_token, scope: tok.scope, expires_in: tok.expires_in }), { mode: 0o600 });
  if (!tok.refresh_token) { console.error('⚠ Drop no entregó refresh_token: no se podrá renovar solo (claves:', Object.keys(tok).join(','), ')'); return fin(true, 'Autorizado, pero sin renovación automática.'); }
  const r = await fetch(`${url}/rest/v1/rpc/drop_guardar_oauth`, { method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_sync: sync, p_cuenta: cuenta, p_oauth: { client_id: reg.client_id, refresh_token: tok.refresh_token, scope: tok.scope ?? SCOPE, guardado: new Date().toISOString() } }) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); console.error('✗ No se guardó en el Vault:', e.message ?? r.status); return fin(false, 'No se guardó.'); }
  console.log(`✓ Permiso de Drop guardado cifrado para ${cuenta} (permisos: ${tok.scope ?? SCOPE}). Ya puedes volver al chat.`);
  fin(true, 'Ya puedes volver al chat.');
}).listen(PORT);
setTimeout(() => { console.error('Tiempo agotado (15 min)'); fs.rmSync(archivoUrl, { force: true }); process.exit(1); }, 15 * 60e3);
