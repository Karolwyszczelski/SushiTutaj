// app/sitemap.ts
import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.mediagalaxy.pl";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = [
    "",
    "/#menu",
    "/#kontakt",
    "[city]/regulamin",
    "[city]/polityka-cookies",
    "[city]/polityka-prywatnosci",
  ];

  return paths.map((p) => ({
    url: `${BASE}${p || "/"}`,
    lastModified: now,
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : 0.6,
  }));
}
