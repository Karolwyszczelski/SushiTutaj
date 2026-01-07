// src/lib/apiHelpers.ts
// Centralne helpery dla API routes

import { NextResponse } from "next/server";

/**
 * Helper do tworzenia JSON response z Cache-Control: no-store
 */
export function json<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Helper do tworzenia error response
 */
export function errorResponse(message: string, status = 500, code?: string): NextResponse {
  return json({ error: message, ...(code && { code }) }, status);
}

/**
 * Normalizuje UUID - usuwa whitespace i waliduje format
 */
export function normalizeUuid(v?: string | null): string | null {
  if (!v) return null;
  const x = String(v).replace(/[<>\s'"]/g, "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)
    ? x
    : null;
}

/**
 * Normalizuje slug restauracji
 */
export function normalizeSlug(v?: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return s || null;
}

/**
 * Formatowanie ceny w PLN
 */
export function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " zł";
}

/**
 * Bezpieczne parsowanie JSON
 */
export function safeParseJson<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/**
 * Sprawdza czy wartość jest niepustym stringiem
 */
export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Czyści cookies auth Supabase (przy wylogowaniu/błędzie auth)
 */
export function clearSupabaseAuthCookies(res: NextResponse): void {
  const cookieNames = [
    "sb-access-token",
    "sb-refresh-token",
    "supabase-auth-token",
  ];
  
  for (const name of cookieNames) {
    res.cookies.set(name, "", { maxAge: 0, path: "/" });
  }
}

/**
 * HTTP Error class dla API
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Wrapper dla async route handlers z error handling
 */
export function withErrorHandler<T>(
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  return handler().catch((err) => {
    if (err instanceof HttpError) {
      return errorResponse(err.message, err.status, err.code);
    }
    console.error("[API Error]", err);
    return errorResponse("Internal server error", 500);
  });
}
