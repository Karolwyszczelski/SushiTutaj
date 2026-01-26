// src/app/[city]/kontakt/page.tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
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

type OpeningHours = {
  mon_thu?: { open: string; close: string } | null;
  fri_sat?: { open: string; close: string } | null;
  sun?: { open: string; close: string } | null;
};

type SocialItem = {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
};

function sanitizeTel(phone?: string | null) {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.length ? cleaned : null;
}

function normalizeUrl(url?: string | null) {
  const s = (url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function Row({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 py-4">
      <div className="mt-0.5 shrink-0 text-white/70">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
          {label}
        </div>
        <div className="mt-1 text-sm text-white/90">{children}</div>
      </div>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const r = await getRestaurantBySlug(city);

  const title = r ? `Kontakt — ${r.name} ${r.city}` : "Kontakt";
  const description = r
    ? `Kontakt do ${r.name} w mieście ${r.city}. Telefon, adres, godziny otwarcia oraz linki do profili społecznościowych.`
    : "Dane kontaktowe restauracji.";

  return { title, description };
}

export default async function Page({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const r = await getRestaurantBySlug(city);

  if (!r) {
    return <main className="px-6 py-24 text-center">Lokal nieaktywny.</main>;
  }

  const oh = (r.opening_hours as OpeningHours | null) ?? null;

  const tel = sanitizeTel(r.phone);
  const mail = r.email?.trim() || null;

  const mapsHref =
    (r.maps_url && r.maps_url.trim()) ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      (r.address && r.address.trim()) ||
        `${r.name ?? "Restauracja"} ${r.city ?? city}`
    )}`;

  const social: SocialItem[] = [
    {
      key: "instagram",
      label: "Instagram",
      href: normalizeUrl(r.instagram_url),
      icon: <Instagram className="h-5 w-5" />,
    },
    {
      key: "facebook",
      label: "Facebook",
      href: normalizeUrl(r.facebook_url),
      icon: <Facebook className="h-5 w-5" />,
    },
    {
      key: "tiktok",
      label: "TikTok",
      href: normalizeUrl(r.tiktok_url),
      icon: <Music className="h-5 w-5" />,
    },
  ].filter((x) => Boolean(x.href));

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      {/* Header */}
      <header className="max-w-3xl">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
          Kontakt
        </div>
        <h1 className="mt-2 font-display text-4xl text-white sm:text-6xl">
          {r.name} <span className="text-white/60">— {r.city}</span>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
          Dane kontaktowe są przypisane do miasta i aktualizują się automatycznie
          dla każdego lokalu.
        </p>
      </header>

      {/* Content */}
      <section className="mt-10 grid gap-8 lg:grid-cols-3">
        {/* LEFT */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur sm:p-8">
            <div className="text-sm font-semibold text-white">Dane lokalu</div>

            <div className="mt-4 divide-y divide-white/10">
              <Row icon={<MapPin className="h-5 w-5" />} label="Adres">
                <div className="flex flex-col gap-2">
                  <div className="text-base font-medium text-white">
                    {r.address ?? "—"}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                    >
                      Nawiguj <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </Row>

              <Row icon={<Phone className="h-5 w-5" />} label="Telefon">
                {tel ? (
                  <a
                    href={`tel:${tel}`}
                    className="text-base font-medium text-white hover:underline"
                  >
                    {r.phone}
                  </a>
                ) : (
                  <span>—</span>
                )}
              </Row>

              <Row icon={<Mail className="h-5 w-5" />} label="E-mail">
                {mail ? (
                  <a
                    href={`mailto:${mail}`}
                    className="text-base font-medium text-white hover:underline"
                  >
                    {mail}
                  </a>
                ) : (
                  <span>—</span>
                )}
              </Row>

              <Row icon={<Clock className="h-5 w-5" />} label="Godziny otwarcia">
                <div className="grid gap-2 text-sm text-white/85 sm:max-w-md">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-white/60">Pon–Czw</span>
                    <span className="font-medium">
                      {oh?.mon_thu
                        ? `${oh.mon_thu.open}–${oh.mon_thu.close}`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-white/60">Pt–Sob</span>
                    <span className="font-medium">
                      {oh?.fri_sat
                        ? `${oh.fri_sat.open}–${oh.fri_sat.close}`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-white/60">Niedziela</span>
                    <span className="font-medium">
                      {oh?.sun ? `${oh.sun.open}–${oh.sun.close}` : "—"}
                    </span>
                  </div>
                </div>
              </Row>
            </div>
          </div>

          {/* CTA strip */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <a
              href={tel ? `tel:${tel}` : undefined}
              aria-disabled={!tel}
              className={`rounded-xl border border-white/10 px-5 py-4 text-left ${
                tel
                  ? "bg-white/5 hover:bg-white/10"
                  : "pointer-events-none bg-white/5 opacity-50"
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                Zadzwoń
              </div>
              <div className="mt-1 text-base font-semibold text-white">
                {r.phone ?? "—"}
              </div>
            </a>

            <a
              href={mail ? `mailto:${mail}` : undefined}
              aria-disabled={!mail}
              className={`rounded-xl border border-white/10 px-5 py-4 text-left ${
                mail
                  ? "bg-white/5 hover:bg-white/10"
                  : "pointer-events-none bg-white/5 opacity-50"
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                Napisz e-mail
              </div>
              <div className="mt-1 truncate text-base font-semibold text-white">
                {mail ?? "—"}
              </div>
            </a>

            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-left hover:bg-white/10"
            >
              <div className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                Dojazd
              </div>
              <div className="mt-1 text-base font-semibold text-white">
                Otwórz mapy <span className="text-white/60">↗</span>
              </div>
            </a>
          </div>
        </div>

        {/* RIGHT */}
        <aside className="space-y-6 lg:col-span-1">
          <div className="rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur">
            <div className="text-sm font-semibold text-white">Social media</div>
            <p className="mt-2 text-sm text-white/70">
              Aktualności, promocje i kulisy.
            </p>

            <div className="mt-4 space-y-2">
              {social.length ? (
                social.map((s) => (
                  <a
                    key={s.key}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white hover:bg-white/10"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="text-white/70">{s.icon}</span>
                      <span className="font-semibold">{s.label}</span>
                    </span>
                    <ExternalLink className="h-4 w-4 text-white/60" />
                  </a>
                ))
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                  Brak linków społecznościowych dla tego lokalu.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur">
            <div className="text-sm font-semibold text-white">Informacje</div>
            <div className="mt-3 space-y-2 text-sm text-white/75">
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/55">Miasto</span>
                <span className="font-medium text-white/90">
                  {r.city ?? city}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/55">Adres</span>
                <span className="text-right font-medium text-white/90">
                  {r.address ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
