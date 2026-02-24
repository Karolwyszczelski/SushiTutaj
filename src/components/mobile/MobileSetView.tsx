// src/components/mobile/MobileSetView.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
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
      image_url: img ?? undefined,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  /* ── loading skeleton ── */
  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-[#0a0a0a]">
        <div className="w-full aspect-[4/5] skeleton-pulse" />
        <div className="px-6 pt-6 space-y-4">
          <div className="h-3 w-24 rounded skeleton-pulse" />
          <div className="h-7 w-56 rounded skeleton-pulse" />
          <div className="h-4 w-40 rounded skeleton-pulse" />
          <div className="space-y-3 mt-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-4 rounded skeleton-pulse" style={{ width: `${70 - i * 8}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── empty state ── */
  if (!title) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center px-8 text-center bg-[#0a0a0a]"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 48px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 100px)",
        }}
      >
        <div className="relative w-20 h-20 mb-6">
          <div className="absolute inset-0 bg-white/[0.04] rounded-2xl rotate-6" />
          <div className="absolute inset-0 bg-white/[0.06] rounded-2xl -rotate-3 flex items-center justify-center">
            <span className="text-3xl opacity-40">🍣</span>
          </div>
        </div>
        <h3 className="text-base font-semibold text-white mb-2">
          Brak zestawu w tym miesiącu
        </h3>
        <p className="text-white/40 text-sm leading-relaxed max-w-[240px]">
          Nowy zestaw pojawi się wkrótce — wróć po więcej!
        </p>
      </div>
    );
  }

  /* ── main view ── */
  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0a]">

      {/* ── Full-bleed hero image ── */}
      <div className="relative w-full aspect-[4/5] overflow-hidden">
        {img ? (
          <Image
            src={img}
            alt={title}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a0a0a] to-[#0a0a0a] flex items-center justify-center">
            <span className="text-6xl opacity-20">🍣</span>
          </div>
        )}

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/50 via-transparent to-transparent h-24" />

        {/* Top label */}
        <div
          className="absolute top-0 left-0 right-0 px-6 flex items-center justify-between hero-stagger hero-stagger-1"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-[3px] h-4 bg-[#c41e1e] rounded-full" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/50">
              {monthLabel}
            </span>
          </div>
          {pieces && (
            <span className="text-[11px] font-medium text-white/40 bg-white/[0.08] px-2.5 py-1 rounded-lg backdrop-blur-sm">
              {pieces} szt.
            </span>
          )}
        </div>

        {/* Bottom info overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-6">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c8a97e] mb-2 hero-stagger hero-stagger-2"
          >
            Zestaw Miesiąca
          </p>
          <h1
            className="text-[26px] font-bold text-white leading-tight tracking-tight mb-3 hero-stagger hero-stagger-3"
          >
            {title}
          </h1>

          {/* Price */}
          {price !== null && (
            <div className="flex items-baseline gap-1.5 hero-stagger hero-stagger-3">
              <span className="text-[32px] font-bold text-[#c41e1e] leading-none tracking-tight">
                {price.toFixed(0)}
              </span>
              <span className="text-[15px] font-medium text-[#c41e1e]/60">zł</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Content section ── */}
      <div
        className="flex-1 px-6 pt-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 200px)" }}
      >
        {/* Subtitle / header */}
        {parsedDesc.header && (
          <p className="text-[13px] text-white/45 font-medium mb-5">
            {parsedDesc.header}
          </p>
        )}

        {/* Contents list */}
        {parsedDesc.items.length > 0 && (
          <div className="hero-stagger hero-stagger-4">
            <div className="flex items-center gap-2.5 mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">
                W zestawie
              </p>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            <div className="space-y-0">
              {parsedDesc.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-0"
                >
                  <span className="text-[13px] font-medium text-white/20 tabular-nums w-5 shrink-0 text-right">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[14px] text-white/65 leading-relaxed">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky bottom CTA ── */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 pointer-events-none"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 8px) + 76px)" }}
      >
        <div className="px-5 pb-4 pt-10 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent pointer-events-auto">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!productId || added}
            className={clsx(
              "w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-semibold text-[15px] transition-all duration-200",
              added
                ? "bg-emerald-600 text-white cart-bounce"
                : "bg-gradient-to-r from-[#c41e1e] via-[#a61b1b] to-[#7a0b0b] text-white shadow-[0_6px_24px_rgba(166,27,27,0.4)] active:scale-[0.98]",
              (!productId || added) && "opacity-50"
            )}
          >
            {added ? (
              <>
                <Check className="w-5 h-5 cart-check-flash" />
                <span>Dodano do koszyka</span>
              </>
            ) : (
              <>
                <span>Dodaj do koszyka</span>
                {price !== null && (
                  <span className="text-white/60">· {price.toFixed(0)} zł</span>
                )}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
