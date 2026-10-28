"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

// Registro con nombre, cédula, correo y clave. La función `registro` crea la cuenta como pendiente: no ve nada
// hasta que el dueño la apruebe en Usuarios y permisos.
export function RegistroForm() {
  const [datos, setDatos] = useState({ nombre: "", cedula: "", email: "", clave: "", sitio: "" });
  const [verClave, setVerClave] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const cambiar = (k: keyof typeof datos) => (e: React.ChangeEvent<HTMLInputElement>) => { setDatos({ ...datos, [k]: e.target.value }); setError(null); };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true); setError(null);
    // Si la red se queda colgada (datos móviles, wifi débil), a los 25 s se suelta en vez de quedar "Enviando…" para
    // siempre. Puede que la solicitud sí haya llegado: por eso se invita a probar entrar antes de reintentar.
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), 25_000);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/registro`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: JSON.stringify(datos),
        signal: corte.signal,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) setError(j.mensaje ?? "No se pudo enviar la solicitud. Intenta de nuevo.");
      else setListo(true);
    } catch {
      setError(corte.signal.aborted
        ? "La conexión está muy lenta y no hubo respuesta. Puede que tu solicitud sí haya llegado: intenta entrar con tu correo y clave; si no te deja, vuelve a enviarla."
        : "Sin conexión. Revisa tu internet e intenta de nuevo.");
    } finally {
      clearTimeout(reloj);
    }
    setCargando(false);
  }

  if (listo) {
    return (
      <div className="mt-6 space-y-4 text-sm">
        <p className="text-green">Solicitud enviada. Cuando el administrador te dé acceso podrás entrar con tu correo y tu clave.</p>
        <Link href="/login" className="btn-primary block text-center w-full rounded-full py-2.5 text-sm font-medium text-white">Ir a entrar</Link>
      </div>
    );
  }

  const campo = "mt-1 w-full rounded-xl bg-panel-2 border border-line px-3.5 py-2.5 text-sm outline-none focus:border-blue/60 focus:ring-2 focus:ring-blue/20";
  return (
    <form onSubmit={enviar} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-xs text-muted">Nombre completo</span>
        <input required autoComplete="name" value={datos.nombre} onChange={cambiar("nombre")} className={campo} />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Cédula o documento</span>
        <input required inputMode="numeric" value={datos.cedula} onChange={cambiar("cedula")} className={campo} />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Correo</span>
        <input type="email" required autoComplete="email" value={datos.email} onChange={cambiar("email")} className={campo} />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Clave (mínimo 8 caracteres)</span>
        <span className="relative block">
          <input type={verClave ? "text" : "password"} required minLength={8} autoComplete="new-password" value={datos.clave} onChange={cambiar("clave")} className={`${campo} pr-11`} />
          <button type="button" onClick={() => setVerClave(!verClave)} aria-label={verClave ? "Ocultar clave" : "Mostrar clave"}
            className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 p-1.5 rounded-lg text-muted hover:text-text transition-colors">
            {verClave ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
      {/* Trampa para robots: oculta para las personas. */}
      <input tabIndex={-1} autoComplete="off" value={datos.sitio} onChange={cambiar("sitio")} className="hidden" aria-hidden />
      {error && <p className="text-sm text-red" role="status">{error}</p>}
      <button type="submit" disabled={cargando} className="btn-primary w-full rounded-full py-2.5 text-sm font-medium text-white disabled:opacity-60 transition-opacity">
        {cargando ? "Enviando…" : "Enviar solicitud"}
      </button>
      <Link href="/login" className="block text-center text-xs text-muted hover:text-text transition-colors">Ya tengo cuenta: entrar</Link>
    </form>
  );
}
