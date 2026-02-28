# 🧪 Instrukcja Testowania Powiadomień na Zablokowanym Ekranie

## 📋 Przygotowanie do Testów

### Wymagania:
- ✅ Fizyczny tablet Android (NIE emulator - powiadomienia nie działają)
- ✅ Android 8.0+ (API 26+) z włączoną optymalizacją baterii
- ✅ Zainstalowana aplikacja SushiTutaj Mobile
- ✅ Zalogowany admin restauracji
- ✅ Dostęp do panelu admina (do wysyłania testowych zamówień)

### Przygotowanie Tabletu:
```bash
# 1. Sprawdź czy battery optimization jest włączona (WAŻNE!)
Settings → Apps → SushiTutaj → Battery → Background restriction → Unrestricted

# 2. Sprawdź czy powiadomienia są włączone
Settings → Apps → SushiTutaj → Notifications → All enabled

# 3. Sprawdź czy Do Not Disturb jest wyłączony (dla pierwszego testu)
Settings → Sound → Do Not Disturb → OFF

# 4. Sprawdź poziom baterii (minimum 50% żeby Android nie był aggressive)
```

---

## 🧪 Scenariusz 1: Tablet Zablokowany Krótko (10 Minut)

### Cel:
Sprawdzić czy powiadomienia przychodzą natychmiast na zablokowany ekran.

### Kroki:
1. **Uruchom aplikację** - potwierdź że jest zalogowana
2. **Sprawdź logi** w terminalu:
   ```bash
   npx expo start --dev-client
   # Lub na urządzeniu fizycznym:
   adb logcat | grep -E "FCM|Notification"
   ```
3. **Zablokuj tablet** - naciśnij przycisk Power (ekran się wyłącza)
4. **Czekaj 2 minuty** - tablet wejdzie w Light Doze mode
5. **Wyślij testowe zamówienie** z panelu admina
6. **Obserwuj:**
   - ✅ Powiadomienie POWINNO przyjść NATYCHMIAST (1-3 sekundy)
   - ✅ Ekran POWINIEN się zaświecić
   - ✅ Dźwięk POWINIEN zagrać
   - ✅ Wibracja POWINNA zadziałać
   - ✅ Alarm POWINIEN się zapętlić

7. **Odblokuj tablet**
8. **Sprawdź logi serwera:**
   ```bash
   # W Vercel/logs lub local terminal:
   # Powinieneś zobaczyć:
   [fcm] ✅ Wysyłam do 1 urządzeń (FCM: 1, Expo: 0)
   [fcm] Podsumowanie: 1 sent, 0 failed
   ```

### ✅ Sukces jeśli:
- Powiadomienie przyszło w < 5 sekund
- Dźwięk + wibracja zadziałały
- Token NIE został usunięty (sprawdź w bazie: `failure_count = 0`)

### ❌ Błąd jeśli:
- Powiadomienie NIE przyszło → Sprawdź FCM credentials
- Przyszło po odblokowaniu → Problem z `direct_boot_ok` (sprawdź app.config.js)
- Brak dźwięku → Sprawdź czy kanał został utworzony poprawnie

---

## 🧪 Scenariusz 2: Tablet Zablokowany Długo (30 Minut) - Doze Mode Test

### Cel:
Sprawdzić czy tokeny są chronione przed usunięciem podczas Doze mode.

### Kroki:
1. **Uruchom aplikację** i **zablokuj tablet**
2. **Czekaj 30 minut** - tablet wejdzie w Deep Doze mode
   ```
   Light Doze → 5 min → Deep Doze → 30 min → Idle Maintenance
   ```
3. **Wyślij 3 testowe zamówienia** (co 5 minut)
4. **Sprawdź czy powiadomienia przychodzą**
   - HIGH priority FCM powinno budzić z Doze
5. **Odblokuj tablet po 30 minutach**
6. **Sprawdź logi:**
   ```bash
   [App] Foreground detected — wymuszam re-rejestrację FCM
   [fcm-register] Token UPDATED (isNew: false, updatedAt: ...)
   ```
7. **Sprawdź bazę danych:**
   ```sql
   SELECT 
     token, 
     failure_count, 
     last_failure_at,
     updated_at,
     (EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60)::int AS minutes_since_update
   FROM admin_fcm_tokens
   WHERE restaurant_slug = 'twoja-restauracja';
   ```

### ✅ Sukces jeśli:
- `failure_count` = 0 lub max 1-2 (resetowane po odblokowaniu)
- `updated_at` jest świeże (< 1 minuta po odblokowaniu)
- Token NIE został usunięty z bazy
- Powiadomienia przychodzą normalnie po odblokowaniu

### ⚠️ Możliwe Ostrzeżenia (NORMALNE):
```
[fcm] ⚠️ Token failure 1/3: UNREGISTERED (NIE usuwam — czekam na więcej dowodów)
```
To jest OK! Token jest chroniony przez 15-min grace period.

### 🛡️ Ochrona Powinna Zadziałać:
```
[fcm] 🛡️ OCHRONA: Token ma 3 failures ALE był aktywny 7min temu — NIE usuwam!
(tablet prawdopodobnie w Doze mode, czekam na heartbeat)
```

---

## 🧪 Scenariusz 3: Heartbeat Verification

### Cel:
Sprawdzić czy heartbeat aktualizuje `updated_at` co 5 minut.

### Kroki:
1. **Uruchom aplikację** (NIE blokuj tabletu)
2. **Sprawdź logi co 5 minut:**
   ```bash
   [App] Heartbeat: re-rejestruję FCM token dla: twoja-restauracja
   [fcm-register] Token UPDATED (isNew: false, updatedAt: ...)
   ```
3. **Sprawdź bazę danych:**
   ```sql
   SELECT 
     token,
     updated_at,
     created_at,
     (updated_at > created_at + interval '1 minute') AS is_heartbeat_working
   FROM admin_fcm_tokens
   WHERE restaurant_slug = 'twoja-restauracja';
   ```

### ✅ Sukces jeśli:
- `is_heartbeat_working` = `true` (updated_at > created_at)
- Logi pokazują "Token UPDATED" (nie "CREATED") co 5 min
- `updated_at` zmienia się co 5 minut

---

## 🧪 Scenariusz 4: Token Naprawdę Martwy (Cleanup Test)

### Cel:
Sprawdzić czy martwe tokeny są poprawnie usuwane.

### Kroki:
1. **Utwórz fałszywy token** w bazie:
   ```sql
   INSERT INTO admin_fcm_tokens (
     user_id, 
     restaurant_id, 
     restaurant_slug, 
     token, 
     token_type,
     failure_count,
     updated_at
   ) VALUES (
     'user-uuid',
     'restaurant-uuid', 
     'twoja-restauracja',
     'fake-token-for-testing-123456789',
     'fcm',
     0,
     NOW() - interval '30 minutes'  -- 30 minut temu
   );
   ```

2. **Wyślij testowe zamówienie** (spróbuje wysłać do fake tokena)

3. **Sprawdź logi:**
   ```bash
   [fcm] ⚠️ Token failure 1/3: UNREGISTERED
   # Po 2 kolejnych zamówieniach:
   [fcm] ⚠️ Token failure 2/3: UNREGISTERED
   # Po 3 zamówieniu:
   [fcm] ⚠️ Token failure 3/3: UNREGISTERED
   ```

4. **Sprawdź bazę:**
   ```sql
   SELECT token, failure_count, updated_at
   FROM admin_fcm_tokens
   WHERE token = 'fake-token-for-testing-123456789';
   ```
   - Po 1 wysyłce: `failure_count = 1`
   - Po 2 wysyłce: `failure_count = 2`
   - Po 3 wysyłce: `failure_count = 3` ALE token WCIĄŻ istnieje! (ochrona 15-min)

5. **Wyślij 4-te zamówienie PO 20 minutach:**
   ```bash
   # Poczekaj 20 minut (symuluj brak heartbeat)
   # Wyślij zamówienie
   [fcm] 🗑️ Token TRWALE martwy po 4 failures (ostatnia aktywność 50min temu)
   ```

6. **Potwierdź usunięcie:**
   ```sql
   SELECT COUNT(*) FROM admin_fcm_tokens
   WHERE token = 'fake-token-for-testing-123456789';
   -- Powinno zwrócić 0
   ```

### ✅ Sukces jeśli:
- Token NIE jest usuwany natychmiast (po 1-3 failures)
- Token JEST usuwany dopiero gdy:
  - `failure_count >= 3` AND
  - `updated_at` > 15 minut temu (brak heartbeat)
- Prawdziwe tokeny (z heartbeat) NIE są usuwane mimo failures

---

## 🧪 Scenariusz 5: Recovery Po Długiej Blokadzie

### Cel:
Sprawdzić czy system recovery działa po bardzo długiej blokadzie (2+ godzin).

### Kroki:
1. **Uruchom aplikację** i **zablokuj tablet**
2. **Czekaj 2 godziny** (lub użyj `adb` do symulacji):
   ```bash
   # Symulacja Doze mode (wymaga roota):
   adb shell dumpsys deviceidle force-idle
   ```
3. **Wyślij testowe zamówienie** podczas blokady
4. **Odblokuj tablet**
5. **Obserwuj logi:**
   ```bash
   [App] Foreground detected — wymuszam re-rejestrację FCM
   [FCM] Requesting native FCM device token...
   [FCM] ✅ FCM token uzyskany: ...
   [fcm-register] Token UPDATED (isNew: false)
   [fcm] ✅ Reset failure_count dla 1 tokenów
   ```

6. **Wyślij kolejne zamówienie** - powinno działać normalnie

### ✅ Sukces jeśli:
- Po odblokowaniu token jest automatycznie re-rejestrowany
- `failure_count` resetuje się do 0
- Kolejne powiadomienia działają natychmiast

---

## 🧪 Scenariusz 6: Do Not Disturb Mode

### Cel:
Sprawdzić czy `bypassDnd: true` działa poprawnie.

### Kroki:
1. **Włącz Do Not Disturb:**
   ```
   Settings → Sound → Do Not Disturb → ON
   ```
2. **Uruchom aplikację** i **zablokuj tablet**
3. **Wyślij testowe zamówienie**
4. **Obserwuj:**
   - ✅ Powiadomienie POWINNO przyjść (bypass DND)
   - ✅ Dźwięk POWINIEN zagrać (mimo DND)
   - ✅ Wibracja POWINNA zadziałać

### ✅ Sukces jeśli:
- Powiadomienie przychodzi mimo DND
- Dźwięk + wibracja działają

### ❌ Błąd jeśli:
- Powiadomienie przyszło ALE bez dźwięku → Sprawdź `bypassDnd` w app.config.js

---

## 📊 Monitoring Po Wdrożeniu

### Sprawdź Regularnie:
```sql
-- Tokeny z wysokim failure_count (potencjalne problemy):
SELECT 
  restaurant_slug,
  COUNT(*) as token_count,
  AVG(failure_count) as avg_failures,
  MAX(failure_count) as max_failures,
  MIN(updated_at) as oldest_update
FROM admin_fcm_tokens
GROUP BY restaurant_slug
HAVING MAX(failure_count) > 0;

-- Tokeny chronione przez grace period (normalne w Doze mode):
SELECT 
  token,
  failure_count,
  last_failure_reason,
  (EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60)::int AS minutes_since_update
FROM admin_fcm_tokens
WHERE failure_count >= 3
  AND updated_at > NOW() - interval '15 minutes';
-- Jeśli zwraca wyniki, to znaczy że ochrona działa!

-- Usunięte tokeny w ostatnich 24h (z logów):
SELECT 
  created_at,
  channel,
  status,
  error_code,
  COUNT(*) as count
FROM notification_delivery_log
WHERE created_at > NOW() - interval '24 hours'
  AND status = 'failed'
  AND error_code IN ('UNREGISTERED', 'DeviceNotRegistered')
GROUP BY created_at::date, channel, status, error_code
ORDER BY created_at DESC;
```

---

## 🚨 Troubleshooting

### Problem: Powiadomienia NIE przychodzą na zablokowany ekran

#### Diagnoza:
1. **Sprawdź logi FCM:**
   ```bash
   adb logcat | grep -E "FCM|ExpoFirebaseMessagingService"
   ```
   
2. **Sprawdź czy wiadomość jest data-only:**
   ```typescript
   // src/lib/fcm.ts - NIE powinno być notification {}:
   const message = {
     message: {
       token,
       data: { /* ... */ },
       android: {
         priority: "HIGH",
         direct_boot_ok: true,
         // ❌ BRAK notification: {} ← to jest POPRAWNE!
       }
     }
   };
   ```

3. **Sprawdź battery optimization:**
   ```bash
   adb shell dumpsys deviceidle whitelist
   # Sprawdź czy SushiTutaj jest na liście
   ```

#### Możliwe Rozwiązania:
- ✅ Dodaj apkę do battery optimization whitelist
- ✅ Sprawdź czy `direct_boot_ok: true` jest w kodzie
- ✅ Upewnij się że używasz data-only messages (BRAK `notification {}`)
- ✅ Sprawdź Firebase credentials (PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY)

---

### Problem: Token jest usuwany mimo że tablet działa

#### Diagnoza:
1. **Sprawdź heartbeat:**
   ```bash
   # Logi powinny pokazywać co 5 min:
   [App] Heartbeat: re-rejestruję FCM token
   ```

2. **Sprawdź `updated_at` w bazie:**
   ```sql
   SELECT 
     token,
     updated_at,
     (NOW() - updated_at) as age
   FROM admin_fcm_tokens
   WHERE restaurant_slug = 'twoja-restauracja';
   ```
   - Jeśli `age > 15 minutes` → Heartbeat nie działa!

#### Możliwe Rozwiązania:
- ✅ Sprawdź czy app jest otwarta (heartbeat działa tylko w foreground)
- ✅ Sprawdź czy auth token nie wygasł (sprawdź AsyncStorage)
- ✅ Upewnij się że `ignoreDuplicates: false` jest w fcm-register/route.ts

---

### Problem: Alarm nie zatrzymuje się

#### Diagnoza:
```typescript
// Sprawdź czy stopAlarm() jest wywoływane:
// 1. Po kliknięciu powiadomienia (useNotifications.ts:349)
// 2. Po wejściu na stronę zamówień (App.tsx:598-604)
```

#### Możliwe Rozwiązania:
- ✅ Sprawdź logi - czy `stopAlarm()` jest wywoływane
- ✅ Sprawdź czy audio file nie jest zablokowany przez OS

---

## ✅ Checklist Przed Wdrożeniem

- [ ] Wszystkie 6 scenariuszy testowych przeszły pomyślnie
- [ ] Heartbeat działa (logi co 5 min)
- [ ] Token NIE jest usuwany podczas normalnego użytkowania
- [ ] Token JEST usuwany gdy naprawdę martwy (fake token test)
- [ ] Powiadomienia działają na zablokowanym ekranie
- [ ] Dźwięk + wibracja działają mimo DND
- [ ] Recovery po długiej blokadzie działa automatycznie
- [ ] Monitoring w bazie danych pokazuje zdrowe tokeny (failure_count = 0)

---

## 📚 Dodatkowe Zasoby

- [Android Doze Mode Documentation](https://developer.android.com/training/monitoring-device-state/doze-standby)
- [FCM HTTP v1 API Reference](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages)
- [Expo Notifications Documentation](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Testing Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby#testing_doze)

---

**Ostatnia aktualizacja:** 2026-02-28  
**Wersja:** 1.0  
**Status:** ✅ Production Ready
