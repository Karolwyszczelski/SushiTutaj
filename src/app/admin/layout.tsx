// src/app/admin/layout.tsx
"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/admin/sidebar";
import NotificationBell from "@/components/admin/NotificationBell";

// Admin może być spokojnie zawsze dynamiczny
export const dynamic = "force-dynamic";

function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar (ma useSearchParams) */}
      <aside className="flex-none">
        <Sidebar />
      </aside>

      {/* Główna treść */}
      <main className="flex-1 overflow-y-auto">
        {/* Sticky header z dzwonkiem – na wszystkich stronach admina
            Z WYJĄTKIEM /admin/login */}
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

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
          Ładowanie panelu administracyjnego…
        </div>
      }
    >
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
