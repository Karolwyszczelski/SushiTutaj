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
      {/* ============ MOBILE - Minimalist Bottom Sheet ============ */}
      <div className="md:hidden fixed inset-0 z-[100]">
        {/* Backdrop */}
        <div
          className={`
            absolute inset-0 bg-black/80
            transition-opacity duration-200 ease-out
            ${isVisible && !isClosing ? "opacity-100" : "opacity-0"}
          `}
          aria-hidden
        />

        {/* Sheet */}
        <div
          className={`
            absolute inset-x-0 bottom-0
            bg-[#0a0a0a] rounded-t-[28px]
            flex flex-col
            transform-gpu transition-transform duration-200 ease-out
          `}
          style={{
            transform: isVisible && !isClosing 
              ? "translateY(0)" 
              : "translateY(100%)",
            willChange: "transform",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Zgoda na pliki cookie"
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-9 h-1 bg-white/20 rounded-full" />
          </div>

          {/* Header - Minimalist */}
          <div className="px-6 pt-2 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#a61b1b] flex items-center justify-center">
                <Cookie className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-[17px] font-semibold text-white tracking-tight">Cookies</h2>
                <p className="text-[13px] text-white/40">Twoje preferencje</p>
              </div>
            </div>
          </div>

          {/* Content - Clean */}
          <div className="px-6 pb-5">
            <p className="text-[14px] text-white/60 leading-relaxed mb-5">
              Używamy plików cookie dla poprawnego działania strony i lepszego dopasowania treści.
            </p>

            {/* Cookie Categories - Compact */}
            <div className="space-y-2.5 mb-5">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04]">
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span className="text-[14px] font-medium text-white">Niezbędne</span>
                </div>
                <span className="text-[12px] text-emerald-400/80 font-medium">Aktywne</span>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04]">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-4 h-4 text-white/40" />
                  <span className="text-[14px] text-white/70">Analityczne</span>
                </div>
                <span className="text-[12px] text-white/30">Opcjonalne</span>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04]">
                <div className="flex items-center gap-3">
                  <Megaphone className="w-4 h-4 text-white/40" />
                  <span className="text-[14px] text-white/70">Marketingowe</span>
                </div>
                <span className="text-[12px] text-white/30">Opcjonalne</span>
              </div>
            </div>

            {/* Links - Minimal */}
            <div className="flex items-center justify-center gap-3 mb-5">
              <a
                href="/polityka-prywatnosci"
                className="text-[12px] text-white/40 active:text-white/60"
              >
                Polityka prywatności
              </a>
              <span className="text-white/10">·</span>
              <a
                href="/regulamin"
                className="text-[12px] text-white/40 active:text-white/60"
              >
                Regulamin
              </a>
            </div>
          </div>

          {/* Actions - Professional */}
          <div 
            className="px-6 pt-4 border-t border-white/[0.06]"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 20px) + 20px)" }}
          >
            {/* Primary CTA */}
            <button
              onClick={() => save({ necessary: true, analytics: true, marketing: true })}
              className="
                w-full h-[52px] rounded-2xl mb-3
                bg-[#a61b1b] text-white
                font-semibold text-[15px]
                active:bg-[#8a1515] active:scale-[0.98]
                transition-all duration-150
              "
            >
              Akceptuj wszystkie
            </button>

            {/* Secondary options */}
            <div className="flex gap-2.5">
              <button
                onClick={() => save({ necessary: true, analytics: true, marketing: false })}
                className="
                  flex-1 h-[46px] rounded-xl
                  bg-white/[0.06] text-white/80
                  font-medium text-[14px]
                  active:bg-white/10 active:scale-[0.98]
                  transition-all duration-150
                "
              >
                + Analityka
              </button>

              <button
                onClick={() => save({ necessary: true, analytics: false, marketing: false })}
                className="
                  flex-1 h-[46px] rounded-xl
                  bg-white/[0.03] text-white/50
                  font-medium text-[14px]
                  active:bg-white/[0.06] active:scale-[0.98]
                  transition-all duration-150
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
