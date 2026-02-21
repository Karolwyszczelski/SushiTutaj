// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

/** --- KANONICZNY HOST --- */
const CANONICAL_HOST =
  process.env.NEXT_PUBLIC_BASE_HOST ||
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/^https?:\/\//, "") ||
  "www.sushitutaj.pl";

/** Ścieżki po starem WP */
const WP_PREFIXES = [
  "/wp-admin",
  "/wp-content",
  "/wp-includes",
  "/wp-json",
  "/xmlrpc.php",
  "/feed",
  "/comments-feed",
  "/category",
  "/tag",
  "/author",
  "/archives",
] as const;

/** Dozwolone znane trasy */
const WHITELIST = new Set<string>([
  "/",
  "/#menu",
  "/kontakt",
  "/rezerwacje",
  "/pickup-order",
  "/verify",
  "/admin",
  "/admin/login",
  "/legal/regulamin",
  "/legal/polityka-prywatnosci",
  "/gone",
]);

const isJsonRequest = (req: NextRequest) => {
  const accept = req.headers.get("accept") ?? "";
  const xhr = req.headers.get("x-requested-with") ?? "";
  return (
    accept.includes("application/json") ||
    xhr === "XMLHttpRequest" ||
    req.nextUrl.pathname.startsWith("/api/")
  );
};

const normalizePath = (raw: string) => {
  const p = raw.replace(/\/+$/, "");
  return p.length ? p : "/";
};

const isSpamPath = (pathname: string, req: NextRequest) => {
  if (WP_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (/^\/\d{4}(?:\/\d{2}(?:\/\d{2})?)?(?:\/|$)/.test(pathname)) return true;
  if (/^\/\d{6,}(?:\/|$)/.test(pathname)) return true;
  if (/\.(php|asp|aspx|jsp|cgi|cfm)(?:\/|$)/i.test(pathname)) return true;

  const segs = pathname.split("/").filter(Boolean);
  if (segs.some((s) => s.split("-").length >= 6 || s.length >= 80)) return true;
  if (segs.length >= 6) return true;

  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {}
  const looksCJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(decoded);
  if (looksCJK && !WHITELIST.has(pathname)) return true;

  const sp = req.nextUrl.searchParams;
  const spamParams = ["s", "p", "m", "paged", "cat", "attachment_id", "replytocom"];
  if (spamParams.some((k) => sp.has(k))) return true;

  return false;
};

/**
 * Kopiuje cookies ustawione na `from` (np. po refreshu sesji) do `to` (redirect/JSON),
 * żeby nie gubić odświeżenia tokenów przy redirectach.
 */
function carryCookies(from: NextResponse, to: NextResponse) {
  try {
    const all = from.cookies.getAll();
    for (const c of all) to.cookies.set(c);
  } catch {
    // no-op
  }
  return to;
}

/** Wykryj natywną appkę mobilną po User-Agent */
const isNativeApp = (req: NextRequest) =>
  (req.headers.get("user-agent") ?? "").includes("SushiTutajAdmin");

/** Restrykcyjny CSP dla admina w przeglądarce (nie WebView) */
const ADMIN_BROWSER_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://maps.googleapis.com https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://www.googletagmanager.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://challenges.cloudflare.com https://www.google-analytics.com https://*.sentry.io",
  "frame-src 'self' https://challenges.cloudflare.com https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Dodaj headery anti-clickjacking do response TYLKO dla zwykłych przeglądarek.
 * Natywna appka (WebView) jest pomijana — te headery blokują rendering w WebView.
 * Dodatkowo: dla natywnej appki USUWAMY restrykcyjny CSP, bo powoduje problemy
 * z hydracją React w WebView (upgrade-insecure-requests, restrykcyjne connect-src).
 */
function applyFrameHeaders(res: NextResponse, req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (isNativeApp(req)) {
    // Dla WebView: bardzo permisywny CSP — WebView jest zamkniętym środowiskiem,
    // nie potrzebuje restrykcji jak przeglądarka publiczna
    res.headers.set(
      "Content-Security-Policy",
      "default-src * 'self' 'unsafe-inline' 'unsafe-eval' data: blob: wss:; img-src * data: blob:; font-src * data:;"
    );
    // Usuń X-Frame-Options (blokuje WebView)
    res.headers.delete("X-Frame-Options");
  } else {
    res.headers.set("X-Frame-Options", "DENY");
    // Dla admin w przeglądarce: dodaj pełny CSP (bo next.config.ts go nie ustawia na /admin)
    if (pathname.startsWith("/admin")) {
      res.headers.set("Content-Security-Policy", ADMIN_BROWSER_CSP);
    } else {
      // Dla non-admin: dodaj frame-ancestors do CSP z next.config.ts
      const csp = res.headers.get("Content-Security-Policy");
      if (csp && !csp.includes("frame-ancestors")) {
        res.headers.set("Content-Security-Policy", csp + "; frame-ancestors 'none'");
      } else if (!csp) {
        res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
      }
    }
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const isPreview =
    host.endsWith(".vercel.app") ||
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1");

  // kanoniczny host
  if (!isPreview && host && host !== CANONICAL_HOST) {
    const url = new URL(req.url);
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const pathname = normalizePath(req.nextUrl.pathname);

  // /gone zostawiamy w spokoju
  if (pathname === "/gone") return applyFrameHeaders(NextResponse.next(), req);

  // spam / stare ścieżki WP
  if (isSpamPath(pathname, req)) {
    const gone = new NextResponse("Gone", { status: 410 });
    gone.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return gone;
  }

  // Interesuje nas auth tylko dla /admin*
  if (!pathname.startsWith("/admin")) return applyFrameHeaders(NextResponse.next(), req);

  // Najpierw przygotuj res i supabase (żeby móc odświeżać cookies sesji)
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          res = NextResponse.next({
            request: {
              headers: req.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // /admin/login — dostępne bez logowania, ale jeśli ktoś już zalogowany → kieruj do /admin
  if (pathname === "/admin/login") {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const url = new URL("/admin", req.nextUrl.origin);
      return applyFrameHeaders(carryCookies(res, NextResponse.redirect(url)), req);
    }
    return applyFrameHeaders(res, req);
  }

  // /admin* wymaga sesji - używamy getUser() bo jest bardziej niezawodny
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    // jeśli getUser() rzuci błąd, spróbuj refreshSession
    try {
      const { data } = await supabase.auth.refreshSession();
      user = data?.user ?? null;
    } catch {}
  }

  if (!user) {
    if (isJsonRequest(req)) {
      const out = new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
      return applyFrameHeaders(carryCookies(res, out), req);
    }

    const url = new URL("/admin/login", req.nextUrl.origin);
    url.searchParams.set("r", pathname);
    return applyFrameHeaders(carryCookies(res, NextResponse.redirect(url)), req);
  }

  // W Edge Runtime nie mamy dostępu do SUPABASE_SERVICE_ROLE_KEY,
  // więc nie możemy sprawdzić restaurant_admins (RLS blokuje).
  // Zamiast tego ufamy że użytkownik jest zalogowany i przepuszczamy.
  // Sprawdzenie roli admina odbywa się w ensure-cookie API (które używa service role).
  
  // routing /admin → odpowiedni panel (domyślnie AdminPanel, sidebar ustali szczegóły)
  if (pathname === "/admin") {
    return applyFrameHeaders(carryCookies(res, NextResponse.redirect(new URL("/admin/AdminPanel", req.nextUrl.origin))), req);
  }

  return applyFrameHeaders(res, req);
}

export const config = {
  matcher: [
    "/((?!_next|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|woff2?)|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
