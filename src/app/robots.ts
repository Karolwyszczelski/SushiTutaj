import type { MetadataRoute } from "next";
const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.sushitutaj.pl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/order",
          "/verify",
          "/admin",
          "/api/",
          // stare WP:
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
          // parametry (Google respektuje wildcardy):
          "/*?s=",
          "/*?p=",
          "/*?m=",
          "/*?paged=",
          "/*?cat=",
          "/*?attachment_id=",
          "/*?replytocom=",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
