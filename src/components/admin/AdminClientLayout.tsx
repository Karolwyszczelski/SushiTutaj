// src/components/admin/AdminClientLayout.tsx
"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/admin/sidebar";
import NotificationBell from "@/components/admin/NotificationBell";
import PushServiceWorkerManager from "@/components/admin/PushServiceWorkerManager";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// ──────────────────────────────────────────────
// Fallback widoczny podczas ładowania
// ──────────────────────────────────────────────
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
      Ładowanie panelu administracyjnego…
    </div>
  );
}

// ──────────────────────────────────────────────
// Auth Guard – klient sprawdza sesję Supabase.
// Jeśli nie ma sesji → redirect do /admin/login
// Strona /admin/login jest pomijana (bez tego byłby loop).
// ──────────────────────────────────────────────
function AuthGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ok" | "redirect">("checking");

  useEffect(() => {
    // Na stronie logowania nie blokujemy renderowania
    if (pathname === "/admin/login") {
      setState("ok");
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowser();

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        setState("ok");
      } else {
        // Brak sesji → przekieruj na login z "return" URL
        router.replace(`/admin/login?r=${encodeURIComponent(pathname)}` as "/admin/login");
        setState("redirect");
      }
    });

    return () => { cancelled = true; };
  }, [pathname, router]);

  if (state === "checking") return <LoadingFallback />;
  if (state === "redirect") return <LoadingFallback />;

  return <>{children}</>;
}

// ──────────────────────────────────────────────
// Shell admina – Sidebar + header + content
// ──────────────────────────────────────────────
function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Service Worker Manager – utrzymuje SW aktywny */}
      <PushServiceWorkerManager />

      {/* Sidebar (ma useSearchParams wewnątrz Suspense) */}
      <aside className="flex-none">
        <Sidebar />
      </aside>

      {/* Główna treść */}
      <main className="flex-1 overflow-y-auto">
        {/* Sticky header z dzwonkiem – na wszystkich stronach admina Z WYJĄTKIEM /admin/login */}
        {!isLogin && (
          <header className="sticky top-0 z-20 flex items-center justify-end gap-4 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur">
            <NotificationBell />
          </header>
        )}

        <div className={isLogin ? "" : "p-6"}>{children}</div>
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────
// Publiczny eksport – AuthGuard → Suspense → AdminShell
// ──────────────────────────────────────────────
export default function AdminClientLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <Suspense fallback={<LoadingFallback />}>
        <AdminShell>{children}</AdminShell>
      </Suspense>
    </AuthGuard>
  );
}
