self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || "Nowe zamówienie";
  const body  = data.body  || "Pojawiło się nowe zamówienie.";
  const url   = data.url   || "/admin/current-orders";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/hamburger.png",
      badge: "/favicon.ico",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const w = wins.find((c) => "url" in c && c.url.includes(url));
      if (w) return w.focus();
      return clients.openWindow(url);
    })
  );
});
