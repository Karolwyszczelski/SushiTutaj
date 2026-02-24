// src/components/legal/CookieBanner.tsx
"use client";
import { useEffect, useState, useCallback } from "react";

const KEY = "cookie_consent_v1";

type Consent = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export default function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [consent, setConsent] = useState<Consent>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        setOpen(true);
        setTimeout(() => setIsVisible(true), 50);
      }
    } catch {
      setOpen(true);
      setTimeout(() => setIsVisible(true), 50);
    }
  }, []);

  /* lock body scroll on mobile */
  useEffect(() => {
    if (open && typeof window !== "undefined" && window.innerWidth < 768) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const save = useCallback((c: Consent) => {
    setIsClosing(true);
    setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(c));
        if (c.analytics) {
          // GA / Tag Manager injection placeholder
        }
      } catch {}
      setOpen(false);
      setIsVisible(false);
      setIsClosing(false);
      document.body.style.overflow = "";
    }, 300);
  }, []);

  if (!open) return null;

  return (
    <>
      {/* ═══ MOBILE — dark bottom-sheet ═══ */}
      <div className="md:hidden fixed inset-0 z-[100]">
        {/* backdrop */}
        <div
          className={`absolute inset-0 bg-black/70 transition-opacity duration-200 ease-out ${
            isVisible && !isClosing ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden
        />

        {/* sheet */}
        <div
          className="absolute inset-x-0 bottom-0 bg-[#0b0b0b] rounded-t-[20px] flex flex-col transform-gpu transition-transform duration-200 ease-out"
          style={{
            transform:
              isVisible && !isClosing ? "translateY(0)" : "translateY(100%)",
            willChange: "transform",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Zgoda na pliki cookie"
        >
          {/* handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-white/20 rounded-full" />
          </div>

          <div className="px-5 pb-3">
            {/* header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#c41e1e] to-[#8a1414] flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="8" cy="9" r="1" fill="currentColor" stroke="none" />
                  <circle cx="15" cy="8" r="1" fill="currentColor" stroke="none" />
                  <circle cx="10" cy="14" r="1" fill="currentColor" stroke="none" />
                  <circle cx="16" cy="13" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-white">
                  Szanujemy Twoją prywatność
                </h2>
                <p className="text-[12px] text-white/45 leading-snug mt-0.5">
                  Wybierz, na co wyrażasz zgodę
                </p>
              </div>
            </div>

            {/* cookie toggles */}
            <div className="rounded-2xl border border-white/[0.08] overflow-hidden divide-y divide-white/[0.06]">
              {/* Necessary — always on */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-[13px] font-medium text-white">Niezbędne</span>
                    <p className="text-[11px] text-white/35">Zawsze włączone</p>
                  </div>
                </div>
                {/* locked toggle */}
                <div className="w-11 h-[26px] rounded-full bg-emerald-500 flex items-center px-0.5 opacity-60">
                  <div className="w-[22px] h-[22px] rounded-full bg-white shadow-sm ml-auto" />
                </div>
              </div>

              {/* Analytics */}
              <button
                type="button"
                onClick={() => setConsent((c) => ({ ...c, analytics: !c.analytics }))}
                className="flex items-center justify-between px-4 py-3.5 w-full active:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <span className="text-[13px] font-medium text-white">Analityczne</span>
                    <p className="text-[11px] text-white/35">Statystyki odwiedzin</p>
                  </div>
                </div>
                <div className={`w-11 h-[26px] rounded-full flex items-center px-0.5 transition-colors duration-200 ${consent.analytics ? 'bg-[#c41e1e]' : 'bg-white/[0.1]'}`}>
                  <div className={`w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-transform duration-200 ${consent.analytics ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </div>
              </button>

              {/* Marketing */}
              <button
                type="button"
                onClick={() => setConsent((c) => ({ ...c, marketing: !c.marketing }))}
                className="flex items-center justify-between px-4 py-3.5 w-full active:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <span className="text-[13px] font-medium text-white">Marketingowe</span>
                    <p className="text-[11px] text-white/35">Reklamy i remarketing</p>
                  </div>
                </div>
                <div className={`w-11 h-[26px] rounded-full flex items-center px-0.5 transition-colors duration-200 ${consent.marketing ? 'bg-[#c41e1e]' : 'bg-white/[0.1]'}`}>
                  <div className={`w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-transform duration-200 ${consent.marketing ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </div>
              </button>
            </div>

            {/* links */}
            <div className="flex items-center justify-center gap-4 mt-3">
              <a href="/polityka-prywatnosci" className="text-[11px] text-white/30 underline underline-offset-2">
                Polityka prywatności
              </a>
              <a href="/cookies" className="text-[11px] text-white/30 underline underline-offset-2">
                Polityka cookies
              </a>
            </div>
          </div>

          {/* footer buttons */}
          <div
            className="border-t border-white/[0.06] px-5 pt-4 bg-[#0b0b0b] shrink-0"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
          >
            <button
              onClick={() =>
                save({ necessary: true, analytics: true, marketing: true })
              }
              className="w-full py-3.5 rounded-full text-white text-[15px] font-semibold bg-gradient-to-b from-[#c41e1e] to-[#8a1414] shadow-[0_4px_20px_rgba(196,30,30,0.35)] active:scale-[0.97] transition-transform mb-2.5"
            >
              Akceptuj wszystkie
            </button>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  save({ necessary: true, analytics: false, marketing: false })
                }
                className="flex-1 py-3 rounded-full bg-white/[0.06] text-white/60 text-[13px] font-medium active:bg-white/[0.1] transition-colors"
              >
                Tylko niezbędne
              </button>
              <button
                onClick={() => save(consent)}
                className="flex-1 py-3 rounded-full bg-white/[0.1] text-white text-[13px] font-medium active:bg-white/[0.15] transition-colors"
              >
                Zapisz wybór
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ DESKTOP — floating card ═══ */}
      <div
        className={`hidden md:flex fixed inset-x-0 bottom-0 z-50 justify-center px-4 pb-4 pointer-events-none transition-all duration-500 ease-out ${
          isVisible && !isClosing
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-8"
        }`}
      >
        <div className="pointer-events-auto w-full max-w-2xl rounded-2xl bg-black/90 text-white border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur px-6 py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm leading-relaxed">
            <div className="flex items-center gap-2 font-semibold mb-1 text-base">
              🍪 Zgoda na pliki cookie
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
              onClick={() =>
                save({ necessary: true, analytics: false, marketing: false })
              }
              className="rounded-full border border-white/25 bg-transparent px-4 py-2 text-xs font-medium hover:bg-white/10 hover:border-white/40 transition-colors"
            >
              Odrzuć zbędne
            </button>
            <button
              onClick={() =>
                save({ necessary: true, analytics: true, marketing: true })
              }
              className="rounded-full px-5 py-2 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/40 transition-colors"
            >
              Akceptuj wszystkie
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
