import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import RotatingPlate from "@/components/RotatingPlate";
import { listActiveRestaurants } from "@/lib/tenant";
import SeasonalSnow from "@/components/SeasonalSnow";
import AuthToast from "@/components/AuthToast";
import ResetPasswordToast from "@/components/ResetPasswordToast";

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

const ACCENT =
  "bg-gradient-to-b from-[#b31217] to-[#7a0b0b] text-white ring-1 ring-black/30 shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] hover:[filter:brightness(1.06)] active:[filter:brightness(0.96)]";

export default async function Page() {
  const restaurants = (await listActiveRestaurants()) || [];

  // preferowana kolejność; fallback do pierwszych dostępnych
  const preferred = ["ciechanow", "przasnysz", "szczytno"];
  const bySlug = new Map(
    restaurants.map((r: any) => [String(r.slug || "").toLowerCase(), r])
  );

  const picked: any[] = preferred
    .map((s) => bySlug.get(s))
    .filter(Boolean) as any[];

  for (const r of restaurants as any[]) {
    if (picked.length >= 3) break;
    if (!picked.find((x) => x.slug === r.slug)) picked.push(r);
  }

  // lekka logika sezonowa – śnieg w grudniu i styczniu
  const now = new Date();
  const month = now.getMonth(); // 0 = styczeń, 11 = grudzień
  const showSnow = month === 11 || month === 0;

  return (
    <>
      {/* popup po udanej rejestracji / aktywacji konta */}
      <AuthToast />
      <ResetPasswordToast />

      <main className="relative min-h-[100svh] pt-28 pb-16 text-white">
        {/* śnieg (overlay, nie blokuje kliknięć) */}
        <SeasonalSnow enabled={showSnow} />

        {/* tło */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="/assets/bg-sushi.jpg"
            alt="Tło strony wyboru restauracji SUSHI Tutaj – kawałki sushi na talerzu"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/65" />
        </div>

        {/* nagłówek */}
        <section className="px-5 text-center">
          <h1 className="text-4xl sm:text-6xl leading-tight">
            Wybierz restaurację
          </h1>
          <p className="mt-3 text-white/80 max-w-xl mx-auto text-sm sm:text-base">
            Wybierz najbliższy lokal i zamów sushi online. Pokażemy aktualne
            menu, godziny otwarcia oraz dostępność dostawy w Twoim mieście.
          </p>
        </section>

        {/* przyciski miast */}
        <section className="mt-12 px-5">
          {picked.length === 0 ? (
            <p className="mx-auto max-w-xl text-center text-sm text-white/70">
              Aktualnie brak aktywnych restauracji w systemie. Spróbuj ponownie
              za chwilę lub skontaktuj się z obsługą lokalu.
            </p>
          ) : (
            <div className="mx-auto grid max-w-3xl grid-cols-1 sm:grid-cols-3 gap-3">
              {picked.slice(0, 3).map((r) => {
                const label = r.city_name || r.name || r.slug;
                const slug = String(r.slug || "").toLowerCase();
                return (
                  <Link
                    key={slug}
                    href={`/${encodeURIComponent(slug)}?slug=${encodeURIComponent(
                      slug
                    )}`}
                    prefetch={false}
                    className={`block rounded-3xl px-3 py-2.5 text-center text-sm sm:text-base ${ACCENT}`}
                    aria-label={`Przejdź do restauracji SUSHI Tutaj w mieście ${label} – menu i zamówienia online`}
                  >
                    <span className="block text-base sm:text-lg font-semibold">
                      {label}
                    </span>
                    <span className="block text-xs sm:text-sm opacity-80 mt-0.5">
                      Zobacz menu i złóż zamówienie online
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* opis SEO */}
        <section className="mt-8 px-5">
          <p className="text-center text-white/65 text-xs sm:text-sm max-w-2xl mx-auto leading-relaxed">
            SUSHI Tutaj to sieć restauracji sushi, w której zamówisz świeże
            futomaki, hosomaki, california i nigiri na wynos lub z dostawą.
            Wybierz swój lokal, sprawdź menu online i zamów sushi prosto do domu
            lub do pracy. Płatność odbywa się wygodnie gotówką przy dostawie lub
            odbiorze.
          </p>
        </section>

        {/* dekoracja */}
        <RotatingPlate />
      </main>
    </>
  );
}
