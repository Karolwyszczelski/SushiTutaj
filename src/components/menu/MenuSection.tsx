// src/components/menu/MenuSection.tsx
"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import Image from "next/image";
import { ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import useCartStore from "@/store/cartStore";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  price_cents: number | null;
  image_url: string | null;
  subcategory: string | null;
  position: number | null;
  is_active: boolean;
  available: boolean | null;
  restaurant_id: string;
};

type RestaurantIdRow = {
  id: string;
};

const GUTTER = "170px";
const ACCENT = "[background:linear-gradient(180deg,#b31217_0%,#7a0b0b_100%)]";
const ARROW_GUTTER_PX = 56;

// dekoracje (desktop)
const MENU_TL = {
  src: "/assets/menu-decor-tl.png",
  w: "260px",
  h: "260px",
  x: "-50px",
  y: "-20px",
  z: 2,
  opacity: "0.8",
  scale: 1.4,
  rot: "0deg",
};
const MENU_BR = {
  src: "/assets/menu-decor-br.png",
  w: "240px",
  h: "240px",
  x: "-50px",
  y: "0px",
  z: 2,
  opacity: "0.8",
  scale: 1,
  rot: "0deg",
};
const MENU_TR = {
  src: "/assets/hero-left.png",
  w: "520px",
  h: "520px",
  x: "-100px",
  y: "-150px",
  z: -1,
  opacity: "0.9",
  scale: 1.1,
  rot: "0deg",
};

const norm = (s: string) =>
  s
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

const slugify = (s: string) =>
  norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const priceLabel = (p: Product) => {
  if (typeof p.price_cents === "number")
    return (p.price_cents / 100).toFixed(2) + " zł";
  if (p.price != null) {
    const n = parseFloat(String(p.price).replace(",", "."));
    if (Number.isFinite(n)) return n.toFixed(2) + " zł";
  }
  return "—";
};

const priceNumber = (p: Product) => {
  if (typeof p.price_cents === "number") return p.price_cents / 100;
  const n = parseFloat(String(p.price ?? "").toString().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Fallbacki: image_url → /assets/menuphoto/{slug}.webp → .jpg → .png → placeholder */
function ProductImg({ p, sizes = "50vw" }: { p: Product; sizes?: string }) {
  const candidates = useMemo(() => {
    const base = `/assets/menuphoto/${slugify(p.name)}`;
    const list = [
      p.image_url &&
      (p.image_url.startsWith("http") || p.image_url.startsWith("/"))
        ? p.image_url
        : null,
      `${base}.webp`,
      `${base}.jpg`,
      `${base}.png`,
      "/assets/placeholder-sushi.jpg",
    ].filter(Boolean) as string[];
    return list;
  }, [p.name, p.image_url]);
  const [idx, setIdx] = useState(0);
  const src = candidates[Math.min(idx, candidates.length - 1)];
  return (
    <Image
      src={src}
      alt={p.name}
      fill
      sizes={sizes}
      className="object-contain transition"
      onError={() => setIdx((i) => Math.min(i + 1, candidates.length - 1))}
      priority={false}
    />
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function MenuSection() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  // rozluźniony typ addItem – żeby TS nie marudził na dodatkowe pola
  const { addItem } = useCartStore() as any;

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState<string>("Wszystko");
  const [q, setQ] = useState("");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string[]>([]);
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>(
    {}
  );

  // karuzele
  const railTopRef = useRef<HTMLDivElement | null>(null);
  const railBotRef = useRef<HTMLDivElement | null>(null);
  const [pageTop, setPageTop] = useState(0);
  const [pageBot, setPageBot] = useState(0);

  // kategorie: szyna + strzałki (mobile)
  const catsRailRef = useRef<HTMLDivElement | null>(null);
  const [catsCanLeft, setCatsCanLeft] = useState(false);
  const [catsCanRight, setCatsCanRight] = useState(false);

  // zapobieganie globalnym handlerom dotyku
  const stopProp = (e: any) => e.stopPropagation();

  useEffect(() => {
    const readSlug = () => {
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

    let mounted = true;
    (async () => {
      setLoading(true);
      const slug = readSlug();

      if (slug) {
        const { data: r } = await supabase
          .from("restaurants")
          .select("id")
          .eq("slug", slug)
          .maybeSingle<RestaurantIdRow>();

        if (mounted) setRestaurantId(r?.id ?? null);
      } else {
        const { data: rFirst } = await supabase
          .from("restaurants")
          .select("id")
          .limit(1)
          .maybeSingle<RestaurantIdRow>();

        if (mounted) setRestaurantId(rFirst?.id ?? null);
      }

      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!restaurantId) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select(
          "id,name,description,price,price_cents,image_url,subcategory,position,is_active,available,restaurant_id"
        )
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .or("available.is.null,available.eq.true")
        .order("subcategory", { ascending: true })
        .order("position", { ascending: true })
        .order("name", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error(error.message);
        setProducts([]);
        setCategories(["Wszystko"]);
        setLoading(false);
        return;
      }

      const items = (data || []) as Product[];
      setProducts(items);

      const cats = Array.from(
        new Set(items.map((p) => p.subcategory || "Inne"))
      ).sort((a, b) => a.localeCompare(b, "pl"));
      setCategories(["Wszystko", ...cats]);
      if (activeCat !== "Wszystko" && !cats.includes(activeCat))
        setActiveCat("Wszystko");
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [restaurantId, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const term = norm(q.trim());
    return products.filter((p) => {
      const inCat =
        activeCat === "Wszystko" || (p.subcategory || "Inne") === activeCat;
      if (!inCat) return false;
      if (!term) return true;
      return (
        norm(p.name).includes(term) ||
        norm(p.description || "").includes(term) ||
        norm(p.subcategory || "").includes(term)
      );
    });
  }, [products, activeCat, q]);

  // desktop: 3/stronę; mobile: 2/stronę
  const groupsD = useMemo(() => chunk(visible, 3), [visible]);
  const groupsTopD = useMemo(
    () => groupsD.filter((_, i) => i % 2 === 0),
    [groupsD]
  );
  const groupsBotD = useMemo(
    () => groupsD.filter((_, i) => i % 2 === 1),
    [groupsD]
  );

  const groupsM = useMemo(() => chunk(visible, 2), [visible]);
  const groupsTopM = useMemo(
    () => groupsM.filter((_, i) => i % 2 === 0),
    [groupsM]
  );
  const groupsBotM = useMemo(
    () => groupsM.filter((_, i) => i % 2 === 1),
    [groupsM]
  );

  useEffect(() => {
    setPageTop(0);
    setPageBot(0);
    railTopRef.current?.scrollTo({ left: 0, behavior: "auto" });
    railBotRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [groupsTopD.length, groupsBotD.length, groupsTopM.length, groupsBotM.length]);

  const onScroll = (row: "top" | "bot") => {
    const rail = row === "top" ? railTopRef.current : railBotRef.current;
    if (!rail) return;
    const width = rail.clientWidth || 1;
    const idx = Math.round(rail.scrollLeft / width);
    if (row === "top") {
      if (idx !== pageTop) setPageTop(idx);
    } else {
      if (idx !== pageBot) setPageBot(idx);
    }
  };

  const handleAdd = (p: Product) => {
    if (p.available === false) return;
    addItem({ id: p.id, name: p.name, price: priceNumber(p), quantity: 1 });
    setJustAdded((prev) => (prev.includes(p.id) ? prev : [...prev, p.id]));
    setTimeout(
      () => setJustAdded((prev) => prev.filter((id) => id !== p.id)),
      900
    );
  };

  const [firstCat, restCats] = useMemo(() => {
    if (categories.length === 0) return [null, []] as [string | null, string[]];
    const [first, ...rest] = categories;
    return [first, rest] as [string, string[]];
  }, [categories]);

  const arrowBtn =
    `h-11 w-11 rounded-full text-white ${ACCENT} ring-1 ring-black/30 ` +
    `shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] ` +
    `hover:[filter:brightness(1.06)] active:[filter:brightness(0.96)] disabled:opacity-40 disabled:cursor-not-allowed`;

  const arrowBtnSm =
    `h-10 w-10 rounded-full text-white ${ACCENT} ring-1 ring-black/30 ` +
    `shadow-[0_10px_18px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] ` +
    `hover:[filter:brightness(1.06)] active:[filter:brightness(0.96)] disabled:opacity-40 disabled:cursor-not-allowed`;

  // kategorie: obsługa strzałek + gest
  const updateCatArrows = useCallback(() => {
    const el = catsRailRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCatsCanLeft(el.scrollLeft > 2);
    setCatsCanRight(el.scrollLeft < max - 2);
  }, []);

  const catScroll = (dir: -1 | 1) => {
    const el = catsRailRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 240, behavior: "smooth" });
  };

  useEffect(() => {
    updateCatArrows();
    const el = catsRailRef.current;
    if (!el) return;
    const onScrollCats = () => updateCatArrows();
    el.addEventListener("scroll", onScrollCats, { passive: true });
    const onResize = () => updateCatArrows();
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("scroll", onScrollCats);
      window.removeEventListener("resize", onResize);
    };
  }, [categories, updateCatArrows]);

  const CardMobile = ({ p }: { p: Product }) => {
    const isAdded = justAdded.includes(p.id);
    const expanded = !!expandedDesc[p.id];
    const hasLong = !!p.description && p.description.length > 120;
    const brief =
      !p.description
        ? ""
        : hasLong && !expanded
        ? p.description.slice(0, 120) + "…"
        : p.description;

    return (
      <article
        key={p.id}
        tabIndex={0}
        className="group relative bg-transparent outline-none"
      >
        <div className="relative aspect-square bg-black">
          <ProductImg p={p} sizes="50vw" />
          {p.available === false && (
            <div className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-medium bg-[var(--accent,#de1d13)] text-white">
              Niedostępne
            </div>
          )}
        </div>

        <div className="p-3">
          <h4 className="text-sm font-medium leading-snug text-white">
            {p.name}
          </h4>

          {p.description && (
            <div className="mt-1 text-xs font-light text-white/70">
              <p>{brief}</p>
              {hasLong && (
                <button
                  type="button"
                  className="mt-1 underline text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedDesc((s) => ({
                      ...s,
                      [p.id]: !s[p.id],
                    }));
                  }}
                  aria-expanded={expanded}
                >
                  {expanded ? "Pokaż mniej" : "Pokaż cały opis"}
                </button>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-medium text-white">
              {priceLabel(p)}
            </span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAdd(p);
              }}
              disabled={p.available === false}
              aria-label={`Dodaj ${p.name}`}
              className={`h-9 w-9 shrink-0 rounded-full text-white ${ACCENT}
                ring-1 ring-black/30 shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)]
                hover:[filter:brightness(1.06)] active:[filter:brightness(0.96)]
                disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <ShoppingCart className="h-4 w-4 mx-auto my-auto" />
            </button>
          </div>

          {isAdded && (
            <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-[var(--accent,#de1d13)] ring-2 ring-white" />
          )}
        </div>
      </article>
    );
  };

  const CardDesktop = ({ p }: { p: Product }) => {
    const isAdded = justAdded.includes(p.id);
    const expanded = !!expandedDesc[p.id];
    const hasLong = !!p.description && p.description.length > 160;
    const brief =
      !p.description
        ? ""
        : hasLong && !expanded
        ? p.description.slice(0, 160) + "…"
        : p.description;

    return (
      <article
        key={p.id}
        tabIndex={0}
        onClick={() => handleAdd(p)}
        className="group relative bg-transparent transition hover:bg-white/5 focus:bg-white/5 outline-none cursor-pointer"
      >
        <div className="relative aspect-square bg-black">
          <ProductImg p={p} sizes="33vw" />
          {p.available === false && (
            <div className="absolute top-3 right-3 px-3 py-1 text-xs font-medium bg-[var(--accent,#de1d13)] text-white">
              Niedostępne
            </div>
          )}
        </div>

        <div className="p-4">
          <h4 className="text-base font-medium leading-snug text-white">
            {p.name}
          </h4>

          {p.description && (
            <div className="mt-1 text-sm font-light text-white/70">
              <p>{brief}</p>
              {hasLong && (
                <button
                  type="button"
                  className="mt-1 underline text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedDesc((s) => ({
                      ...s,
                      [p.id]: !s[p.id],
                    }));
                  }}
                  aria-expanded={expanded}
                >
                  {expanded ? "Pokaż mniej" : "Pokaż cały opis"}
                </button>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-medium text-white">
              {priceLabel(p)}
            </span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAdd(p);
              }}
              disabled={p.available === false}
              aria-label={`Dodaj ${p.name}`}
              className={`h-10 w-10 shrink-0 rounded-full text-white ${ACCENT}
                ring-1 ring-black/30 shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)]
                hover:[filter:brightness(1.06)] active:[filter:brightness(0.96)]
                disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <ShoppingCart className="h-5 w-5 mx-auto my-auto" />
            </button>
          </div>

          {isAdded && (
            <span className="absolute -top-2 -right-2 h-3 w-3 rounded-full bg-[var(--accent,#de1d13)] ring-2 ring-white" />
          )}
        </div>
      </article>
    );
  };

  return (
    <section
      id="menu"
      className="relative z-[60] w-full text-white"
      style={
        {
          backgroundColor: "#0b0b0b",
          ["--gutter" as any]: GUTTER,
          ["--menu-tl-w" as any]: MENU_TL.w,
          ["--menu-tl-h" as any]: MENU_TL.h,
          ["--menu-tl-x" as any]: MENU_TL.x,
          ["--menu-tl-y" as any]: MENU_TL.y,
          ["--menu-tl-z" as any]: (MENU_TL.z as unknown as number),
          ["--menu-tl-opacity" as any]: (MENU_TL.opacity as unknown as number),
          ["--menu-tl-scale" as any]: MENU_TL.scale,
          ["--menu-tl-rot" as any]: MENU_TL.rot,
          ["--menu-br-w" as any]: MENU_BR.w,
          ["--menu-br-h" as any]: MENU_BR.h,
          ["--menu-br-x" as any]: MENU_BR.x,
          ["--menu-br-y" as any]: MENU_BR.y,
          ["--menu-br-z" as any]: (MENU_BR.z as unknown as number),
          ["--menu-br-opacity" as any]: (MENU_BR.opacity as unknown as number),
          ["--menu-br-scale" as any]: MENU_BR.scale,
          ["--menu-br-rot" as any]: MENU_BR.rot,
          ["--menu-tr-w" as any]: MENU_TR.w,
          ["--menu-tr-h" as any]: MENU_TR.h,
          ["--menu-tr-x" as any]: MENU_TR.x,
          ["--menu-tr-y" as any]: MENU_TR.y,
          ["--menu-tr-z" as any]: (MENU_TR.z as unknown as number),
          ["--menu-tr-opacity" as any]: (MENU_TR.opacity as unknown as number),
          ["--menu-tr-scale" as any]: MENU_TR.scale,
          ["--menu-tr-rot" as any]: MENU_TR.rot,
        } as React.CSSProperties
      }
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

      {/* dekoracje desktop */}
      <div
        aria-hidden
        className="hidden md:block absolute"
        style={{
          left: "calc(50px + var(--menu-tl-x))",
          top: "var(--menu-tl-y)",
          width: "var(--menu-tl-w)",
          height: "var(--menu-tl-h)",
          zIndex: "var(--menu-tl-z)" as unknown as number,
          opacity: "var(--menu-tl-opacity)" as unknown as number,
          transform: "scale(var(--menu-tl-scale)) rotate(var(--menu-tl-rot))",
          transformOrigin: "top left",
        }}
      >
        <Image
          src={MENU_TL.src}
          alt=""
          fill
          sizes="260px"
          className="object-contain select-none pointer-events-none"
          priority
        />
      </div>
      <div
        aria-hidden
        className="hidden md:block absolute"
        style={{
          right: "calc(50px + var(--menu-tr-x))",
          top: "var(--menu-tr-y)",
          width: "var(--menu-tr-w)",
          height: "var(--menu-tr-h)",
          zIndex: "var(--menu-tr-z)" as unknown as number,
          opacity: "var(--menu-tr-opacity)" as unknown as number,
          transform: "scale(var(--menu-tr-scale)) rotate(var(--menu-tr-rot))",
          transformOrigin: "top right",
        }}
      >
        <Image
          src={MENU_TR.src}
          alt=""
          fill
          sizes="220px"
          className="object-contain select-none pointer-events-none"
          priority
        />
      </div>
      <div
        aria-hidden
        className="hidden md:block absolute"
        style={{
          right: "calc(50px + var(--menu-br-x))",
          bottom: "var(--menu-br-y)",
          width: "var(--menu-br-w)",
          height: "var(--menu-br-h)",
          zIndex: "var(--menu-br-z)" as unknown as number,
          opacity: "var(--menu-br-opacity)" as unknown as number,
          transform: "scale(var(--menu-br-scale)) rotate(var(--menu-br-rot))",
          transformOrigin: "bottom right",
        }}
      >
        <Image
          src={MENU_BR.src}
          alt=""
          fill
          sizes="240px"
          className="object-contain select-none pointer-events-none"
          priority
        />
      </div>

      {/* ---------- MOBILE ---------- */}
      <div className="md:hidden px-6 py-10">
        <h3 className="mb-3 text-xs tracking-[0.25em] font-thin text-white/60">
          MENU
        </h3>

        {/* kategorie */}
        <div className="relative">
          <button
            type="button"
            aria-label="Przewiń kategorie w lewo"
            onClick={() => catScroll(-1)}
            disabled={!catsCanLeft}
            className={`${arrowBtnSm} absolute left-0 top-1/2 -translate-y-1/2 z-10`}
          >
            <ChevronLeft className="mx-auto my-auto" />
          </button>
          <button
            type="button"
            aria-label="Przewiń kategorie w prawo"
            onClick={() => catScroll(1)}
            disabled={!catsCanRight}
            className={`${arrowBtnSm} absolute right-0 top-1/2 -translate-y-1/2 z-10`}
          >
            <ChevronRight className="mx-auto my-auto" />
          </button>

          <div
            ref={catsRailRef}
            className="mx-12 overflow-x-auto whitespace-nowrap scroll-smooth overscroll-x-contain"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch" as any,
            }}
            onTouchStartCapture={stopProp}
            onTouchMoveCapture={stopProp}
            onWheelCapture={stopProp}
          >
            <div className="inline-flex flex-nowrap gap-2 py-1">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCat(c)}
                  aria-pressed={c === activeCat}
                  className={`px-3 py-2 text-sm rounded-full border ${
                    c === activeCat
                      ? `${ACCENT} text-white ring-1 ring-black/30`
                      : "border-white/15 bg-white/5 text-white/80"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* search */}
        <div className="mt-4">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            placeholder="Szukaj po nazwie…"
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-black text-white placeholder-white/50 outline-none px-4 py-3 text-sm font-light"
            aria-label="Szukaj po nazwie"
          />
        </div>

        {/* DWA RZĘDY KARUZEL NA MOBILE, GESTEM */}
        {loading ? (
          <div className="mt-6 grid grid-rows-2 gap-6">
            {Array.from({ length: 2 }).map((_, r) => (
              <div key={r} className="grid grid-cols-2 gap-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-44 bg-white/5" />
                ))}
              </div>
            ))}
          </div>
        ) : groupsM.length === 0 ? (
          <p className="mt-6 text-white/60 text-sm text-center">
            Brak pozycji.
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            {/* TOP row */}
            <div>
              <div
                ref={railTopRef}
                onScroll={() => onScroll("top")}
                className="overflow-x-auto snap-x snap-mandatory scroll-smooth"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  WebkitOverflowScrolling: "touch" as any,
                }}
                onTouchStartCapture={stopProp}
                onTouchMoveCapture={stopProp}
                onWheelCapture={stopProp}
              >
                <div className="flex">
                  {groupsTopM.map((group, gi) => (
                    <div key={gi} className="snap-start shrink-0 w-full">
                      <div className="grid grid-cols-2 gap-4">
                        {group.map((p) => (
                          <CardMobile key={p.id} p={p} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* BOTTOM row */}
            <div>
              <div
                ref={railBotRef}
                onScroll={() => onScroll("bot")}
                className="overflow-x-auto snap-x snap-mandatory scroll-smooth"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  WebkitOverflowScrolling: "touch" as any,
                }}
                onTouchStartCapture={stopProp}
                onTouchMoveCapture={stopProp}
                onWheelCapture={stopProp}
              >
                <div className="flex">
                  {groupsBotM.map((group, gi) => (
                    <div key={gi} className="snap-start shrink-0 w-full">
                      <div className="grid grid-cols-2 gap-4">
                        {group.map((p) => (
                          <CardMobile key={p.id} p={p} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------- DESKTOP ---------- */}
      <div
        className="hidden md:block relative z-10 mx-auto w-full max-w-7xl"
        style={{ paddingLeft: "var(--gutter)", paddingRight: "var(--gutter)" }}
      >
        <div className="py-14 md:py-20 grid grid-cols-12 gap-10">
          {/* SIDEBAR */}
          <aside className="hidden md:block col-span-3">
            <div className="sticky top-20">
              <h3 className="mb-4 text-xs tracking-widest font-light text-white/60">
                MENU
              </h3>

              {firstCat && (
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm font-light rounded-none transition
                    ${
                      activeCat === "Wszystko"
                        ? `text-white ${ACCENT} shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] ring-1 ring-black/30`
                        : "text-white/80 hover:text-white hover:bg-white/5"
                    }`}
                  aria-pressed={activeCat === "Wszystko"}
                  onClick={() => setActiveCat("Wszystko")}
                >
                  Wszystko
                </button>
              )}

              <nav className="mt-2 flex flex-col gap-1">
                {restCats.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm font-light rounded-none transition
                      ${
                        c === activeCat
                          ? `text-white ${ACCENT} shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] ring-1 ring-black/30`
                          : "text-white/80 hover:text-white hover:bg-white/5"
                      }`}
                    aria-pressed={c === activeCat}
                    onClick={() => setActiveCat(c)}
                  >
                    {c}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* CONTENT */}
          <div className="col-span-12 md:col-span-9">
            {/* search */}
            <div className="mb-6 flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setQ("")}
                  placeholder="Szukaj po nazwie…"
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full bg-black text-white placeholder-white/50 outline-none px-4 py-3 text-sm font-light"
                  aria-label="Szukaj po nazwie"
                />
                <span className="pointer-events-none select-none absolute right-4 top-1/2 -translate-y-1/2 text-white/50 text-xs">
                  ⌘K
                </span>
              </div>
            </div>

            {/* dwie karuzele */}
            {loading ? (
              <div className="grid grid-rows-2 gap-8">
                {Array.from({ length: 2 }).map((_, r) => (
                  <div key={r} className="grid grid-cols-3 gap-6">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-72 bg-white/5" />
                    ))}
                  </div>
                ))}
              </div>
            ) : groupsD.length === 0 ? (
              <p className="text-white/60 text-sm font-light">Brak pozycji.</p>
            ) : (
              <div className="space-y-10">
                {/* ROW TOP */}
                <div
                  className="relative"
                  style={{
                    paddingLeft: ARROW_GUTTER_PX,
                    paddingRight: ARROW_GUTTER_PX,
                  }}
                >
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                    <button
                      aria-label="Poprzednia strona (góra)"
                      onClick={() =>
                        railTopRef.current?.scrollBy({
                          left: -(railTopRef.current?.clientWidth || 0),
                          behavior: "smooth",
                        })
                      }
                      className={arrowBtn}
                    >
                      <ChevronLeft className="mx-auto my-auto" />
                    </button>
                  </div>

                  <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                    <button
                      aria-label="Następna strona (góra)"
                      onClick={() =>
                        railTopRef.current?.scrollBy({
                          left: railTopRef.current?.clientWidth || 0,
                          behavior: "smooth",
                        })
                      }
                      className={arrowBtn}
                    >
                      <ChevronRight className="mx-auto my-auto" />
                    </button>
                  </div>

                  <div
                    ref={railTopRef}
                    onScroll={() => onScroll("top")}
                    className="overflow-x-auto snap-x snap-mandatory scroll-smooth"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    <div className="flex">
                      {groupsTopD.map((group, gi) => (
                        <div key={gi} className="snap-start shrink-0 w-full">
                          <div className="grid grid-cols-3 gap-6">
                            {group.map((p) => (
                              <CardDesktop key={p.id} p={p} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ROW BOTTOM */}
                <div
                  className="relative"
                  style={{
                    paddingLeft: ARROW_GUTTER_PX,
                    paddingRight: ARROW_GUTTER_PX,
                  }}
                >
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                    <button
                      aria-label="Poprzednia strona (dół)"
                      onClick={() =>
                        railBotRef.current?.scrollBy({
                          left: -(railBotRef.current?.clientWidth || 0),
                          behavior: "smooth",
                        })
                      }
                      className={arrowBtn}
                    >
                      <ChevronLeft className="mx-auto my-auto" />
                    </button>
                  </div>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                    <button
                      aria-label="Następna strona (dół)"
                      onClick={() =>
                        railBotRef.current?.scrollBy({
                          left: railBotRef.current?.clientWidth || 0,
                          behavior: "smooth",
                        })
                      }
                      className={arrowBtn}
                    >
                      <ChevronRight className="mx-auto my-auto" />
                    </button>
                  </div>

                  <div
                    ref={railBotRef}
                    onScroll={() => onScroll("bot")}
                    className="overflow-x-auto snap-x snap-mandatory scroll-smooth"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    <div className="flex">
                      {groupsBotD.map((group, gi) => (
                        <div key={gi} className="snap-start shrink-0 w-full">
                          <div className="grid grid-cols-3 gap-6">
                            {group.map((p) => (
                              <CardDesktop key={p.id} p={p} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* /karuzele */}
          </div>
        </div>
      </div>
    </section>
  );
}
