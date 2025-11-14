// src/components/TurnstileWidget.tsx
"use client";
import { useEffect, useRef, useState } from "react";

declare global { interface Window { turnstile?: any } }

type Props = {
  siteKey: string;
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  theme?: "auto" | "light" | "dark";
};

export default function TurnstileWidget({
  siteKey,
  onSuccess,
  onExpire,
  theme = "auto",
}: Props) {
  const host = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  // załaduj skrypt tylko raz
  useEffect(() => {
    if (window.turnstile) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = host;
    s.async = true;
    s.defer = true;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);

  // wyrenderuj widget raz
  useEffect(() => {
    if (!ready || !containerRef.current || widgetId.current) return;
    widgetId.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => onSuccess(token),
      "expired-callback": () => onExpire?.(),
      "error-callback": () => onExpire?.(),
      appearance: "interaction-only", // nie znika po odświeżeniu stanu
      action: "checkout",
      theme,
    });
  }, [ready, siteKey, onSuccess, onExpire, theme]);

  return <div ref={containerRef} className="h-[66px]" />;
}
