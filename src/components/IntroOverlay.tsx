"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  minMs?: number;
  fadeMs?: number;
  /** jeśli ustawisz, intro pokaże się 1x na sesję (sessionStorage) */
  storageKey?: string;
  allowSkip?: boolean;
};

export default function IntroOverlay({
  minMs = 2400,
  fadeMs = 600,
  storageKey,
  allowSkip = true,
}: Props) {
  const [open, setOpen] = useState(true);
  const [fading, setFading] = useState(false);
  const [rollPhase, setRollPhase] = useState<"rolling" | "stopped" | "reveal">("rolling");

  const timers = useRef<number[]>([]);

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
    if (bypassIntro) {
      unlockScroll();
      setOpen(false);
      return;
    }

    if (storageKey) {
      try {
        if (sessionStorage.getItem(storageKey) === "1") {
          setOpen(false);
          return;
        }
      } catch {}
    }

    lockScroll();

    // Fazy animacji:
    // 1. Rolka toczy się przez ekran (0-800ms)
    // 2. Rolka zatrzymuje się na środku (800ms)
    // 3. Napis pojawia się za rolką (800-1600ms)
    // 4. Pełna ekspozycja (1600-2400ms)
    // 5. Fade out

    timers.current.push(
      window.setTimeout(() => {
        setRollPhase("stopped");
      }, 800)
    );

    timers.current.push(
      window.setTimeout(() => {
        setRollPhase("reveal");
      }, 1000)
    );

    timers.current.push(
      window.setTimeout(() => {
        setFading(true);
      }, Math.max(0, minMs))
    );

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
    ["--fadeMs" as any]: `${Math.max(120, fadeMs)}ms`,
  } as React.CSSProperties;

  return (
    <div
      className={`fixed inset-0 z-[99999] flex items-center justify-center bg-[#0a0a0a] text-white overflow-hidden ${
        fading ? "intro-fade" : ""
      }`}
      style={cssVars}
      onClick={onSkip}
      role="presentation"
    >
      {/* Tło z subtelnymi świeceniami */}
      <div className="absolute inset-0 intro-ambient" />
      
      {/* Ślad za rolką sushi */}
      <div className={`sushi-trail ${rollPhase !== "rolling" ? "trail-visible" : ""}`} />

      {/* Główny kontener animacji */}
      <div className="relative flex flex-col items-center justify-center w-full max-w-full px-4 sm:px-0">
        
        {/* Tocząca się rolka sushi */}
        <div className={`sushi-roll-container ${rollPhase === "rolling" ? "rolling" : rollPhase === "stopped" ? "stopped" : "reveal"}`}>
          <div className="sushi-roll">
            {/* Zewnętrzna warstwa - nori */}
            <div className="sushi-outer">
              {/* Wewnętrzna warstwa - ryż */}
              <div className="sushi-inner">
                {/* Środek - filling */}
                <div className="sushi-center">
                  <div className="sushi-salmon" />
                  <div className="sushi-avocado" />
                  <div className="sushi-cucumber" />
                </div>
              </div>
              {/* Tekstura nori */}
              <div className="nori-texture" />
            </div>
          </div>
          {/* Cień pod rolką */}
          <div className="sushi-shadow" />
        </div>

        {/* Napis pojawiający się za rolką */}
        <div className={`intro-text-container ${rollPhase === "reveal" ? "text-visible" : ""}`}>
          <div className="intro-main-text">
            <span className="text-char" style={{ animationDelay: "0ms" }}>S</span>
            <span className="text-char" style={{ animationDelay: "50ms" }}>U</span>
            <span className="text-char" style={{ animationDelay: "100ms" }}>S</span>
            <span className="text-char" style={{ animationDelay: "150ms" }}>H</span>
            <span className="text-char" style={{ animationDelay: "200ms" }}>I</span>
            <span className="text-char-space" />
            <span className="text-char text-accent" style={{ animationDelay: "300ms" }}>T</span>
            <span className="text-char text-accent" style={{ animationDelay: "350ms" }}>U</span>
            <span className="text-char text-accent" style={{ animationDelay: "400ms" }}>T</span>
            <span className="text-char text-accent" style={{ animationDelay: "450ms" }}>A</span>
            <span className="text-char text-accent" style={{ animationDelay: "500ms" }}>J</span>
          </div>
          
          <div className="intro-tagline">
            <span>Smak perfekcji w każdym kęsie</span>
          </div>

          <div className="intro-chopsticks">
            <div className="chopstick chopstick-left" />
            <div className="chopstick chopstick-right" />
          </div>
        </div>
      </div>

      {/* Dekoracyjne elementy */}
      <div className="intro-particles">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`particle particle-${i}`} />
        ))}
      </div>

      <style>{`
        .intro-fade {
          animation: introFade var(--fadeMs) ease forwards;
        }
        @keyframes introFade { to { opacity: 0; pointer-events: none; } }

        .intro-ambient {
          background: 
            radial-gradient(ellipse 100% 60% at 50% 40%, rgba(222, 29, 19, 0.15), transparent 50%),
            radial-gradient(ellipse 80% 50% at 30% 80%, rgba(76, 175, 80, 0.08), transparent 40%),
            radial-gradient(ellipse 60% 40% at 80% 20%, rgba(255, 152, 0, 0.08), transparent 40%);
        }

        /* Ślad za rolką */
        .sushi-trail {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 0;
          height: 4px;
          background: linear-gradient(90deg, transparent, rgba(222, 29, 19, 0.6), rgba(222, 29, 19, 0.8));
          border-radius: 2px;
          opacity: 0;
          transition: all 0.4s ease;
        }
        .trail-visible {
          width: 200px;
          opacity: 0;
        }

        /* Kontener rolki sushi */
        .sushi-roll-container {
          position: relative;
          z-index: 10;
        }
        .sushi-roll-container.rolling {
          animation: rollIn 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
        .sushi-roll-container.stopped {
          animation: none;
          transform: translateX(0);
        }
        .sushi-roll-container.reveal {
          animation: floatUp 0.6s ease forwards;
        }

        @keyframes rollIn {
          0% {
            transform: translateX(-150px) rotate(-720deg);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            transform: translateX(0) rotate(0deg);
            opacity: 1;
          }
        }

        @media (min-width: 640px) {
          @keyframes rollIn {
            0% {
              transform: translateX(-300px) rotate(-720deg);
              opacity: 0;
            }
            20% {
              opacity: 1;
            }
            100% {
              transform: translateX(0) rotate(0deg);
              opacity: 1;
            }
          }
        }

        @keyframes floatUp {
          to {
            transform: translateY(-60px) scale(0.9);
          }
        }

        /* Rolka sushi - 3D wygląd */
        .sushi-roll {
          width: 80px;
          height: 80px;
          position: relative;
          animation: gentleSpin 0.8s linear;
        }
        
        @media (min-width: 640px) {
          .sushi-roll {
            width: 120px;
            height: 120px;
          }
        }
        
        .sushi-roll-container.stopped .sushi-roll,
        .sushi-roll-container.reveal .sushi-roll {
          animation: gentleBounce 2s ease-in-out infinite;
        }

        @keyframes gentleSpin {
          from { transform: rotate(-720deg); }
          to { transform: rotate(0deg); }
        }

        @keyframes gentleBounce {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(3deg); }
        }

        .sushi-outer {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: linear-gradient(145deg, #1a1a1a 0%, #0d0d0d 50%, #1a1a1a 100%);
          box-shadow: 
            inset 0 -4px 12px rgba(0,0,0,0.8),
            inset 0 4px 8px rgba(255,255,255,0.05),
            0 8px 32px rgba(0,0,0,0.6),
            0 0 60px rgba(222, 29, 19, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .nori-texture {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background-image: 
            repeating-linear-gradient(
              45deg,
              transparent 0px,
              transparent 2px,
              rgba(0,0,0,0.3) 2px,
              rgba(0,0,0,0.3) 3px
            );
          opacity: 0.5;
        }

        .sushi-inner {
          width: 85%;
          height: 85%;
          border-radius: 50%;
          background: linear-gradient(145deg, #f5f5f0 0%, #e8e8e0 50%, #f0f0e8 100%);
          box-shadow: 
            inset 0 -3px 8px rgba(0,0,0,0.15),
            inset 0 3px 6px rgba(255,255,255,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        /* Ziarenka ryżu */
        .sushi-inner::before {
          content: '';
          position: absolute;
          inset: 4px;
          border-radius: 50%;
          background-image: 
            radial-gradient(ellipse 3px 2px at 20% 30%, rgba(0,0,0,0.08) 50%, transparent 50%),
            radial-gradient(ellipse 3px 2px at 60% 25%, rgba(0,0,0,0.08) 50%, transparent 50%),
            radial-gradient(ellipse 3px 2px at 80% 50%, rgba(0,0,0,0.08) 50%, transparent 50%),
            radial-gradient(ellipse 3px 2px at 40% 70%, rgba(0,0,0,0.08) 50%, transparent 50%),
            radial-gradient(ellipse 3px 2px at 70% 75%, rgba(0,0,0,0.08) 50%, transparent 50%);
        }

        .sushi-center {
          width: 55%;
          height: 55%;
          border-radius: 50%;
          background: #2d2d2d;
          position: relative;
          overflow: hidden;
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.5);
        }

        .sushi-salmon {
          position: absolute;
          width: 50%;
          height: 100%;
          left: 0;
          background: linear-gradient(180deg, #ff6b4a 0%, #e55039 50%, #ff7b5a 100%);
          clip-path: polygon(50% 0%, 100% 0%, 100% 100%, 50% 100%, 0% 50%);
        }

        .sushi-avocado {
          position: absolute;
          width: 35%;
          height: 60%;
          right: 10%;
          top: 20%;
          background: linear-gradient(145deg, #7cb342 0%, #558b2f 50%, #8bc34a 100%);
          border-radius: 40%;
        }

        .sushi-cucumber {
          position: absolute;
          width: 20%;
          height: 40%;
          right: 25%;
          bottom: 10%;
          background: linear-gradient(145deg, #81c784 0%, #4caf50 100%);
          border-radius: 30%;
        }

        .sushi-shadow {
          position: absolute;
          bottom: -12px;
          left: 50%;
          transform: translateX(-50%);
          width: 70px;
          height: 15px;
          background: radial-gradient(ellipse, rgba(0,0,0,0.4) 0%, transparent 70%);
          border-radius: 50%;
        }
        
        @media (min-width: 640px) {
          .sushi-shadow {
            bottom: -15px;
            width: 100px;
            height: 20px;
          }
        }

        /* Tekst */
        .intro-text-container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          opacity: 0;
          pointer-events: none;
          z-index: 5;
        }
        .intro-text-container.text-visible {
          animation: textReveal 0.6s ease forwards 0.2s;
        }

        @keyframes textReveal {
          to {
            opacity: 1;
            transform: translate(-50%, 30px);
          }
        }

        .intro-main-text {
          font-size: clamp(1.8rem, 8vw, 3rem);
          font-weight: 800;
          letter-spacing: 0.08em;
          white-space: nowrap;
          display: flex;
          justify-content: center;
          gap: 2px;
          padding: 0 1rem;
        }

        @media (min-width: 640px) {
          .intro-main-text {
            font-size: 4rem;
            letter-spacing: 0.2em;
            padding: 0;
          }
        }

        .text-char {
          display: inline-block;
          opacity: 0;
          transform: translateY(30px) rotateX(-90deg);
          color: #ffffff;
          text-shadow: 0 2px 20px rgba(255,255,255,0.3);
        }
        .text-visible .text-char {
          animation: charReveal 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }

        .text-char-space {
          width: 0.3em;
        }
        
        @media (min-width: 640px) {
          .text-char-space {
            width: 0.5em;
          }
        }

        .text-accent {
          color: #de1d13;
          text-shadow: 0 2px 30px rgba(222, 29, 19, 0.6);
        }

        @keyframes charReveal {
          to {
            opacity: 1;
            transform: translateY(0) rotateX(0deg);
          }
        }

        .intro-tagline {
          margin-top: 1rem;
          font-size: 0.7rem;
          font-weight: 400;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.6);
          opacity: 0;
          padding: 0 1rem;
          text-align: center;
        }
        .text-visible .intro-tagline {
          animation: taglineIn 0.6s ease forwards 0.7s;
        }

        @media (min-width: 640px) {
          .intro-tagline {
            font-size: 1rem;
            letter-spacing: 0.3em;
            padding: 0;
          }
        }

        @keyframes taglineIn {
          to {
            opacity: 1;
          }
        }

        /* Pałeczki dekoracyjne */
        .intro-chopsticks {
          position: absolute;
          bottom: -40px;
          left: 50%;
          transform: translateX(-50%);
          width: 120px;
          height: 40px;
          opacity: 0;
        }
        .text-visible .intro-chopsticks {
          animation: chopsticksIn 0.5s ease forwards 0.9s;
        }

        @keyframes chopsticksIn {
          to { opacity: 1; }
        }

        .chopstick {
          position: absolute;
          width: 100px;
          height: 4px;
          background: linear-gradient(90deg, #8B4513 0%, #D2691E 50%, #8B4513 100%);
          border-radius: 2px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .chopstick-left {
          left: 0;
          transform: rotate(-15deg);
          transform-origin: right center;
        }
        .chopstick-right {
          right: 0;
          transform: rotate(15deg);
          transform-origin: left center;
        }

        /* Cząsteczki dekoracyjne */
        .intro-particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .particle {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          opacity: 0;
        }

        .particle-0 {
          background: rgba(222, 29, 19, 0.6);
          top: 20%;
          left: 15%;
          animation: particleFloat 3s ease-in-out infinite 0.5s;
        }
        .particle-1 {
          background: rgba(76, 175, 80, 0.5);
          top: 30%;
          right: 20%;
          animation: particleFloat 3.5s ease-in-out infinite 0.8s;
        }
        .particle-2 {
          background: rgba(255, 152, 0, 0.5);
          bottom: 25%;
          left: 25%;
          animation: particleFloat 2.8s ease-in-out infinite 1s;
        }
        .particle-3 {
          background: rgba(255, 255, 255, 0.3);
          top: 40%;
          left: 10%;
          animation: particleFloat 3.2s ease-in-out infinite 0.3s;
        }
        .particle-4 {
          background: rgba(222, 29, 19, 0.4);
          bottom: 35%;
          right: 15%;
          animation: particleFloat 3s ease-in-out infinite 1.2s;
        }
        .particle-5 {
          background: rgba(139, 195, 74, 0.5);
          top: 60%;
          right: 30%;
          animation: particleFloat 2.5s ease-in-out infinite 0.6s;
        }

        @keyframes particleFloat {
          0%, 100% {
            opacity: 0;
            transform: translateY(0) scale(0.5);
          }
          50% {
            opacity: 0.8;
            transform: translateY(-20px) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sushi-roll-container,
          .sushi-roll,
          .text-char,
          .intro-tagline,
          .intro-chopsticks,
          .particle,
          .intro-fade {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
          .intro-text-container {
            opacity: 1 !important;
            transform: translate(-50%, 30px) !important;
          }
        }
      `}</style>
    </div>
  );
}
