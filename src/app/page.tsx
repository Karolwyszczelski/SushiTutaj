import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import RotatingPlate from "@/components/RotatingPlate";
import { listActiveRestaurants } from "@/lib/tenant";
import SeasonalSnow from "@/components/SeasonalSnow";
import IntroOverlay from "@/components/IntroOverlay";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wybierz restaurację SUSHI Tutaj – zamów sushi online",
  description:
    "Wybierz restaurację SUSHI Tutaj w swoim mieście i zamów świeże sushi online. Sprawdź menu, godziny otwarcia i dostępność dostawy.",
  keywords: [
    "sushi",
    "sushi online",
    "zamów sushi",
    "SUSHI Tutaj",
    "sushi na wynos",
    "dostawa sushi",
  ],
};



type RestaurantLite = {
  slug: string;
  city_name?: string | null;
  name?: string | null;
};

const normSlug = (s: unknown) => String(s ?? "").trim().toLowerCase();

export default async function Page() {
  const restaurantsRaw = (await listActiveRestaurants()) || [];

  // bierzemy tylko takie, które faktycznie mają slug
  const restaurants: RestaurantLite[] = restaurantsRaw
    .map((r: any) => ({
      slug: normSlug(r?.slug),
      city_name: r?.city_name ?? null,
      name: r?.name ?? null,
    }))
    .filter((r) => Boolean(r.slug));

  // preferowana kolejność; fallback do pierwszych dostępnych
  const preferred = ["ciechanow", "przasnysz", "szczytno"];

  const bySlug = new Map<string, RestaurantLite>(
    restaurants.map((r) => [normSlug(r.slug), r])
  );

  const picked: RestaurantLite[] = [];

  for (const s of preferred) {
    const rr = bySlug.get(normSlug(s));
    if (rr) picked.push(rr);
  }

  for (const r of restaurants) {
    if (picked.length >= 3) break;
    if (!picked.find((x) => normSlug(x.slug) === normSlug(r.slug))) picked.push(r);
  }

  const introCities = picked
    .slice(0, 3)
    .map((r) => String(r.city_name || r.name || r.slug));

  // lekka logika sezonowa – śnieg w grudniu i styczniu
  const now = new Date();
  const month = now.getMonth(); // 0 = styczeń, 11 = grudzień
  const showSnow = month === 11 || month === 0;

  return (
    <>
      <IntroOverlay
        minMs={3500}
        fadeMs={700}
        storageKey="intro_seen:choose-restaurant:v2"
      />

      <main className="relative min-h-[100svh] text-white">
        <SeasonalSnow enabled={showSnow} />

        {/* tło */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="/assets/bg-sushi.jpg"
            alt=""
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/75" />
        </div>

        {/* Wspólny layout mobile + desktop */}
        <div className="min-h-[100svh] flex flex-col items-center justify-center px-6 py-20">
          {/* Logo */}
          <div className="relative w-20 h-20 md:w-28 md:h-28">
            <Image 
              src="/assets/logo.png" 
              alt="SUSHI Tutaj" 
              fill
              className="object-contain"
              priority 
            />
          </div>
          
          {/* Tytuł */}
          <h1 className="mt-8 text-2xl md:text-4xl text-center leading-tight tracking-wide">
            WYBIERZ MIASTO
          </h1>
          <p className="mt-2 text-white/50 text-sm md:text-base">
            i zamów świeże sushi
          </p>

          {/* Przyciski */}
          <div className="mt-10 w-full max-w-xs md:max-w-none md:w-auto flex flex-col md:flex-row gap-3 md:gap-4">
            {picked.slice(0, 3).map((r) => {
              const label = r.city_name || r.name || r.slug;
              const slug = normSlug(r.slug);
              return (
                <Link
                  key={slug}
                  href={`/${encodeURIComponent(slug)}?slug=${encodeURIComponent(slug)}`}
                  prefetch={false}
                  className="btn-primary w-full md:w-auto md:min-w-[160px] text-center py-4 md:py-3"
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* SEO tekst */}
          <p className="mt-14 text-white/25 text-[11px] md:text-xs max-w-md text-center leading-relaxed">
            Futomaki, hosomaki, california, nigiri – dostawa i odbiór osobisty
          </p>
        </div>

        <RotatingPlate />
      </main>
    </>
  );
}
