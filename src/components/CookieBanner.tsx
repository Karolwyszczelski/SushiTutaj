"use client";
import { useEffect, useState, useCallback } from "react";
import { Cookie, Shield, BarChart3, Megaphone } from "lucide-react";

const KEY = "cookie-consent-v1";

export default function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(KEY);
    if (!v) {
      setOpen(true);
      // Animacja wejścia
      setTimeout(() => setIsVisible(true), 50);
    }
  }, []);

  // Zablokuj scroll body gdy banner jest otwarty na mobile
  useEffect(() => {
    if (open && typeof window !== "undefined") {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        document.body.style.overflow = "hidden";
      }
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const save = useCallback((prefs: { necessary: boolean; analytics: boolean; marketing: boolean }) => {
    setIsClosing(true);
    setTimeout(() => {
      localStorage.setItem(KEY, JSON.stringify(prefs));
      setOpen(false);
      setIsVisible(false);
      setIsClosing(false);
      document.body.style.overflow = "";
    }, 300);
    // tutaj odpalasz skrypty analytics/ads TYLKO jeśli prefs.analytics/marketing === true
  }, []);

  if (!open) return null;

  return (
    <>
      {/* ============ MOBILE - Bottom Sheet Style ============ */}
      <div className="md:hidden fixed inset-0 z-[60]">
        {/* Backdrop */}
        <div
          className={`
            absolute inset-0 bg-black/70 backdrop-blur-sm
            transition-opacity duration-300 ease-out
            ${isVisible && !isClosing ? "opacity-100" : "opacity-0"}
          `}
          aria-hidden
        />

        {/* Sheet */}
        <div
          className={`
            absolute inset-x-0 bottom-0
            bg-[#0b0b0b] rounded-t-3xl
            shadow-[0_-10px_50px_rgba(0,0,0,0.5)]
            flex flex-col
            transform-gpu transition-transform duration-300 ease-out
          `}
          style={{
            transform: isVisible && !isClosing 
              ? "translateY(0)" 
              : "translateY(100%)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Zgoda na pliki cookie"
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-white/30 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-900/30">
              <Cookie className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Zgoda na cookies</h2>
              <p className="text-xs text-white/50">Dostosuj swoje preferencje</p>
            </div>
          </div>

          {/* Content */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-sm text-white/70 leading-relaxed">
              Używamy plików cookie, aby strona działała poprawnie i lepiej dopasowywała treści do Twoich potrzeb.
            </p>

            {/* Cookie Categories */}
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Niezbędne</p>
                  <p className="text-xs text-white/50">Zawsze aktywne</p>
                </div>
                <div className="w-10 h-6 rounded-full bg-green-500 flex items-center justify-end px-1">
                  <div className="w-4 h-4 rounded-full bg-white shadow" />
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Statystyka</p>
                  <p className="text-xs text-white/50">Analiza ruchu</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Marketing</p>
                  <p className="text-xs text-white/50">Reklamy i treści</p>
                </div>
              </div>
            </div>

            {/* Links */}
            <div className="flex items-center justify-center gap-4 pt-2">
              <a
                href="/polityka-prywatnosci"
                className="text-xs text-red-400 hover:text-red-300 underline-offset-2 hover:underline"
              >
                Polityka prywatności
              </a>
              <span className="text-white/20">•</span>
              <a
                href="/regulamin"
                className="text-xs text-red-400 hover:text-red-300 underline-offset-2 hover:underline"
              >
                Regulamin
              </a>
            </div>
          </div>

          {/* Actions */}
          <div 
            className="px-5 pt-3 pb-4 border-t border-white/10 space-y-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 16px)" }}
          >
            <button
              onClick={() => save({ necessary: true, analytics: true, marketing: true })}
              className="
                w-full py-3.5 rounded-2xl
                bg-gradient-to-r from-red-600 to-red-500
                text-white font-semibold text-sm
                shadow-lg shadow-red-900/40
                active:scale-[0.98] transition-transform
              "
            >
              Akceptuj wszystkie
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => save({ necessary: true, analytics: true, marketing: false })}
                className="
                  flex-1 py-3 rounded-2xl
                  bg-white/10 border border-white/10
                  text-white font-medium text-sm
                  active:bg-white/15 transition-colors
                "
              >
                Tylko statystyka
              </button>

              <button
                onClick={() => save({ necessary: true, analytics: false, marketing: false })}
                className="
                  flex-1 py-3 rounded-2xl
                  bg-white/5 border border-white/10
                  text-white/70 font-medium text-sm
                  active:bg-white/10 transition-colors
                "
              >
                Tylko niezbędne
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============ DESKTOP - Floating Banner Style ============ */}
      <div 
        className={`
          hidden md:flex fixed inset-x-0 bottom-0 z-50 
          justify-center px-4 pb-4 pointer-events-none
          transition-all duration-500 ease-out
          ${isVisible && !isClosing ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
        `}
      >
        <div
          className="
            pointer-events-auto w-full max-w-2xl rounded-2xl
            bg-black/90 text-white border border-white/10
            shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur
            px-6 py-5
            flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between
          "
        >
          <div className="text-sm leading-relaxed">
            <div className="flex items-center gap-2 font-semibold mb-1 text-base">
              <Cookie className="w-5 h-5 text-red-400" />
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

          <div className="flex flex-wrap gap-2 sm:justify-end shrink-0">
            <button
              onClick={() => save({ necessary: true, analytics: false, marketing: false })}
              className="
                rounded-full border border-white/25
                bg-transparent px-4 py-2
                text-xs font-medium
                hover:bg-white/10 hover:border-white/40
                transition-colors
              "
            >
              Odrzuć zbędne
            </button>

            <button
              onClick={() => save({ necessary: true, analytics: true, marketing: false })}
              className="
                rounded-full border border-white/20
                bg-white/5 px-4 py-2
                text-xs font-medium
                hover:bg-white/15
                transition-colors
              "
            >
              Tylko statystyka
            </button>

            <button
              onClick={() => save({ necessary: true, analytics: true, marketing: true })}
              className="
                rounded-full px-5 py-2
                text-xs font-semibold
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
    </>
  );
}
