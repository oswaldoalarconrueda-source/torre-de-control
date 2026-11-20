// Autoriza una vez el MCP oficial de Dropi para la sincronización de órdenes (función dropi-sync).
// Abre el inicio de sesión oficial (oauth.dropi.co): el dueño elige el país, entra con el usuario de ESA cuenta y autoriza.
// El permiso (client_id + refresh_token) se guarda cifrado en el Vault (rpc dropi_guardar_oauth) y nunca se imprime.
// Uso (desde la carpeta del proyecto): node --env-file=.env scripts/autorizar-dropi.mjs AUNCLIC_GT

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cuenta = process.argv[2];
if (!['AUNCLIC_GT', 'TIENDA_GT', 'TIENDA_CO'].includes(cuenta)) { console.error('Uso: node --env-file=.env scripts/autorizar-dropi.mjs AUNCLIC_GT|TIENDA_GT|TIENDA_CO'); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, sync = process.env.EFFI_SYNC_TOKEN;
if (!url || !anon || !sync) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o EFFI_SYNC_TOKEN en el .env'); process.exit(1); }

// 19-nov-2026: Dropi movió su servidor de permisos a mcp.dropi.co (lo anuncia el propio MCP en
// /.well-known/oauth-protected-resource); integrations.dropi.co y oauth.dropi.co dejaron de funcionar.
// Permisos de solo lectura: órdenes, cartera (billing), reportes e inventario. Nada de escritura.
const MCP = 'https://mcp.dropi.co/mcp', AUTH = 'https://mcp.dropi.co';
const SCOPE = 'read:orders read:billing read:reports read:inventory';
const PORT = 8765, REDIR = `http://localhost:${PORT}/cb`;
const archivoUrl = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'dropi-autorizar.txt');

const reg = await (await fetch(`${AUTH}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_name: `Centro de Control (${cuenta})`, redirect_uris: [REDIR], grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'], token_endpoint_auth_method: 'none', scope: SCOPE }) })).json();
if (!reg.client_id) { console.error('Dropi no aceptó el registro:', JSON.stringify(reg).slice(0, 200)); process.exit(1); }
const ver = crypto.randomBytes(32).toString('base64url');
const chal = crypto.createHash('sha256').update(ver).digest('base64url');
const state = crypto.randomBytes(8).toString('hex');
const dir = `${AUTH}/login/authorize?response_type=code&client_id=${encodeURIComponent(reg.client_id)}&redirect_uri=${encodeURIComponent(REDIR)}` +
  `&code_challenge=${chal}&code_challenge_method=S256&scope=${encodeURIComponent(SCOPE)}&state=${state}&resource=${encodeURIComponent(MCP)}`;
fs.mkdirSync(path.dirname(archivoUrl), { recursive: true });
fs.writeFileSync(archivoUrl, dir);
console.log(`Se abre tu navegador con el inicio de sesión de Dropi (si no se abre, copia esta dirección):\n\n${dir}\n\nElige el país, entra con el usuario de ${cuenta} y autoriza. Deja esta ventana abierta hasta ver «Listo ✓» (15 min).`);
// En el Mac lo abre en el navegador predeterminado (Chrome, Safari…). La dirección no lleva claves: solo el reto PKCE.
if (process.platform === 'darwin') (await import('node:child_process')).spawn('open', [dir], { stdio: 'ignore', detached: true }).unref();

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIR);
  if (u.pathname !== '/cb') { res.end(); return; }
  const fin = (ok, msg) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<h2>${ok ? 'Listo ✓' : 'No se pudo'}</h2><p>${msg}</p>`); fs.rmSync(archivoUrl, { force: true }); srv.close(); setTimeout(() => process.exit(ok ? 0 : 1), 100); };
  if (u.searchParams.get('state') !== state) return fin(false, 'Respuesta que no corresponde a esta autorización.');
  const code = u.searchParams.get('code');
  if (!code) { console.error('✗ Dropi no autorizó:', u.searchParams.get('error')); return fin(false, 'Dropi no autorizó.'); }
  const tok = await (await fetch(`${AUTH}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIR, client_id: reg.client_id, code_verifier: ver, resource: MCP }) })).json();
  if (!tok.refresh_token) { console.error('✗ Dropi no entregó refresh_token (claves:', Object.keys(tok).join(','), ')'); return fin(false, 'Sin permiso de renovación.'); }
  const r = await fetch(`${url}/rest/v1/rpc/dropi_guardar_oauth`, { method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_sync: sync, p_cuenta: cuenta, p_oauth: { client_id: reg.client_id, refresh_token: tok.refresh_token, auth: AUTH, scope: tok.scope ?? SCOPE, guardado: new Date().toISOString() } }) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); console.error('✗ No se guardó en el Vault:', e.message ?? r.status); return fin(false, 'No se guardó.'); }
  console.log(`✓ Permiso de Dropi guardado cifrado para ${cuenta}. Ya puedes volver al chat.`);
  fin(true, 'Ya puedes volver al chat.');
}).listen(PORT);
setTimeout(() => { console.error('Tiempo agotado (15 min)'); fs.rmSync(archivoUrl, { force: true }); process.exit(1); }, 15 * 60e3);
