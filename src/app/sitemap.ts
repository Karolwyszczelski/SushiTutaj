// app/sitemap.ts
import type { MetadataRoute } from "next";
import { listActiveRestaurants } from "@/lib/tenant";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.sushitutaj.pl";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${BASE}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE}/regulamin`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${BASE}/polityka-cookies`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE}/polityka-prywatnosci`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const restaurants = (await listActiveRestaurants()) ?? [];

  const cityPages: MetadataRoute.Sitemap = restaurants
    .filter((r: any) => r.slug)
    .flatMap((r: any) => {
      const slug = String(r.slug).toLowerCase();

      return [
        {
          url: `${BASE}/${slug}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.9,
        },
        {
          url: `${BASE}/${slug}/kontakt`,
          lastModified: now,
          changeFrequency: "monthly",
          priority: 0.6,
        },
        {
          url: `${BASE}/${slug}/regulamin`,
          lastModified: now,
          changeFrequency: "yearly",
          priority: 0.3,
        },
        {
          url: `${BASE}/${slug}/cookies`,
          lastModified: now,
          changeFrequency: "yearly",
          priority: 0.2,
        },
        {
          url: `${BASE}/${slug}/polityka-prywatnosci`,
          lastModified: now,
          changeFrequency: "yearly",
          priority: 0.2,
        },
      ];
    });

  return [...staticPages, ...cityPages];
}
