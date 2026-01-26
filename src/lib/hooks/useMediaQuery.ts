// src/lib/hooks/useMediaQuery.ts
import { useState, useEffect } from "react";

/**
 * Prosty hook do sprawdzania media query po stronie klienta.
 * @param query np. "(max-width: 1024px)"
 */
export default function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    // nowoczesne API
    if (mql.addEventListener) {
      mql.addEventListener("change", handler);
    } else {
      // fallback dla starszych przeglądarek
      // @ts-ignore
      mql.addListener(handler);
    }

    // synchronizacja initial
    setMatches(mql.matches);

    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener("change", handler);
      } else {
        // @ts-ignore
        mql.removeListener(handler);
      }
    };
  }, [query]);

  return matches;
}
