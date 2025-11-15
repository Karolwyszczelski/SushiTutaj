// src/app/api/push/send/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

let webpushConfigured = false;

async function getWebPush() {
  // @ts-ignore – brak oficjalnych typów dla "web-push", ignorujemy błąd TS świadomie
  const webpushModule = await import("web-push");
  const webpush = (webpushModule as any).default ?? webpushModule;

  if (!webpushConfigured) {
    webpush.setVapidDetails(
      "mailto:admin@sushitutaj.pl",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    webpushConfigured = true;
  }
  return webpush as {
    setVapidDetails: (
      subject: string,
      publicKey: string,
      privateKey: string
    ) => void;
    sendNotification: (
      subscription: { endpoint: string; keys: any },
      payload: string
    ) => Promise<unknown>;
  };
}

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    url?: string;
  };

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

  const subscriptions = (subs ?? []) as {
    endpoint: string;
    keys: any;
  }[];

  await Promise.allSettled(
    subscriptions.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        notif
      )
    )
  );

  // (opcjonalnie) czyszczenie nieaktywnych subskrypcji (410/404) – jak w komentarzu

  return NextResponse.json({ sent: subscriptions.length });
}
