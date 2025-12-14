// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
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
  if (pathname === "/gone") return NextResponse.next();

  // spam / stare ścieżki WP
  if (isSpamPath(pathname, req)) {
    const gone = new NextResponse("Gone", { status: 410 });
    gone.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return gone;
  }

  // Interesuje nas auth tylko dla /admin*
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  // Najpierw przygotuj res i supabase (żeby móc odświeżać cookies sesji)
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  // /admin/login — dostępne bez logowania, ale jeśli ktoś już zalogowany → kieruj do /admin
  if (pathname === "/admin/login") {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      const url = new URL("/admin", req.nextUrl.origin);
      return carryCookies(res, NextResponse.redirect(url));
    }
    return res;
  }

  // /admin* wymaga sesji
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    if (isJsonRequest(req)) {
      const out = new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
      return carryCookies(res, out);
    }

    const url = new URL("/admin/login", req.nextUrl.origin);
    url.searchParams.set("r", pathname);
    return carryCookies(res, NextResponse.redirect(url));
  }

  // Sprawdzenie uprawnień w restaurant_admins:
  // PRIORYTET: rola dla aktualnej restauracji z cookie restaurant_id
  const restaurantId = req.cookies.get("restaurant_id")?.value ?? null;

  let adminRole: string | null = null;

  try {
    if (restaurantId) {
      const { data, error } = await supabase
        .from("restaurant_admins")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("restaurant_id", restaurantId)
        .limit(1)
        .maybeSingle();

      if (!error) {
        const row = (data ?? null) as { role?: string } | null;
        adminRole = row?.role ?? null;
      }
    }

    // fallback: jak nie ma cookie albo nie znalazło — wystarczy jakikolwiek wpis admina
    if (!adminRole) {
      const { data, error } = await supabase
        .from("restaurant_admins")
        .select("role")
        .eq("user_id", session.user.id)
        .order("added_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[middleware] restaurant_admins error:", error.message);
      } else {
        const row = (data ?? null) as { role?: string } | null;
        adminRole = row?.role ?? null;
      }
    }
  } catch (e: any) {
    console.error("[middleware] restaurant_admins exception:", e?.message ?? e);
  }

  if (!adminRole) {
    if (isJsonRequest(req)) {
      const out = new NextResponse(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
      return carryCookies(res, out);
    }
    return carryCookies(res, NextResponse.redirect(new URL("/", req.nextUrl.origin)));
  }

  // routing /admin → odpowiedni panel
  if (pathname === "/admin") {
    const dest = adminRole === "employee" ? "/admin/EmployeePanel" : "/admin/AdminPanel";
    return carryCookies(res, NextResponse.redirect(new URL(dest, req.nextUrl.origin)));
  }

  // (opcjonalnie) blokada wejścia employee na AdminPanel:
  // if (pathname.startsWith("/admin/AdminPanel") && adminRole === "employee") {
  //   return carryCookies(res, NextResponse.redirect(new URL("/admin/EmployeePanel", req.nextUrl.origin)));
  // }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|woff2?)|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
