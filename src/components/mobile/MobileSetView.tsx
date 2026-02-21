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
        className="flex-1 flex flex-col items-center justify-center bg-[#0a0a0a]"
        style={{ 
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 48px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 100px)" 
        }}
      >
        <div className="w-8 h-8 border-2 border-white/10 border-t-[#a61b1b] rounded-full animate-spin" />
      </div>
    );
  }

  if (!title) {
    return (
      <div 
        className="flex-1 flex flex-col items-center justify-center px-8 text-center bg-[#0a0a0a]"
        style={{ 
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 48px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 100px)" 
        }}
      >
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-5">
          <Sparkles className="w-7 h-7 text-white/20" />
        </div>
        <h3 className="text-base font-medium text-white mb-2">Brak zestawu</h3>
        <p className="text-white/40 text-sm leading-relaxed">
          Aktualnie nie ma dostępnego<br />zestawu miesiąca.
        </p>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col min-h-full bg-[#0a0a0a]"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 48px)" }}
    >
      {/* Minimalist Header */}
      <div className="px-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1 h-4 bg-[#a61b1b] rounded-full" />
          <span className="text-[11px] font-medium uppercase tracking-widest text-white/40">
            {monthLabel}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Zestaw Miesiąca
        </h1>
      </div>

      {/* Hero Image - Clean, rounded */}
      <div className="px-5 mb-6">
        {img && (
          <div className="relative w-full aspect-square rounded-3xl overflow-hidden bg-white/5">
            <Image
              src={img}
              alt={title}
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
            
            {/* Subtle overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            
            {/* Price badge - bottom left */}
            {price !== null && (
              <div className="absolute bottom-4 left-4 bg-white px-4 py-2 rounded-xl">
                <span className="text-2xl font-bold text-[#0a0a0a]">{price.toFixed(0)}</span>
                <span className="text-sm text-black/60 ml-1">zł</span>
              </div>
            )}
            
            {/* Pieces badge - bottom right */}
            {pieces && (
              <div className="absolute bottom-4 right-4 bg-[#a61b1b] px-3 py-2 rounded-xl">
                <span className="text-sm font-semibold text-white">{pieces} szt.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div 
        className="flex-1 px-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 160px)" }}
      >
        {/* Title card */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-1">{title}</h2>
          {parsedDesc.header && (
            <p className="text-sm text-white/50">{parsedDesc.header}</p>
          )}
        </div>

        {/* What's included - Minimal list */}
        {parsedDesc.items.length > 0 && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-white/30 mb-4">
              W zestawie
            </p>
            <div className="space-y-3">
              {parsedDesc.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0"
                >
                  <span className="shrink-0 w-1.5 h-1.5 mt-2 rounded-full bg-[#a61b1b]" />
                  <span className="text-[15px] text-white/70 leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom CTA - Minimal */}
      <div 
        className="fixed inset-x-0 bottom-0 z-30 pointer-events-none"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 8px) + 76px)" }}
      >
        <div className="px-5 pb-4 pt-8 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent pointer-events-auto">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!productId || added}
            className={clsx(
              "w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-semibold text-[15px] transition-all duration-200",
              added
                ? "bg-emerald-600 text-white"
                : "bg-[#a61b1b] text-white active:scale-[0.98] active:bg-[#8a1515]",
              (!productId || added) && "opacity-50"
            )}
          >
            {added ? (
              <>
                <Check className="w-5 h-5" />
                <span>Dodano do koszyka</span>
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5" />
                <span>Dodaj do koszyka</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
