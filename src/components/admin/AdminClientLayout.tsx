// src/components/admin/AdminClientLayout.tsx
"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Suspense, useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/admin/sidebar";
import NotificationBell from "@/components/admin/NotificationBell";
import PushServiceWorkerManager from "@/components/admin/PushServiceWorkerManager";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

// ──────────────────────────────────────────────
// Timeout na sprawdzenie sesji (ms)
// Na tablecie po uśpieniu sesja może długo się ładować
// ──────────────────────────────────────────────
const AUTH_CHECK_TIMEOUT = 8000;

// ──────────────────────────────────────────────
// Fallback widoczny podczas ładowania
// ──────────────────────────────────────────────
function LoadingFallback() {
  return (
    <div className="admin-shell min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
      Ładowanie panelu administracyjnego…
    </div>
  );
}

// ──────────────────────────────────────────────
// Error Boundary dla sekcji admina
// Łapie błędy renderowania i pokazuje sensowny UI
// zamiast czarnego/białego ekranu
// ──────────────────────────────────────────────
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AdminErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AdminErrorBoundary] Caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="admin-shell min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full rounded-2xl bg-white p-8 shadow-lg text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <svg className="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Coś poszło nie tak</h2>
            <p className="text-sm text-slate-500 mb-6">
              Wystąpił nieoczekiwany błąd w panelu administracyjnym.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Odśwież stronę
              </button>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                }}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Spróbuj ponownie
              </button>
            </div>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <pre className="mt-4 max-h-32 overflow-auto rounded bg-slate-100 p-3 text-left text-xs text-red-700">
                {this.state.error.message}\n{this.state.error.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ──────────────────────────────────────────────
// Auth Guard – klient sprawdza sesję Supabase.
// Jeśli nie ma sesji → redirect do /admin/login
// Strona /admin/login jest pomijana (bez tego byłby loop).
//
// POPRAWKI:
// - Dodany .catch() na getSession()
// - Timeout 8s → jeśli sesja nie odpowie, przekieruj na login
// - Retry z getUser() gdy getSession() zawiedzie
// ──────────────────────────────────────────────
function AuthGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ok" | "redirect" | "error">("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Na stronie logowania nie blokujemy renderowania
    if (pathname === "/admin/login") {
      setState("ok");
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowser();

    // TIMEOUT: Jeśli auth check nie odpowie w AUTH_CHECK_TIMEOUT ms,
    // przekieruj na login. Tablet po nocy/uśpieniu może nie mieć aktualnej sesji.
    timeoutRef.current = setTimeout(() => {
      if (cancelled) return;
      console.warn("[AuthGuard] Timeout – sesja nie odpowiedziała w", AUTH_CHECK_TIMEOUT, "ms");
      router.replace(`/admin/login?r=${encodeURIComponent(pathname)}` as "/admin/login");
      setState("redirect");
    }, AUTH_CHECK_TIMEOUT);

    const checkAuth = async () => {
      try {
        // Najpierw spróbuj getSession()
        const { data, error } = await supabase.auth.getSession();

        if (cancelled) return;

        if (error) {
          console.warn("[AuthGuard] getSession error:", error.message);
        }

        if (data?.session) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setState("ok");
          return;
        }

        // getSession() nie zwróciło sesji – spróbuj getUser() jako fallback
        // (getUser() jest bardziej niezawodny, sam refreshuje token)
        try {
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (cancelled) return;

          if (!userError && userData?.user) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setState("ok");
            return;
          }
        } catch (userErr) {
          console.warn("[AuthGuard] getUser fallback failed:", userErr);
        }

        // Brak sesji i brak usera → przekieruj na login
        if (cancelled) return;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        router.replace(`/admin/login?r=${encodeURIComponent(pathname)}` as "/admin/login");
        setState("redirect");

      } catch (err) {
        // KRYTYCZNE: getSession() rzuciło wyjątek
        // (uszkodzone ciasteczka, brak sieci, błąd Supabase)
        if (cancelled) return;
        console.error("[AuthGuard] Auth check failed:", err);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        // Spróbuj przekierować na login – to bezpieczniejsze niż wieczne ładowanie
        try {
          router.replace(`/admin/login?r=${encodeURIComponent(pathname)}` as "/admin/login");
          setState("redirect");
        } catch {
          // Nawet router.replace zawiódł – pokaż error state
          setErrorMsg("Nie udało się sprawdzić sesji. Sprawdź połączenie z internetem.");
          setState("error");
        }
      }
    };

    void checkAuth();

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [pathname, router]);

  if (state === "checking") return <LoadingFallback />;
  if (state === "redirect") return <LoadingFallback />;

  if (state === "error") {
    return (
      <div className="admin-shell min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full rounded-2xl bg-white p-8 shadow-lg text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-7 w-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Problem z połączeniem</h2>
          <p className="text-sm text-slate-500 mb-6">
            {errorMsg || "Nie udało się załadować panelu. Sprawdź połączenie z internetem."}
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Odśwież stronę
            </button>
            <button
              onClick={() => {
                window.location.href = "/admin/login";
              }}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Przejdź do logowania
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ──────────────────────────────────────────────
// Shell admina – Sidebar + header + content
// ──────────────────────────────────────────────
function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";

  return (
    <div className="admin-shell flex min-h-screen bg-slate-50">
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
// Publiczny eksport – ErrorBoundary → AuthGuard → Suspense → AdminShell
// ──────────────────────────────────────────────
export default function AdminClientLayout({ children }: { children: ReactNode }) {
  return (
    <AdminErrorBoundary>
      <AuthGuard>
        <Suspense fallback={<LoadingFallback />}>
          <AdminShell>{children}</AdminShell>
        </Suspense>
      </AuthGuard>
    </AdminErrorBoundary>
  );
}
