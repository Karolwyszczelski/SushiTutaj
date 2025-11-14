import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import RotatingPlate from "@/components/RotatingPlate";
import { listActiveRestaurants } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wybierz restaurację | SUSHI Tutaj",
  description: "Wybierz miasto SUSHI Tutaj i przejdź do menu oraz zamówień.",
};

const ACCENT =
  "bg-gradient-to-b from-[#b31217] to-[#7a0b0b] text-white ring-1 ring-black/30 shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] hover:[filter:brightness(1.06)] active:[filter:brightness(0.96)]";

export default async function Page() {
  const restaurants = await listActiveRestaurants();

  // preferowana kolejność; fallback do pierwszych dostępnych
  const preferred = ["ciechanow", "przasnysz", "szczytno"];
  const bySlug = new Map(
    (restaurants || []).map((r: any) => [String(r.slug || "").toLowerCase(), r])
  );
  const picked: any[] = preferred.map((s) => bySlug.get(s)).filter(Boolean);

  for (const r of restaurants as any[]) {
    if (picked.length >= 3) break;
    if (!picked.find((x) => x.slug === r.slug)) picked.push(r);
  }

  return (
    <main className="relative min-h-[100svh] pt-28 pb-16 text-white">
      {/* tło */}
      <div className="absolute inset-0 -z-10">
        <Image src="/assets/bg-sushi.jpg" alt="" fill priority className="object-cover" />
        <div className="absolute inset-0 bg-black/65" />
      </div>

      {/* nagłówek */}
      <section className="px-5 text-center">
        <h1 className="text-4xl sm:text-6xl leading-tight">Wybierz restaurację</h1>
        <p className="mt-3 text-white/80 max-w-xl mx-auto">
          Wybierz najbliższy lokal. Pokażemy menu, godziny i dostępność dostawy.
        </p>
      </section>

      {/* przyciski miast */}
      <section className="mt-8 px-5">
        <div className="mx-auto grid max-w-3xl grid-cols-1 sm:grid-cols-3 gap-3">
          {picked.slice(0, 3).map((r) => {
            const label = r.city_name || r.name || r.slug;
            const slug = String(r.slug || "").toLowerCase();
            return (
              <Link
                key={slug}
                href={`/${encodeURIComponent(slug)}?slug=${encodeURIComponent(slug)}`}
                prefetch={false}
                className={`block rounded-xl px-6 py-4 text-center ${ACCENT}`}
              >
                <span className="block text-lg font-semibold">{label}</span>
                <span className="block text-sm opacity-80">Zobacz menu</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* opis SEO */}
      <p className="mt-8 px-5 text-center text-white/65 text-sm max-w-2xl mx-auto">
        SUSHI Tutaj — świeże rolki, bowle i przystawki. Płatność gotówką przy odbiorze lub dostawie.
      </p>

      {/* dekoracja */}
      <RotatingPlate />
    </main>
  );
}
