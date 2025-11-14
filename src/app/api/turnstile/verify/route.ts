// src/app/api/turnstile/verify/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ ok: false, code: "NO_TOKEN" }, { status: 400 });

    const form = new FormData();
    form.append("secret", process.env.TURNSTILE_SECRET_KEY!);
    form.append("response", token);
    // opcjonalnie IP: form.append("remoteip", req.headers.get("x-forwarded-for") ?? "");

    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = await r.json();
    return NextResponse.json({ ok: !!data.success, data });
  } catch (err) {
    return NextResponse.json({ ok: false, code: "EXCEPTION" }, { status: 500 });
  }
}
