"use client";

import { useEffect, useState } from "react";

export default function AuthToast() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const params = url.searchParams;

    if (params.get("auth") === "signup-success") {
      setOpen(true);

      // usuwamy parametr z URL, żeby po odświeżeniu popup nie wracał
      params.delete("auth");
      const newUrl =
        url.pathname + (params.toString() ? `?${params.toString()}` : "");
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 text-center">
        <h2 className="text-lg font-semibold mb-2">
          Twoje konto zostało utworzone
        </h2>
        <p className="text-sm text-black/70 mb-4">
          Możesz się teraz zalogować i składać zamówienia online.
        </p>
        <button
          onClick={() => setOpen(false)}
          className="inline-flex rounded-xl px-4 py-2 text-sm font-semibold bg-gradient-to-r from-[var(--accent-red-dark,#7a0d0d)] via-[var(--accent-red,#a61b1b)] to-[var(--accent-red-dark-2,#b11212)] text-white"
        >
          Zamknij
        </button>
      </div>
    </div>
  );
}
