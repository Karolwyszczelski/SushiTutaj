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
import { registerRootComponent } from "expo";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
 * 1. Sygnalizuje React Native gdy strona jest gotowa (DOM wyrenderowany)
 * 2. Wyciąga cookies Supabase i restaurant_slug → wysyła do RN
 * 3. Nasłuchuje na wiadomości od RN (np. nawigacja do URL)
 * 4. Ukrywa elementy UI niepotrzebne w natywnej apce
 * 5. Wyłącza Web Push (bo mamy natywny FCM!)
 */
const INJECTED_JS = `
(function() {
  // --- 0. KRYTYCZNE: Sygnał "strona gotowa" do React Native ---
  // onLoadEnd w RN odpala się gdy HTML się załaduje z sieci,
  // ALE React może jeszcze nie wyrenderować treści.
  // Ten mechanizm czeka aż DOM ma faktyczną zawartość.
  function signalReady() {
    try {
      // Sprawdź czy strona ma widoczną treść (nie jest pusta)
      var body = document.body;
      if (!body) return false;
      
      // Sprawdź czy React wyrenderował coś (body nie jest puste)
      var hasContent = body.children.length > 0 && body.innerText.trim().length > 0;
      
      // Albo czy jest formularz logowania / panel admina
      var hasForm = !!document.querySelector('form, [class*="admin"], [class*="sidebar"], nav, main');
      
      if (hasContent || hasForm) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAGE_READY',
          url: window.location.href,
          title: document.title || '',
        }));
        return true;
      }
      return false;
    } catch(e) { return false; }
  }

  // Próbuj sygnalizować gotowość wielokrotnie
  // (React hydration może trwać kilka sekund na wolnych tabletach)
  var readySent = false;
  function trySignalReady() {
    if (readySent) return;
    if (signalReady()) {
      readySent = true;
    }
  }

  // Sprawdzaj co 200ms przez max 15 sekund
  var readyInterval = setInterval(function() {
    trySignalReady();
    if (readySent) clearInterval(readyInterval);
  }, 200);
  setTimeout(function() {
    clearInterval(readyInterval);
    if (!readySent) {
      // Timeout - wyślij PAGE_READY mimo wszystko żeby nie blokować UI
      readySent = true;
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAGE_READY',
          url: window.location.href,
          title: document.title || '',
          timeout: true,
        }));
      } catch(e) {}
    }
  }, 15000);

  // Spróbuj od razu i po DOMContentLoaded
  trySignalReady();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trySignalReady);
  }
  window.addEventListener('load', trySignalReady);

  // --- 1. DEBUGGER: przechwytuj błędy JS ---
  window.onerror = function(msg, source, line, col, error) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'JS_ERROR',
        message: String(msg),
        source: String(source || ''),
        line: line,
      }));
    } catch(e2) {}
  };

  window.addEventListener('unhandledrejection', function(event) {
    try {
      var msg = event.reason ? (event.reason.message || String(event.reason)) : 'Unknown';
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'JS_ERROR',
        message: 'UnhandledPromise: ' + msg,
      }));
    } catch(e2) {}
  });

  // --- 2. Wyślij cookies do React Native ---
  function sendCookies() {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'COOKIES',
        cookies: document.cookie,
      }));
    } catch(e) {}
  }
  sendCookies();
  setInterval(sendCookies, 10000);

  // --- 2b. Wyciągnij Supabase access_token i wyślij do RN ---
  function sendAuthToken() {
    try {
      // Supabase przechowuje sesję w localStorage
      // Klucz: sb-<project_ref>-auth-token
      var token = null;
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.match(/sb-.*-auth-token$/)) {
          var raw = localStorage.getItem(key);
          if (raw) {
            try {
              var parsed = JSON.parse(raw);
              token = parsed.access_token || (parsed.currentSession && parsed.currentSession.access_token) || null;
            } catch(e3) {}
          }
          break;
        }
      }
      // Fallback: chunked cookies (sb-*-auth-token.0, .1, ...)
      if (!token) {
        var parts = [];
        var allCookies = document.cookie.split(';');
        for (var j = 0; j < allCookies.length; j++) {
          var c = allCookies[j].trim();
          if (c.match(/sb-.*-auth-token/)) {
            var eqIdx = c.indexOf('=');
            if (eqIdx > -1) parts.push(c.substring(eqIdx + 1));
          }
        }
        if (parts.length > 0) {
          try {
            var joined = decodeURIComponent(parts.join(''));
            var p2 = JSON.parse(joined);
            token = p2.access_token || null;
          } catch(e4) {}
        }
      }
      if (token) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'AUTH_TOKEN',
          token: token,
        }));
      }
    } catch(e) {}
  }
  sendAuthToken();
  setInterval(sendAuthToken, 10000);

  // --- 3. Wyciągnij restaurant_slug ---
  function sendSlug() {
    try {
      var slug = null;
      var match = document.cookie.match(/restaurant_slug=([^;]+)/);
      if (match) slug = decodeURIComponent(match[1]);
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

  // --- 4. Ukryj elementy niepotrzebne w natywnej apce ---
  try {
    var style = document.createElement('style');
    style.textContent = [
      '.pwa-install-prompt, .install-banner, [data-pwa-prompt] { display: none !important; }',
      '[data-push-toggle], .push-toggle-btn { display: none !important; }',
    ].join('\\n');
    document.head.appendChild(style);
  } catch(e) {}

  // --- 5. Wyłącz Web Push w kontekście natywnej apki ---
  window.__NATIVE_APP__ = true;
  window.__NATIVE_FCM__ = true;

  // --- 6. Nasłuchuj na wiadomości od React Native ---
  document.addEventListener('message', function(event) {
    try {
      var msg = JSON.parse(event.data);
      if (msg.type === 'NAVIGATE') {
        window.location.href = msg.url;
      }
    } catch(e) {}
  });
  window.addEventListener('message', function(event) {
    try {
      var msg = JSON.parse(event.data);
      if (msg.type === 'NAVIGATE') {
        window.location.href = msg.url;
      }
    } catch(e) {}
  });

  // --- 7. Resetuj readySent przy nawigacji SPA ---
  // Next.js robi client-side navigation, więc musimy ponowić sygnał
  var lastHref = window.location.href;
  setInterval(function() {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      readySent = false;
      trySignalReady();
    }
  }, 500);

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
  // Czy HTML się załadował (ale React mógł jeszcze nie wyrenderować)
  const [htmlLoaded, setHtmlLoaded] = useState(false);

  const {
    pushToken,
    registrationState,
    error: pushError,
    registerToken,
    lastNotificationUrl,
    clearLastNotificationUrl,
  } = useNotifications();

  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null);
  const [hasAuthToken, setHasAuthToken] = useState(false);

  // ------------------------------------------------------------------
  // Ukryj NATYWNY splash od razu → nasz loading overlay przejmuje
  // ------------------------------------------------------------------
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // ------------------------------------------------------------------
  // Timeout: jeśli strona nie załaduje się w 25s → pokaż błąd
  // ------------------------------------------------------------------
  useEffect(() => {
    if (isReady) return;
    const timer = setTimeout(() => {
      console.warn("[App] Timeout — strona nie załadowała się w 25s");
      // Jeśli HTML się załadował ale PAGE_READY nie przyszedł,
      // pokaż stronę mimo wszystko (lepsza biała strona niż wieczny loader)
      if (htmlLoaded) {
        setIsReady(true);
      } else {
        setLoadError("Strona nie odpowiada. Sprawdź połączenie z internetem.");
        setIsReady(true);
      }
    }, 25000);
    return () => clearTimeout(timer);
  }, [isReady, htmlLoaded]);

  // ------------------------------------------------------------------
  // Android: fizyczny przycisk "wstecz" → cofnij w WebView
  // ------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
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
  // Zarejestruj FCM token gdy mamy slug restauracji I auth token
  // ------------------------------------------------------------------
  useEffect(() => {
    if (pushToken && restaurantSlug && hasAuthToken) {
      console.log("[App] Rejestruję FCM token dla:", restaurantSlug, "pushToken:", pushToken?.slice(0, 25) + "...");
      void registerToken(restaurantSlug);
    }
  }, [pushToken, restaurantSlug, hasAuthToken, registerToken]);

  // ------------------------------------------------------------------
  // Obsługa wiadomości z WebView
  // ------------------------------------------------------------------
  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);

        switch (msg.type) {
          case "PAGE_READY":
            // KRYTYCZNE: Strona się WYRENDEROWAŁA (nie tylko załadowała)
            // Teraz bezpiecznie możemy ukryć loading overlay
            console.log("[App] PAGE_READY z WebView:", msg.url, msg.timeout ? "(timeout)" : "");
            if (!isReady) {
              setIsReady(true);
              setLoadError(null);
            }
            break;

          case "COOKIES":
            void saveCookiesFromWebView(msg.cookies);
            break;

          case "AUTH_TOKEN":
            if (msg.token) {
              console.log("[App] Auth token z WebView (Supabase access_token)");
              void AsyncStorage.setItem("@sushi_auth_token", msg.token).then(() => {
                setHasAuthToken(true);
              });
            }
            break;

          case "RESTAURANT_SLUG":
            if (msg.slug && msg.slug !== restaurantSlug) {
              console.log("[App] Restaurant slug z WebView:", msg.slug);
              setRestaurantSlug(msg.slug);
            }
            break;

          case "JS_ERROR":
            console.warn("[App] JS error w WebView:", msg.message);
            break;

          default:
            break;
        }
      } catch {
        // Ignoruj nie-JSON wiadomości
      }
    },
    [restaurantSlug, isReady]
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
  // WebView HTML załadowany (ale React mógł jeszcze nie wyrenderować!)
  // ------------------------------------------------------------------
  const onLoadEnd = useCallback(() => {
    setHtmlLoaded(true);
    // NIE ustawiamy isReady tutaj!
    // Czekamy na sygnał PAGE_READY z wstrzykniętego JS.
    // Fallback: timeout 25s w useEffect wyżej.
    console.log("[App] HTML loaded (onLoadEnd), waiting for PAGE_READY...");
  }, []);

  // ------------------------------------------------------------------
  // Obsługa zewnętrznych linków (tel:, mailto:, itp.)
  // ------------------------------------------------------------------
  const onShouldStartLoad = useCallback(
    (event: { url: string }) => {
      const { url } = event;

      if (url.startsWith("tel:") || url.startsWith("mailto:")) {
        Linking.openURL(url).catch(() => {});
        return false;
      }

      // KRYTYCZNE: NIE blokuj zewnętrznych URL-i!
      // Strona ładuje zasoby z wielu domen (Supabase, CDN, fonts, analytics)
      return true;
    },
    []
  );

  // ------------------------------------------------------------------
  // Render
  // WAŻNE: Kolejność renderowania:
  //   1. WebView (zawsze, na spodzie)
  //   2. Loading/Error overlay (na wierzchu, z zIndex + elevation)
  // Overlay musi być AFTER WebView w JSX żeby renderować się na wierzchu!
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

      {/* ============================================== */}
      {/* WebView — ZAWSZE renderowany, na spodzie      */}
      {/* Opacity 0 gdy nie gotowy → zapobiega flash    */}
      {/* ============================================== */}
      <View style={styles.webviewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: startUrl }}
          style={[
            styles.webview,
            // KRYTYCZNE: Ukryj WebView dopóki strona się nie wyrenderuje
            // Zapobiega białemu/czarnemu flash na tablecie
            !isReady && styles.webviewHidden,
          ]}
          // Wstrzyknij JS po załadowaniu
          injectedJavaScript={INJECTED_JS}
          // Wstrzyknij JS PRZED załadowaniem strony (ustawia flagi natywnej apki wcześniej)
          injectedJavaScriptBeforeContentLoaded={`
            window.__NATIVE_APP__ = true;
            window.__NATIVE_FCM__ = true;
            true;
          `}
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
            if (nativeEvent.statusCode >= 500) {
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
          // Cache
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
          // Mieszane treści (http/https) — pozwól na tablecie
          mixedContentMode="compatibility"
          // Android: hardware acceleration dla lepszego renderowania
          androidLayerType="hardware"
          // Debugowanie (wyłącz na produkcji)
          webviewDebuggingEnabled={__DEV__}
        />
      </View>

      {/* ============================================== */}
      {/* Overlaye — AFTER WebView → renderują się      */}
      {/* NA WIERZCHU (React Native: later = on top)    */}
      {/* ============================================== */}

      {/* Loading overlay */}
      {!isReady && !loadError && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingEmoji}>🍣</Text>
          <Text style={styles.loadingTitle}>Sushi Tutaj</Text>
          <ActivityIndicator size="large" color="#f97316" style={{ marginTop: 24 }} />
          <Text style={styles.loadingText}>Ładowanie panelu...</Text>
        </View>
      )}

      {/* Błąd ładowania */}
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
              setIsReady(false);
              setHtmlLoaded(false);
              webViewRef.current?.reload();
            }}
          >
            <Text style={styles.retryBtnText}>Spróbuj ponownie</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// =============================================================================
// STYLE
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  webview: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  // KRYTYCZNE: Ukryj WebView dopóki strona się nie wyrenderuje
  // opacity: 0 zamiast display: none → WebView kontynuuje ładowanie w tle
  webviewHidden: {
    opacity: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
    // Android: elevation zapewnia że overlay jest NA WIERZCHU WebView
    elevation: 50,
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  loadingTitle: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "bold",
  },
  loadingText: {
    color: "#64748b",
    marginTop: 16,
    fontSize: 14,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    zIndex: 60,
    elevation: 60,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
  },
  errorDesc: {
    color: "#64748b",
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
    zIndex: 70,
    elevation: 70,
  },
  errorText: {
    color: "#ffffff",
    fontSize: 12,
    textAlign: "center",
  },
});
