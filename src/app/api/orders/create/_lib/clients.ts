// src/app/api/orders/create/_lib/clients.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";

export const TERMS_VERSION = process.env.TERMS_VERSION || "2025-01";
export const PRIVACY_VERSION = process.env.PRIVACY_VERSION || "2025-01";

export const TERMS_URL =
  process.env.TERMS_URL || "https://www.sushitutaj.pl/regulamin";

export const PRIVACY_URL =
  process.env.PRIVACY_URL || "https://www.sushitutaj.pl/polityka-prywatnosci";
