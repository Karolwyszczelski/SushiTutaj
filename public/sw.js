// public/sw.js

self.addEventListener("install", (event) => {
  // Natychmiast aktywuj nowy SW bez czekania
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  // Przejmij kontrolę nad wszystkimi kartami natychmiast
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) {
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

  // Kluczowe: stabilny identyfikator zdarzenia, żeby notyfikacje się NIE nadpisywały.
  // Wyciągamy UUID z payloadu albo z tytułu (#uuid), a jak brak – robimy unikalny fallback.
  const uuidMatch = String(data.id || data.orderId || title).match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  const eventId =
    (uuidMatch && uuidMatch[0]) ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const tag = String(data.tag || `order-${eventId}`);

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: "/android-chrome-192x192.png",
        badge: "/favicon.ico",
        data: { url: targetUrl, id: eventId },
        tag, // <-- najważniejsze: unikalny tag per zamówienie (eliminuje “3 zamówienia -> 1 powiadomienie”)
        requireInteraction: true,
        timestamp: Date.now(),
        // === KLUCZOWE DLA ZABLOKOWANEGO EKRANU ===
        renotify: true,  // Wymusza dźwięk/wibrację nawet przy tym samym tagu
        silent: false,   // Wymusza dźwięk systemowy (nie cichy)
        vibrate: [300, 100, 300, 100, 400], // Wzorzec wibracji w ms
        // Dodatkowe przyciski akcji dla lepszej interakcji na tablecie
        actions: [
          { action: "open", title: "Otwórz" },
          { action: "dismiss", title: "Zamknij" }
        ],
      })
      .catch((err) => {
        console.error("[sw] showNotification error:", err);
      })
  );
});


self.addEventListener("notificationclick", (event) => {
  const action = event.action;
  
  // Jeśli kliknięto "Zamknij" - tylko zamknij powiadomienie
  if (action === "dismiss") {
    event.notification.close();
    // Musimy wywołać waitUntil nawet dla dismiss, żeby SW się nie wyłączył przedwcześnie
    event.waitUntil(Promise.resolve());
    return;
  }
  
  event.notification.close();

  const url =
    (event.notification.data && event.notification.data.url) ||
    self.location.origin;

  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const existing = wins.find((w) => w.url && w.url.includes("/admin"));
      if (existing) {
        await existing.focus();
        // jeśli browser wspiera navigate, przejdź na URL z notyfikacji
        if ("navigate" in existing) {
          try {
            await existing.navigate(url);
          } catch {}
        }
        return;
      }

      await self.clients.openWindow(url);
    })()
  );
});

