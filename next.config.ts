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
  try { decoded = decodeURIComponent(pathname); } catch {}
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

  if (!isPreview && host && host !== CANONICAL_HOST) {
    const url = new URL(req.url);
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const pathname = normalizePath(req.nextUrl.pathname);

  if (pathname === "/gone") {
    return NextResponse.next();
  }

  if (isSpamPath(pathname, req)) {
    const gone = new NextResponse("Gone", { status: 410 });
    gone.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return gone;
  }

  if (!pathname.startsWith("/admin")) return NextResponse.next();
  if (pathname === "/admin/login") return NextResponse.next();

  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

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

  try {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();

    const role = data?.role ?? null;

    if (pathname === "/admin") {
      const dest =
        role === "admin"
          ? "/admin/AdminPanel"
          : role === "employee"
          ? "/admin/EmployeePanel"
          : "/";
      if (dest !== pathname)
        return NextResponse.redirect(new URL(dest, req.nextUrl.origin));
    }

    if (role === "client") {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
  } catch {}

  return res;
}

export const config = {
  matcher: [
    "/((?!_next|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml)|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
