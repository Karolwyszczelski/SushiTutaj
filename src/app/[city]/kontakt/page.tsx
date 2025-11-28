// src/app/[city]/kontakt/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getRestaurantBySlug } from "@/lib/tenant";
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Instagram,
  Facebook,
  ExternalLink,
  Music,
} from "lucide-react";

type Route = "/[city]/kontakt";

type OpeningHours = {
  mon_thu?: { open: string; close: string } | null;
  fri_sat?: { open: string; close: string } | null;
  sun?: { open: string; close: string } | null;
};

export async function generateMetadata(
  { params }: PageProps<Route>
): Promise<Metadata> {
  const { city } = await params;
  const r = await getRestaurantBySlug(city);

  const title = r ? `Kontakt — ${r.name} ${r.city}` : "Kontakt";
  const description = r
    ? `Kontakt do ${r.name} w mieście ${r.city}. Telefon, adres, godziny otwarcia i linki społecznościowe.`
    : "Dane kontaktowe";

  return { title, description };
}

export default async function Page(
  { params }: PageProps<Route>
) {
  const { city } = await params;
  const r = await getRestaurantBySlug(city);

  if (!r) {
    return <main className="px-6 py-24 text-center">Lokal nieaktywny.</main>;
  }

  const oh = (r.opening_hours as OpeningHours | null) ?? null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-24">
      <header className="text-center">
        <h1 className="font-display text-4xl sm:text-6xl">Kontakt — {r.city}</h1>
        <p className="mt-3 text-white/80">
          Telefon, adres, godziny i nasze profile. Dane zmieniają się automatycznie
          dla każdego miasta.
        </p>
      </header>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        {/* Karta: Adres */}
        <div className="rounded-2xl border border-white/10 bg-black/50 backdrop-blur p-6">
          <div className="flex items-start gap-3">
            <MapPin className="h-6 w-6 shrink-0" />
            <div>
              <div className="text-sm uppercase text-white/60">Adres</div>
              <div className="mt-1 text-lg font-medium text-white">{r.address ?? "—"}</div>
              <div className="mt-4">
                <Link
                  href={r.maps_url || "#"}
                  target={r.maps_url ? "_blank" : undefined}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
                >
                  Zobacz na mapie <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Karta: Kontakt */}
        <div className="rounded-2xl border border-white/10 bg-black/50 backdrop-blur p-6">
          <div className="flex items-start gap-3">
            <Phone className="h-6 w-6 shrink-0" />
            <div>
              <div className="text-sm uppercase text-white/60">Telefon</div>
              <div className="mt-1 text-lg font-medium">
                <Link href={r.phone ? `tel:${r.phone}` : "#"}>{r.phone ?? "—"}</Link>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Mail className="h-5 w-5 text-white/70" />
                <Link
                  href={r.email ? `mailto:${r.email}` : "#"}
                  className="text-white/90"
                >
                  {r.email ?? "—"}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Karta: Godziny */}
        <div className="rounded-2xl border border-white/10 bg-black/50 backdrop-blur p-6">
          <div className="flex items-start gap-3">
            <Clock className="h-6 w-6 shrink-0" />
            <div>
              <div className="text-sm uppercase text-white/60">Godziny otwarcia</div>
              <ul className="mt-2 space-y-1 text-white/90">
                <li>
                  Pon–Czw:{" "}
                  {oh?.mon_thu ? `${oh.mon_thu.open}–${oh.mon_thu.close}` : "—"}
                </li>
                <li>
                  Pt–Sob:{" "}
                  {oh?.fri_sat ? `${oh.fri_sat.open}–${oh.fri_sat.close}` : "—"}
                </li>
                <li>
                  Nd: {oh?.sun ? `${oh.sun.open}–${oh.sun.close}` : "—"}
                </li>
              </ul>
              <p className="mt-3 text-sm text-white/60">
                Zamówienia: tylko gotówka, odbiór lub dostawa.
              </p>
            </div>
          </div>
        </div>

        {/* Karta: Social */}
        <div className="rounded-2xl border border-white/10 bg-black/50 backdrop-blur p-6">
          <div className="text-sm uppercase text-white/60">Znajdź nas</div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link
              aria-label="Instagram"
              href={r.instagram_url || "#"}
              target={r.instagram_url ? "_blank" : undefined}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 hover:bg-white/10"
            >
              <Instagram className="h-5 w-5" /> Instagram
            </Link>
            <Link
              aria-label="Facebook"
              href={r.facebook_url || "#"}
              target={r.facebook_url ? "_blank" : undefined}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 hover:bg-white/10"
            >
              <Facebook className="h-5 w-5" /> Facebook
            </Link>
            <Link
              aria-label="TikTok"
              href={r.tiktok_url || "#"}
              target={r.tiktok_url ? "_blank" : undefined}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 hover:bg-white/10"
            >
              <Music className="h-5 w-5" /> TikTok
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
