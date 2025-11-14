// src/app/api/push/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

let webpushConfigured = false;
async function getWebPush() {
  const webpush = (await import("web-push")).default; // CJS -> default
  if (!webpushConfigured) {
    webpush.setVapidDetails(
      "mailto:admin@sushitutaj.pl",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    webpushConfigured = true;
  }
  return webpush;
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, keys")
    .limit(500);

  const notif = JSON.stringify({
    title: payload.title || "Nowe zamówienie",
    body: payload.body || "Kliknij, aby zobaczyć szczegóły.",
    url: payload.url || "/admin/current-orders",
  });

  const webpush = await getWebPush();

  const results = await Promise.allSettled(
    (subs ?? []).map((s: any) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, notif)
    )
  );

  // (opcjonalnie) usuń nieaktywne suby po 410/404:
  // const toRemove = results
  //   .map((r, i) => (r.status === "rejected" && (r.reason?.statusCode === 410 || r.reason?.statusCode === 404) ? subs![i].endpoint : null))
  //   .filter(Boolean);
  // if (toRemove.length) await supabase.from("push_subscriptions").delete().in("endpoint", toRemove);

  return NextResponse.json({ sent: (subs ?? []).length });
}
