"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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

    // Supabase wymaga aktywnej sesji z linku resetującego.
    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      console.error(error);
      setErrorMsg(
        "Nie udało się ustawić nowego hasła. Link mógł wygasnąć – poproś o nowy reset hasła."
      );
      return;
    }

    setSuccess(true);

    // Po chwili przerzucamy na ekran logowania / stronę główną.
    setTimeout(() => {
      router.replace("/?auth=password_reset_success");
    }, 1500);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f5f5f5] px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-semibold mb-2 text-center">
          Ustaw nowe hasło
        </h1>
        <p className="text-sm text-gray-600 mb-6 text-center">
          Link z maila został zweryfikowany. Wpisz nowe hasło do swojego konta.
        </p>

        {errorMsg && (
          <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">
            {errorMsg}
          </div>
        )}

        {success ? (
          <div className="rounded-lg bg-green-50 text-green-700 text-sm px-3 py-3 text-center">
            Hasło zostało zmienione. Za chwilę wrócisz na stronę główną.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Nowe hasło
              </label>
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
              <label className="block text-sm font-medium mb-1">
                Powtórz hasło
              </label>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-sm font-semibold py-2.5 disabled:opacity-60"
            >
              {loading ? "Zapisywanie..." : "Zapisz nowe hasło"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
