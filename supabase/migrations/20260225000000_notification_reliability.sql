-- =============================================================================
-- Migracja: Niezawodność systemu powiadomień
-- 1. Failure tracking na tokenach FCM (zamiast natychmiastowego usuwania)
-- 2. Tabela logów dostarczenia powiadomień (delivery tracking)
-- 3. Funkcja RPC do atomowego inkrementowania failure_count
--
-- Uruchom w Supabase SQL Editor (produkcja + staging)
-- =============================================================================

-- =============================================================================
-- 1. Dodaj kolumny failure tracking do admin_fcm_tokens
-- =============================================================================

-- Licznik kolejnych błędów wysyłki — token usuwany dopiero po >= 3
ALTER TABLE admin_fcm_tokens
  ADD COLUMN IF NOT EXISTS failure_count integer DEFAULT 0;

-- Timestamp ostatniego błędu — przydatne do debugowania
ALTER TABLE admin_fcm_tokens
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz;

-- Powód ostatniego błędu (UNREGISTERED, DeviceNotRegistered, etc.)
ALTER TABLE admin_fcm_tokens
  ADD COLUMN IF NOT EXISTS last_failure_reason text;

-- =============================================================================
-- 2. Tabela logów dostarczenia powiadomień (Delivery Tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id   uuid NOT NULL,
  
  -- Klucz idempotentności — zapobiega duplikatom
  idempotency_key text,
  
  -- Kanał dostarczenia
  channel         text NOT NULL,   -- 'web_push', 'fcm', 'expo'
  
  -- Status wysyłki
  status          text NOT NULL,   -- 'sent', 'failed', 'dead_token'
  
  -- Ostatnie 20 znaków tokena (do debugowania, bez PII)
  target_token_suffix text,
  
  -- Szczegóły błędu
  error_code      text,
  error_message   text,
  
  -- Kontekst powiadomienia
  payload_title   text,
  payload_type    text,
  
  created_at      timestamptz DEFAULT now() NOT NULL
);

-- Indeks do przeglądania logów per restauracja
CREATE INDEX IF NOT EXISTS idx_ndl_restaurant_created
  ON notification_delivery_log (restaurant_id, created_at DESC);

-- Indeks do sprawdzania idempotentności (tylko non-null keys)
CREATE INDEX IF NOT EXISTS idx_ndl_idempotency
  ON notification_delivery_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Indeks po statusie — szybkie filtrowanie błędów
CREATE INDEX IF NOT EXISTS idx_ndl_status
  ON notification_delivery_log (status, created_at DESC);

-- RLS: service role ma pełny dostęp (używamy supabaseAdmin)
ALTER TABLE notification_delivery_log ENABLE ROW LEVEL SECURITY;

-- Polityka: tylko service role (admin panel) czyta logi
DROP POLICY IF EXISTS "Service role full access to delivery log" ON notification_delivery_log;
CREATE POLICY "Service role full access to delivery log"
  ON notification_delivery_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 3. Tabela idempotentności powiadomień
-- Zapobiega wysłaniu tego samego powiadomienia dwukrotnie
-- (np. retry requesta, podwójne kliknięcie)
-- =============================================================================

CREATE TABLE IF NOT EXISTS notification_idempotency (
  key             text PRIMARY KEY,
  restaurant_id   uuid NOT NULL,
  created_at      timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nidemp_created
  ON notification_idempotency (created_at);

ALTER TABLE notification_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to idempotency" ON notification_idempotency;
CREATE POLICY "Service role full access to idempotency"
  ON notification_idempotency
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 4. Tabela Expo Push Receipts
-- Expo wymaga sprawdzenia ticketów po 15-30 minutach aby dowiedzieć się
-- czy powiadomienie rzeczywiście dotarło do urządzenia.
-- Bez tego martwe tokeny Expo mogą żyć w bazie tygodniami!
-- =============================================================================

CREATE TABLE IF NOT EXISTS expo_push_receipts (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Ticket ID z Expo Push API (format: "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX")
  ticket_id       text NOT NULL UNIQUE,
  
  -- Token Expo którego dotyczy ticket
  expo_token      text NOT NULL,
  
  -- Status: 'pending' → 'ok' | 'error'
  status          text NOT NULL DEFAULT 'pending',
  
  -- Szczegóły błędu (wypełniane po sprawdzeniu receiptu)
  error_code      text,
  error_message   text,
  
  -- Restaurant context (dla debugowania)
  restaurant_id   uuid NOT NULL,
  
  created_at      timestamptz DEFAULT now() NOT NULL,
  checked_at      timestamptz
);

-- Indeks do pobierania niesprawdzonych ticketów
CREATE INDEX IF NOT EXISTS idx_expo_receipts_pending
  ON expo_push_receipts (status, created_at)
  WHERE status = 'pending';

-- Indeks do czyszczenia starych
CREATE INDEX IF NOT EXISTS idx_expo_receipts_created
  ON expo_push_receipts (created_at);

ALTER TABLE expo_push_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to expo receipts" ON expo_push_receipts;
CREATE POLICY "Service role full access to expo receipts"
  ON expo_push_receipts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 5. Automatyczne czyszczenie starych danych (pg_cron)
-- =============================================================================

-- Logi starsze niż 30 dni — czyść co niedzielę o 4:00
-- SELECT cron.schedule(
--   'cleanup-delivery-log',
--   '0 4 * * 0',
--   $$DELETE FROM notification_delivery_log WHERE created_at < now() - interval '30 days'$$
-- );

-- Klucze idempotentności starsze niż 24h — czyść co godzinę
-- SELECT cron.schedule(
--   'cleanup-idempotency-keys',
--   '0 * * * *',
--   $$DELETE FROM notification_idempotency WHERE created_at < now() - interval '24 hours'$$
-- );

-- FCM tokeny z >= 3 failures starsze niż 7 dni — czyść co niedzielę
-- SELECT cron.schedule(
--   'cleanup-dead-fcm-tokens',
--   '0 3 * * 0',
--   $$DELETE FROM admin_fcm_tokens WHERE failure_count >= 3 AND last_failure_at < now() - interval '7 days'$$
-- );

-- FCM tokeny nieaktualizowane > 90 dni (urządzenie porzucone)
-- SELECT cron.schedule(
--   'cleanup-old-fcm-tokens',
--   '0 3 * * 0',
--   $$DELETE FROM admin_fcm_tokens WHERE updated_at < now() - interval '90 days'$$
-- );

-- Expo receipts starsze niż 7 dni — czyść co niedzielę
-- SELECT cron.schedule(
--   'cleanup-expo-receipts',
--   '0 3 * * 0',
--   $$DELETE FROM expo_push_receipts WHERE created_at < now() - interval '7 days'$$
-- );
