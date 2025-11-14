"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function VerifyClient() {
  const supabase = createClientComponentClient(); // PKCE domyślnie
  const router = useRouter();
  const [msg, setMsg] = useState("Weryfikuję link…");

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const sp = url.searchParams;
        const hp = new URLSearchParams(url.hash.replace(/^#/, ""));
        const next = sp.get("next") || "/?verified=1";

        // Komunikaty błędu z URL
        const err = sp.get("error") || sp.get("error_code");
        const errDesc = sp.get("error_description");
        if (err || errDesc) throw new Error(errDesc || err!);

        // 1) PKCE (?code=...)
        const code = sp.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            // jeśli link otwarto w innej przeglądarce i brakuje code_verifier – potraktuj jako potwierdzone
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

        // 2) Implicit hash (#access_token/#refresh_token)
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

        // 3) Starsze linki OTP
        const token_hash = sp.get("token_hash");
        const type = sp.get("type") as "signup" | "magiclink" | "recovery" | "email_change" | null;
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
