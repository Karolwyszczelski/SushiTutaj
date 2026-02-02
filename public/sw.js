// public/sw.js
// ==============================================================================
// SERVICE WORKER DLA PUSH NOTIFICATIONS - SUSHI TUTAJ
// ==============================================================================

// Klucz VAPID musi byc zsynchronizowany z env NEXT_PUBLIC_VAPID_PUBLIC_KEY
// Service Worker odnawia subskrypcje automatycznie przy pushsubscriptionchange

const SUBSCRIBE_ENDPOINT = "/api/admin/push/subscribe";
const DB_NAME = "sushi-push-db";
const DB_STORE = "config";
const DB_VERSION = 1;

// ==============================================================================
// IndexedDB helpers - przechowywanie restaurant_slug dla SW
// ==============================================================================
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "key" });
      }
    };
  });
}

async function getFromDB(key) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const store = tx.objectStore(DB_STORE);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setInDB(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      store.put({ key, value });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

// ==============================================================================
// INSTALL - natychmiastowa aktywacja
// ==============================================================================
self.addEventListener("install", (event) => {
  console.log("[sw] Installing service worker...");
  // Natychmiast aktywuj nowy SW bez czekania na zamkniecie starych kart
  event.waitUntil(self.skipWaiting());
});

// ==============================================================================
// ACTIVATE - przejmij kontrole nad wszystkimi kartami
// ==============================================================================
self.addEventListener("activate", (event) => {
  console.log("[sw] Activating service worker...");
  event.waitUntil(
    (async () => {
      // Przejmij kontrole nad wszystkimi kartami natychmiast
      await self.clients.claim();
      
      // Wyczysc stare cache jesli istnieja
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("sushi-") && name !== "sushi-v1")
          .map((name) => caches.delete(name))
      );
      
      console.log("[sw] Service worker activated and controlling all clients");
    })()
  );
});

// ==============================================================================
// FETCH - keep-alive handler (utrzymuje SW aktywny dluzej)
// ==============================================================================
self.addEventListener("fetch", (event) => {
  // Pass-through dla wszystkich requestow - nie modyfikujemy
  // Ten handler jest potrzebny zeby SW nie byl zbyt szybko usuwany z pamieci
  // przez przegladarke (SW bez fetch handlera jest traktowany jako "nieaktywny")
  
  const url = new URL(event.request.url);
  
  // Dla requestow API - zawsze siec (no cache)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Dla pozostalych - standardowe zachowanie (siec z fallback)
  event.respondWith(
    fetch(event.request).catch(() => {
      // Offline fallback - tylko dla navigation requests
      if (event.request.mode === "navigate") {
        return caches.match("/offline.html").then((cached) => {
          return cached || new Response("Offline", { status: 503 });
        });
      }
      return new Response("Offline", { status: 503 });
    })
  );
});

// ==============================================================================
// MESSAGE - komunikacja z klientem (odswiezanie subskrypcji, ping, itp.)
// ==============================================================================
self.addEventListener("message", (event) => {
  const { type, payload } = event.data || {};
  
  console.log("[sw] Message received:", type);
  
  switch (type) {
    case "PING":
      // Keep-alive ping od klienta
      event.ports[0]?.postMessage({ type: "PONG", timestamp: Date.now() });
      break;
      
    case "SKIP_WAITING":
      // Wymusz aktywacje nowej wersji SW
      self.skipWaiting();
      break;
      
    case "GET_SUBSCRIPTION":
      // Zwroc aktualna subskrypcje push
      (async () => {
        try {
          const sub = await self.registration.pushManager.getSubscription();
          const restaurantSlug = await getFromDB("restaurant_slug");
          event.ports[0]?.postMessage({ 
            type: "SUBSCRIPTION", 
            subscription: sub ? sub.toJSON() : null,
            restaurant_slug: restaurantSlug,
          });
        } catch (err) {
          event.ports[0]?.postMessage({ type: "ERROR", error: err.message });
        }
      })();
      break;
      
    case "SET_RESTAURANT":
      // Zapisz restaurant_slug w IndexedDB (wywolywane przez klienta przy logowaniu/zmianie restauracji)
      (async () => {
        try {
          const slug = payload?.restaurant_slug || null;
          await setInDB("restaurant_slug", slug);
          console.log("[sw] Restaurant slug saved:", slug);
          event.ports[0]?.postMessage({ type: "RESTAURANT_SET", restaurant_slug: slug });
        } catch (err) {
          event.ports[0]?.postMessage({ type: "ERROR", error: err.message });
        }
      })();
      break;
      
    case "FORCE_RESUBSCRIBE":
      // Wymusz odnowienie subskrypcji (np. po zmianie restauracji)
      (async () => {
        try {
          // Zapisz nowy slug jesli przekazany
          if (payload?.restaurant_slug) {
            await setInDB("restaurant_slug", payload.restaurant_slug);
          }
          const result = await resubscribePush(payload?.applicationServerKey, payload?.restaurant_slug);
          event.ports[0]?.postMessage({ type: "RESUBSCRIBED", result });
        } catch (err) {
          event.ports[0]?.postMessage({ type: "ERROR", error: err.message });
        }
      })();
      break;
      
    default:
      console.log("[sw] Unknown message type:", type);
  }
});

// ==============================================================================
// PUSHSUBSCRIPTIONCHANGE - automatyczne odnowienie wygaslej subskrypcji
// ==============================================================================
self.addEventListener("pushsubscriptionchange", (event) => {
  console.log("[sw] Push subscription changed, renewing...");
  
  event.waitUntil(
    (async () => {
      try {
        // Pobierz nowa subskrypcje (stara wygasla)
        const oldSubscription = event.oldSubscription;
        const newSubscription = event.newSubscription;
        
        let subscription = newSubscription;
        
        // Jesli nie ma nowej subskrypcji, sprobuj utworzyc
        if (!subscription && oldSubscription) {
          const options = oldSubscription.options;
          subscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: options?.applicationServerKey,
          });
        }
        
        if (!subscription) {
          console.error("[sw] Failed to get new subscription");
          return;
        }
        
        // KRYTYCZNE: Pobierz restaurant_slug z IndexedDB
        const restaurantSlug = await getFromDB("restaurant_slug");
        
        if (!restaurantSlug) {
          console.warn("[sw] No restaurant_slug in IndexedDB, subscription will use server cookies");
        }
        
        // Wyslij nowa subskrypcje do serwera Z restaurant_slug
        const payload = subscription.toJSON();
        
        const response = await fetch(SUBSCRIBE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ 
            subscription: payload,
            restaurant_slug: restaurantSlug,  // <-- KRYTYCZNE dla multi-tenant
          }),
        });
        
        if (!response.ok) {
          const text = await response.text();
          console.error("[sw] Failed to sync subscription:", response.status, text);
        } else {
          console.log("[sw] Subscription renewed successfully for restaurant:", restaurantSlug);
        }
      } catch (err) {
        console.error("[sw] pushsubscriptionchange error:", err);
      }
    })()
  );
});

// ==============================================================================
// Helper: Odnow subskrypcje push (uzywane przez message handler)
// ==============================================================================
async function resubscribePush(applicationServerKey, restaurantSlug) {
  try {
    // Pobierz slug z parametru lub z IndexedDB
    const slug = restaurantSlug || await getFromDB("restaurant_slug");
    
    // Anuluj stara subskrypcje
    const oldSub = await self.registration.pushManager.getSubscription();
    if (oldSub) {
      await oldSub.unsubscribe();
    }
    
    // Utworz nowa
    const newSub = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey,
    });
    
    // Wyslij do serwera Z restaurant_slug
    const payload = newSub.toJSON();
    const response = await fetch(SUBSCRIBE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ 
        subscription: payload,
        restaurant_slug: slug,  // <-- KRYTYCZNE dla multi-tenant
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    
    console.log("[sw] Resubscribed for restaurant:", slug);
    return { success: true, endpoint: newSub.endpoint, restaurant_slug: slug };
  } catch (err) {
    console.error("[sw] resubscribePush error:", err);
    return { success: false, error: err.message };
  }
}

// ==============================================================================
// PUSH - obsluga przychodzacych powiadomien
// ==============================================================================
self.addEventListener("push", (event) => {
  console.log("[sw] Push event received");
  
  let data = {};
  try {
    if (event.data) {
      try {
        data = event.data.json();
        console.log("[sw] Push data parsed:", JSON.stringify(data).slice(0, 200));
      } catch {
        const txt = event.data.text();
        data = { body: txt };
        console.log("[sw] Push data as text:", txt.slice(0, 100));
      }
    }
  } catch (e) {
    console.error("[sw] Push data parse error:", e);
    data = {};
  }

  const title = data.title || "Nowe zamowienie";
  const body = data.body || "Pojawilo sie nowe zamowienie.";
  const url = data.url || "/admin/pickup-order";
  const targetUrl = new URL(url, self.location.origin).toString();

  // Priorytet dla unikalnego ID:
  // 1. ID z payload (unikalne per powiadomienie z serwera)
  // 2. OrderId z payload
  // 3. Fallback: timestamp + random
  const eventId = data.id || data.orderId || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  // Tag z serwera lub wygenerowany - MUSI byc unikalny per powiadomienie
  // zeby rozne zamowienia nie nadpisywaly sie nawzajem
  const tag = data.tag || `order-${eventId}`;
  
  // Timestamp z serwera lub teraz
  const timestamp = data.timestamp || Date.now();

  console.log("[sw] Showing notification:", { title, tag, eventId });

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: "/android-chrome-192x192.png",
        badge: "/favicon.ico",
        // Dane przekazywane do notificationclick
        data: { 
          url: targetUrl, 
          id: eventId,
          orderId: data.orderId,
          type: data.type,
          receivedAt: Date.now(),
        },
        // Unikalny tag - kazde zamowienie ma swoj
        tag,
        // Wymusza interakcje uzytkownika (powiadomienie nie znika samo)
        requireInteraction: true,
        // Timestamp dla sortowania powiadomien
        timestamp,
        // === KLUCZOWE DLA ZABLOKOWANEGO EKRANU / TLA ===
        renotify: true,  // Wymusza dzwiek/wibracje nawet przy tym samym tagu
        silent: false,   // NIE cichy - wymusza dzwiek systemowy
        vibrate: [300, 100, 300, 100, 400], // Wzorzec wibracji w ms
        // Przyciski akcji
        actions: [
          { action: "open", title: "Otworz" },
          { action: "dismiss", title: "Zamknij" }
        ],
      })
      .then(() => {
        console.log("[sw] Notification shown successfully:", tag);
      })
      .catch((err) => {
        console.error("[sw] showNotification error:", err);
      })
  );
});

// ==============================================================================
// NOTIFICATIONCLICK - obsluga klikniecia w powiadomienie
// ==============================================================================
self.addEventListener("notificationclick", (event) => {
  const action = event.action;
  const notificationData = event.notification.data || {};
  
  console.log("[sw] Notification clicked:", { action, id: notificationData.id });
  
  // Jesli kliknieto "Zamknij" - tylko zamknij powiadomienie
  if (action === "dismiss") {
    event.notification.close();
    // Musimy wywolac waitUntil nawet dla dismiss, zeby SW sie nie wylaczyl przedwczesnie
    event.waitUntil(Promise.resolve());
    return;
  }
  
  event.notification.close();

  const url = notificationData.url || self.location.origin;

  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Szukaj istniejacego okna z panelem admina
      const existing = wins.find((w) => w.url && w.url.includes("/admin"));
      if (existing) {
        await existing.focus();
        // Jesli browser wspiera navigate, przejdz na URL z notyfikacji
        if ("navigate" in existing) {
          try {
            await existing.navigate(url);
          } catch (e) {
            console.warn("[sw] Navigate failed:", e);
          }
        }
        return;
      }

      // Brak istniejacego okna - otworz nowe
      await self.clients.openWindow(url);
    })()
  );
});

// ==============================================================================
// NOTIFICATIONCLOSE - logowanie zamkniecia (debug)
// ==============================================================================
self.addEventListener("notificationclose", (event) => {
  // Logujemy zamkniecie powiadomienia (przydatne do debugowania)
  const data = event.notification.data || {};
  console.log("[sw] Notification closed:", data.id || "unknown");
});

// ==============================================================================
// PERIODICSYNC - utrzymanie SW aktywnego (jesli przegladarka wspiera)
// ==============================================================================
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "push-keepalive") {
    console.log("[sw] Periodic sync: push-keepalive");
    event.waitUntil(
      (async () => {
        // Sprawdz czy subskrypcja jest aktualna
        try {
          const sub = await self.registration.pushManager.getSubscription();
          if (!sub) {
            console.log("[sw] No subscription found during periodic sync");
            return;
          }
          
          // Logujemy ze subskrypcja zyje
          const restaurantSlug = await getFromDB("restaurant_slug");
          console.log("[sw] Subscription alive for restaurant:", restaurantSlug, "endpoint:", sub.endpoint.slice(-30));
        } catch (err) {
          console.error("[sw] Periodic sync error:", err);
        }
      })()
    );
  }
});

// ==============================================================================
// SYNC - Background Sync (dla offline scenarios)
// ==============================================================================
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-subscription") {
    console.log("[sw] Background sync: sync-subscription");
    event.waitUntil(
      (async () => {
        try {
          const sub = await self.registration.pushManager.getSubscription();
          if (!sub) return;
          
          // KRYTYCZNE: Pobierz restaurant_slug z IndexedDB
          const restaurantSlug = await getFromDB("restaurant_slug");
          
          const payload = sub.toJSON();
          const response = await fetch(SUBSCRIBE_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ 
              subscription: payload,
              restaurant_slug: restaurantSlug,  // <-- KRYTYCZNE dla multi-tenant
            }),
          });
          
          if (response.ok) {
            console.log("[sw] Background sync: subscription synced for restaurant:", restaurantSlug);
          }
        } catch (err) {
          console.error("[sw] Background sync error:", err);
        }
      })()
    );
  }
});

// ==============================================================================
// ERROR HANDLER - globalne lapanie bledow
// ==============================================================================
self.addEventListener("error", (event) => {
  console.error("[sw] Global error:", event.error);
});

self.addEventListener("unhandledrejection", (event) => {
  console.error("[sw] Unhandled promise rejection:", event.reason);
});

console.log("[sw] Service worker script loaded");
