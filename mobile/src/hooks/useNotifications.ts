// mobile/src/hooks/useNotifications.ts
import { useEffect, useRef, useState, useCallback } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform, AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import {
  FCM_REGISTER_URL,
  NOTIFICATION_CHANNEL_ID,
  NOTIFICATION_CHANNEL_NAME,
  ADMIN_URL,
} from "../config";

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
  // Inicjalizacja kanału Android
  // ------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
        name: NOTIFICATION_CHANNEL_NAME,
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 100, 300, 100, 400],
        lightColor: "#FF0000",
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true, // Przebija tryb Nie Przeszkadzać
        sound: "new_order.mp3", // Niestandardowy dźwięk (z assets)
        enableVibrate: true,
        enableLights: true,
      });
    }
  }, []);

  // ------------------------------------------------------------------
  // Uzyskaj token FCM
  // ------------------------------------------------------------------
  const getToken = useCallback(async (): Promise<string | null> => {
    // Na symulatorze push nie działa
    if (!Device.isDevice) {
      console.warn("[FCM] Push notifications nie działają na symulatorze");
      return null;
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

    // Uzyskaj Expo Push Token (wrapper na FCM/APNs)
    try {
      const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!easProjectId) {
        console.error("[FCM] Brak projectId w app.config.js → extra.eas.projectId");
        setError("Brak konfiguracji push (projectId)");
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: easProjectId,
      });

      const token = tokenData.data;
      console.log("[FCM] Token uzyskany:", token.slice(0, 30) + "...");

      await AsyncStorage.setItem(STORAGE_KEY_TOKEN, token);
      setPushToken(token);
      return token;
    } catch (err: any) {
      // Fallback: spróbuj natywny Device Push Token (FCM bezpośrednio)
      try {
        const deviceToken = await Notifications.getDevicePushTokenAsync();
        const token = deviceToken.data as string;
        console.log("[FCM] Device token uzyskany:", token.slice(0, 30) + "...");
        
        await AsyncStorage.setItem(STORAGE_KEY_TOKEN, token);
        setPushToken(token);
        return token;
      } catch (deviceErr: any) {
        console.error("[FCM] Nie udało się uzyskać tokena:", deviceErr);
        setError("Nie udało się uzyskać tokena push");
        return null;
      }
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

        // Pobierz zapisane cookies z WebView (ustawiane przez saveCookies)
        const authCookies =
          (await AsyncStorage.getItem(STORAGE_KEY_COOKIES)) || "";

        const res = await fetch(FCM_REGISTER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Przekazujemy cookies z WebView jako header
            // Serwer odczyta z nich sesję Supabase
            Cookie: authCookies,
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
          console.error("[FCM] Rejestracja nieudana:", res.status, text);
          setRegistrationState("error");
          setError(`Błąd rejestracji: ${res.status}`);
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
      });

    // Gdy użytkownik kliknie powiadomienie
    responseListenerRef.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data || {};
        const url = (data.url as string) || "/admin/pickup-order";
        console.log("[FCM] Kliknięto powiadomienie, URL:", url);
        setLastNotificationUrl(url);
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
        console.log("[FCM] App wróciła na pierwszy plan, sprawdzam token...");
        // Re-rejestruj token po powrocie z tła
        AsyncStorage.getItem(STORAGE_KEY_SLUG).then((slug) => {
          void registerToken(slug);
        });
      }
      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => subscription.remove();
  }, [registerToken]);

  // ------------------------------------------------------------------
  // Inicjalizacja — uzyskaj token na starcie
  // ------------------------------------------------------------------
  useEffect(() => {
    void getToken();
  }, [getToken]);

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
