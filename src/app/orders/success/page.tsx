// src/app/orders/success/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const pickFirst = (v: unknown): string | null => {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : null;
  return typeof v === "string" ? v : null;
};

function clampStr(v: unknown, max = 220): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function isUuid(v?: string | null): boolean {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function isPublicId(v?: string | null): boolean {
  if (!v) return false;
  return /^[a-f0-9]{8,64}$/i.test(String(v).trim());
}

function normalizeHexToken(v: unknown): string | null {
  const s = clampStr(v, 220);
  if (!s) return null;
  // tracking_token: zwykle 64 hex, ale tolerujemy 32–128
  if (!/^[a-f0-9]{32,128}$/i.test(s)) return null;
  return s.toLowerCase();
}

function normalizeLegacyToken(v: unknown): string | null {
  const s = clampStr(v, 220);
  if (!s) return null;
  // HMAC base64url
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(s)) return null;
  return s;
}

function getLegacySecret(): string | null {
  return process.env.ORDER_LINK_SECRET || process.env.ORDER_TRACKING_SECRET || null;
}

function signOrderId(orderId: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(orderId).digest("base64url");
}

function verifyLegacyHmac(orderId: string, token: string, secret: string): boolean {
  const expected = signOrderId(orderId, secret);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function OrderSuccessPage(props: any) {
  // Next 15: searchParams może być Promise, ale zwykle jest obiektem
  const spRaw = props?.searchParams;
  const sp =
    spRaw && typeof spRaw?.then === "function" ? await spRaw : spRaw || {};

  // Obsługujemy różne nazwy parametrów (legacy + nowe)
  const idRaw =
    (pickFirst(sp.publicId) ||
      pickFirst(sp.id) ||
      pickFirst(sp.orderId) ||
      "")?.trim() || "";

  const tokenRaw =
    (pickFirst(sp.t) || pickFirst(sp.token) || "")?.trim() || "";

  if (!idRaw || !tokenRaw) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center text-slate-100">
        <h1 className="mb-3 text-2xl font-semibold">Link jest niekompletny</h1>
        <p className="mb-4 text-sm text-slate-300">
          Ten podgląd wymaga poprawnego linku z wiadomości (token bezpieczeństwa).
          Otwórz link bezpośrednio z e-maila/SMS.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-200"
        >
          Wróć na stronę główną
        </Link>
      </main>
    );
  }

  // ==========================
  // 1) NOWE parametry: public_id + tracking_token => redirect do /order/...
  // ==========================
  const tokenHex = normalizeHexToken(tokenRaw);
  if (isPublicId(idRaw) && tokenHex) {
    redirect(`/order/${encodeURIComponent(idRaw.toLowerCase())}?t=${encodeURIComponent(tokenHex)}`);
  }

  // Od tego miejsca traktujemy idRaw jako UUID (legacy / przejściowy)
  const orderUuid = isUuid(idRaw) ? idRaw : null;
  if (!orderUuid) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center text-slate-100">
        <h1 className="mb-3 text-2xl font-semibold">Link jest nieprawidłowy</h1>
        <p className="text-sm text-slate-300">
          Link może być uszkodzony lub nieaktualny. Otwórz go bezpośrednio z wiadomości.
        </p>
      </main>
    );
  }

  // ==========================
  // 2) Przejściowy: UUID + tracking_token(hex)
  // (gdyby kiedyś powstały linki uuid+t=hex)
  // ==========================
  if (tokenHex) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("public_id, tracking_token")
      .eq("id", orderUuid)
      .eq("tracking_token", tokenHex)
      .maybeSingle();

    if (!error && data) {
      const publicId = typeof (data as any)?.public_id === "string" ? (data as any).public_id : null;
      const tt = typeof (data as any)?.tracking_token === "string" ? (data as any).tracking_token : null;

      if (isPublicId(publicId) && normalizeHexToken(tt)) {
        redirect(`/order/${encodeURIComponent(publicId.toLowerCase())}?t=${encodeURIComponent(tt.toLowerCase())}`);
      }
    }
  }

  // ==========================
  // 3) LEGACY: UUID + HMAC(secret) => po weryfikacji spróbuj przekierować na nowy tracking
  // ==========================
  const legacySecret = getLegacySecret();
  const legacyToken = normalizeLegacyToken(tokenRaw);

  if (!legacySecret || !legacyToken) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center text-slate-100">
        <h1 className="mb-3 text-2xl font-semibold">Link jest nieprawidłowy</h1>
        <p className="text-sm text-slate-300">
          Link może być uszkodzony lub nieaktualny. Otwórz go bezpośrednio z wiadomości.
        </p>
      </main>
    );
  }

  if (!verifyLegacyHmac(orderUuid, legacyToken, legacySecret)) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center text-slate-100">
        <h1 className="mb-3 text-2xl font-semibold">Link jest nieprawidłowy</h1>
        <p className="text-sm text-slate-300">
          Link może być uszkodzony lub nieaktualny. Otwórz go bezpośrednio z wiadomości.
        </p>
      </main>
    );
  }

  // Token legacy OK => pobierz nowe pola i przekieruj, jeśli istnieją
  const { data: row, error: rowErr } = await supabaseAdmin
    .from("orders")
    .select("public_id, tracking_token")
    .eq("id", orderUuid)
    .maybeSingle();

  if (!rowErr && row) {
    const publicId = typeof (row as any)?.public_id === "string" ? (row as any).public_id : null;
    const tt = typeof (row as any)?.tracking_token === "string" ? (row as any).tracking_token : null;

    if (isPublicId(publicId) && normalizeHexToken(tt)) {
      redirect(`/order/${encodeURIComponent(publicId.toLowerCase())}?t=${encodeURIComponent(tt.toLowerCase())}`);
    }
  }

  // Fallback: legacy link poprawny, ale rekord nie ma jeszcze nowych pól (np. stare zamówienie bez backfill)
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center text-slate-100">
      <h1 className="mb-3 text-2xl font-semibold">Zamówienie zapisane</h1>
      <p className="mb-4 text-sm text-slate-300">
        Ten link działa, ale to zamówienie nie ma jeszcze nowego linku do śledzenia.
        Jeśli masz nowszą wiadomość (SMS/e-mail), otwórz ją ponownie — powinna prowadzić do strony śledzenia.
      </p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-full bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-200"
      >
        Wróć na stronę główną
      </Link>
    </main>
  );
}
