// src/app/api/admin/notifications/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  try {
    // TODO: tu w przyszłości zrób SELECT z Supabase (orders, logi błędów itp.)
    const demo = [
      {
        id: "demo-order-1",
        type: "order" as const,
        title: "Nowe zamówienie",
        message: "Nowe zamówienie złożone przed chwilą w systemie.",
        created_at: new Date().toISOString(),
        read: false,
      },
      {
        id: "demo-error-1",
        type: "error" as const,
        title: "Błąd w integracji",
        message: "Nie udało się wysłać e-maila z potwierdzeniem.",
        created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        read: true,
      },
    ];

    return NextResponse.json({ notifications: demo });
  } catch (e) {
    return NextResponse.json(
      { notifications: [], error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
