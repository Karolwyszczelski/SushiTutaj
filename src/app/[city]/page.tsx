import type { Metadata } from "next";
import Hero from "@/components/Hero";
import ZestawMiesiaca from "@/components/ZestawMiesiaca";
import MenuSection from "@/components/menu/MenuSection"; // „preview”, bez zamawiania
import OnasSection from "@/components/OnasSection";
import ContactSection from "@/components/ContactSection"; // ogólne info marki
import { getRestaurantBySlug } from "@/lib/tenant";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://www.sushitutaj.pl";

export const dynamic = "force-dynamic";

type CityParams = { city: string };

// SEO per miasto
export async function generateMetadata(
  { params }: { params: Promise<CityParams> }
): Promise<Metadata> {
  const { city } = await params;
  const r = await getRestaurantBySlug(city);

  const slug = String(r?.slug || city).toLowerCase();
  const cityName = r?.city || r?.name || slug;

  const title = `SUSHI Tutaj ${cityName} – zamów sushi online`;
  const description =
    `Zamów świeże sushi w restauracji SUSHI Tutaj ${cityName}. Dostawa i odbiór osobisty, aktualne menu online.`;

  const ogImage = "/og/sushi-og.jpg"; // globalny obrazek OG (bez ryzyka 404)

  return {
    title,
    description,
    alternates: {
      canonical: `/${slug}`,
    },
    openGraph: {
      type: "website",
      url: `/${slug}`,
      title,
      description,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `SUSHI Tutaj ${cityName} – zamów sushi online`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

// Strona + JSON-LD LocalBusiness / Restaurant
export default async function Home({ params }: { params: CityParams }) {
  const r = await getRestaurantBySlug(params.city);

  const slug = String(r?.slug || params.city).toLowerCase();
  const cityName = r?.city || r?.name || slug;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${BASE}/${slug}#restaurant`,
    name: r?.name || `SUSHI Tutaj ${cityName}`,
    url: `${BASE}/${slug}`,
    telephone: r?.phone || undefined,
    address: r?.address
      ? {
          "@type": "PostalAddress",
          streetAddress: r.address,
          addressLocality: cityName,
          addressCountry: "PL",
        }
      : undefined,
    servesCuisine: ["Sushi", "Japanese"],
    image: `${BASE}/og/sushi-og.jpg`,
    brand: {
      "@type": "Brand",
      name: "SUSHI Tutaj",
    },
  };

  return (
    <main>
      {/* JSON-LD LocalBusiness / Restaurant dla danej restauracji */}
      <script
        type="application/ld+json"
        // JSON.stringify usunie pola z undefined, więc nie wyciekną puste klucze
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Hero />
      <ZestawMiesiaca />
      <MenuSection />   {/* bez koszyka */}
      <OnasSection />
      <ContactSection /> {/* ogólne, nieper-miasto */}
    </main>
  );
}
