// src/lib/supabaseServer.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

/**
 * Tworzy klienta Supabase dla Server Components i Route Handlers (Next.js 15+)
 * WAŻNE: Ta funkcja MUSI być wywołana wewnątrz async funkcji, bo używa await cookies()
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // W Server Components nie zawsze można ustawiać cookies
          }
        },
      },
    }
  );
}

/**
 * @deprecated Użyj createSupabaseServer() zamiast tego
 * Zachowane dla kompatybilności wstecznej - ale WYMAGA przepisania na async
 */
export const supabaseServer = () => {
  // Ten helper jest przestarzały - powinien być async
  throw new Error("supabaseServer() is deprecated. Use createSupabaseServer() instead.");
};
