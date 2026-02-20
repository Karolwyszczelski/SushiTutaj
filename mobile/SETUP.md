# 📱 Sushi Tutaj Admin — Natywna Aplikacja (Expo + FCM)

Aplikacja mobilna (Android) dla tabletów restauracyjnych. Opakowuje panel admina
w WebView i dodaje **natywne push powiadomienia przez Firebase Cloud Messaging (FCM)**
— gwarantuje dostarczenie nawet gdy Android zabije przeglądarkę.

---

## 📋 Wymagania

- **Node.js** ≥ 18
- **Konto Firebase** (darmowe)
- **Konto Expo** (darmowe) — `npx expo register`
- **Android tablet/telefon** do testów
- **Supabase** — migracja SQL dla tabeli `admin_fcm_tokens`

---

## 🚀 Szybki start

### 1. Migracja bazy danych

Uruchom SQL w **Supabase SQL Editor** (Dashboard → SQL Editor → New query):

```sql
-- Skopiuj zawartość pliku:
-- supabase/migrations/20250101000000_admin_fcm_tokens.sql
```

Lub bezpośrednio:

```sql
CREATE TABLE IF NOT EXISTS admin_fcm_tokens (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid NOT NULL,
  restaurant_id   uuid NOT NULL,
  restaurant_slug text NOT NULL,
  token           text NOT NULL,
  token_type      text NOT NULL DEFAULT 'expo' CHECK (token_type IN ('fcm', 'expo')),
  device_info     text,
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT admin_fcm_tokens_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_admin_fcm_tokens_restaurant ON admin_fcm_tokens (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_admin_fcm_tokens_user ON admin_fcm_tokens (user_id);

ALTER TABLE admin_fcm_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own FCM tokens"
  ON admin_fcm_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 2. Firebase — konfiguracja projektu

1. Wejdź na [Firebase Console](https://console.firebase.google.com/)
2. **Utwórz nowy projekt** (lub użyj istniejącego)
3. **Dodaj aplikację Android**:
   - Package name: `com.sushitutaj.admin`
   - App nickname: `Sushi Tutaj Admin`
4. **Pobierz `google-services.json`** i umieść w folderze `mobile/`
5. W Firebase → **Project Settings → Service accounts**:
   - Kliknij "Generate new private key"
   - Pobierz plik JSON

### 3. Zmienne środowiskowe (serwer Next.js)

Dodaj do `.env.local` (lub Vercel Environment Variables):

```env
# Opcja A: Cały service account JSON w jednej zmiennej
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}

# LUB Opcja B: Osobne zmienne
FIREBASE_PROJECT_ID=twoj-projekt-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@twoj-projekt.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIB...\n-----END PRIVATE KEY-----\n"
```

> ⚠️ W Vercel: `FIREBASE_PRIVATE_KEY` wymaga poprawnego formatowania — użyj `\n` zamiast prawdziwych nowych linii.

### 4. Instalacja zależności mobilnej app

```bash
cd mobile
npm install
```

### 5. Konfiguracja URL

Edytuj `mobile/src/config.ts`:

```typescript
// Produkcja:
export const ADMIN_URL = __DEV__
  ? "http://192.168.1.100:3000"     // IP twojej maszyny deweloperskiej
  : "https://twojadomena.pl";       // ← zmień na prawdziwy URL
```

### 6. Expo — prebuild + uruchomienie

```bash
cd mobile

# Zaloguj się do Expo
npx expo login

# Wygeneruj natywny projekt Android
npx expo prebuild --platform android

# Uruchom na podłączonym urządzeniu USB (tryb development)
npx expo run:android

# LUB zbuduj APK do zainstalowania
cd android && ./gradlew assembleRelease
# APK będzie w: android/app/build/outputs/apk/release/
```

### 7. Budowanie APK produkcyjnego z EAS

Alternatywnie, użyj Expo Application Services (EAS) do budowania w chmurze:

```bash
# Zainstaluj EAS CLI
npm install -g eas-cli

# Zaloguj się
eas login

# Konfiguracja
eas build:configure

# Zbuduj APK (profil preview = APK, profil production = AAB)
eas build --platform android --profile preview
```

---

## 🏗️ Architektura

```
┌─────────────────────┐
│   Tablet Android    │
│                     │
│  ┌───────────────┐  │
│  │  Expo App     │  │
│  │  ┌─────────┐  │  │
│  │  │ WebView │  │  │  ← Panel admina (Next.js)
│  │  └─────────┘  │  │
│  │  + FCM native │  │  ← Natywne powiadomienia
│  └───────────────┘  │
└─────────────────────┘
         │
         │ FCM token registration
         ▼
┌─────────────────────┐
│  Next.js Server     │
│  (Vercel)           │
│                     │
│  /api/admin/push/   │
│    fcm-register     │  ← Zapisuje FCM token
│                     │
│  src/lib/push.ts    │  ← Wysyła web-push + FCM
│  src/lib/fcm.ts     │  ← Firebase Cloud Messaging
└─────────────────────┘
         │
         │ Nowe zamówienie
         ▼
┌─────────────────────┐
│  Supabase           │
│  admin_fcm_tokens   │  ← Tokeny FCM per restauracja
│  admin_push_subs    │  ← Tokeny web-push (backup)
└─────────────────────┘
```

### Przepływ powiadomienia:

1. Klient składa zamówienie
2. `notifications.ts` → `sendPushForRestaurant()`
3. `push.ts` wysyła **web-push** (dla przeglądarek)
4. `push.ts` wywołuje `sendFcmForRestaurant()` (dla natywnych app)
5. `fcm.ts` pobiera tokeny z `admin_fcm_tokens` i wysyła przez FCM HTTP v1 API
6. Android dostarcza powiadomienie z dźwiękiem nawet w Doze mode

---

## 📁 Struktura plików

```
mobile/
├── App.tsx                      # Główna aplikacja (WebView + FCM)
├── app.json                     # Konfiguracja Expo
├── package.json                 # Zależności
├── babel.config.js
├── tsconfig.json
├── google-services.json         # ← DODAJ z Firebase Console
└── src/
    ├── config.ts                # URL-e, stałe
    └── hooks/
        └── useNotifications.ts  # FCM token management

src/
├── lib/
│   ├── fcm.ts                   # NOWY: Firebase Cloud Messaging sender
│   └── push.ts                  # ZMODYFIKOWANY: + FCM integration
└── app/api/admin/push/
    └── fcm-register/
        └── route.ts             # NOWY: Rejestracja FCM tokenów

supabase/migrations/
└── 20250101000000_admin_fcm_tokens.sql  # Migracja DB
```

---

## 🔧 Rozwiązywanie problemów

### Powiadomienia nie przychodzą

1. **Sprawdź czy token jest zarejestrowany**:
   ```sql
   SELECT * FROM admin_fcm_tokens WHERE restaurant_slug = 'twoj-slug';
   ```

2. **Sprawdź logi serwera** — szukaj `[fcm]`:
   ```
   [fcm] Wysyłam do 2 natywnych urządzeń dla restauracji: xxx
   ```

3. **Sprawdź zmienne środowiskowe** — `FIREBASE_PROJECT_ID` itd.

4. **Na tablecie**: Upewnij się że:
   - Powiadomienia dla app są włączone
   - Bateria nie jest w trybie "optymalizacji" dla tej app
   - W ustawieniach → Aplikacje → Sushi Tutaj Admin → Bateria → "Bez ograniczeń"

### WebView nie ładuje strony

- Sprawdź URL w `config.ts`
- Upewnij się że serwer Next.js jest dostępny z tabletu
- W dev mode: użyj IP maszyny deweloperskiej (nie `localhost`)

### Dźwięk powiadomienia nie gra

- Dodaj plik `new_order.wav` do `mobile/assets/` (zostanie skopiowany przy prebuild)
- Format: WAV, max 30 sekund
- Nazwa pliku musi odpowiadać `sound: "new_order"` w konfiguracji kanału

---

## 🔒 Bezpieczeństwo

- FCM tokeny są powiązane z `user_id` i `restaurant_id`
- Endpoint `/api/admin/push/fcm-register` wymaga autoryzacji (Bearer token lub cookie session)
- RLS na tabeli `admin_fcm_tokens` — użytkownicy widzą tylko swoje tokeny
- Service role client omija RLS do wysyłania (server-side only)
- Martwe tokeny są automatycznie usuwane po nieudanej wysyłce

---

## 📱 Instalacja na tabletach restauracyjnych

1. Zbuduj APK (patrz sekcja "Budowanie APK")
2. Prześlij APK na tablet (USB / Google Drive / link)
3. Zainstaluj APK (włącz "Nieznane źródła" jeśli potrzeba)
4. Otwórz app → zaloguj się
5. App automatycznie zarejestruje FCM token
6. **Ważne**: W ustawieniach Androida:
   - Aplikacje → Sushi Tutaj Admin → Bateria → **Bez ograniczeń**
   - Powiadomienia → Sushi Tutaj Admin → **Włączone**, priorytet **Pilne**
   - (Samsung) Device care → Bateria → Nie optymalizowane → Dodaj "Sushi Tutaj Admin"
   - (Xiaomi) Ustawienia → Zarządzanie aplikacjami → Sushi Tutaj Admin → Autostart → ON
