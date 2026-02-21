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
  TouchableOpacity,
} from "react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import * as SplashScreen from "expo-splash-screen";

import { ADMIN_URL, START_PATH } from "./src/config";
import {
  useNotifications,
  saveCookiesFromWebView,
} from "./src/hooks/useNotifications";

// Nie ukrywaj splash screena automatycznie
try { SplashScreen.preventAutoHideAsync(); } catch {}

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
  // --- 0. DEBUGGER: przechwytuj błędy JS i pokaż na ekranie ---
  // To jest kluczowe dla diagnozy problemów z hydracją React w WebView
  window.onerror = function(msg, source, line, col, error) {
    try {
      var div = document.getElementById('__webview_debug');
      if (!div) {
        div = document.createElement('div');
        div.id = '__webview_debug';
        div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:red;color:white;padding:12px;font-size:12px;font-family:monospace;max-height:50vh;overflow:auto;white-space:pre-wrap;';
        document.body.appendChild(div);
      }
      div.textContent += 'ERROR: ' + msg + '\\n  at ' + source + ':' + line + ':' + col + '\\n';
      // Wyślij błąd do React Native
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'JS_ERROR',
        message: String(msg),
        source: String(source || ''),
        line: line,
      }));
    } catch(e2) {}
  };

  // Przechwytuj nieobsłużone promisy
  window.addEventListener('unhandledrejection', function(event) {
    try {
      var msg = event.reason ? (event.reason.message || String(event.reason)) : 'Unknown';
      var div = document.getElementById('__webview_debug');
      if (!div) {
        div = document.createElement('div');
        div.id = '__webview_debug';
        div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:red;color:white;padding:12px;font-size:12px;font-family:monospace;max-height:50vh;overflow:auto;white-space:pre-wrap;';
        document.body.appendChild(div);
      }
      div.textContent += 'UNHANDLED PROMISE: ' + msg + '\\n';
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'JS_ERROR',
        message: 'UnhandledPromise: ' + msg,
      }));
    } catch(e2) {}
  });

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
  // Ukryj NATYWNY splash od razu → nasz loading overlay przejmuje
  // Bez tego natywny splash (czarny) blokuje CAŁY React Native UI
  // ------------------------------------------------------------------
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // ------------------------------------------------------------------
  // Timeout: jeśli strona nie załaduje się w 20s → pokaż błąd
  // ------------------------------------------------------------------
  useEffect(() => {
    if (isReady) return; // już załadowane
    const timer = setTimeout(() => {
      console.warn("[App] Timeout — strona nie załadowała się w 20s");
      setLoadError("Strona nie odpowiada. Sprawdź połączenie z internetem.");
      setIsReady(true);
    }, 20000);
    return () => clearTimeout(timer);
  }, [isReady]);

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

          case "JS_ERROR":
            console.error("[WebView JS]", msg.message, msg.source, msg.line);
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
    }
    setLoadError(null);
  }, [isReady]);

  // ------------------------------------------------------------------
  // Obsługa zewnętrznych linków (tel:, mailto:, itp.)
  // ------------------------------------------------------------------
  const onShouldStartLoad = useCallback(
    (event: { url: string }) => {
      const { url } = event;

      // Telefon / email → otwórz systemową apkę
      if (url.startsWith("tel:") || url.startsWith("mailto:")) {
        Linking.openURL(url).catch(() => {});
        return false;
      }

      // Wszystko inne (https, http, about:, data:) → ładuj w WebView
      // KRYTYCZNE: NIE blokuj zewnętrznych URL-i!
      // Strona ładuje zasoby z wielu domen (Supabase, CDN, fonts, analytics)
      // i blokowanie ich powoduje biały/czarny ekran.
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
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

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

      {/* Loading overlay — widoczny (nie czarny!) */}
      {!isReady && !loadError && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingEmoji}>🍣</Text>
          <Text style={styles.loadingTitle}>Sushi Tutaj</Text>
          <ActivityIndicator size="large" color="#f97316" style={{ marginTop: 24 }} />
          <Text style={styles.loadingText}>Ładowanie panelu...</Text>
        </View>
      )}

      {/* Błąd ładowania — wyraźnie widoczny */}
      {loadError && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>Problem z połączeniem</Text>
          <Text style={styles.errorDesc}>{loadError}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            activeOpacity={0.7}
            onPress={() => {
              setLoadError(null);
              setIsReady(false); // pokaż loading ponownie
              webViewRef.current?.reload();
            }}
          >
            <Text style={styles.retryBtnText}>Spróbuj ponownie</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* WebView z panelem admina */}
      <WebView
        ref={webViewRef}
        source={{ uri: startUrl }}
        style={styles.webview}
        // Wstrzyknij error handler PRZED załadowaniem strony
        injectedJavaScriptBeforeContentLoaded={`
          window.onerror = function(msg, source, line, col, error) {
            try {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'JS_ERROR', message: String(msg), source: String(source||''), line: line
              }));
            } catch(e) {}
          };
          window.addEventListener('unhandledrejection', function(e) {
            try {
              var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unknown';
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'JS_ERROR', message: 'Promise: ' + msg
              }));
            } catch(e2) {}
          });
          window.__NATIVE_APP__ = true;
          window.__NATIVE_FCM__ = true;
          true;
        `}
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
          setLoadError(nativeEvent.description || "Nie udało się załadować strony");
          setIsReady(true);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error("[App] HTTP error:", nativeEvent.statusCode);
          if (nativeEvent.statusCode >= 400) {
            setLoadError(`Błąd serwera (${nativeEvent.statusCode})`);
            setIsReady(true);
          }
        }}
        // Android: odzyskaj po crashu renderera WebView
        onRenderProcessGone={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error("[App] WebView renderer crashed:", nativeEvent.didCrash);
          setLoadError("Panel wymaga ponownego załadowania.");
          setIsReady(true);
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
        // Debugowanie (tymczasowo włączone — do wyłączenia po naprawieniu)
        webviewDebuggingEnabled={true}
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
    backgroundColor: "#f8fafc",  // bg-slate-50 — pasuje do admin panelu
  },
  webview: {
    flex: 1,
    backgroundColor: "#f8fafc",  // bg-slate-50
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#f8fafc",  // bg-slate-50 — jasne tło jak admin
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  loadingTitle: {
    color: "#0f172a",  // slate-900 — ciemny tekst na jasnym tle
    fontSize: 22,
    fontWeight: "bold",
  },
  loadingText: {
    color: "#64748b",  // slate-500
    marginTop: 16,
    fontSize: 14,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#f8fafc",  // bg-slate-50 — jasne tło
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    zIndex: 20,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    color: "#0f172a",  // slate-900
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
  },
  errorDesc: {
    color: "#64748b",  // slate-500
    fontSize: 14,
    textAlign: "center",
    marginBottom: 32,
  },
  retryBtn: {
    backgroundColor: "#f97316",
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
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
