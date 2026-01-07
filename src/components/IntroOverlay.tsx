"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type Props = {
  cities?: string[];
  headline?: string;
  logoSrc?: string;

  minMs?: number;
  fadeMs?: number;

  /** jeśli ustawisz, intro pokaże się 1x na sesję (sessionStorage) */
  storageKey?: string;

  logoSize?: number;   // px (mobile)
  logoSizeSm?: number; // px (>= sm)

  allowSkip?: boolean;
};

export default function IntroOverlay({
  cities = [],
  headline = "Najlepsze sushi tylko w Sushi Tutaj!",
  logoSrc = "/assets/logos.png",
  minMs = 1800,
  fadeMs = 520,
  storageKey,
  logoSize = 84,
  logoSizeSm = 108,
  allowSkip = true,
}: Props) {
  // UWAGA: startujemy od razu jako "open", żeby było przed stroną (SSR + pierwszy paint)
  const [open, setOpen] = useState(true);
  const [fading, setFading] = useState(false);

  const timers = useRef<number[]>([]);

    // Jeśli jesteśmy w flow resetu hasła / recovery – NIE pokazuj intro (bo zasłania modal)
  const bypassIntro = useMemo(() => {
    if (typeof window === "undefined") return false;

    const sp = new URLSearchParams(window.location.search);
    const auth = (sp.get("auth") || "").toLowerCase();
    const type = (sp.get("type") || "").toLowerCase();
    const code = sp.get("code");
    const tokenHash = sp.get("token_hash");
    const hash = window.location.hash || "";

    return (
      auth === "password-reset" ||
      type === "recovery" ||
      !!code ||
      !!tokenHash ||
      hash.includes("access_token=") ||
      hash.includes("refresh_token=")
    );
  }, []);


  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const lockScroll = () => {
    try {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } catch {}
  };

  const unlockScroll = () => {
    try {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    } catch {}
  };

  const finish = () => {
    setFading(false);
    setOpen(false);
    unlockScroll();
    if (storageKey) {
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {}
    }
  };

  useEffect(() => {
    // bypass intro dla resetu hasła / recovery
    if (bypassIntro) {
      unlockScroll();
      setOpen(false);
      return;
    }
    // Po mount: jeśli już było pokazane w tej sesji -> zamknij od razu
    if (storageKey) {
      try {
        if (sessionStorage.getItem(storageKey) === "1") {
          setOpen(false);
          return;
        }
      } catch {}
    }

    lockScroll();

    // min czas -> fade
    timers.current.push(
      window.setTimeout(() => {
        setFading(true);
      }, Math.max(0, minMs))
    );

    // min + fade -> close
    timers.current.push(
      window.setTimeout(() => {
        finish();
      }, Math.max(0, minMs + fadeMs))
    );

    return () => {
      clearTimers();
      unlockScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, minMs, fadeMs, bypassIntro]);


  const onSkip = () => {
    if (!allowSkip) return;
    if (!open) return;

    clearTimers();
    setFading(true);

    timers.current.push(
      window.setTimeout(() => {
        finish();
      }, Math.max(0, fadeMs))
    );
  };

  if (!open) return null;

  const cssVars = {
    ["--logo" as any]: `${Math.max(32, logoSize)}px`,
    ["--logoSm" as any]: `${Math.max(40, logoSizeSm)}px`,
    ["--fadeMs" as any]: `${Math.max(120, fadeMs)}ms`,
  } as React.CSSProperties;

  return (
    <div
      className={`fixed inset-0 z-[99999] grid place-items-center bg-black text-white overflow-hidden ${
        fading ? "intro-fade" : ""
      }`}
      style={cssVars}
      onClick={onSkip}
      role="presentation"
    >
      <div className="absolute inset-0 opacity-60 intro-bg" />

      <div className="relative w-full max-w-lg px-6 text-center">
        <div className="intro-in intro-d0 mx-auto mb-5 flex items-center justify-center">
          <div className="relative intro-logo">
            <Image
              src={logoSrc}
              alt="SUSHI Tutaj"
              fill
              priority
              className="object-contain"
            />
          </div>
        </div>

        <div className="intro-in intro-d1 text-xl sm:text-2xl font-semibold tracking-tight">
          {headline}
        </div>

        {!!cities?.length && (
          <div className="intro-in intro-d2 mt-4 text-sm sm:text-base text-white/75">
            {cities.slice(0, 3).map((c, i) => (
              <span key={`${c}-${i}`} className={`intro-chip intro-d${3 + i}`}>
                {c}
              </span>
            ))}
          </div>
        )}

        <div className="intro-in intro-d6 mt-8 flex items-center justify-center gap-2 text-[11px] text-white/60">
          <span className="intro-dot" />
          <span>Ładowanie…</span>
        </div>
      </div>

      <style>{`
        .intro-fade {
          animation: introFade var(--fadeMs) ease forwards;
        }
        @keyframes introFade { to { opacity: 0; } }

        .intro-bg {
          background: radial-gradient(
              800px 400px at 50% 35%,
              rgba(222, 29, 19, 0.35),
              transparent 60%
            ),
            radial-gradient(
              900px 500px at 50% 70%,
              rgba(255, 255, 255, 0.08),
              transparent 60%
            );
        }

        .intro-logo {
          width: var(--logo);
          height: var(--logo);
        }
        @media (min-width: 640px) {
          .intro-logo {
            width: var(--logoSm);
            height: var(--logoSm);
          }
        }

        .intro-in {
          opacity: 0;
          transform: translateY(10px) scale(0.99);
          animation: introIn 520ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        .intro-d0 { animation-delay: 80ms; }
        .intro-d1 { animation-delay: 220ms; }
        .intro-d2 { animation-delay: 360ms; }
        .intro-d3 { animation-delay: 440ms; }
        .intro-d4 { animation-delay: 520ms; }
        .intro-d5 { animation-delay: 600ms; }
        .intro-d6 { animation-delay: 700ms; }

        .intro-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 10px;
          margin: 6px 6px 0 6px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(6px);
          font-weight: 600;
          letter-spacing: 0.2px;
        }

        .intro-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: rgba(222, 29, 19, 0.95);
          box-shadow: 0 0 0 0 rgba(222, 29, 19, 0.35);
          animation: pulse 900ms ease-in-out infinite;
        }

        @keyframes introIn {
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(222, 29, 19, 0.35); }
          70% { box-shadow: 0 0 0 10px rgba(222, 29, 19, 0); }
          100% { box-shadow: 0 0 0 0 rgba(222, 29, 19, 0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .intro-in,
          .intro-dot,
          .intro-fade {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
