// src/components/mobile/MobileSetView.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ShoppingCart, Sparkles, Star, Check } from "lucide-react";
import useCartStore from "@/store/cartStore";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import clsx from "clsx";

type SomRow = {
  id: string;
  name: string | null;
  description: string | null;
  product_id: string | null;
  image_url: string | null;
  promo_price_cents: number | null;
  restaurant_id: string;
  starts_on: string;
  ends_on: string | null;
  is_active?: boolean | null;
};

type ProductRow = {
  id: string;
  name: string;
  price: number | string | null;
  price_cents?: number | null;
  description?: string | null;
  image_url?: string | null;
};

type RestaurantIdRow = {
  id: string;
  slug?: string | null;
};

const gradBtn =
  "inline-flex items-center justify-center gap-2.5 rounded-2xl px-8 py-4 " +
  "font-semibold text-base text-white bg-gradient-to-r from-[#b31217] via-[#a61b1b] to-[#7a0b0b] " +
  "shadow-[0_8px_30px_rgba(166,27,27,0.4)] " +
  "hover:shadow-[0_12px_40px_rgba(166,27,27,0.5)] hover:scale-[1.02] " +
  "active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

export default function MobileSetView() {
  const supabase = getSupabaseBrowser();
  const { addItem } = useCartStore();

  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(false);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [img, setImg] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [pieces, setPieces] = useState<number | null>(null);
  const [productName, setProductName] = useState("");
  const [productId, setProductId] = useState<string | null>(null);

  const monthLabel = useMemo(() => {
    const m = new Date().toLocaleDateString("pl-PL", { month: "long" });
    return m.charAt(0).toUpperCase() + m.slice(1);
  }, []);

  const parseSomDescription = (input?: string | null) => {
    const raw = String(input ?? "").replace(/\r/g, "").trim();
    if (!raw) return { header: null as string | null, items: [] as string[] };

    const parts = raw
      .split(/\n|•/g)
      .map((p) => p.trim())
      .filter(Boolean);

    if (!parts.length) return { header: null, items: [] };

    let header: string | null = null;
    let items = parts;

    if (parts.length > 1 && /(szt|zł)/i.test(parts[0])) {
      header = parts[0];
      items = parts.slice(1);
    }

    items = items
      .map((x) => x.replace(/^[\-•\u2022]+/, "").trim())
      .filter(Boolean);

    return { header, items };
  };

  const parsedDesc = useMemo(() => parseSomDescription(desc), [desc]);

  useEffect(() => {
    let cancelled = false;

    const readLocalSlug = () => {
      if (typeof window === "undefined") return null;
      try {
        const path = window.location.pathname || "";
        const segments = path.split("/").filter(Boolean);
        if (segments.length > 0) return segments[0];
      } catch {}
      return null;
    };

    const today = new Date().toISOString().slice(0, 10);

    (async () => {
      setLoading(true);

      let restaurantId: string | null = null;
      const slug = readLocalSlug();

      if (slug) {
        const { data: r } = await supabase
          .from("restaurants")
          .select("id,slug")
          .eq("slug", slug)
          .maybeSingle<RestaurantIdRow>();
        restaurantId = r?.id ?? null;
      }

      if (!restaurantId) {
        const { data: rFirst } = await supabase
          .from("restaurants")
          .select("id")
          .limit(1)
          .maybeSingle<RestaurantIdRow>();
        restaurantId = rFirst?.id ?? null;
      }

      if (!restaurantId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: som, error: somErr } = await supabase
        .from("sushi_of_month")
        .select(
          "id,name,description,product_id,image_url,promo_price_cents,restaurant_id,starts_on,ends_on,is_active"
        )
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .lte("starts_on", today)
        .or(`ends_on.gte.${today},ends_on.is.null`)
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle<SomRow>();

      if (cancelled) return;

      if (somErr || !som) {
        setLoading(false);
        return;
      }

      let prodRow: ProductRow | null = null;
      if (som.product_id) {
        const { data } = await supabase
          .from("products")
          .select("id,name,price,price_cents,description,image_url")
          .eq("id", som.product_id)
          .maybeSingle<ProductRow>();
        prodRow = data;
      }

      if (cancelled) return;

      setTitle(som.name ?? prodRow?.name ?? "Zestaw Miesiąca");
      setDesc(som.description ?? prodRow?.description ?? "");
      setImg(som.image_url ?? prodRow?.image_url ?? null);

      const priceCents = som.promo_price_cents ?? prodRow?.price_cents ?? null;
      if (typeof priceCents === "number") {
        setPrice(priceCents / 100);
      } else if (prodRow?.price != null) {
        const n = parseFloat(String(prodRow.price).replace(",", "."));
        setPrice(Number.isFinite(n) ? n : null);
      }

      const pcsMatch = (som.description ?? "").match(/(\d+)\s*szt/i);
      setPieces(pcsMatch ? parseInt(pcsMatch[1], 10) : null);
      setProductName(prodRow?.name ?? som.name ?? "Zestaw Miesiąca");
      setProductId(prodRow?.id ?? null);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleAdd = () => {
    if (!productId || price === null) return;
    addItem({
      id: productId,
      product_id: productId,
      name: productName,
      price,
      quantity: 1,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  if (loading) {
    return (
      <div 
        className="flex-1 flex items-center justify-center"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 100px)" }}
      >
        <div className="w-10 h-10 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  if (!title) {
    return (
      <div 
        className="flex-1 flex flex-col items-center justify-center px-6 text-center"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 100px)" }}
      >
        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <Sparkles className="w-10 h-10 text-white/30" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Brak zestawu</h3>
        <p className="text-white/50 text-sm">
          Aktualnie nie ma dostępnego zestawu miesiąca.
        </p>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col min-h-full bg-[#0b0b0b]"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      {/* Hero Image - Full width, immersive */}
      <div className="relative">
        {/* Badge - floating at top */}
        <div 
          className="absolute top-0 left-0 right-0 z-20 flex justify-center pt-2"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
            <Sparkles className="w-3.5 h-3.5 text-[#e8b923]" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white">
              Zestaw Miesiąca — {monthLabel}
            </span>
          </div>
        </div>

        {/* Main Image */}
        {img && (
          <div className="relative w-full aspect-[4/3] bg-gradient-to-b from-white/5 to-transparent">
            <Image
              src={img}
              alt={title}
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
            
            {/* Bottom gradient for text readability */}
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/80 to-transparent" />
            
            {/* Pieces badge */}
            {pieces && (
              <div className="absolute top-14 right-4 bg-[var(--accent-red,#a61b1b)] text-white text-sm font-bold px-3 py-1.5 rounded-lg shadow-lg">
                {pieces} sztuk
              </div>
            )}
          </div>
        )}

        {/* Floating info card - overlapping image */}
        <div className="relative z-10 -mt-8 mx-4">
          <div className="bg-[#151515] rounded-2xl p-5 border border-white/10 shadow-xl">
            {/* Title and price row */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-white leading-snug">
                  {title}
                </h1>
                {parsedDesc.header && (
                  <p className="mt-1 text-sm text-white/50">
                    {parsedDesc.header}
                  </p>
                )}
              </div>
              
              {price !== null && (
                <div className="shrink-0 text-right">
                  <div className="text-2xl font-bold text-white">
                    {price.toFixed(0)}<span className="text-lg text-white/70"> zł</span>
                  </div>
                  {pieces && (
                    <p className="text-xs text-white/40 mt-0.5">
                      {(price / pieces).toFixed(2)} zł/szt
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content - scrollable */}
      <div 
        className="flex-1 px-4 pt-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 160px)" }}
      >
        {/* What's included */}
        {parsedDesc.items.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3 px-1">
              W zestawie
            </h3>
            <div className="space-y-2.5 px-1">
              {parsedDesc.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3"
                >
                  <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                    <Check className="w-4 h-4 text-[var(--accent-red,#a61b1b)]" />
                  </span>
                  <span className="text-[15px] text-white/75 leading-snug">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom CTA */}
      <div 
        className="fixed inset-x-0 bottom-0 z-30 pointer-events-none"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 8px) + 76px)" }}
      >
        <div className="px-4 pb-4 pt-6 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b] to-transparent pointer-events-auto">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!productId || added}
            className={clsx(
              "w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-semibold text-base transition-all duration-200",
              added
                ? "bg-green-600 text-white"
                : "bg-gradient-to-r from-[#c41e1e] to-[#9a1515] text-white shadow-[0_8px_30px_rgba(166,27,27,0.4)] active:scale-[0.98]",
              (!productId || added) && "opacity-60"
            )}
          >
            {added ? (
              <>
                <Check className="w-5 h-5" />
                <span>Dodano!</span>
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5" />
                <span>Dodaj do koszyka</span>
                {price !== null && (
                  <span className="ml-1 opacity-80">• {price.toFixed(0)} zł</span>
                )}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
