// src/components/mobile/MobileMenuView.tsx
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

const ACCENT = "[background:linear-gradient(180deg,#b31217_0%,#7a0b0b_100%)]";

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

const SUBCAT_PREFIX: Record<string, string> = {
  futomaki: "Futomak",
  california: "California",
  hosomaki: "Hosomak",
  nigiri: "Nigiri",
};

const normalizeDisplay = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, " ");

const buildDisplayName = (p: Product): string => {
  const base = p.name || "";
  const sub = (p.subcategory || "").toLowerCase();
  const baseLower = normalizeDisplay(base);
  
  // Check if it's a set (set in name or category)
  const isSet = /zestaw|set/.test(sub) || /zestaw|set/i.test(baseLower);
  
  if (isSet) {
    // If already starts with "Zestaw" - keep it
    if (/^zestaw\s+\d+/i.test(base)) {
      return base;
    }
    
    // Extract number from name
    const num = extractSetNumber(base);
    if (num !== null) {
      return `Zestaw ${num}`;
    }
    
    // If no number, use name with "Zestaw" prefix
    const cleanName = base
      .replace(/\bset\b/gi, "")
      .replace(/\bzestaw\b/gi, "")
      .replace(/\bvege\b/gi, "Vege")
      .replace(/\s+/g, " ")
      .trim();
    return cleanName ? `Zestaw ${cleanName}` : base;
  }
  
  // Standard logic for non-sets
  const prefix = SUBCAT_PREFIX[sub];
  if (!prefix) return base;

  const n = normalizeDisplay(base);
  const prefNorm = normalizeDisplay(prefix);
  const subNorm = normalizeDisplay(sub);

  if (n.startsWith(prefNorm) || n.startsWith(subNorm)) {
    return base;
  }

  return `${prefix} ${base}`;
};

const extractSetNumber = (name: string | null | undefined): number | null => {
  if (!name) return null;
  const match = name.match(/(\d+)/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  return Number.isFinite(num) ? num : null;
};

// Lunch time helpers
const LUNCH_START_MINUTES = 12 * 60;
const LUNCH_CUTOFF_MINUTES = 16 * 60;

const getWarsawTimeInfo = () => {
  try {
    const now = new Date();
    const dayParts = new Intl.DateTimeFormat("pl-PL", {
      timeZone: "Europe/Warsaw",
      weekday: "short",
    }).formatToParts(now);
    
    const timeParts = new Intl.DateTimeFormat("pl-PL", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const hh = Number(timeParts.find((p) => p.type === "hour")?.value ?? "0");
    const mm = Number(timeParts.find((p) => p.type === "minute")?.value ?? "0");
    const minutes = hh * 60 + mm;
    
    const weekday = dayParts.find((p) => p.type === "weekday")?.value ?? "";
    const isWeekend = weekday === "sob" || weekday === "niedz" || weekday === "sob." || weekday === "niedz." || weekday === "so" || weekday === "nd";

    return { minutes, isWeekend };
  } catch {
    const d = new Date();
    const day = d.getDay();
    const isWeekend = day === 0 || day === 6;
    return { 
      minutes: d.getHours() * 60 + d.getMinutes(),
      isWeekend 
    };
  }
};

const isLunchUnavailable = () => {
  const { minutes, isWeekend } = getWarsawTimeInfo();
  return isWeekend || minutes < LUNCH_START_MINUTES || minutes >= LUNCH_CUTOFF_MINUTES;
};

const isLunchProduct = (p: Product) => {
  const cat = norm(String(p.subcategory ?? ""));
  const name = norm(String(p.name ?? ""));
  return /lunch|lunche/.test(cat) || name.startsWith("lunch ");
};

const formatSetDescription = (desc: string | null): string[] => {
  if (!desc) return [];
  const headerMatch = desc.match(/^(\d+\s*szt\.?\s*,?\s*(?:SUROWY|MIESZANY|PIECZONY|WEGE|VEGE)?\s*:?)\s*/i);
  const lines: string[] = [];
  let rest = desc;
  
  if (headerMatch) {
    lines.push(headerMatch[1].trim());
    rest = desc.slice(headerMatch[0].length);
  }
  
  const items = rest.split(/,\s*/).filter(Boolean);
  const result: string[] = [];
  
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const versionMatch = trimmed.match(/^(.*?)\s*\.?\s*(Wersja\s+pieczona\s*\+?\s*\d*\s*z[łl]?.*)$/i);
    if (versionMatch && versionMatch[1] && versionMatch[2]) {
      const before = versionMatch[1].replace(/[.\s]+$/, '').trim();
      const version = versionMatch[2].replace(/^[.\s]+/, '').trim();
      if (before) result.push(before);
      if (version) result.push(version);
    } else {
      result.push(trimmed);
    }
  }
  
  return [...lines, ...result];
};

/** Product image with fallbacks */
function ProductImg({ p, sizes = "50vw" }: { p: Product; sizes?: string }) {
  const candidates = useMemo(() => {
    const base = `/assets/menuphoto/${slugify(p.name)}`;
    const list = [
      p.image_url && (p.image_url.startsWith("http") || p.image_url.startsWith("/"))
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

export default function MobileMenuView() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const { addItem } = useCartStore() as any;

  const [lunchClosed, setLunchClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState<string>("Wszystko");
  const [q, setQ] = useState("");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string[]>([]);
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>({});

  const catsRailRef = useRef<HTMLDivElement | null>(null);
  const [catsCanLeft, setCatsCanLeft] = useState(false);
  const [catsCanRight, setCatsCanRight] = useState(false);

  // Lunch time check
  useEffect(() => {
    const tick = () => setLunchClosed(isLunchUnavailable());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Get restaurant ID from URL path
  useEffect(() => {
    const readSlug = () => {
      if (typeof window === "undefined") return null;
      try {
        const path = window.location.pathname || "";
        const segments = path.split("/").filter(Boolean);
        if (segments.length > 0) {
          return segments[0];
        }
      } catch {}
      return null;
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

    return () => { mounted = false; };
  }, [supabase]);

  // Load products
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

      const rows = (data || []) as Product[];
      const uniqueMap = new Map<string, Product>();
      for (const p of rows) {
        if (!uniqueMap.has(p.id)) uniqueMap.set(p.id, p);
      }
      const unique = Array.from(uniqueMap.values());

      // Helper to extract set number
      const extractSetNumber = (name: string | null | undefined): number | null => {
        if (!name) return null;
        const match = name.match(/(\d+)/);
        if (!match) return null;
        const num = parseInt(match[1], 10);
        return Number.isFinite(num) ? num : null;
      };

      // Sort with preference: Sets (Zestaw 1-13 → Vege → Nigiri → other) → Lunches → rest
      const items = unique.slice().sort((a, b) => {
        const catNormA = normalizeDisplay(a.subcategory || "Inne");
        const catNormB = normalizeDisplay(b.subcategory || "Inne");
        const nameNormA = normalizeDisplay(a.name || "");
        const nameNormB = normalizeDisplay(b.name || "");

        const groupOf = (catNorm: string, nameNorm: string) => {
          if (/zestaw|set/.test(catNorm) || /zestaw|set/.test(nameNorm)) return 0;
          if (/lunch|lunche/.test(catNorm) || nameNorm.startsWith("lunch ")) return 1;
          return 2;
        };

        const gA = groupOf(catNormA, nameNormA);
        const gB = groupOf(catNormB, nameNormB);
        if (gA !== gB) return gA - gB;

        // Inside SETS group - prioritize: Zestaw 1-13 → Vege → Nigiri → other
        if (gA === 0) {
          const getSetKey = (p: Product) => {
            const n = normalizeDisplay(p.name || "");
            const isVege = n.includes("vege") || n.includes("wege");
            const isNigiri = n.includes("nigiri");
            const num = extractSetNumber(p.name);
            
            let group = 3; // other sets
            if (!isVege && !isNigiri && num !== null) {
              group = 0; // Regular numbered sets (Zestaw 1-13)
            } else if (isVege) {
              group = 1; // Vege sets
            } else if (isNigiri) {
              group = 2; // Nigiri set
            }

            const order = num !== null ? num : Infinity;
            return { group, order };
          };

          const keyA = getSetKey(a);
          const keyB = getSetKey(b);

          if (keyA.group !== keyB.group) return keyA.group - keyB.group;
          if (keyA.order !== keyB.order) return keyA.order - keyB.order;
        }

        const posA = typeof a.position === "number" ? a.position : Infinity;
        const posB = typeof b.position === "number" ? b.position : Infinity;
        if (posA !== posB) return posA - posB;

        return (a.name || "").localeCompare(b.name || "", "pl");
      });

      setProducts(items);

      // Build categories
      const rawCats = Array.from(new Set(items.map((p) => p.subcategory || "Inne")))
        .sort((a, b) => a.localeCompare(b, "pl"));

      const isSetCat = (c: string) => /zestaw|set/.test(norm(c));
      const isLunchCat = (c: string) => /lunch|lunche/.test(norm(c));

      const setsCats = rawCats.filter(isSetCat);
      const lunchCats = rawCats.filter(isLunchCat);
      const restCats = rawCats.filter((c) => !isSetCat(c) && !isLunchCat(c));

      const catsOrdered = ["Wszystko", ...setsCats, ...lunchCats, ...restCats];
      setCategories(catsOrdered);
      
      if (activeCat !== "Wszystko" && !catsOrdered.includes(activeCat)) {
        setActiveCat("Wszystko");
      }

      setLoading(false);
    })();

    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, supabase]);

  const visible = useMemo(() => {
    const term = norm(q.trim());

    return products.filter((p) => {
      if (p.available === false) return false;
      const inCat = activeCat === "Wszystko" || (p.subcategory || "Inne") === activeCat;
      if (!inCat) return false;
      if (!term) return true;

      const name = norm(p.name || "");
      const desc = norm(p.description || "");
      const sub = norm(p.subcategory || "");
      return name.includes(term) || desc.includes(term) || sub.includes(term);
    });
  }, [products, activeCat, q]);

  const handleAdd = (p: Product) => {
    const lunchBlocked = lunchClosed && isLunchProduct(p);
    if (p.available === false || lunchBlocked) return;

    const displayName = buildDisplayName(p);
    addItem({
      id: p.id,
      product_id: p.id,
      baseName: p.name,
      name: displayName,
      price: priceNumber(p),
      quantity: 1,
    });
    setJustAdded((prev) => (prev.includes(p.id) ? prev : [...prev, p.id]));
    setTimeout(() => setJustAdded((prev) => prev.filter((id) => id !== p.id)), 900);
  };

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
    el.addEventListener("scroll", updateCatArrows, { passive: true });
    window.addEventListener("resize", updateCatArrows);
    return () => {
      el.removeEventListener("scroll", updateCatArrows);
      window.removeEventListener("resize", updateCatArrows);
    };
  }, [categories, updateCatArrows]);

  const arrowBtn =
    `h-8 w-8 rounded-full text-white ${ACCENT} ring-1 ring-black/30 ` +
    `shadow-[0_8px_16px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] ` +
    `hover:[filter:brightness(1.06)] active:[filter:brightness(0.96)] disabled:opacity-40 disabled:cursor-not-allowed`;

  // Scroll to active category
  const scrollToCat = useCallback((cat: string) => {
    const el = catsRailRef.current;
    if (!el) return;
    const btn = el.querySelector(`[data-cat="${cat}"]`) as HTMLElement;
    if (btn) {
      btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, []);

  const handleCatClick = (cat: string) => {
    setActiveCat(cat);
    scrollToCat(cat);
  };

  return (
    <div className="flex flex-col min-h-full bg-[#0b0b0b]">
      {/* Sticky Header - Search + Categories */}
      <div 
        className="sticky top-0 z-20 bg-[#0b0b0b]/95 backdrop-blur-md border-b border-white/5"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 36px)" }}
      >
        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQ("")}
              placeholder="Szukaj w menu..."
              spellCheck={false}
              autoComplete="off"
              className="w-full bg-white/5 text-white placeholder-white/40 outline-none pl-10 pr-4 py-3 text-[15px] rounded-xl border border-white/10 focus:border-white/20 focus:bg-white/[0.08] transition-colors"
              aria-label="Szukaj w menu"
            />
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Categories - horizontal scroll */}
        <div className="relative">
          <div
            ref={catsRailRef}
            className="overflow-x-auto scroll-smooth overscroll-x-contain px-4 pb-3"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <div className="inline-flex flex-nowrap gap-2">
              {categories.map((c) => {
                const isActive = c === activeCat;
                return (
                  <button
                    key={c}
                    type="button"
                    data-cat={c}
                    onClick={() => handleCatClick(c)}
                    aria-pressed={isActive}
                    className={`shrink-0 px-4 py-2 text-sm font-medium rounded-full border transition-all ${
                      isActive
                        ? "bg-[#a61b1b] text-white border-[#a61b1b] shadow-[0_4px_12px_rgba(166,27,27,0.4)]"
                        : "border-white/15 bg-white/5 text-white/70 active:bg-white/15"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Products List */}
      <div className="flex-1 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+120px)]">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-3 bg-white/[0.03] rounded-2xl animate-pulse">
                <div className="w-24 h-24 bg-white/5 rounded-xl shrink-0" />
                <div className="flex-1 py-1 space-y-2">
                  <div className="h-4 bg-white/5 rounded w-3/4" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
                  <div className="h-5 bg-white/5 rounded w-16 mt-auto" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-white/60 text-sm">Nie znaleziono produktów</p>
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="mt-3 text-sm text-[var(--accent-red,#a61b1b)] font-medium"
              >
                Wyczyść wyszukiwanie
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((p) => {
              const isAdded = justAdded.includes(p.id);
              const lunchBlocked = lunchClosed && isLunchProduct(p);
              const displayName = buildDisplayName(p);
              const isUnavailable = p.available === false || lunchBlocked;
              const isExpanded = !!expandedDesc[p.id];
              const descItems = formatSetDescription(p.description);

              return (
                <article
                  key={p.id}
                  onClick={() => setExpandedDesc(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                  className={`relative flex gap-3 p-3 bg-white/[0.03] rounded-2xl border border-white/5 transition-all cursor-pointer active:scale-[0.98] ${
                    isUnavailable ? "opacity-50" : ""
                  } ${isExpanded ? "border-white/15" : ""}`}
                >
                  {/* Image */}
                  <div className={`relative shrink-0 rounded-xl overflow-hidden bg-black transition-all ${
                    isExpanded ? "w-28 h-28" : "w-24 h-24"
                  }`}>
                    <ProductImg p={p} sizes="112px" />
                    {lunchBlocked && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-white/80 text-center px-1">
                          Do 16:00
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col py-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[15px] font-semibold text-white leading-snug line-clamp-2">
                        {displayName}
                      </h3>
                      {/* Expand indicator */}
                      {p.description && (
                        <svg 
                          className={`w-4 h-4 text-white/30 shrink-0 mt-0.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>

                    {/* Description - collapsed or expanded */}
                    {p.description && (
                      <div className={`mt-1.5 overflow-hidden transition-all ${
                        isExpanded ? "max-h-[500px]" : "max-h-16"
                      }`}>
                        {isExpanded ? (
                          <ul className="space-y-1">
                            {descItems.map((item, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-white/60">
                                <span className="text-[var(--accent-red,#a61b1b)] mt-0.5">•</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <>
                            <p className="text-xs text-white/50 line-clamp-2 leading-relaxed">
                              {descItems.slice(0, 3).join(" • ")}
                            </p>
                            <p className="text-[10px] text-white/30 mt-1.5 italic flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                              Kliknij, aby rozwinąć
                            </p>
                          </>
                        )}
                      </div>
                    )}

                    <div className="mt-auto pt-2 flex items-center justify-between">
                      <span className="text-base font-bold text-white">
                        {priceLabel(p)}
                      </span>

                      {/* Add button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdd(p);
                        }}
                        disabled={isUnavailable}
                        aria-label={`Dodaj ${displayName}`}
                        className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-all ${
                          isAdded
                            ? "bg-green-500 text-white scale-110"
                            : `text-white ${ACCENT} ring-1 ring-black/30 shadow-lg active:scale-95`
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        {isAdded ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Unavailable badge */}
                  {p.available === false && (
                    <div className="absolute top-2 left-2 px-2 py-1 text-[10px] font-semibold bg-red-500/90 text-white rounded-md">
                      Niedostępne
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
