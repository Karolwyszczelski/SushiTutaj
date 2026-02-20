-- =============================================================================
-- Migracja: Tabela admin_fcm_tokens
-- Przechowuje natywne FCM/Expo push tokeny z aplikacji mobilnej
-- Uruchom w Supabase SQL Editor
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_fcm_tokens (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  restaurant_slug text NOT NULL,
  
  -- Token FCM lub Expo Push Token
  token       text NOT NULL,
  
  -- 'fcm' = natywny Firebase Cloud Messaging token
  -- 'expo' = Expo Push Token (ExponentPushToken[xxx])
  token_type  text NOT NULL DEFAULT 'expo' CHECK (token_type IN ('fcm', 'expo')),
  
  -- Opcjonalne info o urządzeniu (model, OS version, etc.)
  device_info text,
  
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL,
  
  -- Każdy token jest unikalny globalnie (jedno urządzenie = jeden token)
  CONSTRAINT admin_fcm_tokens_token_unique UNIQUE (token)
);

-- Indeks do szybkiego wyszukiwania tokenów po restauracji
CREATE INDEX IF NOT EXISTS idx_admin_fcm_tokens_restaurant 
  ON admin_fcm_tokens (restaurant_id);

-- Indeks do wyszukiwania po user_id (np. przy logout)
CREATE INDEX IF NOT EXISTS idx_admin_fcm_tokens_user 
  ON admin_fcm_tokens (user_id);

-- RLS: service role ma pełny dostęp (używamy supabaseAdmin)
-- Jeśli potrzebujesz RLS dla zwykłych użytkowników:
ALTER TABLE admin_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Polityka: admini mogą czytać/pisać swoje tokeny
CREATE POLICY "Users can manage own FCM tokens"
  ON admin_fcm_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Polityka: service role ma pełny dostęp (domyślnie w Supabase)
-- Nie trzeba tworzyć osobnej polityki — service role omija RLS

-- =============================================================================
-- OPCJONALNIE: Automatyczne czyszczenie starych tokenów (> 90 dni)
-- Możesz uruchomić jako cron job w Supabase (pg_cron)
-- =============================================================================
-- SELECT cron.schedule(
--   'cleanup-old-fcm-tokens',
--   '0 3 * * 0',  -- co niedzielę o 3:00
--   $$DELETE FROM admin_fcm_tokens WHERE updated_at < now() - interval '90 days'$$
-- );
