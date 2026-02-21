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
      {/* ============ MOBILE - Bottom Sheet (jak koszyk) ============ */}
      <div className="md:hidden fixed inset-0 z-[100]">
        {/* Backdrop */}
        <div
          className={`
            absolute inset-0 bg-black/70
            transition-opacity duration-200 ease-out
            ${isVisible && !isClosing ? "opacity-100" : "opacity-0"}
          `}
          aria-hidden
        />

        {/* Sheet - identyczny styl jak MobileBottomSheet */}
        <div
          className={`
            absolute inset-x-0 bottom-0
            bg-[#0b0b0b] rounded-t-[20px]
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
          {/* Handle - jak w koszyku */}
          <div className="flex justify-center pt-3 pb-4">
            <div className="w-10 h-1 bg-white/20 rounded-full" />
          </div>

          {/* Content */}
          <div className="px-4 pb-4">
            {/* Info card - jak produkty w koszyku */}
            <div className="bg-white/5 rounded-xl p-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  <Cookie className="w-5 h-5 text-white/80" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-white mb-1">
                    Ta strona używa cookies
                  </h2>
                  <p className="text-sm text-white/60 leading-relaxed">
                    Używamy plików cookie, aby strona działała poprawnie i lepiej dopasowywała treści.
                  </p>
                </div>
              </div>
            </div>

            {/* Cookie types - compact list */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-white">Niezbędne</span>
                </div>
                <span className="text-xs text-green-400">Zawsze włączone</span>
              </div>
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-white/40" />
                  <span className="text-sm text-white/60">Analityczne</span>
                </div>
                <span className="text-xs text-white/40">Opcjonalne</span>
              </div>
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-white/40" />
                  <span className="text-sm text-white/60">Marketingowe</span>
                </div>
                <span className="text-xs text-white/40">Opcjonalne</span>
              </div>
            </div>

            {/* Links */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <a
                href="/polityka-prywatnosci"
                className="text-xs text-white/40 underline underline-offset-2"
              >
                Polityka prywatności
              </a>
              <a
                href="/regulamin"
                className="text-xs text-white/40 underline underline-offset-2"
              >
                Regulamin
              </a>
            </div>
          </div>

          {/* Footer - identyczny jak w koszyku */}
          <div 
            className="border-t border-white/10 p-4 bg-[#0b0b0b] shrink-0"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
          >
            {/* Main button - gradient jak "Przejdź do zamówienia" */}
            <button
              onClick={() => save({ necessary: true, analytics: true, marketing: true })}
              className="w-full py-4 rounded-full text-white text-base font-semibold [background:linear-gradient(180deg,#b31217_0%,#7a0b0b_100%)] shadow-lg active:scale-[0.98] transition-transform mb-3"
            >
              Akceptuj wszystkie
            </button>

            {/* Secondary buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => save({ necessary: true, analytics: true, marketing: false })}
                className="flex-1 py-3 rounded-full bg-white/10 text-white text-sm font-medium active:bg-white/15 transition-colors"
              >
                Tylko analityka
              </button>
              <button
                onClick={() => save({ necessary: true, analytics: false, marketing: false })}
                className="flex-1 py-3 rounded-full bg-white/5 text-white/70 text-sm font-medium active:bg-white/10 transition-colors"
              >
                Niezbędne
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
