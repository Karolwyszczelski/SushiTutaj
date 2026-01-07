"use client";

import { useEffect } from "react";

const ALLOWED = new Set(["ciechanow", "przasnysz", "szczytno"]);

export default function ResetPasswordRedirectPage() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // To jest URL, na który Supabase Cię przekierował (może zawierać code/type/token_hash i/lub hash z tokenami)
    const url = new URL(window.location.href);
    const sp = url.searchParams;

    // city przychodzi z redirectTo (jeśli dopięte) – zachowujemy, żeby wrócić na /[city]
    const cityRaw = (sp.get("city") || "").trim().toLowerCase();
    const city = ALLOWED.has(cityRaw) ? cityRaw : "";

    // sprzątamy city z query, ale resztę zostawiamy (code/type/token_hash itp.)
    sp.delete("city");

    // flaga dla UI: otwórz modal resetu niezależnie od wariantu tokenów
    sp.set("auth", "password-reset");

    const destBase = city ? `/${city}` : "/";

    // zachowaj hash (np. #access_token=...), bo Supabase czasem tam wkłada tokeny
    const qs = sp.toString();
    const dest = destBase + (qs ? `?${qs}` : "") + (url.hash || "");

    window.location.replace(dest);
  }, []);

  return null;
}
