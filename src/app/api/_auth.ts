export const runtime = "nodejs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supaAnon = createClient<Database>(SUPABASE_URL, ANON, { auth: { persistSession: false } });

async function readAccessTokenFromCookies(): Promise<string | null> {
  const store = await cookies();
  const all = store.getAll();
  const parts = all
    .filter((c) => /sb-.*-auth-token\.\d+$/.test(c.name))
    .sort((a, b) => parseInt(a.name.split(".").pop()!) - parseInt(b.name.split(".").pop()!))
    .map((c) => c.value);
  const raw = parts.length ? parts.join("") : (all.find((c) => /sb-.*-auth-token$/.test(c.name))?.value ?? "");
  if (!raw) return null;
  let text = raw; try { text = decodeURIComponent(raw); } catch {}
  try {
    const p = JSON.parse(text);
    return p?.access_token || p?.currentSession?.access_token || p?.data?.session?.access_token || null;
  } catch { return null; }
}

export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const hdr = req.headers.get("authorization") || req.headers.get("Authorization");
  const token = hdr?.startsWith("Bearer ") ? hdr.slice(7).trim() : null;
  const t = token || (await readAccessTokenFromCookies());
  if (!t) return null;
  const { data } = await supaAnon.auth.getUser(t);
  return data?.user?.id ?? null;
}
