// src/app/admin/layout.tsx
import type { ReactNode } from "react";
import { Suspense } from "react";
import Sidebar from "@/components/admin/sidebar";

// Admin może być spokojnie zawsze dynamiczny
export const dynamic = "force-dynamic";

function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar (ma useSearchParams) pod Suspense */}
      <aside className="flex-none">
        <Sidebar />
      </aside>

      {/* Główna treść */}
      <main className="flex-1 overflow-y-auto">
        {children}
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
