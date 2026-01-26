// src/components/AuthCookieSync.tsx
"use client";
import { useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function AuthCookieSync() {
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_OUT") {
        await fetch("/api/restaurants/clear-cookie", { method: "POST" });
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        await fetch("/api/restaurants/ensure-cookie", { cache: "no-store", credentials: "include" });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  return null;
}
