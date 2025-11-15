// src/app/api/push/subscribe/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";
import { cookies } from "next/headers";

type PushSubscriptionPayload = {
  endpoint: string;
  keys: any;
};

export async function POST(req: Request) {
  const sub = (await req.json().catch(() => null)) as
    | PushSubscriptionPayload
    | null;

  if (!sub?.endpoint || !sub.keys) {
    return NextResponse.json(
      { error: "Brak poprawnych danych subskrypcji" },
      { status: 400 }
    );
  }

  const supabase = createRouteHandlerClient<Database>({ cookies });

  // tabela push_subscriptions: id (uuid), user_id, endpoint (text), keys (json), created_at
  const { error } = await (supabase
    .from("push_subscriptions") as any).upsert(
    {
      endpoint: sub.endpoint,
      keys: sub.keys,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    console.error("push_subscriptions upsert error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
