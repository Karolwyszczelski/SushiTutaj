"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { X, KeyRound } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const gradBtn =
  "bg-gradient-to-r from-[var(--accent-red-dark,#7a0d0d)] via-[var(--accent-red,#a61b1b)] to-[var(--accent-red-dark-2,#b11212)] text-white";

const inputCls =
  "w-full rounded-xl bg-white border border-black/10 px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-[var(--accent-red,#a61b1b)] focus:border-transparent";

const ALLOWED_CITIES = new Set(["ciechanow", "przasnysz", "szczytno"]);

export default function ResetPasswordToast() {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const sp = useSearchParams();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");

  const city = useMemo(() => {
    const c = (sp.get("city") || "").trim().toLowerCase();
    return ALLOWED_CITIES.has(c) ? c : "";
  }, [sp]);

  const hasRecoveryMarkers = useMemo(() => {
    const type = (sp.get("type") || "").toLowerCase();
    const auth = (sp.get("auth") || "").toLowerCase();
    const code = sp.get("code");
    const tokenHash = sp.get("token_hash");
    const hash = typeof window !== "undefined" ? window.location.hash : "";

    return (
      auth === "password-reset" ||
      type === "recovery" ||
      !!code ||
      !!tokenHash ||
      hash.includes("access_token=") ||
      hash.includes("refresh_token=")
    );
  }, [sp]);

  // 1) Jeśli w URL jest recovery — otwórz modal
  useEffect(() => {
    if (hasRecoveryMarkers) setOpen(true);
  }, [hasRecoveryMarkers]);

  // 2) Jeśli Supabase używa PKCE i przychodzi `code`, wymień go na sesję
  useEffect(() => {
    const code = sp.get("code");
    const type = (sp.get("type") || "").toLowerCase();
    if (!code || type !== "recovery") return;

    let cancelled = false;

    (async () => {
      try {
        // WAŻNE: wyloguj obecną sesję przed wymianą kodu na nową
        // To rozwiązuje problem "Auth session missing" gdy user jest zalogowany
        await supabase.auth.signOut().catch(() => {});
        
        // to jest kluczowe – bez tego nie będziesz miał sesji do updateUser(password)
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          // Mapuj błędy Supabase na czytelne komunikaty
          let errorMsg = error.message || "Nie udało się zweryfikować linku resetu hasła.";
          if (error.message?.includes("session missing") || error.message?.includes("expired")) {
            errorMsg = "Link do resetu hasła wygasł lub został już użyty. Poproś o nowy link.";
          } else if (error.message?.includes("invalid")) {
            errorMsg = "Nieprawidłowy link do resetu hasła. Sprawdź czy skopiowałeś cały link z emaila.";
          }
          setErr(errorMsg);
        }
      } catch (e: any) {
        if (!cancelled) {
          let errorMsg = e?.message || "Błąd weryfikacji linku resetu hasła.";
          if (errorMsg.includes("session missing") || errorMsg.includes("expired")) {
            errorMsg = "Link do resetu hasła wygasł lub został już użyty. Poproś o nowy link.";
          }
          setErr(errorMsg);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sp, supabase]);

  // 3) Fallback: jeśli event PASSWORD_RECOVERY wpadnie – też otwieramy
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setOpen(true);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const close = () => {
    setOpen(false);
    setErr(null);
    setMsg(null);
    setPass1("");
    setPass2("");

    // czyścimy URL z recovery parametrów, żeby intro/flow nie odpalało ponownie
    const dest = city ? `/${city}` : pathname;
    router.replace(dest as any);
  };

  const submit = async () => {
    setErr(null);
    setMsg(null);

    if (!pass1 || pass1.length < 6) {
      setErr("Hasło musi mieć min. 6 znaków.");
      return;
    }
    if (pass1 !== pass2) {
      setErr("Hasła muszą być identyczne.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;

      setMsg("Hasło zostało zmienione. Możesz się zalogować.");
      // po krótkiej chwili sprzątamy URL i zamykamy
      setTimeout(() => close(), 600);
    } catch (e: any) {
      setErr(e?.message || "Nie udało się zmienić hasła.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100000] bg-black/60 grid place-items-center px-4" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md bg-white text-black shadow-2xl rounded-2xl overflow-hidden">
        <button
          onClick={close}
          aria-label="Zamknij"
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-black/5"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Ustaw nowe hasło</h3>
          </div>

          <p className="text-xs text-black/60 mb-4">
            Wpisz nowe hasło do konta. Po zapisaniu przekierujemy Cię z powrotem.
          </p>

          {(err || msg) && (
            <div
              className={clsx(
                "mb-3 rounded-xl px-3 py-2 text-sm",
                err
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-50 text-green-700 border border-green-200"
              )}
            >
              {err || msg}
            </div>
          )}

          <div className="space-y-3">
            <label className="text-xs text-black/70">
              Nowe hasło
              <input
                className={clsx(inputCls, "mt-1")}
                type="password"
                value={pass1}
                onChange={(e) => setPass1(e.target.value)}
                placeholder="Min. 6 znaków"
                autoComplete="new-password"
              />
            </label>

            <label className="text-xs text-black/70">
              Powtórz hasło
              <input
                className={clsx(inputCls, "mt-1")}
                type="password"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                placeholder="Powtórz hasło"
                autoComplete="new-password"
              />
            </label>

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className={clsx("w-full rounded-xl px-4 py-2 font-semibold disabled:opacity-60", gradBtn)}
            >
              {busy ? "Zapisywanie…" : "Zapisz nowe hasło"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
