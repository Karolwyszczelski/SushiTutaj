// src/app/api/restaurants/clear-cookie/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const CK_BASE = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 0,
};

const CK_ID = { ...CK_BASE, httpOnly: true };
const CK_SLUG = { ...CK_BASE, httpOnly: false };

export async function POST() {
  const res = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );

  // Czyść dokładnie po name+path (najpewniejsze przy różnych atrybutach)
  res.cookies.set("restaurant_id", "", CK_ID);
  res.cookies.set("restaurant_slug", "", CK_SLUG);

  return res;
}
