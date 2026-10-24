"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Llega aquí desde el enlace del correo "Olvidé mi clave": el cliente de Supabase canjea el código del
// enlace por una sesión y con esa sesión se guarda la clave nueva.
export function NuevaClaveForm() {
  const router = useRouter();
  const [listo, setListo] = useState<"cargando" | "si" | "no">("cargando");
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setListo(data.session ? "si" : "no"));
  }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (clave !== repetir) return setError("Las dos claves no coinciden.");
    setCargando(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password: clave });
    if (error) {
      setCargando(false);
      return setError(error.message);
    }
    router.replace("/");
    router.refresh();
  }

  if (listo === "cargando") return <p className="mt-6 text-sm text-muted">Revisando el enlace…</p>;
  if (listo === "no")
    return (
      <div className="mt-6 space-y-4">
        <p className="text-sm text-red">El enlace ya venció o ya se usó. Pide uno nuevo desde “Olvidé mi clave”.</p>
        <a href="/login" className="btn-primary block text-center w-full rounded-full py-2.5 text-sm font-medium text-white">
          Volver a entrar
        </a>
      </div>
    );

  const campo =
    "mt-1 w-full rounded-xl bg-panel-2 border border-line px-3.5 py-2.5 pr-11 text-sm outline-none focus:border-blue/60 focus:ring-2 focus:ring-blue/20";

  return (
    <form onSubmit={guardar} className="mt-6 space-y-4">
      {[
        { etiqueta: "Clave nueva", valor: clave, poner: setClave },
        { etiqueta: "Repite la clave", valor: repetir, poner: setRepetir },
      ].map((c) => (
        <label key={c.etiqueta} className="block">
          <span className="text-xs text-muted">{c.etiqueta}</span>
          <span className="relative block">
            <input
              type={verClave ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              value={c.valor}
              onChange={(e) => {
                c.poner(e.target.value);
                setError(null);
              }}
              className={campo}
            />
            <button
              type="button"
              onClick={() => setVerClave(!verClave)}
              aria-label={verClave ? "Ocultar clave" : "Mostrar clave"}
              className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 p-1.5 rounded-lg text-muted hover:text-text transition-colors"
            >
              {verClave ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
      ))}
      <p className="text-xs text-muted">Mínimo 8 caracteres.</p>
      {error && (
        <p className="text-sm text-red" role="status">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={cargando}
        className="btn-primary w-full rounded-full py-2.5 text-sm font-medium text-white disabled:opacity-60 transition-opacity"
      >
        {cargando ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}
