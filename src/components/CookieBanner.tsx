"use client";
import { useEffect, useState } from "react";

const KEY = "cookie-consent-v1";

export default function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(KEY);
    if (!v) setOpen(true);
  }, []);

  if (!open) return null;

  const save = (prefs: any) => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    setOpen(false);
    // tutaj odpalasz skrypty analytics/ads TYLKO jeśli prefs.analytics/marketing === true
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-white p-4 shadow-2xl">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          Używamy plików cookie. Zobacz{" "}
          <a href="/polityka-prywatnosci" className="underline">Politykę prywatności</a>{" "}
          i <a href="/regulamin" className="underline">Regulamin</a>.
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => save({ necessary: true, analytics: false, marketing: false })}
            className="rounded border px-3 py-2 text-sm"
          >
            Odrzuć zbędne
          </button>
          <button
            onClick={() => save({ necessary: true, analytics: true, marketing: false })}
            className="rounded border px-3 py-2 text-sm"
          >
            Tylko statystyka
          </button>
          <button
            onClick={() => save({ necessary: true, analytics: true, marketing: true })}
            className="rounded bg-black px-3 py-2 text-sm text-white"
          >
            Akceptuj wszystkie
          </button>
        </div>
      </div>
    </div>
  );
}
