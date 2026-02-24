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
          {/* desktop: gradient from left dark → right transparent to show photo */}
          <div className="absolute inset-0 bg-black/80 md:bg-gradient-to-r md:from-black/90 md:via-black/75 md:to-black/50" />
        </div>

        {/* ═══ MOBILE layout ═══ */}
        <div className="md:hidden min-h-[100svh] flex flex-col px-6">
          <div className="flex-1 min-h-[60px]" />

          <div className="flex flex-col items-center">
            <div className="relative w-12 h-12 mb-10">
              <Image src="/assets/logo.png" alt="SUSHI Tutaj" fill className="object-contain" priority />
            </div>
            <h1 className="sr-only">Wybierz miasto – SUSHI Tutaj</h1>
            <p className="text-white/90 text-[17px] font-medium mb-1 text-center">Gdzie zamawiamy?</p>
            <p className="text-white/30 text-[13px] mb-7 text-center">Wybierz swoje miasto</p>

            <nav className="w-full max-w-[320px] flex flex-col gap-2">
              {picked.slice(0, 3).map((r, i) => {
                const cityOnly = (r.city_name || r.name || r.slug).replace(/^Sushi Tutaj\s*/i, "");
                const slug = normSlug(r.slug);
                return (
                  <Link
                    key={slug}
                    href={`/${encodeURIComponent(slug)}?slug=${encodeURIComponent(slug)}`}
                    prefetch={false}
                    className="group flex items-center gap-3.5 w-full rounded-2xl py-4 px-4 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.97] transition-all duration-200"
                  >
                    <div className="w-2 h-2 rounded-full bg-[#c41e1e] shrink-0 group-hover:scale-125 transition-transform" />
                    <span className="text-[16px] font-semibold text-white/85 group-hover:text-white transition-colors flex-1">{cityOnly}</span>
                    <svg className="w-4 h-4 text-white/15 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex-1 min-h-[60px]" />
          <div className="pb-8 flex justify-center">
            <p className="text-white/[0.08] text-[10px] tracking-wider">sushitutaj.pl</p>
          </div>
        </div>

        {/* ═══ DESKTOP layout — left-aligned with visible photo right ═══ */}
        <div className="hidden md:flex min-h-[100svh] items-center">
          <div className="w-full max-w-[520px] pl-[8vw] xl:pl-[12vw] py-16 shrink-0">
            {/* Logo */}
            <div className="relative w-16 h-16 mb-12">
              <Image src="/assets/logo.png" alt="SUSHI Tutaj" fill className="object-contain" priority />
            </div>

            <h1 className="sr-only">Wybierz miasto – SUSHI Tutaj</h1>

            <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-3">
              Zamów online
            </p>
            <h2
              className="text-[32px] xl:text-[38px] font-bold text-white leading-tight mb-2"
              style={{ fontFamily: "var(--font-display), serif" }}
            >
              Wybierz swoje miasto
            </h2>
            <p className="text-white/40 text-[15px] leading-relaxed mb-10 max-w-[360px]">
              Dostawa i odbiór osobisty. Świeże sushi prosto do Twoich drzwi.
            </p>

            {/* City cards — stacked on desktop, larger */}
            <nav className="flex flex-col gap-2">
              {picked.slice(0, 3).map((r) => {
                const cityOnly = (r.city_name || r.name || r.slug).replace(/^Sushi Tutaj\s*/i, "");
                const slug = normSlug(r.slug);
                return (
                  <Link
                    key={slug}
                    href={`/${encodeURIComponent(slug)}?slug=${encodeURIComponent(slug)}`}
                    prefetch={false}
                    className="group flex items-center gap-4 rounded-xl py-4 px-5
                               bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.08]
                               active:scale-[0.99] transition-all duration-200"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#c41e1e]/10 group-hover:bg-[#c41e1e]/20 flex items-center justify-center shrink-0 transition-colors">
                      <svg className="w-[18px] h-[18px] text-[#c41e1e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[17px] font-semibold text-white/90 group-hover:text-white transition-colors">{cityOnly}</p>
                      <p className="text-[12px] text-white/30 mt-0.5">Dostawa i odbiór osobisty</p>
                    </div>
                    <svg className="w-5 h-5 text-white/15 group-hover:text-white/40 group-hover:translate-x-1 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                );
              })}
            </nav>

            {/* Subtle footer */}
            <p className="mt-16 text-white/[0.12] text-[11px]">
              © {new Date().getFullYear()} sushitutaj.pl
            </p>
          </div>

          {/* Rotating plate — right side */}
          <div className="flex-1 flex items-center justify-center">
            <RotatingPlate />
          </div>
        </div>
      </main>
    </>
  );
}
