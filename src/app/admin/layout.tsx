// src/app/admin/layout.tsx
// ──────────────────────────────────────────────────────────────
// SERVER COMPONENT – eksportuje dynamic = "force-dynamic"
// żeby Next.js ZAWSZE renderował admin dynamicznie (nie cache'ował).
// Dzięki temu middleware ZAWSZE uruchomi się i sprawdzi auth.
//
// Cała logika kliencka (Sidebar, AuthGuard, NotificationBell)
// jest w AdminClientLayout ("use client").
// ──────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import AdminClientLayout from "@/components/admin/AdminClientLayout";

// KRYTYCZNE: To musi być w SERVER COMPONENT żeby zadziałało.
// W "use client" plikach export const dynamic jest IGNOROWANY.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminClientLayout>{children}</AdminClientLayout>;
}
