// src/app/api/push/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/adminContext";
import { sendPushForRestaurant } from "@/lib/push";

type PushSendBody = {
  title?: string;
  body?: string;
  url?: string;
  type?: string;
};

function clampStr(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeInternalUrl(v: unknown, fallback = "/admin/current-orders") {
  const s = clampStr(v, 300);
  if (!s) return fallback;

  if (!s.startsWith("/")) return fallback;
  if (s.startsWith("//")) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return fallback;
  if (s.includes("\n") || s.includes("\r")) return fallback;

  return s;
}

function json(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  // 1) Autoryzacja + scope restauracji
  let restaurantId: string;
  try {
    const ctx = await getAdminContext();
    restaurantId = ctx.restaurantId;
  } catch {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  // 2) Payload
  const raw = (await req.json().catch(() => null)) as PushSendBody | null;
  if (!raw || typeof raw !== "object") {
    return json({ error: "INVALID_BODY" }, 400);
  }

  const payload = {
    type: clampStr(raw.type, 40) ?? "manual",
    title: clampStr(raw.title, 120) ?? "Nowe zamówienie",
    body: clampStr(raw.body, 240) ?? "Kliknij, aby zobaczyć szczegóły.",
    url: normalizeInternalUrl(raw.url, "/admin/current-orders"),
  };

  // 3) Wysyłka tylko do subskrypcji tej restauracji
  await sendPushForRestaurant(restaurantId, payload);

  return json({ ok: true }, 200);
}
