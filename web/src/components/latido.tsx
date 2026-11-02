"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Avisa cada minuto que esta persona sigue aquí (solo con la pestaña a la vista): de ahí sale "En línea" en el Inicio.
export function Latido() {
  useEffect(() => {
    const supabase = createClient();
    // .then(): sin él, Supabase no manda la consulta.
    const latir = () => { if (!document.hidden) void supabase.rpc("app_latido").then(); };
    latir();
    const t = setInterval(latir, 60_000);
    document.addEventListener("visibilitychange", latir);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", latir); };
  }, []);
  return null;
}
