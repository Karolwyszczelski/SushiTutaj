// src/components/mobile/MobileHeroView.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useMobileNavStore } from "@/store/mobileNavStore";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

interface MobileHeroViewProps {
  onGoToMenu: () => void;
}

// ─── Typy ────────────────────────────────────────────────────
type OpeningHours = {
  mon_thu?: { open: string; close: string };
  fri_sat?: { open: string; close: string };
  sun?: { open: string; close: string };
};

type RestaurantInfo = {
  name: string;
  city: string;
  phone: string | null;
  opening_hours: OpeningHours | null;
};

type SomRow = {
  name: string | null;
  promo_price_cents: number | null;
  image_url: string | null;
  product_id: string | null;
};

type ProductPrice = {
  price_cents: number | null;
  price: number | string | null;
};

// ─── Copy per miasto ─────────────────────────────────────────
const CITY_COPY: Record<string, { headline: string; sub: string }> = {
  default: {
    headline: "Świeże sushi\nna wyciągnięcie ręki",
    sub: "Wybierz miasto i przejdź do menu",
  },
  ciechanow: {
    headline: "Świeże sushi\nw Ciechanowie",
    sub: "Maki · Nigiri · Sashimi · Zestawy",
  },
  przasnysz: {
    headline: "Świeże sushi\nw Przasnyszu",
    sub: "Przygotowane na miejscu, z pasją",
  },
  szczytno: {
    headline: "Świeże sushi\nw Szczytnie",
    sub: "Autentyczny smak Japonii",
  },
};

// ─── Helpers ─────────────────────────────────────────────────
function getTodayHours(oh: OpeningHours | null): { open: string; close: string } | null {
  if (!oh) return null;
  const day = new Date().getDay(); // 0=Sun
  if (day === 0) return oh.sun ?? null;
  if (day >= 5) return oh.fri_sat ?? null; // Fri=5, Sat=6
  return oh.mon_thu ?? null;
}

function isOpenNow(oh: OpeningHours | null): boolean {
  const slot = getTodayHours(oh);
  if (!slot) return false;
  try {
    const now = new Date();
    const warsawTime = new Intl.DateTimeFormat("pl-PL", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const hh = Number(warsawTime.find((p) => p.type === "hour")?.value ?? "0");
    const mm = Number(warsawTime.find((p) => p.type === "minute")?.value ?? "0");
    const nowMin = hh * 60 + mm;

    const [oH, oM] = slot.open.split(":").map(Number);
    const [cH, cM] = slot.close.split(":").map(Number);
    const openMin = oH * 60 + oM;
    const closeMin = cH * 60 + cM;

    return nowMin >= openMin && nowMin < closeMin;
  } catch {
    return false;
  }
}

// ─── Component ───────────────────────────────────────────────
export default function MobileHeroView({ onGoToMenu }: MobileHeroViewProps) {
  const params = useParams<{ city?: string }>();
  const city = (params?.city || "default").toLowerCase();
  const copy = CITY_COPY[city] ?? CITY_COPY.default;
  const setActiveTab = useMobileNavStore((s) => s.setActiveTab);

  // ── Dane restauracji (godziny, telefon) ──
  const [info, setInfo] = useState<RestaurantInfo | null>(null);
  const [somName, setSomName] = useState<string | null>(null);
  const [somPrice, setSomPrice] = useState<number | null>(null);
  const [somImg, setSomImg] = useState<string | null>(null);

  const supabase = useMemo(() => getSupabaseBrowser(), []);

  useEffect(() => {
    let cancelled = false;
    const slug =
      city !== "default"
        ? city
        : typeof window !== "undefined"
          ? window.location.pathname.split("/").filter(Boolean)[0] ?? null
          : null;

    if (!slug) return;

    (async () => {
      // 1. Restaurant info
      const { data: r } = await supabase
        .from("restaurants")
        .select("id, name, city, phone, opening_hours")
        .eq("slug", slug)
        .maybeSingle();

      if (cancelled || !r) return;
      setInfo({
        name: r.name,
        city: r.city,
        phone: r.phone,
        opening_hours: r.opening_hours as OpeningHours | null,
      });

      // 2. Zestaw miesiąca (aktywny)
      const today = new Date().toISOString().slice(0, 10);
      const { data: som } = await supabase
        .from("sushi_of_month")
        .select("name, promo_price_cents, image_url, product_id")
        .eq("restaurant_id", r.id)
        .eq("is_active", true)
        .lte("starts_on", today)
        .or(`ends_on.gte.${today},ends_on.is.null`)
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle<SomRow>();

      if (cancelled) return;

      if (som) {
        setSomName(som.name ?? "Zestaw Miesiąca");
        setSomImg(som.image_url);

        // Cena: promo_price_cents z SOM lub cena produktu
        if (som.promo_price_cents) {
          setSomPrice(som.promo_price_cents / 100);
        } else if (som.product_id) {
          const { data: prod } = await supabase
            .from("products")
            .select("price_cents, price")
            .eq("id", som.product_id)
            .maybeSingle<ProductPrice>();
          if (!cancelled && prod) {
            if (typeof prod.price_cents === "number") setSomPrice(prod.price_cents / 100);
            else if (prod.price != null) {
              const n = parseFloat(String(prod.price).replace(",", "."));
              if (Number.isFinite(n)) setSomPrice(n);
            }
          }
        }
      }
    })();

    return () => { cancelled = true; };
  }, [city, supabase]);

  const todaySlot = getTodayHours(info?.opening_hours ?? null);
  const openNow = isOpenNow(info?.opening_hours ?? null);

  const goToSet = () => setActiveTab("set");

  // Miesiąc po polsku
  const monthLabel = useMemo(() => {
    const m = new Date().toLocaleDateString("pl-PL", { month: "long" });
    return m.charAt(0).toUpperCase() + m.slice(1);
  }, []);

  return (
    <div className="relative flex flex-col min-h-full bg-[#0b0b0b] overflow-hidden">

      {/* ── Tło: hero image z overlay ── */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/assets/hero-mobile.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center opacity-40 scale-110"
          priority
        />
        {/* Gradient overlay — ciemny dół, lekko transparentna góra */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b0b0b]/60 via-[#0b0b0b]/40 to-[#0b0b0b]" />
        {/* Subtelna tekstura japońska (sashiko-inspired) via repeating pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle, #fff 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      {/* ── Górna sekcja: logo + status ── */}
      <div
        className="relative z-10 flex flex-col items-center"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
      >
        {/* Logo */}
        <div className="relative w-[72px] h-[72px] hero-stagger hero-stagger-1">
          <Image
            src="/assets/logo.png"
            alt="Sushi Tutaj"
            fill
            sizes="72px"
            className="object-contain drop-shadow-lg"
            priority
          />
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-2 mt-4 hero-stagger hero-stagger-2">
          {/* Otwarte / Zamknięte */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase ${
              openNow
                ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20"
                : "bg-red-500/15 text-red-400 ring-1 ring-red-500/20"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${openNow ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
            {openNow ? "Otwarte" : "Zamknięte"}
          </div>

          {/* Godziny */}
          {todaySlot && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] text-[11px] text-white/50 font-medium ring-1 ring-white/[0.06]">
              <svg className="w-3 h-3 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {todaySlot.open}–{todaySlot.close}
            </div>
          )}
        </div>
      </div>

      {/* ── Headline ── */}
      <div className="relative z-10 flex-1 flex flex-col justify-center items-center px-8 py-8 hero-stagger hero-stagger-3">
        <h1
          className="text-[28px] leading-[1.15] font-bold text-center text-white whitespace-pre-line"
          style={{ fontFamily: "var(--font-display), serif" }}
        >
          {copy.headline}
        </h1>
        <p className="mt-3 text-[13px] text-white/40 text-center tracking-wide">
          {copy.sub}
        </p>

        {/* Delikatna linia dekoracyjna — chopstick divider */}
        <div className="flex items-center gap-3 mt-6">
          <div className="w-8 h-px bg-gradient-to-r from-transparent to-white/20" />
          <span className="text-white/15 text-xs">鮨</span>
          <div className="w-8 h-px bg-gradient-to-l from-transparent to-white/20" />
        </div>
      </div>

      {/* ── Zestaw Miesiąca — premium mini card ── */}
      {somName && (
        <div className="relative z-10 px-5 mb-5 hero-stagger hero-stagger-4">
          <button
            type="button"
            onClick={goToSet}
            className="group w-full relative overflow-hidden rounded-2xl active:scale-[0.98] transition-transform text-left"
          >
            {/* Background: image or fallback gradient */}
            <div className="absolute inset-0">
              {somImg ? (
                <Image
                  src={somImg}
                  alt={somName}
                  fill
                  sizes="100vw"
                  className="object-cover opacity-40 scale-105 group-active:scale-100 transition-transform duration-300"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#1a0a0a] to-[#0a0a0a]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/90 via-[#0a0a0a]/70 to-[#0a0a0a]/50" />
            </div>

            {/* Content */}
            <div className="relative flex items-center gap-4 p-4">
              {/* Thumbnail */}
              {somImg && (
                <div className="relative w-[72px] h-[72px] rounded-xl overflow-hidden ring-1 ring-white/[0.1] shrink-0">
                  <Image src={somImg} alt={somName} fill sizes="72px" className="object-cover" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-[3px] h-3 bg-[#c41e1e] rounded-full" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#c8a97e]">
                    Zestaw {monthLabel}
                  </p>
                </div>
                <p className="text-[15px] font-semibold text-white leading-snug truncate">
                  {somName}
                </p>
                {somPrice !== null && (
                  <p className="text-[15px] font-bold text-white/80 mt-1">
                    {somPrice.toFixed(0)}{" "}
                    <span className="text-[11px] font-medium text-white/40">zł</span>
                  </p>
                )}
              </div>

              {/* Arrow indicator */}
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 group-active:bg-white/[0.12] transition-colors">
                <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* Bottom accent line */}
            <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-[#c41e1e]/40 via-[#c8a97e]/20 to-transparent" />
          </button>
        </div>
      )}

      {/* ── CTA Buttons ── */}
      <div
        className="relative z-10 px-5 flex flex-col gap-2.5 hero-stagger hero-stagger-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 88px)" }}
      >
        {/* Primary: Menu */}
        <button
          type="button"
          onClick={onGoToMenu}
          className="w-full py-4 rounded-2xl font-semibold text-[15px] text-white bg-gradient-to-r from-[#b31217] via-[#a61b1b] to-[#7a0b0b] shadow-[0_8px_30px_rgba(166,27,27,0.35)] active:scale-[0.98] transition-transform"
        >
          Zobacz menu
        </button>

        {/* Secondary row */}
        <div className="flex gap-2.5">
          {/* Telefon */}
          {info?.phone && (
            <a
              href={`tel:${info.phone}`}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[13px] font-medium text-white/70 bg-white/[0.05] ring-1 ring-white/[0.08] active:bg-white/[0.08] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Zadzwoń
            </a>
          )}

          {/* Zmień miasto */}
          <a
            href="/"
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[13px] font-medium text-white/70 bg-white/[0.05] ring-1 ring-white/[0.08] active:bg-white/[0.08] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {city !== "default" ? "Zmień miasto" : "Wybierz miasto"}
          </a>
        </div>
      </div>
    </div>
  );
}
