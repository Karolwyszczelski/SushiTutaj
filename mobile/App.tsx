// mobile/App.tsx
// =============================================================================
// SUSHI TUTAJ - Admin Mobile App
// Cienki natywny wrapper z WebView + FCM push notifications
// =============================================================================

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  BackHandler,
  Platform,
  Linking,
} from "react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import * as SplashScreen from "expo-splash-screen";

import { ADMIN_URL, START_PATH } from "./src/config";
import {
  useNotifications,
  saveCookiesFromWebView,
} from "./src/hooks/useNotifications";

// Nie ukrywaj splash screena automatycznie
SplashScreen.preventAutoHideAsync();

// =============================================================================
// JavaScript wstrzykiwany do WebView
// =============================================================================

/**
 * Ten skrypt jest wstrzykiwany do WebView i:
 * 1. Wyciąga cookies Supabase i restaurant_slug → wysyła do RN
 * 2. Nasłuchuje na wiadomości od RN (np. nawigacja do URL)
 * 3. Ukrywa elementy UI niepotrzebne w natywnej apce (np. banner "dodaj do ekranu")
 * 4. Wyłącza Web Push (bo mamy natywny FCM!)
 */
const INJECTED_JS = `
(function() {
  // --- 1. Wyślij cookies do React Native ---
  function sendCookies() {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'COOKIES',
        cookies: document.cookie,
      }));
    } catch(e) {}
  }

  // Wysyłaj cookies co 10 sekund (sesja może się odświeżyć)
  sendCookies();
  setInterval(sendCookies, 10000);

  // --- 2. Wyciągnij restaurant_slug ---
  function sendSlug() {
    try {
      var slug = null;
      // Z cookie
      var match = document.cookie.match(/restaurant_slug=([^;]+)/);
      if (match) slug = decodeURIComponent(match[1]);
      // Z localStorage
      if (!slug) slug = localStorage.getItem('restaurant_slug');
      
      if (slug) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'RESTAURANT_SLUG',
          slug: slug,
        }));
      }
    } catch(e) {}
  }
  sendSlug();
  setInterval(sendSlug, 15000);

  // --- 3. Ukryj elementy niepotrzebne w natywnej apce ---
  try {
    var style = document.createElement('style');
    style.textContent = [
      // Ukryj "Dodaj do ekranu głównego" / install prompt
      '.pwa-install-prompt, .install-banner, [data-pwa-prompt] { display: none !important; }',
      // Ukryj przycisk włączania web push (mamy natywny FCM)
      '[data-push-toggle], .push-toggle-btn { display: none !important; }',
    ].join('\\n');
    document.head.appendChild(style);
  } catch(e) {}

  // --- 4. Wyłącz Web Push w kontekście natywnej apki ---
  // Oznaczamy że jesteśmy w natywnej apce - panel admina może to sprawdzić
  // i pominąć rejestrację Service Workera dla push
  window.__NATIVE_APP__ = true;
  window.__NATIVE_FCM__ = true;

  // --- 5. Nasłuchuj na wiadomości od React Native ---
  document.addEventListener('message', function(event) {
    try {
      var msg = JSON.parse(event.data);
      if (msg.type === 'NAVIGATE') {
        window.location.href = msg.url;
      }
    } catch(e) {}
  });

  // Wersja dla Android
  window.addEventListener('message', function(event) {
    try {
      var msg = JSON.parse(event.data);
      if (msg.type === 'NAVIGATE') {
        window.location.href = msg.url;
      }
    } catch(e) {}
  });

  true; // wymagane przez WebView
})();
`;

// =============================================================================
// APP COMPONENT
// =============================================================================

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    pushToken,
    registrationState,
    error: pushError,
    registerToken,
    lastNotificationUrl,
    clearLastNotificationUrl,
  } = useNotifications();

  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // SAFETY: ukryj splash po max 5s nawet jeśli WebView nie załaduje
  // ------------------------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {}
      if (!isReady) {
        console.warn("[App] Splash timeout — wymuszam ukrycie");
        setIsReady(true);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // ------------------------------------------------------------------
  // Android: fizyczny przycisk "wstecz" → cofnij w WebView
  // ------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // Obsłużone
      }
      return false; // Pozwól zamknąć app
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );
    return () => subscription.remove();
  }, [canGoBack]);

  // ------------------------------------------------------------------
  // Nawigacja po kliknięciu powiadomienia
  // ------------------------------------------------------------------
  useEffect(() => {
    if (lastNotificationUrl && webViewRef.current) {
      const fullUrl = lastNotificationUrl.startsWith("http")
        ? lastNotificationUrl
        : `${ADMIN_URL}${lastNotificationUrl}`;

      console.log("[App] Nawigacja z powiadomienia:", fullUrl);

      webViewRef.current.injectJavaScript(`
        window.location.href = "${fullUrl}";
        true;
      `);

      clearLastNotificationUrl();
    }
  }, [lastNotificationUrl, clearLastNotificationUrl]);

  // ------------------------------------------------------------------
  // Zarejestruj FCM token gdy mamy slug restauracji
  // ------------------------------------------------------------------
  useEffect(() => {
    if (pushToken && restaurantSlug) {
      console.log("[App] Rejestruję FCM token dla:", restaurantSlug);
      void registerToken(restaurantSlug);
    }
  }, [pushToken, restaurantSlug, registerToken]);

  // ------------------------------------------------------------------
  // Obsługa wiadomości z WebView
  // ------------------------------------------------------------------
  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);

        switch (msg.type) {
          case "COOKIES":
            // Zapisz cookies z WebView (zawierają sesję Supabase)
            void saveCookiesFromWebView(msg.cookies);
            break;

          case "RESTAURANT_SLUG":
            if (msg.slug && msg.slug !== restaurantSlug) {
              console.log("[App] Restaurant slug z WebView:", msg.slug);
              setRestaurantSlug(msg.slug);
            }
            break;

          default:
            break;
        }
      } catch {
        // Ignoruj nie-JSON wiadomości
      }
    },
    [restaurantSlug]
  );

  // ------------------------------------------------------------------
  // Śledzenie nawigacji WebView
  // ------------------------------------------------------------------
  const onNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      setCanGoBack(navState.canGoBack);
      setCurrentUrl(navState.url);
    },
    []
  );

  // ------------------------------------------------------------------
  // WebView załadowany
  // ------------------------------------------------------------------
  const onLoadEnd = useCallback(() => {
    if (!isReady) {
      setIsReady(true);
      SplashScreen.hideAsync();
    }
    setLoadError(null);
  }, [isReady]);

  // ------------------------------------------------------------------
  // Obsługa zewnętrznych linków (tel:, mailto:, itp.)
  // ------------------------------------------------------------------
  const onShouldStartLoad = useCallback(
    (event: { url: string }) => {
      const { url } = event;

      // Pozwól na nawigację wewnątrz domeny
      if (url.startsWith(ADMIN_URL) || url.startsWith("about:")) {
        return true;
      }

      // Otwórz zewnętrzne linki w przeglądarce systemowej
      if (
        url.startsWith("tel:") ||
        url.startsWith("mailto:") ||
        url.startsWith("https://") ||
        url.startsWith("http://")
      ) {
        Linking.openURL(url);
        return false;
      }

      return true;
    },
    []
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  const startUrl = `${ADMIN_URL}${START_PATH}`;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Push status bar (pokazuje się tylko gdy jest problem) */}
      {registrationState === "error" && pushError && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>⚠️ Push: {pushError}</Text>
        </View>
      )}

      {registrationState === "registered" && !isReady && (
        <View style={styles.successBar}>
          <Text style={styles.successText}>✅ Powiadomienia aktywne</Text>
        </View>
      )}

      {/* Loading overlay */}
      {!isReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Ładowanie panelu...</Text>
        </View>
      )}

      {/* Błąd ładowania */}
      {loadError && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Brak połączenia</Text>
          <Text style={styles.errorDesc}>{loadError}</Text>
          <Text
            style={styles.retryButton}
            onPress={() => {
              setLoadError(null);
              webViewRef.current?.reload();
            }}
          >
            Spróbuj ponownie
          </Text>
        </View>
      )}

      {/* WebView z panelem admina */}
      <WebView
        ref={webViewRef}
        source={{ uri: startUrl }}
        style={styles.webview}
        // Wstrzyknij JS po załadowaniu
        injectedJavaScript={INJECTED_JS}
        // Obsługa wiadomości z WebView
        onMessage={onMessage}
        // Nawigacja
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={onShouldStartLoad}
        // Events
        onLoadEnd={onLoadEnd}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error("[App] WebView error:", nativeEvent.description);
          setLoadError(nativeEvent.description || "Nie udało się załadować");
          // Ukryj splash żeby error overlay był widoczny
          SplashScreen.hideAsync().catch(() => {});
          setIsReady(true);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error("[App] HTTP error:", nativeEvent.statusCode);
          if (nativeEvent.statusCode >= 500) {
            setLoadError(`Błąd serwera (${nativeEvent.statusCode})`);
            SplashScreen.hideAsync().catch(() => {});
            setIsReady(true);
          }
        }}
        // Ustawienia WebView
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        // Cookies i sesja
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        // Cache — offline fallback
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        // Media
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        // Fullscreen
        allowsFullscreenVideo={false}
        // User Agent — identyfikuje natywną apkę
        applicationNameForUserAgent="SushiTutajAdmin/1.0"
        // Android: pozwól na file upload (zdjęcia menu)
        allowFileAccess={true}
        // Debugowanie (wyłącz na produkcji)
        webviewDebuggingEnabled={__DEV__}
      />
    </SafeAreaView>
  );
}

// =============================================================================
// STYLE
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000000",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingText: {
    color: "#ffffff",
    marginTop: 16,
    fontSize: 16,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    zIndex: 20,
  },
  errorTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
  },
  errorDesc: {
    color: "#aaaaaa",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  retryButton: {
    color: "#000000",
    backgroundColor: "#ffffff",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: "bold",
    overflow: "hidden",
  },
  errorBar: {
    backgroundColor: "#dc2626",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  errorText: {
    color: "#ffffff",
    fontSize: 12,
    textAlign: "center",
  },
  successBar: {
    backgroundColor: "#16a34a",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  successText: {
    color: "#ffffff",
    fontSize: 12,
    textAlign: "center",
  },
});
