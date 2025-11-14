import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const sub = await req.json();
  const supabase = createRouteHandlerClient<Database>({ cookies });
  // tabela push_subscriptions: id (uuid), user_id, endpoint (text), keys (json), created_at
  await supabase.from("push_subscriptions").upsert({
    endpoint: sub.endpoint,
    keys: sub.keys,
  }, { onConflict: "endpoint" });
  return NextResponse.json({ ok: true });
}
