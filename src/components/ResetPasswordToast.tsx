"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

export default function ResetPasswordToast() {
  const supabase = useMemo(
    () => createClientComponentClient<Database>(),
    []
  );

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Najpierw: pozwól Supabase przechwycić sesję z linku recovery.
  // Dopiero potem: czyść URL (w tym hash).
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    (async () => {
      const url = new URL(window.location.href);
      const params = url.searchParams;

      const shouldOpen =
        params.get("auth") === "password-reset" || url.hash.includes("type=recovery");

      if (shouldOpen && !cancelled) setOpen(true);

      // 1) Złap sesję z URL (obsługa obu wariantów: ?code=... lub #access_token=...)
      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) console.error("[exchangeCodeForSession]", error);
      } else {
        // To wymusza inicjalizację klienta i obsługę tokenów z hasha, jeśli są
        const { error } = await supabase.auth.getSession();
        if (error) console.error("[getSession]", error);
      }

      // 2) Dopiero teraz czyść URL (usuń query + hash z tokenami)
      params.delete("auth");
      params.delete("code");
      params.delete("token_hash");
      params.delete("type");

      const cleanUrl =
        url.pathname + (params.toString() ? `?${params.toString()}` : "");
      window.history.replaceState({}, "", cleanUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 8) {
      setErrorMsg("Hasło musi mieć co najmniej 8 znaków.");
      return;
    }
    if (password !== password2) {
      setErrorMsg("Hasła nie są takie same.");
      return;
    }

    setLoading(true);

    // Guard: bez sesji recovery updateUser nie zadziała
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (sessionErr || !session) {
      setLoading(false);
      setErrorMsg(
        "Brak aktywnej sesji resetu hasła. Otwórz link z maila ponownie (link mógł wygasnąć)."
      );
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      console.error("[updateUser]", error);
      setErrorMsg(
        "Nie udało się ustawić nowego hasła. Link mógł wygasnąć – poproś o nowy reset hasła."
      );
      return;
    }

    setSuccess(true);

    // Opcjonalnie (często polecane po recover): wyloguj po zmianie hasła
    // await supabase.auth.signOut();
  };

  const handleClose = () => {
    setOpen(false);
    setPassword("");
    setPassword2("");
    setErrorMsg(null);
    setSuccess(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6">
        <h1 className="text-2xl font-semibold mb-2 text-center">Ustaw nowe hasło</h1>
        <p className="text-sm text-gray-600 mb-4 text-center">
          Link z maila został zweryfikowany. Wpisz nowe hasło do swojego konta.
        </p>

        {errorMsg && (
          <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
            {errorMsg}
          </div>
        )}

        {success ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 text-green-700 text-sm px-3 py-3 text-center">
              Hasło zostało zmienione. Możesz się teraz zalogować.
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="w-full inline-flex items-center justify-center rounded-full border border-gray-300 text-gray-700 text-sm font-medium py-2.5"
            >
              Zamknij
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nowe hasło</label>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Powtórz hasło</label>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-sm font-semibold py-2.5 disabled:opacity-60"
              >
                {loading ? "Zapisywanie..." : "Zapisz nowe hasło"}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 inline-flex items-center justify-center rounded-full border border-gray-300 text-gray-700 text-sm font-medium py-2.5"
              >
                Anuluj
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
