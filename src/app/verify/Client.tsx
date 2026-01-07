// src/app/verify/Client.tsx
"use client";

// START: imports
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { Route } from "next";
// END: imports

export default function VerifyClient() {
  // START: supabase client
  const supabase = getSupabaseBrowser();
  // END: supabase client

  const router = useRouter();
  const [msg, setMsg] = useState("Weryfikuję link…");

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const sp = url.searchParams;
        const hp = new URLSearchParams(url.hash.replace(/^#/, ""));

        const rawNext = sp.get("next");
        const next: Route =
          rawNext && rawNext.startsWith("/") ? (rawNext as Route) : "/?verified=1";

        const err = sp.get("error") || sp.get("error_code");
        const errDesc = sp.get("error_description");
        if (err || errDesc) throw new Error(errDesc || err!);

        const code = sp.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            const msg = (error as any)?.message || "";
            if (msg.toLowerCase().includes("code verifier")) {
              router.replace(next);
              return;
            }
            throw error;
          }
          window.history.replaceState({}, document.title, url.origin + url.pathname);
          setMsg("Adres e-mail potwierdzony. Loguję…");
          router.replace(next);
          return;
        }

        const access_token = hp.get("access_token");
        const refresh_token = hp.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          window.history.replaceState({}, document.title, url.origin + url.pathname);
          setMsg("Adres e-mail potwierdzony. Loguję…");
          router.replace(next);
          return;
        }

        const token_hash = sp.get("token_hash");
        const type = sp.get("type") as
          | "signup"
          | "magiclink"
          | "recovery"
          | "email_change"
          | null;
        if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type });
          if (error) throw error;
          window.history.replaceState({}, document.title, url.origin + url.pathname);
          setMsg("Adres e-mail potwierdzony. Loguję…");
          router.replace(next);
          return;
        }

        setMsg("Błąd potwierdzania: brak parametrów weryfikacji w URL.");
      } catch (e: any) {
        setMsg(`Błąd potwierdzania: ${e?.message ?? "nieznany"}`);
      }
    })();
  }, [router, supabase]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="rounded-lg bg-white/60 p-6 text-center">
        <h1 className="text-2xl font-bold mb-2">Weryfikacja</h1>
        <p>{msg}</p>
      </div>
    </div>
  );
}
