"use client";

import { useEffect } from "react";

// Registra el service worker (public/sw.js) para que la app instalada reciba notificaciones; al abrirla se borra el
// numerito del ícono.
export function RegistrarSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    nav.clearAppBadge?.().catch(() => {});
  }, []);
  return null;
}
