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
          <div className="absolute inset-0 bg-black/80" />
        </div>

        <div className="min-h-[100svh] flex flex-col px-6 md:px-8">
          {/* Spacer top */}
          <div className="flex-1 min-h-[80px]" />

          {/* Center block */}
          <div className="flex flex-col items-center">
            {/* Logo */}
            <div className="relative w-14 h-14 md:w-24 md:h-24">
              <Image 
                src="/assets/logo.png" 
                alt="SUSHI Tutaj" 
                fill
                className="object-contain"
                priority 
              />
            </div>
            
            {/* Tagline */}
            <p className="mt-6 text-[11px] text-white/25 tracking-[0.25em] uppercase font-medium">
              Zamów świeże sushi
            </p>
            <h1 className="sr-only">Wybierz miasto – SUSHI Tutaj</h1>

            {/* Divider */}
            <div className="mt-4 w-8 h-px bg-white/[0.12]" />

            {/* City list */}
            <nav className="mt-8 w-full max-w-[300px] md:max-w-none md:w-auto flex flex-col md:flex-row gap-2.5 md:gap-3">
              {picked.slice(0, 3).map((r) => {
                const cityOnly = (r.city_name || r.name || r.slug).replace(/^Sushi Tutaj\s*/i, "");
                const slug = normSlug(r.slug);
                return (
                  <Link
                    key={slug}
                    href={`/${encodeURIComponent(slug)}?slug=${encodeURIComponent(slug)}`}
                    prefetch={false}
                    className="group flex items-center gap-4 w-full md:w-auto md:min-w-[180px]
                               rounded-xl py-3.5 px-5
                               bg-white/[0.05] border border-white/[0.07]
                               hover:bg-white/[0.09] hover:border-white/[0.12]
                               active:scale-[0.98] transition-all duration-200"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#c41e1e]/20 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-[#e85d5d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-white/90 leading-tight">{cityOnly}</p>
                      <p className="text-[11px] text-white/30 mt-0.5">Dostawa i odbiór</p>
                    </div>
                    <svg className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Spacer bottom */}
          <div className="flex-1 min-h-[60px]" />

          {/* Footer */}
          <div className="pb-8 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-px bg-white/[0.08]" />
              <span className="text-white/10 text-[9px] tracking-[0.2em] uppercase">鮨</span>
              <div className="w-5 h-px bg-white/[0.08]" />
            </div>
            <p className="text-white/15 text-[9px] md:text-[10px] text-center tracking-wider">
              Futomaki · Hosomaki · California · Nigiri
            </p>
          </div>
        </div>

        <RotatingPlate />
      </main>
    </>
  );
}
