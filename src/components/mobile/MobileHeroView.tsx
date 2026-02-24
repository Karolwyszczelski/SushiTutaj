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
  image_url?: string | null;
};

function getTodayHours(oh: OpeningHours | null): { open: string; close: string } | null {
  if (!oh) return null;
  const day = new Date().getDay();
  if (day === 0) return oh.sun ?? null;
  if (day >= 5) return oh.fri_sat ?? null;
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
    return nowMin >= oH * 60 + oM && nowMin < cH * 60 + cM;
  } catch {
    return false;
  }
}

export default function MobileHeroView({ onGoToMenu }: MobileHeroViewProps) {
  const params = useParams<{ city?: string }>();
  const city = (params?.city || "default").toLowerCase();
  const setActiveTab = useMobileNavStore((s) => s.setActiveTab);

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

        // Cena + zdjęcie: z SOM lub z powiązanego produktu
        if (som.product_id) {
          const { data: prod } = await supabase
            .from("products")
            .select("price_cents, price, image_url")
            .eq("id", som.product_id)
            .maybeSingle<ProductPrice>();
          if (!cancelled && prod) {
            setSomImg(som.image_url ?? prod.image_url ?? null);
            if (som.promo_price_cents) {
              setSomPrice(som.promo_price_cents / 100);
            } else if (typeof prod.price_cents === "number") {
              setSomPrice(prod.price_cents / 100);
            } else if (prod.price != null) {
              const n = parseFloat(String(prod.price).replace(",", "."));
              if (Number.isFinite(n)) setSomPrice(n);
            }
          } else {
            setSomImg(som.image_url);
            if (som.promo_price_cents) setSomPrice(som.promo_price_cents / 100);
          }
        } else {
          setSomImg(som.image_url);
          if (som.promo_price_cents) setSomPrice(som.promo_price_cents / 100);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [city, supabase]);

  const todaySlot = getTodayHours(info?.opening_hours ?? null);
  const openNow = isOpenNow(info?.opening_hours ?? null);

  const cityLabel = info?.city || (city !== "default" ? city.charAt(0).toUpperCase() + city.slice(1) : "");

  const statusText = openNow
    ? `Otwarte do ${todaySlot?.close ?? ""}`
    : todaySlot
      ? `Zamknięte · otwieramy ${todaySlot.open}`
      : "Sprawdź godziny";

  return (
    <div className="flex flex-col min-h-full bg-[#0b0b0b]">

      {/* ── Full-bleed photo ── */}
      <div className="relative w-full h-[56vh] min-h-[360px] max-h-[480px]">
        <Image
          src="/assets/hero-mobile.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent via-50% to-[#0b0b0b]" />
      </div>

      {/* ── Info block — directly below photo ── */}
      <div className="relative -mt-16 z-10 px-5 pb-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 100px)" }}>
        
        {/* Restaurant name + city */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="relative w-6 h-6 shrink-0">
              <Image src="/assets/logo.png" alt="" fill sizes="24px" className="object-contain" />
            </div>
            <span className="text-[12px] text-white/40 font-medium">Sushi Tutaj</span>
          </div>
          <h1
            className="text-[28px] font-bold text-white leading-none tracking-tight"
          >
            {cityLabel || "Sushi Tutaj"}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${openNow ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="text-[13px] text-white/40">{statusText}</span>
          </div>
        </div>

        {/* CTA button */}
        <button
          type="button"
          onClick={onGoToMenu}
          className="w-full py-4 rounded-xl font-semibold text-[15px] text-white bg-[#c41e1e] active:bg-[#a61b1b] active:scale-[0.98] transition-all mb-3"
        >
          Zobacz menu
        </button>

        {/* Secondary actions — inline, minimal */}
        <div className="flex items-center gap-1">
          {info?.phone && (
            <a
              href={`tel:${info.phone}`}
              className="flex-1 py-3 rounded-xl text-center text-[13px] text-white/40 font-medium active:bg-white/[0.05] transition-colors"
            >
              Zadzwoń
            </a>
          )}
          <a
            href="/"
            className="flex-1 py-3 rounded-xl text-center text-[13px] text-white/40 font-medium active:bg-white/[0.05] transition-colors"
          >
            Zmień miasto
          </a>
        </div>

        {/* SOM — simple promo strip */}
        {somName && (
          <>
            <div className="h-px bg-white/[0.06] my-4" />
            <button
              type="button"
              onClick={() => setActiveTab("set")}
              className="w-full flex items-center gap-3 py-1 active:opacity-70 transition-opacity text-left"
            >
              {somImg ? (
                <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0">
                  <Image src={somImg} alt={somName} fill sizes="48px" className="object-cover" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-lg bg-white/[0.05] shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{somName}</p>
                {somPrice !== null && (
                  <p className="text-[13px] text-white/35">{somPrice.toFixed(0)} zł</p>
                )}
              </div>
              <span className="text-[11px] text-[#c41e1e] font-semibold shrink-0">Sprawdź</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
