// mobile/src/hooks/useNotifications.ts
import { useEffect, useRef, useState, useCallback } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform, AppState, AppStateStatus, Vibration } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  FCM_REGISTER_URL,
  NOTIFICATION_CHANNEL_ID,
  NOTIFICATION_CHANNEL_NAME,
  ADMIN_URL,
} from "../config";
import { startAlarm, stopAlarm } from "../utils/alarmSound";

// ============================================================================
// KONFIGURACJA POWIADOMIEŃ
// ============================================================================

// Jak powiadomienia mają się zachowywać gdy app jest na pierwszym planie
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,    // Pokaż nawet gdy app jest otwarta
    shouldPlaySound: true,    // Zawsze graj dźwięk
    shouldSetBadge: true,     // Ustaw badge
    priority: Notifications.AndroidNotificationPriority.MAX, // Najwyższy priorytet
  }),
});

// ============================================================================
// TYPY
// ============================================================================

type RegistrationState = "idle" | "registering" | "registered" | "error";

interface UseNotificationsReturn {
  /** Token FCM (Expo Push Token) */
  pushToken: string | null;
  /** Stan rejestracji tokenu na serwerze */
  registrationState: RegistrationState;
  /** Błąd rejestracji */
  error: string | null;
  /** Ręczna rejestracja tokenu (np. po zmianie restauracji) */
  registerToken: (restaurantSlug: string | null) => Promise<void>;
  /** Ostatnie kliknięte powiadomienie (URL do otwarcia) */
  lastNotificationUrl: string | null;
  /** Wyczyść lastNotificationUrl po obsłudze */
  clearLastNotificationUrl: () => void;
}

// ============================================================================
// STORAGE KEYS
// ============================================================================
const STORAGE_KEY_TOKEN = "@sushi_fcm_token";
const STORAGE_KEY_SLUG = "@sushi_restaurant_slug";
const STORAGE_KEY_COOKIES = "@sushi_auth_cookies";
const STORAGE_KEY_AUTH = "@sushi_auth_token";

// ============================================================================
// HOOK
// ============================================================================

export function useNotifications(): UseNotificationsReturn {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [registrationState, setRegistrationState] =
    useState<RegistrationState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastNotificationUrl, setLastNotificationUrl] = useState<string | null>(
    null
  );

  const notificationListenerRef = useRef<Notifications.Subscription | null>(
    null
  );
  const responseListenerRef = useRef<Notifications.Subscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ------------------------------------------------------------------
  // Uzyskaj token FCM
  // ------------------------------------------------------------------
  const getToken = useCallback(async (): Promise<string | null> => {
    // Na symulatorze push nie działa
    if (!Device.isDevice) {
      console.warn("[FCM] Push notifications nie działają na symulatorze");
      return null;
    }

    // KRYTYCZNE: Na Androidzie 13+ (API 33) kanał powiadomień MUSI istnieć
    // PRZED żądaniem uprawnień i tokena. Bez kanału dialog uprawnień się
    // nie pojawi. Docs Expo:
    //   "setNotificationChannelAsync must be called before
    //    getDevicePushTokenAsync or getExpoPushTokenAsync"
    if (Platform.OS === "android") {
      // =================================================================
      // KRYTYCZNE: Usuń kanał przed ponownym utworzeniem!
      // Na Androidzie 8+ (API 26+) ustawienia kanału — dźwięk, wibracje,
      // importance — są NIEZMIENNE po utworzeniu. Wywołanie
      // setNotificationChannelAsync na istniejącym kanale NIE aktualizuje
      // dźwięku! Jedyny sposób to delete + create.
      //
      // Bez tego: jeśli kanał był kiedykolwiek utworzony bez dźwięku
      // (stara wersja apki, bug, reset OEM), dźwięk NIGDY nie zadziała
      // na tym urządzeniu — nawet po aktualizacji apki.
      //
      // Profesjonalne apki POS (Square, Toast) robią to samo.
      // Dla tabletu restauracyjnego to bezpieczne — restauracja nie
      // customizuje ustawień powiadomień.
      // =================================================================
      try {
        await Notifications.deleteNotificationChannelAsync(NOTIFICATION_CHANNEL_ID);
        console.log("[FCM] 🗑️ Stary kanał '" + NOTIFICATION_CHANNEL_ID + "' usunięty (force recreation)");
      } catch {
        // Kanał nie istniał — OK, pierwszy start
      }

      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
        name: NOTIFICATION_CHANNEL_NAME,
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 100, 300, 100, 400],
        lightColor: "#FF0000",
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        sound: "new_order.mp3",
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
      });
      console.log("[FCM] ✅ Kanał powiadomień '" + NOTIFICATION_CHANNEL_ID + "' utworzony z dźwiękiem new_order.mp3");
    }

    // Sprawdź uprawnienia
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.warn("[FCM] Brak uprawnień do powiadomień");
      setError("Brak uprawnień do powiadomień. Włącz je w ustawieniach.");
      return null;
    }

    // Uzyskaj NATYWNY FCM token (bezpośrednio, bez pośrednictwa Expo Push API)
    // Dzięki temu serwer wysyła powiadomienia bezpośrednio przez FCM HTTP v1 API
    // (nie potrzeba konfiguracji FCM V1 credentials w EAS Dashboard).
    // expo-notifications i tak przechwytuje wszystkie FCM wiadomości dzięki
    // wbudowanemu FirebaseMessagingService → handleNotification działa normalnie.
    try {
      console.log("[FCM] Requesting native FCM device token...");
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      const token = deviceToken.data as string;
      console.log("[FCM] ✅ FCM token uzyskany:", token.slice(0, 30) + "...");

      await AsyncStorage.setItem(STORAGE_KEY_TOKEN, token);
      setPushToken(token);
      return token;
    } catch (err: any) {
      console.error("[FCM] ❌ Nie udało się uzyskać tokena FCM:", err?.message || err);
      setError("Nie udało się uzyskać tokena push: " + (err?.message || "unknown"));
      return null;
    }
  }, []);

  // ------------------------------------------------------------------
  // Zarejestruj token na serwerze
  // ------------------------------------------------------------------
  const registerToken = useCallback(
    async (restaurantSlug: string | null) => {
      setRegistrationState("registering");
      setError(null);

      try {
        const token = pushToken || (await getToken());
        if (!token) {
          setRegistrationState("error");
          return;
        }

        const slug = restaurantSlug || (await AsyncStorage.getItem(STORAGE_KEY_SLUG));
        if (slug) {
          await AsyncStorage.setItem(STORAGE_KEY_SLUG, slug);
        }

        // Pobierz access token Supabase z WebView (Bearer auth)
        let authToken =
          (await AsyncStorage.getItem(STORAGE_KEY_AUTH)) || "";

        if (!authToken) {
          console.warn("[FCM] Brak auth token — użytkownik niezalogowany lub token nie dotarł z WebView");
          setRegistrationState("error");
          setError("Zaloguj się w panelu admina");
          return;
        }

        console.log("[FCM] Rejestruję token na serwerze...", {
          url: FCM_REGISTER_URL,
          slug,
          tokenType: token.startsWith("ExponentPushToken") ? "expo" : "fcm",
          tokenSuffix: token.slice(-20),
          hasAuth: !!authToken,
          authTokenLen: authToken.length,
        });

        // Retry logic — 3 próby z rosnącym opóźnieniem
        // KRYTYCZNE: 401 (expired auth token) NIE przerywa natychmiast!
        // Po odblokowaniu ekranu WebView odświeża auth token co 5s.
        // Czekamy i próbujemy ponownie ze świeżym tokenem z AsyncStorage.
        let res: Response | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            res = await fetch(FCM_REGISTER_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                token,
                token_type: token.startsWith("ExponentPushToken")
                  ? "expo"
                  : "fcm",
                restaurant_slug: slug,
                device_info: `${Platform.OS} | ${Device.modelName || "unknown"} | ${Device.osVersion || "?"}`,
              }),
            });
            if (res.ok || res.status === 403) break;
            // 401 = auth token wygasł → poczekaj aż WebView odświeży sesję
            if (res.status === 401 && attempt < 3) {
              console.warn(`[FCM] 401 — auth token wygasł, czekam ${attempt * 3}s na odświeżenie z WebView...`);
              await new Promise(r => setTimeout(r, attempt * 3000));
              // Pobierz potencjalnie odświeżony token z AsyncStorage
              const freshAuth = (await AsyncStorage.getItem(STORAGE_KEY_AUTH)) || "";
              if (freshAuth) authToken = freshAuth;
              continue;
            }
            if (res.status === 401) break; // 3 próby wyczerpane
          } catch (fetchErr: any) {
            console.warn(`[FCM] Próba ${attempt}/3 nieudana:`, fetchErr?.message);
            if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
          }
        }

        if (!res) {
          setRegistrationState("error");
          setError("Nie udało się połączyć z serwerem");
          return;
        }

        if (res.status === 401) {
          console.warn(
            "[FCM] 401 - użytkownik niezalogowany, token nie zapisany"
          );
          setRegistrationState("error");
          setError("Zaloguj się w panelu admina");
          return;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error("[FCM] ❌ Rejestracja nieudana:", res.status, text);
          setRegistrationState("error");
          setError(`Błąd rejestracji: ${res.status} - ${text.substring(0, 100)}`);
          return;
        }

        console.log("[FCM] ✅ Token zarejestrowany na serwerze");
        setRegistrationState("registered");
      } catch (err: any) {
        console.error("[FCM] Błąd rejestracji:", err);
        setRegistrationState("error");
        setError(err?.message || "Błąd połączenia z serwerem");
      }
    },
    [pushToken, getToken]
  );

  // ------------------------------------------------------------------
  // Zapisz cookies z WebView (wywoływane z App.tsx)
  // ------------------------------------------------------------------

  // ------------------------------------------------------------------
  // Listenery powiadomień
  // ------------------------------------------------------------------
  useEffect(() => {
    // Gdy powiadomienie przychodzi (app na pierwszym planie)
    notificationListenerRef.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data || {};
        console.log("[FCM] Powiadomienie otrzymane:", data);

        // =================================================================
        // BELT & SUSPENDERS: Dodatkowa wibracja jako backup
        // Nawet jeśli dźwięk kanału nie zadziała (Android bug, DND mode,
        // głośność media na 0), wibracja ZAWSZE jest wyczuwalna.
        // Pattern: krótka-pauza-długa-pauza-krótka (jak dzwonek)
        // =================================================================
        try {
          Vibration.vibrate([0, 400, 200, 600, 200, 400]);
        } catch {
          // Wibracja niedostępna — ignoruj
        }

        // =================================================================
        // LOOPING ALARM — jak Glovo, Pyszne.pl, Uber Eats Merchant
        // Pojedynczy dźwięk notification channel łatwo przeoczyć w kuchni.
        // Zapętlony alarm gra dopóki pracownik nie kliknie powiadomienia
        // lub nie wejdzie na stronę zamówień. Auto-stop po 2 min.
        // =================================================================
        if (!data.type || data.type === "order") {
          startAlarm().catch(() => {});
        }

        // =================================================================
        // DELIVERY ACK: Potwierdź serwerowi że powiadomienie dotarło
        // Bez tego serwer widzi tylko "sent" (= Google przyjął wiadomość)
        // ale nie wie czy tablet NAPRAWDĘ je wyświetlił.
        // ACK = "tak, dostałem, wyświetliłem, zawibrował"
        // =================================================================
        AsyncStorage.getItem(STORAGE_KEY_TOKEN).then((token) => {
          if (!token) return;
          fetch(`${ADMIN_URL}/api/admin/push/delivery-ack`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              notification_id: data.timestamp || notification.request.identifier,
              received_at: Date.now(),
              app_state: "foreground",
            }),
          }).catch(() => {
            // Non-critical — nie blokuj obsługi powiadomienia
          });
        }).catch(() => {});
      });

    // Gdy użytkownik kliknie powiadomienie
    responseListenerRef.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data || {};
        const url = (data.url as string) || "/admin/pickup-order";
        console.log("[FCM] Kliknięto powiadomienie, URL:", url);
        setLastNotificationUrl(url);

        // Zatrzymaj zapętlony alarm — pracownik potwierdził zamówienie
        stopAlarm().catch(() => {});

        // ACK: kliknięcie = pewne potwierdzenie dostarczenia
        // (powiadomienie musiało się wyświetlić żeby user mógł kliknąć)
        AsyncStorage.getItem(STORAGE_KEY_TOKEN).then((token) => {
          if (!token) return;
          fetch(`${ADMIN_URL}/api/admin/push/delivery-ack`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              notification_id: data.timestamp || response.notification.request.identifier,
              received_at: Date.now(),
              app_state: "background_click",
            }),
          }).catch(() => {});
        }).catch(() => {});
      });

    return () => {
      if (notificationListenerRef.current) {
        Notifications.removeNotificationSubscription(
          notificationListenerRef.current
        );
      }
      if (responseListenerRef.current) {
        Notifications.removeNotificationSubscription(
          responseListenerRef.current
        );
      }
    };
  }, []);

  // ------------------------------------------------------------------
  // Re-rejestracja tokenu przy powrocie z tła
  // ------------------------------------------------------------------
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        console.log("[FCM] App wróciła na pierwszy plan — odświeżam FCM token + kanał");
        // KRYTYCZNE: Po długim czasie z zablokowanym ekranem:
        // 1. Token FCM mógł się zmienić (Google Play Services update)
        // 2. Kanał powiadomień mógł zostać zresetowany (Android OEM)
        // 3. Uprawnienia mogły się zmienić
        // getToken() re-tworzy kanał + sprawdza uprawnienia + pobiera token
        // Jeśli token nowy → setPushToken → App.tsx useEffect odpali registerToken
        void getToken();
      }
      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => subscription.remove();
  }, [getToken]);

  // ------------------------------------------------------------------
  // Inicjalizacja — uzyskaj token na starcie
  // ------------------------------------------------------------------
  useEffect(() => {
    void getToken();
  }, [getToken]);

  // ------------------------------------------------------------------
  // Listener: FCM token się zmienił
  // Token może się zmienić po: aktualizacji Google Play Services,
  // reinstalacji, czyszczeniu danych, wewnętrznym odświeżeniu Firebase.
  // BEZ tego listenera stary token zostaje na serwerze → push nie dociera!
  // ------------------------------------------------------------------
  useEffect(() => {
    const subscription = Notifications.addPushTokenListener((tokenData) => {
      const newToken = typeof tokenData.data === "string"
        ? tokenData.data
        : String(tokenData.data);
      console.log("[FCM] 🔄 Token FCM się zmienił:", newToken.slice(0, 30) + "...");
      void AsyncStorage.setItem(STORAGE_KEY_TOKEN, newToken);
      setPushToken(newToken);
      // Nowy pushToken w state → App.tsx useEffect odpali registerToken()
    });
    return () => subscription.remove();
  }, []);

  const clearLastNotificationUrl = useCallback(() => {
    setLastNotificationUrl(null);
  }, []);

  return {
    pushToken,
    registrationState,
    error,
    registerToken,
    lastNotificationUrl,
    clearLastNotificationUrl,
  };
}

/**
 * Zapisuje cookies z WebView do AsyncStorage.
 * Wywoływane z App.tsx po załadowaniu strony w WebView.
 */
export async function saveCookiesFromWebView(cookies: string) {
  if (cookies) {
    await AsyncStorage.setItem(STORAGE_KEY_COOKIES, cookies);
  }
}

/**
 * Pobiera zapisany restaurant_slug z AsyncStorage.
 */
export async function getSavedSlug(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY_SLUG);
}
