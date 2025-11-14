// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

/** --- KANONICZNY HOST --- */
const CANONICAL_HOST =
  process.env.NEXT_PUBLIC_BASE_HOST ||
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/^https?:\/\//, "") ||
  "www.mediagalaxy.pl";

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
  "/menu",
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
  if (pathname === "/gone") {
    return NextResponse.next();
  }

  // spam / stare ścieżki WP
  if (isSpamPath(pathname, req)) {
    const gone = new NextResponse("Gone", { status: 410 });
    gone.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return gone;
  }

  // wszystko poza /admin* nie wymaga auth
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  // /admin/login — dostępne bez logowania
  if (pathname === "/admin/login") return NextResponse.next();

  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // brak sesji → 401/redirect
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

  // sprawdzenie uprawnień w restaurant_admins
  let adminRole: string | null = null;

  try {
    const { data, error } = await supabase
      .from("restaurant_admins")
      .select("role")
      .eq("user_id", session.user.id)
      .order("added_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // jeśli coś wywaliło, traktujemy jak brak uprawnień
      console.error("[middleware] restaurant_admins error:", error.message);
    }

    adminRole = (data?.role as string) ?? null;
  } catch (e: any) {
    console.error("[middleware] restaurant_admins exception:", e?.message ?? e);
  }

  // użytkownik zalogowany, ale nie jest adminem żadnej restauracji
  if (!adminRole) {
    if (isJsonRequest(req)) {
      return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  // routing /admin → odpowiedni panel
  if (pathname === "/admin") {
    let dest = "/";

    if (adminRole === "employee") {
      dest = "/admin/EmployeePanel";
    } else {
      // owner / admin / inne role traktujemy jako pełny admin
      dest = "/admin/AdminPanel";
    }

    if (dest !== pathname) {
      return NextResponse.redirect(new URL(dest, req.nextUrl.origin));
    }
  }

  // dodatkowe ograniczenie: "employee" nie wejdzie na AdminPanel, jeśli chcesz:
  // if (pathname.startsWith("/admin/AdminPanel") && adminRole === "employee") {
  //   return NextResponse.redirect(new URL("/admin/EmployeePanel", req.nextUrl.origin));
  // }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|woff2?)|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
