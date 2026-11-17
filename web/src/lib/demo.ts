// 🎬 Modo demostración (pedido del dueño, 17-nov-2026): el Centro de Control de solo lectura y con los datos de septiembre de
// 2026, para mostrar en pantalla cómo se trabaja. Se entra por /demo (solo el dueño) y se sale por /demo/salir; mientras la
// cookie esté puesta, el proxy deja todas las fechas dentro de septiembre y la pantalla bloquea todo lo que escribe.
export const DEMO_COOKIE = "centro.demo";
export const DEMO = { desde: "2026-09-01", hasta: "2026-09-30", mes: "2026-09", etiqueta: "Septiembre 2026" } as const;

// Pantallas que se muestran en la demostración (en este orden en el menú).
export const DEMO_RUTAS = ["/en-vivo", "/datos", "/oficina", "/novedades", "/agente", "/pedidos-lucid", "/global", "/publicidad", "/sin-liquidar", "/correos"] as const;
// Pantallas de la demostración que no van por fechas: En vivo (la operación real de hoy) y los correos (escogen su día).
export const DEMO_SIN_FECHAS = ["/en-vivo", "/correos"] as const;
export const DEMO_TITULOS: Record<string, string> = { "/en-vivo": "En vivo · hoy", "/correos": "Informes por correo" };

// ValerIA arrancó a finales de octubre y el registro de llamadas de Novedades y Oficina después: en septiembre no tienen
// datos. Esas pantallas muestran la semana del 3 al 9 de noviembre (decisión del dueño, 17-nov-2026), con aviso.
export const DEMO_SEMANA = { desde: "2026-11-03", hasta: "2026-11-09", etiqueta: "Semana del 3 al 9 de noviembre" } as const;
export const DEMO_SEMANA_RUTAS = ["/agente", "/novedades", "/oficina"] as const;
export const rangoDemo = (ruta: string) => ruta.startsWith("/en-vivo")
  ? { desde: "", hasta: "", etiqueta: "En vivo: la operación real de hoy" }
  : DEMO_SEMANA_RUTAS.some((r) => ruta === r || ruta.startsWith(`${r}/`)) ? DEMO_SEMANA : DEMO;
