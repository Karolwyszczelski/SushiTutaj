"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ResetPasswordRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Po wejściu z maila przekierowujemy na stronę główną z flagą,
    // która otworzy popup.
    router.replace("/?auth=password-reset");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f5f5f5] px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-6 text-center text-sm text-gray-600">
        Otwieram formularz resetu hasła...
      </div>
    </main>
  );
}
