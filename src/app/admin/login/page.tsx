// src/app/admin/login/page.tsx (przykładowa ścieżka)
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function AdminLogin() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // jeśli jest sesja → /admin/AdminPanel
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/admin/AdminPanel");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      const m = error.message?.toLowerCase() || "";
      const pretty =
        m.includes("invalid") || m.includes("credentials")
          ? "Nieprawidłowy email lub hasło."
          : "Błąd logowania. Spróbuj ponownie.";
      setErrorMsg(pretty);
      return;
    }
    router.replace("/admin/AdminPanel");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6">
        <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Panel branding */}
          <div className="hidden rounded-3xl bg-slate-900 p-10 text-white lg:block">
            <div className="flex h-full flex-col justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Panel administracyjny</h2>
                <p className="mt-3 max-w-sm text-slate-300">
                  Zaloguj się, aby zarządzać zamówieniami i ustawieniami restauracji.
                </p>
              </div>
              <div className="mt-10 text-sm text-slate-400">
                © {new Date().getFullYear()} SUSHI Tutaj
              </div>
            </div>
          </div>

          {/* Formularz */}
          <div className="mx-auto w-full max-w-md">
            <form
              onSubmit={handleLogin}
              className="w-full rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200"
            >
              <div className="mb-6">
                <h1 className="text-2xl font-semibold text-slate-900">Logowanie</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Podaj dane administratora.
                </p>
              </div>

              {errorMsg && (
                <div
                  className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                  role="alert"
                  aria-live="polite"
                >
                  {errorMsg}
                </div>
              )}

              <label className="mb-4 block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Email
                </span>
                <div className="relative">
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="admin@twojadomena.pl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 outline-none ring-0 transition focus:border-slate-400"
                  />
                </div>
              </label>

              <label className="mb-6 block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Hasło
                </span>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-slate-900 placeholder-slate-400 outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="absolute inset-y-0 right-0 mr-2 inline-flex items-center rounded-lg px-3 text-xs text-slate-600 hover:bg-slate-100"
                    aria-label={showPass ? "Ukryj hasło" : "Pokaż hasło"}
                    tabIndex={-1}
                  >
                    {showPass ? "Ukryj" : "Pokaż"}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
              >
                {loading ? "Logowanie…" : "Zaloguj się"}
              </button>

              <p className="mt-4 text-center text-xs text-slate-500">
                Dostęp tylko dla upoważnionych użytkowników.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
