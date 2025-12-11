// public/sw.js

// Szybkie przejęcie kontroli przez nową wersję SW
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Push z serwera – pokazanie notyfikacji
self.addEventListener("push", (event) => {
  console.log("[sw] push event", event);

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.warn("[sw] nie udało się sparsować payloadu", e);
  }

  const title = data.title || "Nowe zamówienie";
  const body = data.body || "Pojawiło się nowe zamówienie.";
  const url = data.url || "/admin/pickup-order";

  console.log("[sw] showNotification", { title, body, url });

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/hamburger.png",
      badge: "/favicon.ico",
      data: { url },
      requireInteraction: true, // powiadomienie nie znika od razu
      // silent: false // domyślnie false – system decyduje o dźwięku
    })
  );
});

// Kliknięcie w notyfikację – otwarcie / fokus okna z panelem
self.addEventListener("notificationclick", (event) => {
  console.log("[sw] notificationclick", event.notification.data);
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        const existing = wins.find(
          (w) => "url" in w && w.url && w.url.includes(url)
        );
        if (existing) return existing.focus();
        return self.clients.openWindow(url);
      })
  );
});
