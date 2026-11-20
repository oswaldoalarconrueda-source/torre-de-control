"use client";

import { useEffect, useState } from "react";

// 📣 Aviso al entrar a Disponible en oficina (pedido del dueño, 20-nov-2026): explica a todo el equipo que las guías con
// fecha de retiro ya no quedan en la lista inicial sino en el filtro «🤝 Compromiso de retiro», que se revisa cada día.
// Sale una vez por persona y navegador: al tocar «Entendido» no vuelve a salir. Para un aviso nuevo, cambiar CLAVE.
const CLAVE = "aviso-oficina-compromiso-2026-11-20";

export function AvisoOficina() {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    let visto = false;
    try { visto = localStorage.getItem(CLAVE) === "1"; } catch { /* sin almacenamiento: se muestra */ }
    if (!visto) setAbierto(true);
  }, []);
  if (!abierto) return null;
  const cerrar = () => {
    try { localStorage.setItem(CLAVE, "1"); } catch { /* sin almacenamiento: vuelve a salir la próxima vez */ }
    setAbierto(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="aviso-oficina-titulo">
      <div className="w-full max-w-md rounded-2xl border bg-panel p-6 shadow-2xl">
        <div className="text-4xl">🤝</div>
        <h2 id="aviso-oficina-titulo" className="mt-3 font-display text-xl font-semibold tracking-tight">Cambio en Disponible en oficina</h2>
        <p className="mt-3 text-sm leading-relaxed">
          A partir de este momento, cuando gestiones una entrega con <b>fecha posterior</b>, ya no va a estar en esta lista
          sino en el filtro <b>«🤝 Compromiso de retiro»</b>.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Ese filtro se debe revisar <b className="text-tinte">todos los días</b> para mejorar la gestión y que de verdad se haga la
          entrega correspondiente. Arriba salen primero los compromisos vencidos: hay que volver a llamar.
        </p>
        <button onClick={cerrar} autoFocus
          className="mt-5 w-full rounded-xl bg-tinte px-4 py-2.5 text-sm font-semibold text-panel hover:opacity-90">
          Entendido
        </button>
      </div>
    </div>
  );
}
