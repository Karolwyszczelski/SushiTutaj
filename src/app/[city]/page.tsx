import type { Metadata } from "next";
import Hero from "@/components/Hero";
import ZestawMiesiaca from "@/components/ZestawMiesiaca";
import MenuSection from "@/components/menu/MenuSection"; // „preview”, bez zamawiania
import OnasSection from "@/components/OnasSection";
import ContactSection from "@/components/ContactSection"; // ogólne info marki
import { getRestaurantBySlug } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type CityParams = { city: string };

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

export default async function Home() {
  return (
    <main>
      <Hero />
      <ZestawMiesiaca />
      <MenuSection />   {/* bez koszyka */}
      <OnasSection />
      <ContactSection /> {/* ogólne, nieper-miasto */}
    </main>
  );
}
