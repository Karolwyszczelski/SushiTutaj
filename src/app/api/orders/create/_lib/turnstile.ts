// src/app/api/orders/create/_lib/turnstile.ts
import "server-only";

import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { clientIp } from "./normalize";

export async function enforceTurnstile(
  req: Request,
  raw: any,
  TURNSTILE_SECRET_KEY: string
): Promise<NextResponse | null> {
  if (!TURNSTILE_SECRET_KEY) return null;

  const headerToken =
    req.headers.get("cf-turnstile-response") ||
    req.headers.get("x-turnstile-token");

  const token =
    raw?.turnstileToken ||
    raw?.token ||
    raw?.cf_turnstile_token ||
    headerToken;

  if (!token) {
    return NextResponse.json(
      { error: "Brak weryfikacji antybot.", code: "TURNSTILE_MISSING" },
      { status: 400 }
    );
  }

  try {
    const params = new URLSearchParams({
      secret: TURNSTILE_SECRET_KEY,
      response: String(token),
    });

    const ip = clientIp(req);
    if (ip) params.set("remoteip", ip);

    const ver = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }
    );

    const jr = await ver.json();
    const codes: string[] = Array.isArray(jr?.["error-codes"])
      ? jr["error-codes"]
      : [];

    if (!jr?.success) {
      apiLogger.error("turnstile verify fail", { codes: codes.length ? codes : jr });

      const retryable =
        codes.includes("timeout-or-duplicate") ||
        codes.includes("invalid-input-response");

      return NextResponse.json(
        {
          error: retryable
            ? "Weryfikacja wygasła lub została użyta ponownie. Odśwież weryfikację i spróbuj ponownie."
            : "Nieudana weryfikacja formularza.",
          code: retryable ? "TURNSTILE_RETRY" : "TURNSTILE_FAIL",
          turnstile: { codes },
        },
        { status: retryable ? 409 : 400 }
      );
    }

    return null;
  } catch (e: any) {
    apiLogger.error("turnstile verify error", { error: e?.message || e });
    return NextResponse.json(
      { error: "Błąd weryfikacji formularza.", code: "TURNSTILE_ERROR" },
      { status: 400 }
    );
  }
}
