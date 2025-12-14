// public/sw.js

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) {
      // preferuj JSON, ale nie wywalaj się jak przyjdzie tekst
      try {
        data = event.data.json();
      } catch {
        const txt = event.data.text();
        data = { body: txt };
      }
    }
  } catch {
    data = {};
  }

  const title = data.title || "Nowe zamówienie";
  const body = data.body || "Pojawiło się nowe zamówienie.";
  const url = data.url || "/admin/pickup-order";

  const targetUrl = new URL(url, self.location.origin).toString();

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/hamburger.png", // upewnij się, że istnieje w /public
      badge: "/favicon.ico",
      data: { url: targetUrl },
      requireInteraction: true,
      // opcjonalnie: grupuj powiadomienia (np. jedno “Nowe zamówienie” zamiast 20 szt.)
      // tag: "new-order",
      // renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url) || self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // znajdź istniejące okno z panelem
      const existing = wins.find((w) => w.url && w.url.includes("/admin/pickup-order"));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
