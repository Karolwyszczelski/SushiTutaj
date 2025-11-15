// src/lib/supabase-browser.ts
"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

// Trzymamy dokładnie ten typ, który zwraca helper – bez ręcznego SupabaseClient<>
let _client: ReturnType<typeof createClientComponentClient<Database>> | null = null;

export function getSupabaseBrowser() {
  if (_client) return _client;
  _client = createClientComponentClient<Database>();
  return _client;
}
