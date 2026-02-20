// src/components/admin/PushServiceWorkerManager.tsx
"use client";

import { useEffect, useRef, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

/**
 * Komponent zarządzający Service Workerem dla push notifications.
 * 
 * Odpowiada za:
 * 1. Automatyczną rejestrację SW przy starcie aplikacji
 * 2. Aktualizację SW gdy dostępna jest nowa wersja
 * 3. Utrzymywanie SW aktywnego przez periodic ping
 * 4. Rejestrację periodic sync (jeśli przeglądarka wspiera)
 * 5. Monitorowanie stanu subskrypcji push
 * 6. Synchronizację restaurant_slug z Service Workerem (multi-tenant)
 * 
 * Powinien być umieszczony w admin layout dla wszystkich stron admina.
 */

const SW_PATH = "/sw.js";
const SW_UPDATE_INTERVAL = 60 * 60 * 1000; // Sprawdzaj aktualizacje SW co 1 godzinę
const PING_INTERVAL = 4 * 60 * 1000; // Ping SW co 4 minuty żeby utrzymać go aktywnym
const PERIODIC_SYNC_TAG = "push-keepalive";
const PERIODIC_SYNC_MIN_INTERVAL = 12 * 60 * 60 * 1000; // 12 godzin (minimum dla periodic sync)

// === KRYTYCZNE: Auto-odnowienie subskrypcji push ===
// Subskrypcje FCM/Mozilla WYGASAJĄ cicho po kilku dniach.
// Chrome NIE odpala 'pushsubscriptionchange' niezawodnie.
// Ten interwał to GŁÓWNY mechanizm zapewniający niezawodność powiadomień.
const SUBSCRIPTION_CHECK_INTERVAL = 2 * 60 * 1000; // Sprawdzaj subskrypcję co 2 minuty
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

/**
 * Konwersja klucza VAPID z base64url na Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Pobiera restaurant_slug z różnych źródeł (cookie, localStorage)
 */
function getRestaurantSlug(): string | null {
  if (typeof window === "undefined") return null;
  
  // 1. Sprawdź localStorage (najbardziej aktualne)
  try {
    const lsSlug = window.localStorage.getItem("restaurant_slug");
    if (lsSlug) return lsSlug.toLowerCase();
  } catch {}
  
  // 2. Sprawdź ciasteczko
  try {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "restaurant_slug" && value) {
        return decodeURIComponent(value).toLowerCase();
      }
    }
  } catch {}
  
  return null;
}

export default function PushServiceWorkerManager() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slugSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncedSlugRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const subscriptionCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeLockRef = useRef<any>(null);
  const consecutiveFailsRef = useRef(0);

  /**
   * Wysyła restaurant_slug do Service Workera (IndexedDB)
   * KRYTYCZNE dla multi-tenant: SW musi znać slug przy odnawianiu subskrypcji w tle
   */
  const syncRestaurantSlugToSW = useCallback(async (forceSync = false): Promise<boolean> => {
    if (!registrationRef.current?.active) return false;

    const slug = getRestaurantSlug();
    
    // Jeśli slug się nie zmienił, nie wysyłaj (chyba że force)
    if (!forceSync && slug === lastSyncedSlugRef.current) {
      return true;
    }

    if (!slug) {
      console.log("[PushSWManager] No restaurant_slug available to sync");
      return false;
    }

    try {
      return new Promise<boolean>((resolve) => {
        const messageChannel = new MessageChannel();
        
        messageChannel.port1.onmessage = (event) => {
          if (event.data?.type === "RESTAURANT_SET") {
            lastSyncedSlugRef.current = slug;
            console.log("[PushSWManager] restaurant_slug synced to SW:", slug);
            resolve(true);
          } else {
            resolve(false);
          }
        };

        // Timeout na odpowiedź
        setTimeout(() => resolve(false), 5000);

        registrationRef.current?.active?.postMessage(
          { type: "SET_RESTAURANT", payload: { restaurant_slug: slug } },
          [messageChannel.port2]
        );
      });
    } catch (err) {
      console.warn("[PushSWManager] Failed to sync restaurant_slug to SW:", err);
      return false;
    }
  }, []);

  /**
   * KRYTYCZNE: Walidacja i automatyczne odnowienie subskrypcji push.
   *
   * To jest GŁÓWNY mechanizm zapewniający niezawodność powiadomień.
   * Subskrypcje FCM/Mozilla mogą wygasać po kilku dniach bez powiadamiania klienta.
   * Chrome NIE odpala 'pushsubscriptionchange' niezawodnie.
   * Dlatego MUSIMY aktywnie sprawdzać i odnawiać subskrypcje co 2 minuty.
   *
   * Jak robią to profesjonalne systemy POS (Square, Toast, iZettle):
   * - Aktywna walidacja subskrypcji w interwale
   * - Automatyczne odnowienie bez interakcji użytkownika
   * - Heartbeat do serwera potwierdzający że kanał push żyje
   * - Fallback na polling gdy push jest nieosiągalny
   */
  const validateAndRenewSubscription = useCallback(async (): Promise<boolean> => {
    if (!registrationRef.current) return false;
    if (!VAPID_PUBLIC_KEY) return false;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;

    try {
      // 1. Sprawdź czy subskrypcja istnieje
      let sub = await registrationRef.current.pushManager.getSubscription();

      if (!sub) {
        consecutiveFailsRef.current++;
        console.warn(
          `[PushSWManager] ⚠️ Subskrypcja WYGASŁA/BRAK! Auto-odnowienie... (próba #${consecutiveFailsRef.current})`
        );

        try {
          sub = await registrationRef.current.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
          console.log("[PushSWManager] ✅ Nowa subskrypcja utworzona");
        } catch (subErr) {
          console.error("[PushSWManager] ❌ Nie udało się utworzyć subskrypcji:", subErr);
          return false;
        }
      } else {
        if (consecutiveFailsRef.current > 0) {
          console.log(
            "[PushSWManager] ✅ Subskrypcja znów aktywna po",
            consecutiveFailsRef.current,
            "próbach"
          );
        }
        consecutiveFailsRef.current = 0;
      }

      // 2. Synchronizuj z serwerem (działa też jako heartbeat - serwer aktualizuje created_at)
      const slug = getRestaurantSlug();
      if (!slug) {
        // Brak slug = nie wiemy do której restauracji przypisać
        return true; // subskrypcja jest OK ale nie możemy zsynchronizować
      }

      const payload =
        typeof sub.toJSON === "function"
          ? sub.toJSON()
          : JSON.parse(JSON.stringify(sub));

      const doPost = () =>
        fetch("/api/admin/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            subscription: payload,
            restaurant_slug: slug,
          }),
        });

      let res = await doPost();

      // KRYTYCZNE: Po nocy/uśpieniu sesja Supabase wygasa.
      // Musimy automatycznie odświeżyć i spróbować ponownie.
      if (res.status === 401) {
        console.warn("[PushSWManager] 401 - odświeżam sesję Supabase...");
        try {
          const sb = getSupabaseBrowser();
          const { data } = await sb.auth.refreshSession();
          if (data?.session) {
            console.log("[PushSWManager] ✅ Sesja odświeżona, ponawiam POST...");
            res = await doPost();
          } else {
            console.error("[PushSWManager] ❌ Nie udało się odświeżyć sesji");
            return false;
          }
        } catch (refreshErr) {
          console.error("[PushSWManager] ❌ refreshSession error:", refreshErr);
          return false;
        }
      }

      if (!res.ok) {
        console.error("[PushSWManager] Synchronizacja subskrypcji nieudana:", res.status);
        return false;
      }

      // 3. Synchronizuj slug z SW
      await syncRestaurantSlugToSW(false);

      return true;
    } catch (err) {
      console.error("[PushSWManager] validateAndRenewSubscription error:", err);
      return false;
    }
  }, [syncRestaurantSlugToSW]);

  /**
   * Rejestruje Service Worker z opcjami no-cache
   */
  const registerServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (!("serviceWorker" in navigator)) {
      console.log("[PushSWManager] ServiceWorker not supported");
      return null;
    }

    try {
      // Rejestruj SW z wymuszeniem sprawdzenia aktualizacji
      const registration = await navigator.serviceWorker.register(SW_PATH, {
        updateViaCache: "none", // Zawsze pobieraj świeżą wersję SW
      });

      console.log("[PushSWManager] ServiceWorker registered:", registration.scope);

      // Nasłuchuj na nowe wersje SW
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        console.log("[PushSWManager] New ServiceWorker version found, installing...");

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // Nowa wersja zainstalowana, aktywuj ją natychmiast
            console.log("[PushSWManager] New SW installed, activating...");
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });

      return registration;
    } catch (err) {
      console.error("[PushSWManager] ServiceWorker registration failed:", err);
      return null;
    }
  }, []);

  /**
   * Sprawdza czy SW ma aktualną wersję i aktualizuje jeśli trzeba
   */
  const checkForUpdates = useCallback(async () => {
    if (!registrationRef.current) return;

    try {
      await registrationRef.current.update();
      console.log("[PushSWManager] Checked for SW updates");
    } catch (err) {
      console.warn("[PushSWManager] SW update check failed:", err);
    }
  }, []);

  /**
   * Pinguje SW żeby utrzymać go aktywnym
   */
  const pingServiceWorker = useCallback(async () => {
    if (!registrationRef.current?.active) return;

    try {
      // Używamy MessageChannel do dwukierunkowej komunikacji
      const messageChannel = new MessageChannel();
      
      return new Promise<void>((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          if (event.data?.type === "PONG") {
            const { subscriptionActive, endpoint } = event.data;
            if (subscriptionActive === false) {
              console.warn("[PushSWManager] ⚠️ SW reports subscription INACTIVE");
            } else {
              console.log("[PushSWManager] SW pong ✅ endpoint:", endpoint || "?");
            }
          }
          resolve();
        };

        // Timeout na odpowiedź
        setTimeout(resolve, 5000);

        registrationRef.current?.active?.postMessage(
          { type: "PING" },
          [messageChannel.port2]
        );
      });
    } catch (err) {
      console.warn("[PushSWManager] SW ping failed:", err);
    }
  }, []);

  /**
   * Rejestruje Periodic Background Sync (jeśli przeglądarka wspiera)
   */
  const registerPeriodicSync = useCallback(async () => {
    if (!registrationRef.current) return;

    // Sprawdź czy przeglądarka wspiera periodic sync
    if (!("periodicSync" in registrationRef.current)) {
      console.log("[PushSWManager] Periodic sync not supported");
      return;
    }

    try {
      // Sprawdź czy mamy uprawnienia
      const status = await navigator.permissions.query({
        name: "periodic-background-sync" as PermissionName,
      });

      if (status.state !== "granted") {
        console.log("[PushSWManager] Periodic sync permission not granted");
        return;
      }

      // Zarejestruj periodic sync
      await (registrationRef.current as any).periodicSync.register(PERIODIC_SYNC_TAG, {
        minInterval: PERIODIC_SYNC_MIN_INTERVAL,
      });

      console.log("[PushSWManager] Periodic sync registered");
    } catch (err) {
      console.warn("[PushSWManager] Periodic sync registration failed:", err);
    }
  }, []);

  /**
   * Rejestruje Background Sync (dla offline scenarios)
   */
  const registerBackgroundSync = useCallback(async () => {
    if (!registrationRef.current) return;

    // Sprawdź czy przeglądarka wspiera background sync
    if (!("sync" in registrationRef.current)) {
      console.log("[PushSWManager] Background sync not supported");
      return;
    }

    try {
      await (registrationRef.current as any).sync.register("sync-subscription");
      console.log("[PushSWManager] Background sync registered");
    } catch (err) {
      console.warn("[PushSWManager] Background sync registration failed:", err);
    }
  }, []);

  /**
   * Monitoruje zmiany stanu kontrolera SW
   */
  const setupControllerChangeListener = useCallback(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      console.log("[PushSWManager] Controller changed, new SW is now active");
      // Możemy tutaj przeładować stronę lub wykonać inne akcje
      // window.location.reload(); // Opcjonalne - może być uciążliwe dla użytkownika
    });
  }, []);

  // Główny efekt - inicjalizacja
  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      // 0. Pomiń SW push w natywnej apce — FCM obsługuje push natywnie
      if (typeof window !== "undefined" && (window as any).__NATIVE_FCM__) {
        console.log("[PushSWManager] Natywna apka wykryta (__NATIVE_FCM__) — pomijam rejestrację SW push");
        return;
      }

      // 1. Rejestruj SW
      const registration = await registerServiceWorker();
      if (!mountedRef.current || !registration) return;
      
      registrationRef.current = registration;

      // 2. Poczekaj az SW bedzie aktywny
      if (registration.installing) {
        const installingWorker = registration.installing;
        await new Promise<void>((resolve) => {
          const handler = () => {
            if (installingWorker.state === "activated") {
              installingWorker.removeEventListener("statechange", handler);
              resolve();
            }
          };
          installingWorker.addEventListener("statechange", handler);
          // Timeout fallback
          setTimeout(resolve, 10000);
        });
      }

      if (!mountedRef.current) return;

      // 3. Setup controller change listener
      setupControllerChangeListener();

      // 4. Zarejestruj periodic sync i background sync
      await registerPeriodicSync();
      await registerBackgroundSync();

      // 5. Rozpocznij okresowe sprawdzanie aktualizacji SW
      updateIntervalRef.current = setInterval(checkForUpdates, SW_UPDATE_INTERVAL);

      // 6. Rozpocznij okresowe pingowanie SW
      pingIntervalRef.current = setInterval(pingServiceWorker, PING_INTERVAL);

      // 7. Pierwszy ping od razu
      await pingServiceWorker();

      // 8. KRYTYCZNE: Zsynchronizuj restaurant_slug z SW (multi-tenant)
      await syncRestaurantSlugToSW(true);

      // 9. Okresowo sprawdzaj czy slug się zmienił (np. admin przełączył restaurację)
      slugSyncIntervalRef.current = setInterval(() => {
        void syncRestaurantSlugToSW(false);
      }, 30000); // Co 30 sekund sprawdzaj czy slug się zmienił

      // 10. KRYTYCZNE: Walidacja subskrypcji push co 2 minuty
      // To jest GŁÓWNY mechanizm gwarantujący że push działa nawet po dniach/tygodniach.
      // Bez tego subskrypcje wygasają cicho i powiadomienia przestają dochodzić.
      await validateAndRenewSubscription();
      subscriptionCheckIntervalRef.current = setInterval(() => {
        void validateAndRenewSubscription();
      }, SUBSCRIPTION_CHECK_INTERVAL);

      console.log("[PushSWManager] Initialization complete");
    };

    void init();

    return () => {
      mountedRef.current = false;
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
      
      if (slugSyncIntervalRef.current) {
        clearInterval(slugSyncIntervalRef.current);
        slugSyncIntervalRef.current = null;
      }

      if (subscriptionCheckIntervalRef.current) {
        clearInterval(subscriptionCheckIntervalRef.current);
        subscriptionCheckIntervalRef.current = null;
      }
    };
  }, [
    registerServiceWorker,
    setupControllerChangeListener,
    registerPeriodicSync,
    registerBackgroundSync,
    checkForUpdates,
    pingServiceWorker,
    syncRestaurantSlugToSW,
    validateAndRenewSubscription,
  ]);

  // Efekt - ping przy visibility change (gdy użytkownik wraca do karty)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[PushSWManager] Tab became visible, pinging SW and checking subscription...");
        void pingServiceWorker();
        void checkForUpdates();
        // Synchronizuj slug przy powrocie do karty (mogło się zmienić w innym tabie)
        void syncRestaurantSlugToSW(false);
        // KRYTYCZNE: Sprawdź subskrypcję po powrocie z tła/uśpienia.
        // To jest kluczowy moment - urządzenie mogło stracić subskrypcję w tle
        // (szczególnie tablety restauracyjne które śpią przez noc)
        void validateAndRenewSubscription();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pingServiceWorker, checkForUpdates, syncRestaurantSlugToSW, validateAndRenewSubscription]);

  // Efekt - ping przy online event (gdy przywrócono połączenie)
  useEffect(() => {
    const handleOnline = () => {
      console.log("[PushSWManager] Network came online, syncing...");
      void registerBackgroundSync();
      void pingServiceWorker();
      // Synchronizuj slug przy powrocie online
      void syncRestaurantSlugToSW(true);
      // KRYTYCZNE: Sprawdź subskrypcję po powrocie online
      // Połączenie mogło być zerwane wystarczająco długo żeby subskrypcja wygasła
      void validateAndRenewSubscription();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [registerBackgroundSync, pingServiceWorker, syncRestaurantSlugToSW, validateAndRenewSubscription]);

  // WakeLock - utrzymuje ekran tabletu restauracyjnego włączony
  // Zapobiega wygaszaniu ekranu i uśpieniu urządzenia.
  // Profesjonalne systemy POS (Square, Toast) robią to samo.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      console.log("[PushSWManager] WakeLock nie jest wspierany w tej przeglądarce");
      return;
    }

    let active = true;

    const requestWakeLock = async () => {
      if (!active) return;
      if (document.visibilityState !== "visible") return;

      try {
        // Zwolnij stary lock jeśli istnieje
        if (wakeLockRef.current) {
          try {
            await wakeLockRef.current.release();
          } catch {}
          wakeLockRef.current = null;
        }

        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        console.log("[PushSWManager] 🔒 WakeLock aktywny - ekran nie zgaśnie");

        wakeLockRef.current.addEventListener("release", () => {
          console.log("[PushSWManager] WakeLock zwolniony");
          wakeLockRef.current = null;
          // Ponów po 2 sekundach jeśli strona jest wciąż widoczna
          if (active && document.visibilityState === "visible") {
            setTimeout(() => void requestWakeLock(), 2000);
          }
        });
      } catch (err: any) {
        console.warn("[PushSWManager] WakeLock error:", err?.message || err);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, []);

  // Ten komponent nie renderuje nic widocznego
  return null;
}
