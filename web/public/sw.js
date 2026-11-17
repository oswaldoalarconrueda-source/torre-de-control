// Service worker del Centro de Control: recibe las notificaciones push y, al tocarlas, abre la pantalla del aviso.
// La carga la manda la función push de Supabase: { titulo, cuerpo, url, tipo, id }.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: "Centro de Control", cuerpo: e.data ? e.data.text() : "" }; }
  const titulo = d.titulo || "Centro de Control";
  e.waitUntil(Promise.all([
    self.registration.showNotification(titulo, {
      body: d.cuerpo || "",
      icon: "/icono-192.png",
      badge: "/icono-192.png",
      tag: d.tipo ? `${d.tipo}-${d.id || ""}` : undefined,
      data: { url: d.url || "/" },
    }),
    // Numerito en el ícono de la app (iPhone 16.4+ y Chrome); se limpia al abrir la app.
    self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : Promise.resolve(),
  ]));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abiertas) {
      if ("focus" in c) { await c.focus(); if ("navigate" in c) await c.navigate(url).catch(() => {}); return; }
    }
    await self.clients.openWindow(url);
  })());
});
