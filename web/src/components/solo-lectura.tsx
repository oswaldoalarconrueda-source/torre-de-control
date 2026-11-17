"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { rangoDemo } from "@/lib/demo";

// 🎬 Modo demostración: nada se guarda. Se intercepta en el navegador todo lo que escribe en la base o en Effi (funciones
// que guardan, envían, ejecutan o anulan; altas, cambios y borrados en tablas; funciones del servidor) y se avisa en pantalla.
// Las consultas siguen funcionando para que todo se vea igual que en vivo.
const ESCRIBE = /(guardar|enviar|llamar|seguir|borrador|accion|reintentar|pasar_a|marcar|ejecutar|cambiar|aprobar|anular|registrar|revisar|cargar|conciliar|asignar|rechazar|decidir|latido|ver_sociedad|activo|horario|resultado|crear|eliminar|borrar|subir)/;

export function SoloLectura() {
  const [aviso, setAviso] = useState(0);
  const ruta = usePathname();
  useEffect(() => {
    const original = window.fetch;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const metodo = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (base && url.startsWith(base)) {
        const ruta = url.slice(base.length).split("?")[0];
        const rpc = ruta.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)/)?.[1];
        const bloquear = rpc ? ESCRIBE.test(rpc)
          : ruta.startsWith("/rest/v1/") ? metodo !== "GET" && metodo !== "HEAD"
          : ruta.startsWith("/functions/v1/") || ruta.startsWith("/storage/v1/") ? metodo !== "GET"
          : false;
        if (bloquear) {
          setAviso((n) => n + 1);
          return new Response(JSON.stringify({ message: "Modo demostración: solo lectura, no se guardó nada." }), {
            status: 403, headers: { "Content-Type": "application/json" },
          });
        }
      }
      return original(input, init);
    };
    return () => { window.fetch = original; };
  }, []);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(0), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  return (
    <>
      <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber/40 bg-amber/15 px-4 py-1.5 text-xs font-semibold text-amber backdrop-blur max-md:top-[57px]">
        <span>🎬 Modo demostración · {rangoDemo(ruta).etiqueta} · solo lectura</span>
        <a href="/demo/salir" className="rounded-md border border-amber/50 px-2 py-0.5 hover:bg-amber/20">Salir</a>
      </div>
      {aviso > 0 && (
        <div role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-amber/50 bg-panel px-4 py-2.5 text-sm font-semibold text-amber shadow-lg">
          Modo demostración: solo lectura, no se guardó nada.
        </div>
      )}
    </>
  );
}
