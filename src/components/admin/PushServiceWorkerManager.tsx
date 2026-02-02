// src/components/admin/PushServiceWorkerManager.tsx
"use client";

import { useEffect, useRef, useCallback } from "react";

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
const PING_INTERVAL = 5 * 60 * 1000; // Ping SW co 5 minut żeby utrzymać go aktywnym
const PERIODIC_SYNC_TAG = "push-keepalive";
const PERIODIC_SYNC_MIN_INTERVAL = 12 * 60 * 60 * 1000; // 12 godzin (minimum dla periodic sync)

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
            console.log("[PushSWManager] SW pong received");
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
    };
  }, [
    registerServiceWorker,
    setupControllerChangeListener,
    registerPeriodicSync,
    registerBackgroundSync,
    checkForUpdates,
    pingServiceWorker,
    syncRestaurantSlugToSW,
  ]);

  // Efekt - ping przy visibility change (gdy użytkownik wraca do karty)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[PushSWManager] Tab became visible, pinging SW...");
        void pingServiceWorker();
        void checkForUpdates();
        // Synchronizuj slug przy powrocie do karty (mogło się zmienić w innym tabie)
        void syncRestaurantSlugToSW(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pingServiceWorker, checkForUpdates, syncRestaurantSlugToSW]);

  // Efekt - ping przy online event (gdy przywrócono połączenie)
  useEffect(() => {
    const handleOnline = () => {
      console.log("[PushSWManager] Network came online, syncing...");
      void registerBackgroundSync();
      void pingServiceWorker();
      // Synchronizuj slug przy powrocie online
      void syncRestaurantSlugToSW(true);
    };

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [registerBackgroundSync, pingServiceWorker, syncRestaurantSlugToSW]);

  // Ten komponent nie renderuje nic widocznego
  return null;
}
