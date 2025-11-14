"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "cookie_consent_v1"; // podbijesz przy zmianach

type Consent = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export default function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState<Consent>({ necessary: true, analytics: false, marketing: false });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) setOpen(true);
      else setOpen(false);
    } catch { setOpen(true); }
  }, []);

  const save = (c: Consent) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(c));
      // PRZYKŁAD: iniekcja skryptów dopiero po zgodzie
      if (c.analytics) {
        // tutaj np. GA/Tag Manager (jeśli używasz)
        // const s = document.createElement("script");
        // s.src = "…";
        // document.head.appendChild(s);
      }
    } catch {}
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50">
      <div className="mx-auto max-w-4xl m-3 rounded-lg border bg-white p-4 shadow-lg">
        <p className="text-sm">
          Używamy plików cookie niezbędnych do działania strony oraz – za Twoją zgodą – analitycznych i marketingowych.
          Szczegóły w{" "}
          <Link href="/legal/cookies" className="underline">Polityce cookies</Link>{" "}
          i{" "}
          <Link href="/legal/polityka-prywatnosci" className="underline">Polityce prywatności</Link>.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3 items-center">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked disabled />
            Niezbędne (zawsze włączone)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent.analytics}
              onChange={(e) => setConsent((c) => ({ ...c, analytics: e.target.checked }))}
            />
            Analityczne
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent.marketing}
              onChange={(e) => setConsent((c) => ({ ...c, marketing: e.target.checked }))}
            />
            Marketingowe
          </label>
        </div>

        <div className="mt-3 flex gap-2 justify-end">
          <button
            onClick={() => save({ necessary: true, analytics: false, marketing: false })}
            className="px-3 py-2 rounded border"
          >
            Odrzuć zbędne
          </button>
          <button
            onClick={() => save({ necessary: true, analytics: true, marketing: true })}
            className="px-3 py-2 rounded bg-black text-white"
          >
            Akceptuję wszystko
          </button>
          <button
            onClick={() => save(consent)}
            className="px-3 py-2 rounded bg-yellow-400"
          >
            Zapisz wybór
          </button>
        </div>
      </div>
    </div>
  );
}
