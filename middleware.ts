import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

/** --- KANONICZNY HOST --- */
const CANONICAL_HOST =
  process.env.NEXT_PUBLIC_BASE_HOST ||
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/^https?:\/\//, "") ||
  "www.mediagalaxy.pl";

/** WordPress ścieżki do odcięcia */
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

/** Dozwolone publiczne trasy */
const WHITELIST = new Set<string>([
  "/",
  "/menu",
  "/kontakt",
  "/rezerwacje",
  "/pickup-order",
  "/verify",
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

/** Heurystyka spamowych URL-i */
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

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const isPreview =
    host.endsWith(".vercel.app") ||
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1");

  // 0) HTTPS + host kanoniczny
  if (!isPreview && host && host !== CANONICAL_HOST) {
    const url = new URL(req.url);
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const pathname = normalizePath(req.nextUrl.pathname);

  // 0.5) /gone przepuszczamy
  if (pathname === "/gone") return NextResponse.next();

  // 1) Spam → 410
  if (isSpamPath(pathname, req)) {
    const gone = new NextResponse("Gone", { status: 410 });
    gone.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return gone;
  }

  // Zawsze ustawiaj cookie 'restaurant_slug' dla pierwszego segmentu ścieżki (poza /admin)
  const seg0 = pathname.split("/").filter(Boolean)[0] || null;
  if (seg0 && seg0 !== "admin") {
    const resSet = NextResponse.next();
    resSet.cookies.set("restaurant_slug", seg0.toLowerCase(), {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      secure: !isPreview,
      maxAge: 60 * 60 * 24 * 7,
    });
    // Publiczne strony nie wymagają auth
    if (!pathname.startsWith("/admin")) return resSet;
    // dla /admin przechodzimy dalej z tym samym obiektem odpowiedzi
    // i będziemy go dalej modyfikować
    return await handleAdmin(req, resSet, isPreview);
  }

  // Publiczne strony bez segmentu/slug-u
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  // /admin flow
  return await handleAdmin(req, NextResponse.next(), isPreview);
}

async function handleAdmin(req: NextRequest, res: NextResponse, isPreview: boolean) {
  const supabase = createMiddlewareClient<Database>({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const pathname = normalizePath(req.nextUrl.pathname);

  // 2.1) /admin/login
  if (pathname === "/admin/login") {
    if (!session) return res;

    const { data: membership } = await supabase
      .from("restaurant_admins")
      .select("restaurant_id, added_at")
      .eq("user_id", session.user.id)
      .order("added_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!membership?.restaurant_id) return res;

    const redirect = NextResponse.redirect(new URL("/admin/AdminPanel", req.nextUrl.origin));

    redirect.cookies.set("restaurant_id", String(membership.restaurant_id), {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      secure: !isPreview,
      maxAge: 60 * 60 * 24 * 7,
    });

    const { data: r } = await supabase
      .from("restaurants")
      .select("slug")
      .eq("id", membership.restaurant_id)
      .maybeSingle();

    if (r?.slug) {
      redirect.cookies.set("restaurant_slug", String(r.slug), {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        secure: !isPreview,
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return redirect;
  }

  // 3) Ochrona pozostałych /admin/*
  if (!session) {
    if (isJsonRequest(req)) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const url = new URL("/admin/login", req.nextUrl.origin);
    url.searchParams.set("r", pathname);
    return NextResponse.redirect(url);
  }

  // 4) Membership
  const { data: membership, error: mErr } = await supabase
    .from("restaurant_admins")
    .select("restaurant_id, added_at")
    .eq("user_id", session.user.id)
    .order("added_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (mErr || !membership?.restaurant_id) {
    const url = new URL("/admin/login", req.nextUrl.origin);
    url.searchParams.set("err", "no-restaurant");
    return NextResponse.redirect(url);
  }

  // 5) Cookies: id + slug
  res.cookies.set("restaurant_id", String(membership.restaurant_id), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: !isPreview,
    maxAge: 60 * 60 * 24 * 7,
  });

  const { data: r } = await supabase
    .from("restaurants")
    .select("slug")
    .eq("id", membership.restaurant_id)
    .maybeSingle();

  if (r?.slug) {
    res.cookies.set("restaurant_slug", String(r.slug), {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      secure: !isPreview,
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  // 6) /admin → panel
  if (pathname === "/admin") {
    return NextResponse.redirect(new URL("/admin/AdminPanel", req.nextUrl.origin));
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml)|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
