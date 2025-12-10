"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Mode = "loading" | "recovery" | "done" | "error";

export default function AuthCallbackPage() {
  const supabase = createClientComponentClient();
  const [mode, setMode] = useState<Mode>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);

  // rozpoznanie trybu + ewentualne zalogowanie po code i przekierowanie
  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
        const hashParams = new URLSearchParams(hash);
        const type = hashParams.get("type");
        const code = url.searchParams.get("code");

        // 1) Reset hasła – zostajemy na tej stronie
        if (type === "recovery") {
          setMode("recovery");
          return;
        }

        // 2) Potwierdzenie rejestracji / magic link – wymiana code -> session (jeśli jest)
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error(error);
            throw error;
          }
        }

        // 3) Sukces – przekierowanie na stronę główną z parametrem do popupu
        const origin = url.origin; // na prod będzie https://sushitutaj.pl
        window.location.href = `${origin}/?auth=signup-success`;
      } catch (err) {
        console.error(err);
        setError(
          "Link jest nieprawidłowy lub wygasł. Spróbuj ponownie zalogować się lub zresetować hasło."
        );
        setMode("error");
      }
    };

    run();
  }, [supabase]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!pass || pass !== pass2) {
      setError("Hasła muszą być identyczne.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    setBusy(false);

    if (error) {
      setError(error.message || "Nie udało się zmienić hasła.");
    } else {
      setMode("done");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 border border-black/5">
        {mode === "loading" && (
          <p className="text-sm text-black/70">Przetwarzamy link…</p>
        )}

        {mode === "recovery" && (
          <div>
            <h1 className="text-xl font-semibold mb-2">Ustaw nowe hasło</h1>
            <p className="text-xs text-black/60 mb-4">
              Ten ekran otworzył się po kliknięciu w link „reset hasła”. Po
              zapisaniu nowego hasła możesz zalogować się w panelu konta.
            </p>

            {error && (
              <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="text-xs text-black/70">
                  Nowe hasło
                  <input
                    type="password"
                    className="w-full mt-1 rounded-xl bg-white border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-red,#a61b1b)] focus:border-transparent"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div>
                <label className="text-xs text-black/70">
                  Powtórz nowe hasło
                  <input
                    type="password"
                    className="w-full mt-1 rounded-xl bg-white border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-red,#a61b1b)] focus:border-transparent"
                    value={pass2}
                    onChange={(e) => setPass2(e.target.value)}
                    required
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full mt-1 rounded-xl px-4 py-2 font-semibold bg-gradient-to-r from-[var(--accent-red-dark,#7a0d0d)] via-[var(--accent-red,#a61b1b)] to-[var(--accent-red-dark-2,#b11212)] text-white disabled:opacity-60"
              >
                {busy ? "Zapisuję…" : "Zmień hasło"}
              </button>
            </form>
          </div>
        )}

        {mode === "done" && (
          <div className="space-y-2 text-sm text-black/80">
            <h1 className="text-xl font-semibold">Hasło zmienione</h1>
            <p>
              Twoje hasło zostało zaktualizowane. Możesz wrócić na stronę
              restauracji i zalogować się nowymi danymi.
            </p>
          </div>
        )}

        {mode === "error" && (
          <div className="space-y-2 text-sm text-black/80">
            <h1 className="text-xl font-semibold">Błąd linku</h1>
            <p>
              Link jest nieprawidłowy lub wygasł. Spróbuj ponownie wysłać reset
              hasła z panelu logowania albo poprosić obsługę o nowy link.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
