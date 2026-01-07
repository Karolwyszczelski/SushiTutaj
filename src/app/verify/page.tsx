// src/app/verify/page.tsx

// START: imports
import type { Metadata } from "next";
import { Suspense } from "react";
import VerifyClient from "./Client";
// END: imports

export const metadata: Metadata = {
  title: "Weryfikacja",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

// START: Page wrapped with Suspense
function VerifyFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="rounded-lg bg-white/60 p-6 text-center">
        <h1 className="text-2xl font-bold mb-2">Weryfikacja</h1>
        <p>Ładuję…</p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyClient />
    </Suspense>
  );
}
// END: Page wrapped with Suspense
