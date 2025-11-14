// src/app/api/restaurants/clear-cookie/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";

const CK = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge: 0,
};

export async function POST() {
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set("restaurant_id", "", CK);
  res.cookies.set("restaurant_slug", "", CK);
  return res;
}
