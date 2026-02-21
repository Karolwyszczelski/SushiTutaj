// src/components/mobile/MobileDesktopSwitch.tsx
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const MobileAppShell = dynamic(() => import("./MobileAppShell"), {
  ssr: false,
});

interface MobileDesktopSwitchProps {
  /** Dzieci do renderowania na desktopie */
  children: React.ReactNode;
}

/**
 * Komponent przełączający między widokiem mobile (MobileAppShell) a desktop (children).
 * Na mobile renderuje app-like shell, na desktop zwykłą stronę.
 */
export default function MobileDesktopSwitch({ children }: MobileDesktopSwitchProps) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      // Używamy tego samego breakpointa co Tailwind md: (768px)
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();

    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Podczas SSR i pierwszego renderowania nie wiemy jeszcze
  // Renderujemy dzieci (desktop), bo to jest domyślne zachowanie
  if (isMobile === null) {
    return <>{children}</>;
  }

  // Mobile: renderuj MobileAppShell
  if (isMobile) {
    return <MobileAppShell />;
  }

  // Desktop: renderuj normalną stronę
  return <>{children}</>;
}
