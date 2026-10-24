"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// El correo se recuerda en este equipo; la clave la guarda el navegador (llavero de iCloud, Chrome, etc.).
const LLAVE_CORREO = "torre.login.correo";

export function LoginForm() {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "crear" | "recuperar">("entrar");
  const [hayOwner, setHayOwner] = useState(true);
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [recordar, setRecordar] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "error" | "ok"; texto: string } | null>(null);

  useEffect(() => {
    // Mientras no exista el dueño, se ofrece crear su cuenta (el primer usuario queda como dueño).
    createClient().rpc("app_hay_owner").then(({ data }) => setHayOwner(data !== false));
    try {
      const guardado = localStorage.getItem(LLAVE_CORREO);
      if (guardado) setEmail(guardado);
    } catch {}
  }, []);

  function recordarCorreo() {
    try {
      if (recordar) localStorage.setItem(LLAVE_CORREO, email);
      else localStorage.removeItem(LLAVE_CORREO);
    } catch {}
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setMensaje(null);
    const supabase = createClient();
    if (modo === "recuperar") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/nueva-clave`,
      });
      setCargando(false);
      if (error) return setMensaje({ tipo: "error", texto: error.message });
      setMensaje({ tipo: "ok", texto: "Si el correo tiene cuenta, te llega un enlace para crear una clave nueva." });
      return;
    }
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
      if (error) {
        setMensaje({ tipo: "error", texto: error.message === "Invalid login credentials" ? "Correo o clave incorrectos." : error.message });
        setCargando(false);
        return;
      }
      recordarCorreo();
      router.replace("/");
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password: clave });
      setCargando(false);
      if (error) return setMensaje({ tipo: "error", texto: error.message });
      if (data.session) {
        router.replace("/");
        router.refresh();
      } else {
        setMensaje({ tipo: "ok", texto: "Cuenta creada. Revisa tu correo para confirmarla y luego entra." });
        setModo("entrar");
      }
    }
  }

  const campo =
    "mt-1 w-full rounded-xl bg-panel-2 border border-line px-3.5 py-2.5 text-sm outline-none focus:border-blue/60 focus:ring-2 focus:ring-blue/20";

  return (
    <form onSubmit={enviar} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-xs text-muted">Correo</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={campo}
        />
      </label>
      {modo !== "recuperar" && (
        <label className="block">
          <span className="text-xs text-muted">Clave</span>
          <span className="relative block">
            <input
              type={verClave ? "text" : "password"}
              name="password"
              required
              minLength={8}
              autoComplete={modo === "entrar" ? "current-password" : "new-password"}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              className={`${campo} pr-11`}
            />
            <button
              type="button"
              onClick={() => setVerClave(!verClave)}
              aria-label={verClave ? "Ocultar clave" : "Mostrar clave"}
              title={verClave ? "Ocultar clave" : "Mostrar clave"}
              className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 p-1.5 rounded-lg text-muted hover:text-text transition-colors"
            >
              {verClave ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
      )}
      {modo === "entrar" && (
        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => setRecordar(e.target.checked)}
              className="accent-blue size-3.5"
            />
            Recordarme en este equipo
          </label>
          <button
            type="button"
            onClick={() => {
              setModo("recuperar");
              setMensaje(null);
            }}
            className="text-muted hover:text-text transition-colors"
          >
            Olvidé mi clave
          </button>
        </div>
      )}
      {mensaje && (
        <p className={`text-sm ${mensaje.tipo === "error" ? "text-red" : "text-green"}`} role="status">
          {mensaje.texto}
        </p>
      )}
      <button
        type="submit"
        disabled={cargando}
        className="btn-primary w-full rounded-full py-2.5 text-sm font-medium text-white disabled:opacity-60 transition-opacity"
      >
        {cargando
          ? "Un momento…"
          : modo === "entrar"
            ? "Entrar"
            : modo === "recuperar"
              ? "Enviarme el enlace"
              : "Crear cuenta de dueño"}
      </button>
      {modo === "recuperar" && (
        <button
          type="button"
          onClick={() => {
            setModo("entrar");
            setMensaje(null);
          }}
          className="w-full text-xs text-muted hover:text-text transition-colors"
        >
          Volver a entrar
        </button>
      )}
      {!hayOwner && modo !== "recuperar" && (
        <button
          type="button"
          onClick={() => setModo(modo === "entrar" ? "crear" : "entrar")}
          className="w-full text-xs text-muted hover:text-text transition-colors"
        >
          {modo === "entrar" ? "¿Primera vez? Crear la cuenta del dueño" : "Ya tengo cuenta"}
        </button>
      )}
    </form>
  );
}
