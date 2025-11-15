// src/components/ContactSection.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { MapPin, Phone, Mail, Clock, Instagram, Facebook } from "lucide-react";

/** TikTok jako prosty inline SVG */
function TikTokIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      width="1em"
      height="1em"
      stroke="currentColor"
      fill="currentColor"
      {...props}
    >
      <path d="M33 10.5a9 9 0 0 0 6 2v6.2a14.2 14.2 0 0 1-6-1.6V29A9.7 9.7 0 1 1 23.3 19V25.3a3.7 3.7 0 1 0 3.7 3.7V6h6v4.5z" />
    </svg>
  );
}

type Restaurant = {
  id: string;
  slug: string;
  name: string;
  city: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  maps_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  opening_hours:
    | {
        mon_thu?: { open: string; close: string };
        fri_sat?: { open: string; close: string };
        sun?: { open: string; close: string };
      }
    | null;
};

const GUTTER = "170px";

function toEmbed(url?: string | null) {
  if (!url) return "https://www.google.com/maps?q=Polska&output=embed";
  try {
    const u = new URL(url);
    if (u.hostname.includes("google.")) {
      if (!u.pathname.includes("/embed")) {
        u.pathname = u.pathname.replace("/maps", "/maps/embed");
      }
      if (!u.searchParams.has("output")) {
        u.searchParams.set("output", "embed");
      }
      return u.toString();
    }
    return `https://www.google.com/maps?q=${encodeURIComponent(url)}&output=embed`;
  } catch {
    return `https://www.google.com/maps?q=${encodeURIComponent(url)}&output=embed`;
  }
}

export default function ContactSection() {
  const { city } = useParams<{ city?: string }>();
  const [data, setData] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!city) return;
    setLoading(true);
    fetch(`/api/restaurants/${city}`)
      .then((r) => r.json())
      .then((json) => setData(json?.error ? null : json))
      .finally(() => setLoading(false));
  }, [city]);

  const oh = data?.opening_hours;

  // embed po adresie + mieście (dokładna lokalizacja), fallback na maps_url
  const embedSrc = useMemo(() => {
    if (data?.address) {
      const q = `${data.address}${data.city ? ", " + data.city : ""}, Polska`;
      return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
    }
    return toEmbed(data?.maps_url);
  }, [data?.address, data?.city, data?.maps_url]);

  const CityLabel = (data?.city ?? city?.toString() ?? "").toUpperCase();

  return (
    <section
      id="kontakt"
      className="relative w-full text-white"
      style={{
        backgroundColor: "#0b0b0b",
        ["--gutter" as any]: GUTTER,
      } as React.CSSProperties}
      aria-labelledby="contact-heading"
    >
      {/* boczne pasy */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-0"
        style={{ width: 50, background: "#0b0b0b" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-0"
        style={{ width: 50, background: "#0b0b0b" }}
      />

      {/* --- MOBILE: wszystko wyśrodkowane --- */}
      <div className="md:hidden relative z-10 px-6 py-10">
        <div className="mx-auto w-full max-w-md text-center">
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/60">
            kontakt
          </p>
          <h2
            id="contact-heading"
            className="mt-2 text-3xl font-thin tracking-tight leading-tight"
            style={{ textWrap: "balance" as any }}
          >
            Kontakt — {CityLabel || "—"}
          </h2>

          <div className="mt-6 space-y-6 text-sm">
            {/* Adres */}
            <div className="flex flex-col items-center gap-2">
              <MapPin className="h-5 w-5 text-white/80" />
              <div>
                <div className="uppercase text-[11px] tracking-wide text-white/60">
                  Adres
                </div>
                <div className="mt-1 text-white/90">
                  {loading ? (
                    <span className="inline-block h-4 w-44 animate-pulse bg-white/10 rounded" />
                  ) : (
                    data?.address ?? "—"
                  )}
                </div>
                {data?.maps_url && (
                  <a
                    href={data.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-white/70 underline hover:text-white"
                  >
                    Pokaż w Google Maps
                  </a>
                )}
              </div>
            </div>

            {/* Kontakt */}
            <div className="flex flex-col items-center gap-2">
              <Phone className="h-5 w-5 text-white/80" />
              <div>
                <div className="uppercase text-[11px] tracking-wide text-white/60">
                  Kontakt
                </div>
                <div className="mt-1 text-white/90">
                  {loading ? (
                    <span className="inline-block h-4 w-36 animate-pulse bg-white/10 rounded" />
                  ) : data?.phone ? (
                    <a href={`tel:${data.phone}`} className="hover:underline">
                      {data.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="mt-1 flex items-center justify-center gap-2 text-white/80">
                  <Mail className="h-4 w-4" />
                  {loading ? (
                    <span className="inline-block h-4 w-48 animate-pulse bg-white/10 rounded" />
                  ) : data?.email ? (
                    <a href={`mailto:${data.email}`} className="hover:underline">
                      {data.email}
                    </a>
                  ) : (
                    <span className="text-white/60">—</span>
                  )}
                </div>
              </div>
            </div>

            {/* Godziny */}
            <div className="flex flex-col items-center gap-2">
              <Clock className="h-5 w-5 text-white/80" />
              <div>
                <div className="uppercase text-[11px] tracking-wide text-white/60">
                  Godziny otwarcia
                </div>
                {loading ? (
                  <div className="mt-2 space-y-2">
                    <div className="h-3 w-52 animate-pulse rounded bg-white/10" />
                    <div className="h-3 w-48 animate-pulse rounded bg-white/10" />
                    <div className="h-3 w-44 animate-pulse rounded bg-white/10" />
                  </div>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-white/85">
                    <li>
                      Pon–Czw:{" "}
                      {oh?.mon_thu
                        ? `${oh.mon_thu.open}–${oh.mon_thu.close}`
                        : "—"}
                    </li>
                    <li>
                      Pt–Sob:{" "}
                      {oh?.fri_sat
                        ? `${oh.fri_sat.open}–${oh.fri_sat.close}`
                        : "—"}
                    </li>
                    <li>
                      Nd: {oh?.sun ? `${oh.sun.open}–${oh.sun.close}` : "—"}
                    </li>
                  </ul>
                )}
              </div>
            </div>

            {/* Social */}
            <div className="flex flex-col items-center gap-3 pt-2">
              <span className="uppercase text-[11px] tracking-wide text-white/60">
                Social
              </span>
              <div className="flex items-center justify-center gap-4">
                <a
                  aria-label="Instagram"
                  href={data?.instagram_url || "#"}
                  target={data?.instagram_url ? "_blank" : undefined}
                  rel={data?.instagram_url ? "noreferrer" : undefined}
                  className="text-white/80 hover:text-white"
                >
                  <Instagram className="h-5 w-5" />
                </a>
                <a
                  aria-label="Facebook"
                  href={data?.facebook_url || "#"}
                  target={data?.facebook_url ? "_blank" : undefined}
                  rel={data?.facebook_url ? "noreferrer" : undefined}
                  className="text-white/80 hover:text-white"
                >
                  <Facebook className="h-5 w-5" />
                </a>
                <a
                  aria-label="TikTok"
                  href={data?.tiktok_url || "#"}
                  target={data?.tiktok_url ? "_blank" : undefined}
                  rel={data?.tiktok_url ? "noreferrer" : undefined}
                  className="text-white/80 hover:text-white"
                >
                  <TikTokIcon className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>

          {/* Mapa – wyśrodkowana na mobile */}
          <div className="mt-8 flex justify-center">
            <iframe
              title="Mapa dojazdu"
              src={embedSrc}
              className="w-full max-w-md h-[280px] border-0 rounded-2xl"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </div>
      </div>

      {/* --- DESKTOP (bez zmian) --- */}
      <div
        className="hidden md:block relative z-10 mx-auto w-full max-w-7xl py-14 md:py-20"
        style={{
          paddingLeft: "var(--gutter)",
          paddingRight: "var(--gutter)",
        }}
      >
        <p className="text-[11px] uppercase tracking-[0.28em] text-white/60">
          kontakt
        </p>
        <h2
          id="contact-heading"
          className="mt-2 text-3xl sm:text-5xl font-thin tracking-tight"
          style={{ textWrap: "balance" as any }}
        >
          Kontakt — {CityLabel || "—"}
        </h2>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-6 text-sm md:text-base">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 shrink-0 text-white/80" />
              <div>
                <div className="uppercase text-[11px] tracking-wide text-white/60">
                  Adres
                </div>
                <div className="mt-1 text-white/90">
                  {loading ? (
                    <span className="inline-block h-4 w-44 animate-pulse bg-white/10 rounded" />
                  ) : (
                    data?.address ?? "—"
                  )}
                </div>
                {data?.maps_url && (
                  <a
                    href={data.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-white/70 underline hover:text-white"
                  >
                    Pokaż w Google Maps
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 shrink-0 text-white/80" />
              <div>
                <div className="uppercase text-[11px] tracking-wide text-white/60">
                  Kontakt
                </div>
                <div className="mt-1 text-white/90">
                  {loading ? (
                    <span className="inline-block h-4 w-36 animate-pulse bg-white/10 rounded" />
                  ) : data?.phone ? (
                    <a href={`tel:${data.phone}`} className="hover:underline">
                      {data.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-white/80">
                  <Mail className="h-4 w-4" />
                  {loading ? (
                    <span className="inline-block h-4 w-48 animate-pulse bg-white/10 rounded" />
                  ) : data?.email ? (
                    <a href={`mailto:${data.email}`} className="hover:underline">
                      {data.email}
                    </a>
                  ) : (
                    <span className="text-white/60">—</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 shrink-0 text-white/80" />
              <div>
                <div className="uppercase text-[11px] tracking-wide text-white/60">
                  Godziny otwarcia
                </div>
                {loading ? (
                  <div className="mt-2 space-y-2">
                    <div className="h-3 w-52 animate-pulse rounded bg-white/10" />
                    <div className="h-3 w-48 animate-pulse rounded bg-white/10" />
                    <div className="h-3 w-44 animate-pulse rounded bg-white/10" />
                  </div>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-white/85">
                    <li>
                      Pon–Czw:{" "}
                      {oh?.mon_thu
                        ? `${oh.mon_thu.open}–${oh.mon_thu.close}`
                        : "—"}
                    </li>
                    <li>
                      Pt–Sob:{" "}
                      {oh?.fri_sat
                        ? `${oh.fri_sat.open}–${oh.fri_sat.close}`
                        : "—"}
                    </li>
                    <li>
                      Nd: {oh?.sun ? `${oh.sun.open}–${oh.sun.close}` : "—"}
                    </li>
                  </ul>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <span className="uppercase text-[11px] tracking-wide text-white/60 mr-1">
                Social
              </span>
              <a
                aria-label="Instagram"
                href={data?.instagram_url || "#"}
                target={data?.instagram_url ? "_blank" : undefined}
                rel={data?.instagram_url ? "noreferrer" : undefined}
                className="text-white/80 hover:text-white"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                aria-label="Facebook"
                href={data?.facebook_url || "#"}
                target={data?.facebook_url ? "_blank" : undefined}
                rel={data?.facebook_url ? "noreferrer" : undefined}
                className="text-white/80 hover:text-white"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                aria-label="TikTok"
                href={data?.tiktok_url || "#"}
                target={data?.tiktok_url ? "_blank" : undefined}
                rel={data?.tiktok_url ? "noreferrer" : undefined}
                className="text-white/80 hover:text-white"
              >
                <TikTokIcon className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-7">
            <iframe
              title="Mapa dojazdu"
              src={embedSrc}
              className="w-full h-[360px] md:h-[520px] border-0 rounded-2xl"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
