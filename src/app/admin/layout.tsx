// src/app/admin/layout.tsx
// ──────────────────────────────────────────────────────────────
// SERVER COMPONENT – eksportuje dynamic = "force-dynamic"
// żeby Next.js ZAWSZE renderował admin dynamicznie (nie cache'ował).
// Dzięki temu middleware ZAWSZE uruchomi się i sprawdzi auth.
//
// Cała logika kliencka (Sidebar, AuthGuard, NotificationBell)
// jest w AdminClientLayout ("use client").
//
// WAŻNE: Wrapper <div> z admin-shell i inline style zapewnia
// jasne tło ZANIM React się zahydruje – zapobiega czarnemu
// ekranowi na tablecie.
// ──────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import AdminClientLayout from "@/components/admin/AdminClientLayout";

// KRYTYCZNE: To musi być w SERVER COMPONENT żeby zadziałało.
// W "use client" plikach export const dynamic jest IGNOROWANY.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Inline style – gwarantuje jasne tło PRZED załadowaniem CSS/JS */}
      {/* Działa nawet gdy Tailwind/globals.css jeszcze się nie załadowały */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            body { background: #f8fafc !important; color: #0f172a !important; }
            body::before { display: none !important; }
          `,
        }}
      />
      <AdminClientLayout>{children}</AdminClientLayout>
    </>
  );
}
