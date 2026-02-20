// mobile/src/config.ts

/**
 * Konfiguracja aplikacji mobilnej Sushi Tutaj Admin.
 *
 * WAŻNE: Zmień ADMIN_URL na adres produkcyjny ZANIM zbudujesz APK.
 * Dla developmentu możesz użyć adresu IP maszyny deweloperskiej:
 *   http://192.168.X.X:3000
 */

// URL panelu admina (Next.js) — WebView będzie to wyświetlać
export const ADMIN_URL = __DEV__
  ? "http://192.168.1.100:3000"          // <-- Zmień na IP dev maszyny
  : "https://twojadomena.pl";             // <-- Zmień na produkcyjny URL

// Endpoint do rejestracji tokenu FCM na serwerze
export const FCM_REGISTER_URL = `${ADMIN_URL}/api/admin/push/fcm-register`;

// Domyślna strona startowa w WebView
export const START_PATH = "/admin/pickup-order";

// Kanał powiadomień Android (musi odpowiadać temu w app.json)
export const NOTIFICATION_CHANNEL_ID = "orders";

// Nazwa kanału widoczna w ustawieniach Androida
export const NOTIFICATION_CHANNEL_NAME = "Zamówienia";
