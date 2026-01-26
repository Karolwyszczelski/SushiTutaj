// src/components/ZestawMiesiaca.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import useCartStore from "@/store/cartStore";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

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

const GUTTER = "170px";

// desktop przesunięcia
const TUNE = {
  textX: "50px",
  textY: "-200px",
  imgX: "0px",
  imgY: "-250px",
  imgScale: 1,
};

// wspólne style
const STYLE = {
  h2: "text-2xl md:text-6xl lg:text-4xl font-bold color: [accent(#de1d13)] leading-tight",
  subtitle: "italic text-1xl md:text-2xl font-semibold",
  body: "text-base md:text-lg text-white/80 lg:text-1xl",
  btn:
    "inline-flex items-center justify-center rounded-full px-8 md:px-9 py-3 md:py-3.5 " +
    "font-small text-small text-white [background:linear-gradient(180deg,#b31217_20%,#7a0b0b_100%)] " +
    "shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] " +
    "ring-1 ring-black/30 hover:[filter:brightness(1.06)] active:[filter:brightness(0.96)] " +
    "transition disabled:opacity-50 disabled:cursor-not-allowed relative z-[60]",
  badge:
    "text-white flex items-center justify-center text-center font-extrabold shadow-lg ring-2 ring-white/20 " +
    "bg-[var(--accent,#de1d13)] ",
};

/** PNG w prawym dolnym rogu (desktop) */
const SOM_CORNER = {
  src: "/assets/som-corner.png",
  w: "320px",
  h: "320px",
  x: "-50px",
  y: "0px",
  z: 3,
  opacity: "0.7",
  scale: 1,
  rot: "0deg",
};

export default function ZestawMiesiaca() {
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

    // wspieramy zarówno • jak i \n (gdy kiedyś zaczniesz zapisywać ładnie w DB)
    const parts = raw
      .split(/\n|•/g)
      .map((p) => p.trim())
      .filter(Boolean);

    if (!parts.length) return { header: null, items: [] };

    // heurystyka: pierwszy segment często jest "36 sztuk / 120 zł"
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
      const keys = ["restaurant_slug", "restaurantSlug", "branch", "citySlug"];
      for (const k of keys) {
        const v = window.localStorage.getItem(k);
        if (v) return v;
      }
      try {
        const u = new URL(window.location.href);
        return u.searchParams.get("slug");
      } catch {
        return null;
      }
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

      // jeśli dalej brak restauracji – kończymy bez błędu
      if (!restaurantId) {
        if (!cancelled) {
          console.warn(
            "ZestawMiesiaca: nie udało się ustalić restaurantId – brak danych."
          );
          setLoading(false);
        }
        return;
      }

      const rid = restaurantId as string;

      const { data: som, error: somErr } = await supabase
        .from("sushi_of_month")
        .select(
          "id,name,description,product_id,image_url,promo_price_cents,restaurant_id,starts_on,ends_on,is_active"
        )
        .eq("restaurant_id", rid)
        .eq("is_active", true)
        .lte("starts_on", today)
        // ends_on >= today LUB ends_on IS NULL (open-ended)
        .or(`ends_on.gte.${today},ends_on.is.null`)
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle<SomRow>();

      if (cancelled) return;

      if (somErr) {
        console.error(somErr.message);
        setLoading(false);
        return;
      }

      const row = som as SomRow | null;

      let pRow: ProductRow | null = null;
      if (row?.product_id) {
        const { data: p } = await supabase
          .from("products")
          .select("id,name,price,price_cents,description,image_url")
          .eq("id", row.product_id)
          .maybeSingle<ProductRow>();
        pRow = p ?? null;
      }

      const resolvedTitle = row?.name || pRow?.name || "Zestaw Miesiąca";
      const resolvedDesc = row?.description || pRow?.description || "";
      const resolvedImg = row?.image_url || pRow?.image_url || null;

      setTitle(resolvedTitle);
      setDesc(resolvedDesc);
      setImg(resolvedImg);
      setProductName(pRow?.name || row?.name || "Zestaw Miesiąca");
      setProductId(pRow?.id || row?.product_id || null);

      const extractPieces = (s?: string | null) => {
        if (!s) return null;
        const m = s.match(/(\d+)\s*(?:szt|sztuki|szt\.)/i);
        return m ? parseInt(m[1], 10) : null;
      };

      setPieces(
        extractPieces(row?.description) ??
          extractPieces(row?.name) ??
          extractPieces(pRow?.description) ??
          extractPieces(pRow?.name) ??
          null
      );

      let finalPrice: number | null = null;
      if (row?.promo_price_cents != null)
        finalPrice = row.promo_price_cents / 100;
      if (finalPrice == null && pRow) {
        if (typeof pRow.price_cents === "number")
          finalPrice = pRow.price_cents / 100;
        else if (pRow.price != null) {
          const num = parseFloat(String(pRow.price).replace(",", "."));
          if (Number.isFinite(num)) finalPrice = num;
        }
      }
      setPrice(finalPrice);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleAdd = () => {
    if (price === null) return;
    // CartItem nie ma `id` – zostawiamy nazwę, cenę i ilość
    addItem({
      name: `Zestaw Miesiąca – ${productName || title}`,
      price,
      quantity: 1,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  return (
      <section
  className="relative isolate z-[200] w-full text-white overflow-visible py-8 md:py-20 md:max-h-[300px]"

      style={
        {
          backgroundColor: "#0b0b0b",
          ["--gutter" as any]: GUTTER,
          ["--text-x" as any]: TUNE.textX,
          ["--text-y" as any]: TUNE.textY,
          ["--img-x" as any]: TUNE.imgX,
          ["--img-y" as any]: TUNE.imgY,
          ["--img-scale" as any]: TUNE.imgScale,
          ["--som-w" as any]: SOM_CORNER.w,
          ["--som-h" as any]: SOM_CORNER.h,
          ["--som-x" as any]: SOM_CORNER.x,
          ["--som-y" as any]: SOM_CORNER.y,
          ["--som-z" as any]: (SOM_CORNER.z as unknown as number),
          ["--som-opacity" as any]: (SOM_CORNER.opacity as unknown as number),
          ["--som-scale" as any]: SOM_CORNER.scale,
          ["--som-rot" as any]: SOM_CORNER.rot,
        } as React.CSSProperties
      }
    >
      {/* boczne pasy tylko desktop */}
      <div
        aria-hidden
        className="hidden md:block pointer-events-none absolute inset-y-0 left-0"
        style={{ width: "50px", background: "#0b0b0b" }}
      />
      <div
        aria-hidden
        className="hidden md:block pointer-events-none absolute inset-y-0 right-0"
        style={{ width: "50px", background: "#0b0b0b" }}
      />

      {/* PNG róg — tylko desktop */}
      <div
        aria-hidden
        className="hidden md:block absolute"
        style={{
          right: "calc(50px + var(--som-x))",
          bottom: "var(--som-y)",
          width: "var(--som-w)",
          height: "var(--som-h)",
          zIndex: "var(--som-z)" as unknown as number,
          opacity: "var(--som-opacity)" as unknown as number,
          transform: "scale(var(--som-scale)) rotate(var(--som-rot))",
          transformOrigin: "bottom right",
        }}
      >
        <Image
          src={SOM_CORNER.src}
          alt=""
          fill
          sizes="240px"
          className="object-contain select-none pointer-events-none"
          priority
        />
      </div>

      {/* ------- MOBILE ------- */}
      <div className="md:hidden mx-auto w-full max-w-7xl px-6">
        <p className="text-xs tracking-[0.2em] text-white/70 mb-2 text-center">
          ZESTAW MIESIĄCA
        </p>
        <h2 className="text-3xl font-bold leading-tight text-center">
          {loading ? "…" : monthLabel}
        </h2>
        <p className="mt-1 text-lg font-semibold italic text-center">
          {loading ? "Ładowanie…" : productName || title || "Zestaw specjalny"}
        </p>

        {/* obraz + badge w relatywnym kontenerze */}
        <div className="relative mt-6 mx-auto w-full max-w-sm">
          <Image
            src={img || "/assets/miesiaca2.png"}
            alt="Zestaw miesiąca"
            width={720}
            height={560}
            priority
            className="w-full h-auto object-contain"
          />

          {/* cena */}
          <div
            className={`absolute bottom-2 right-2 w-16 h-16 rounded-full ${STYLE.badge}`}
            aria-hidden
          >
            <span className="leading-tight text-sm">
              {price !== null ? `${price.toFixed(2)}\nzł` : "—"}
            </span>
          </div>

          {/* sztuki */}
          <div
            className={`absolute bottom-2 left-2 w-14 h-14 rounded-full ${STYLE.badge}`}
            aria-hidden
          >
            <span className="leading-tight text-xs">
              {pieces ?? 34}
              <br />
              szt.
            </span>
          </div>
        </div>

                {/* opis */}
        {!loading && (parsedDesc.header || parsedDesc.items.length > 0) ? (
          <div className="mt-4 text-sm text-white/80">
            {parsedDesc.header ? (
              <p className="mb-2 text-center">{parsedDesc.header}</p>
            ) : null}

            {parsedDesc.items.length > 0 ? (
              <ul className="mx-auto max-w-md text-center list-disc list-inside space-y-1">
                {parsedDesc.items.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* akcje */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            onClick={handleAdd}
            disabled={loading || price === null}
            className={`${STYLE.btn} w-full max-w-sm`}
          >
            {added ? "Dodano" : "Dodaj do koszyka"}
          </button>
          <span className="text-white/80 text-sm">
            {price !== null
              ? `Cena: ${price.toFixed(2)} zł`
              : loading
              ? ""
              : "Niedostępne"}
          </span>
        </div>
      </div>

      {/* ------- DESKTOP ------- */}
      <div
        className="hidden md:block mx-auto w-full max-w-7xl"
        style={{ paddingLeft: "var(--gutter)", paddingRight: "var(--gutter)" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-8 md:gap-12">
          {/* lewo — treść */}
          <div
          className="relative z-[50]"
            style={{
              transform: "translate(var(--text-x), var(--text-y))",
            }}
          >
            <p className="text-xs tracking-[0.2em] text-white/70 mb-2">
              ZESTAW MIESIĄCA
            </p>
            <h2 className={STYLE.h2}>{loading ? "…" : monthLabel}</h2>
            <p className={STYLE.subtitle}>
              {loading
                ? "Ładowanie…"
                : productName || title || "Zestaw specjalny"}
            </p>
            {!loading && (parsedDesc.header || parsedDesc.items.length > 0) ? (
              <div className={STYLE.body}>
                {parsedDesc.header ? (
                  <div className="mb-2">{parsedDesc.header}</div>
                ) : null}

                {parsedDesc.items.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1">
                    {parsedDesc.items.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className={STYLE.body}>{loading ? "" : null}</div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={handleAdd}
                disabled={loading || price === null}
                className={STYLE.btn}
              >
                {added ? "Dodano" : "Dodaj do koszyka"}
              </button>
              <span className="text-white/80 text-sm md:text-base">
                {price !== null
                  ? `Cena: ${price.toFixed(2)} zł`
                  : loading
                  ? ""
                  : "Niedostępne"}
              </span>
            </div>
          </div>

          {/* prawo — obraz + badge */}
          <div className="relative">
            <div
              className="relative w-full max-w-[640px] mx-auto"
              style={{
                transform:
                  "translate(var(--img-x), var(--img-y)) scale(var(--img-scale))",
                transformOrigin: "center",
              }}
            >
              <Image
                src={img || "/assets/miesiaca2.png"}
                alt="Zestaw miesiąca"
                width={720}
                height={560}
                priority
                className="w-full h-auto object-contain"
              />

              <div
                className={`absolute -top-[-160px] right-2 w-24 h-24 rounded-full ${STYLE.badge}`}
                aria-hidden
              >
                {price !== null ? (
                  <span className="leading-tight text-lg">
                    {price.toFixed(2)}
                    <br />
                    zł
                  </span>
                ) : (
                  <span className="leading-tight text-lg">—</span>
                )}
              </div>

              <div
                className={`absolute top-[0px] right-28 w-20 h-20 rounded-full ${STYLE.badge}`}
                aria-hidden
              >
                <span className="leading-tight text-base">
                  {pieces ?? 32}
                  <br />
                  szt.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
