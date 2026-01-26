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
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 pointer-events-none">
      <div
        className="
          pointer-events-auto w-full max-w-2xl rounded-2xl
          bg-black/90 text-white border border-white/10
          shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur
          px-4 py-4 sm:px-6 sm:py-5
          flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between
        "
      >
        <div className="text-xs sm:text-sm leading-relaxed">
          <div className="font-semibold mb-1 text-sm sm:text-base">
            Zgoda na pliki cookie
          </div>
          <p className="text-white/80">
            Używamy plików cookie, aby strona działała poprawnie i lepiej
            dopasowywała treści. Zobacz{" "}
            <a
              href="/polityka-prywatnosci"
              className="font-medium text-red-400 hover:text-red-300 underline-offset-2 hover:underline"
            >
              Politykę prywatności
            </a>{" "}
            oraz{" "}
            <a
              href="/regulamin"
              className="font-medium text-red-400 hover:text-red-300 underline-offset-2 hover:underline"
            >
              Regulamin
            </a>
            .
          </p>
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button
            onClick={() =>
              save({ necessary: true, analytics: false, marketing: false })
            }
            className="
              rounded-full border border-white/25
              bg-transparent/10 px-3 py-1.5
              text-[11px] sm:text-xs font-medium
              hover:bg-white/10 hover:border-white/40
              transition-colors
            "
          >
            Odrzuć zbędne
          </button>

          <button
            onClick={() =>
              save({ necessary: true, analytics: true, marketing: false })
            }
            className="
              rounded-full border border-white/20
              bg-white/5 px-3 py-1.5
              text-[11px] sm:text-xs font-medium
              hover:bg-white/15
              transition-colors
            "
          >
            Tylko statystyka
          </button>

          <button
            onClick={() =>
              save({ necessary: true, analytics: true, marketing: true })
            }
            className="
              rounded-full px-4 py-1.5
              text-[11px] sm:text-xs font-semibold
              bg-red-600 hover:bg-red-500
              text-white shadow-lg shadow-red-900/40
              transition-colors
            "
          >
            Akceptuj wszystkie
          </button>
        </div>
      </div>
    </div>
  );
}
