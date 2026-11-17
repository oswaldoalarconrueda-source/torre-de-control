"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fechaHora } from "@/lib/formato";
import { Panel } from "./ui";

type Datos = {
  dispositivos: { endpoint: string; dispositivo: string | null; creado_en: string; ultimo_envio: string | null; ultimo_error: string | null }[];
  avisos: { id: number; tipo: string; titulo: string; cuerpo: string | null; creado_en: string; enviado_en: string | null; enviados: number | null; error: string | null }[];
};

type Alerta = { clave: string; nombre: string; detalle: string | null; activa: boolean; params: Record<string, unknown> };

// La llave pública VAPID viene en base64 url; el navegador la pide en bytes.
const bytes = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const nombreDispositivo = () => {
  const ua = navigator.userAgent;
  const so = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Navegador";
  return `${so} · ${/CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Navegador"}`;
};

export function MisAlertas() {
  const supabase = createClient();
  const [soporte, setSoporte] = useState<"si" | "no" | "instalar" | null>(null);
  const [permiso, setPermiso] = useState<NotificationPermission | null>(null);
  const [suscrito, setSuscrito] = useState<string | null>(null);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [esIphone, setEsIphone] = useState(false);

  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const recargar = useCallback(async () => {
    const [d, a] = await Promise.all([supabase.rpc("push_mis_datos"), supabase.rpc("alerta_config_lista")]);
    setDatos((d.data ?? null) as Datos | null);
    setAlertas((a.data ?? []) as Alerta[]);
  }, [supabase]);

  async function guardarAlerta(clave: string, activa: boolean, params?: Record<string, unknown>) {
    setOcupado(true);
    const { error } = await supabase.rpc("alerta_config_guardar", { p_clave: clave, p_activa: activa, p_params: params ?? null });
    setOcupado(false);
    if (error) setMsg({ ok: false, t: error.message });
    recargar();
  }

  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    setEsIphone(ios);
    const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const hay = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSoporte(hay ? "si" : ios && !instalada ? "instalar" : "no");
    if ("Notification" in window) setPermiso(Notification.permission);
    if (hay) navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setSuscrito(s?.endpoint ?? null)).catch(() => {});
    recargar();
    const t = setInterval(recargar, 15_000);
    return () => clearInterval(t);
  }, [recargar]);

  async function activar() {
    setOcupado(true); setMsg(null);
    try {
      const p = await Notification.requestPermission();
      setPermiso(p);
      if (p !== "granted") throw new Error("No diste permiso. En el iPhone: Ajustes → Notificaciones → Centro de Control → Permitir notificaciones.");
      const { data: clave, error } = await supabase.rpc("push_clave_publica");
      if (error || !clave) throw new Error("El servicio de notificaciones todavía no está encendido. Avísale a Claude.");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(String(clave)) }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await supabase.rpc("push_suscribir", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_dispositivo: nombreDispositivo() });
      if (r.error) throw new Error(r.error.message);
      setSuscrito(j.endpoint);
      setMsg({ ok: true, t: "Listo: este celular ya recibe las alertas. Toca «Enviar prueba» para verla llegar." });
      recargar();
    } catch (e) {
      setMsg({ ok: false, t: (e as Error).message });
    } finally { setOcupado(false); }
  }

  async function probar() {
    setOcupado(true); setMsg(null);
    const { data, error } = await supabase.rpc("push_probar");
    setOcupado(false);
    if (error) return setMsg({ ok: false, t: error.message });
    setMsg(Number(data) > 0 ? { ok: true, t: "Prueba enviada. Bloquea el celular: debe llegar en unos segundos." } : { ok: false, t: "No hay ningún celular activado todavía." });
    setTimeout(recargar, 4000);
  }

  async function quitar(endpoint: string) {
    setOcupado(true);
    if (endpoint === suscrito) {
      const s = await navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).catch(() => null);
      await s?.unsubscribe().catch(() => {});
      setSuscrito(null);
    }
    await supabase.rpc("push_desuscribir", { p_endpoint: endpoint });
    setOcupado(false);
    recargar();
  }

  const btn = "rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50";
  return (
    <div className="space-y-3">
      <Panel titulo="Este celular">
        {soporte === "instalar" ? (
          <div className="text-sm space-y-2">
            <p>Para recibir notificaciones en el iPhone, primero instala el Centro de Control:</p>
            <ol className="list-decimal pl-5 space-y-1 text-muted">
              <li>Abre esta página en <b className="text-text">Safari</b>.</li>
              <li>Toca <b className="text-text">Compartir</b> (el cuadro con la flecha hacia arriba).</li>
              <li>Elige <b className="text-text">Agregar a pantalla de inicio</b> y luego <b className="text-text">Agregar</b>.</li>
              <li>Abre el Centro de Control desde el ícono nuevo y vuelve a <b className="text-text">Mis alertas</b>.</li>
            </ol>
            <p className="text-xs text-muted">Necesita iOS 16.4 o más nuevo.</p>
          </div>
        ) : soporte === "no" ? (
          <p className="text-sm text-muted">Este navegador no recibe notificaciones. En el iPhone usa la app instalada desde Safari; en Android, Chrome.</p>
        ) : soporte === "si" ? (
          <div className="space-y-3 text-sm">
            <p>
              {suscrito ? <span className="text-green">● Activadas en este {esIphone ? "iPhone" : "dispositivo"}.</span>
                : permiso === "denied" ? <span className="text-red">● Bloqueadas. Actívalas en Ajustes → Notificaciones → Centro de Control.</span>
                : <span className="text-muted">● Todavía no están activadas en este {esIphone ? "iPhone" : "dispositivo"}.</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {!suscrito && <button type="button" disabled={ocupado} onClick={activar} className={`${btn} bg-blue text-white hover:opacity-90`}>Activar alertas</button>}
              <button type="button" disabled={ocupado || !datos?.dispositivos.length} onClick={probar} className={`${btn} border border-line hover:bg-panel-2`}>Enviar prueba</button>
            </div>
          </div>
        ) : <p className="text-sm text-muted">Revisando…</p>}
        {msg && <p className={`text-sm mt-3 ${msg.ok ? "text-green" : "text-red"}`}>{msg.t}</p>}
      </Panel>

      <Panel titulo="Celulares que reciben alertas" detalle="Si cambias de celular, actívalas en el nuevo y quita el viejo.">
        {datos?.dispositivos.length ? (
          <ul className="divide-y divide-line text-sm">
            {datos.dispositivos.map((d) => (
              <li key={d.endpoint} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <div>{d.dispositivo ?? "Dispositivo"}{d.endpoint === suscrito && <span className="text-xs text-muted"> · este</span>}</div>
                  <div className="text-xs text-muted">Activado {fechaHora(d.creado_en)}{d.ultimo_envio ? ` · último aviso ${fechaHora(d.ultimo_envio)}` : ""}</div>
                  {d.ultimo_error && <div className="text-xs text-red">{d.ultimo_error}</div>}
                </div>
                <button type="button" disabled={ocupado} onClick={() => quitar(d.endpoint)} className="text-xs text-muted hover:text-red">Quitar</button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Ninguno todavía.</p>}
      </Panel>

      <Panel titulo="Alertas" detalle="Se van agregando a medida que las pidas. Apágalas o cambia el límite aquí; aplica a todos tus celulares.">
        {alertas.length ? (
          <ul className="divide-y divide-line">
            {alertas.map((a) => (
              <li key={a.clave} className="py-3 flex items-start justify-between gap-4">
                <div className="text-sm">
                  <div className="font-medium">{a.nombre}</div>
                  <div className="text-xs text-muted mt-0.5">{a.detalle}</div>
                  {a.clave === "despacho" && (
                    <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted">
                      Avisar si queda por debajo de
                      <input type="number" min={1} max={200} step={1} defaultValue={Number(a.params.umbral ?? 80)} disabled={ocupado}
                        onBlur={(e) => { const v = Number(e.currentTarget.value); if (v && v !== Number(a.params.umbral)) guardarAlerta(a.clave, a.activa, { ...a.params, umbral: v }); }}
                        className="w-16 rounded-lg border border-line bg-panel-2 px-2 py-1 text-sm text-text num" />
                      %
                    </label>
                  )}
                </div>
                <button type="button" role="switch" aria-checked={a.activa} aria-label={`${a.activa ? "Apagar" : "Prender"} ${a.nombre}`} disabled={ocupado}
                  onClick={() => guardarAlerta(a.clave, !a.activa)}
                  className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${a.activa ? "bg-green" : "bg-panel-2 border border-line"}`}>
                  <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${a.activa ? "left-[1.4rem]" : "left-0.5"}`} />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Cargando…</p>}
      </Panel>

      <Panel titulo="Últimos avisos">
        {datos?.avisos.length ? (
          <ul className="divide-y divide-line text-sm">
            {datos.avisos.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="flex justify-between gap-3"><span className="font-medium">{a.titulo}</span><span className="text-xs text-muted whitespace-nowrap">{fechaHora(a.creado_en)}</span></div>
                {a.cuerpo && <div className="text-muted">{a.cuerpo}</div>}
                <div className={`text-xs ${a.error ? "text-red" : "text-muted"}`}>
                  {a.enviado_en ? (a.error ? `No llegó: ${a.error}` : `Enviado a ${a.enviados} celular${a.enviados === 1 ? "" : "es"}`) : "Enviando…"}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Sin avisos todavía.</p>}
      </Panel>
    </div>
  );
}
