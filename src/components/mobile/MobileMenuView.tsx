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

// ─── Category emoji map ──────────────────────────────────────
const CAT_EMOJI: Record<string, string> = {
  "wszystko": "📋",
  "zestaw": "🍣", "zestawy": "🍣", "set": "🍣",
  "lunch": "🍱", "lunche": "🍱",
  "burger": "🍔", "burgery": "🍔",
  "pancake": "🥞", "pancakes": "🥞", "naleśniki": "🥞",
  "kids": "🧒", "dzieci": "🧒", "dla dzieci": "🧒",
  "frytki": "🍟",
  "napoje": "🥤", "napój": "🥤",
  "sake": "🍶",
  "sosy": "💧", "sos": "💧",
  "sashimi": "🐟",
  "nigiri": "🍣",
  "futomaki": "🍙",
  "california": "🌊",
  "hosomaki": "🔸",
  "inne": "✨",
};

function getCatEmoji(cat: string): string {
  const key = norm(cat);
  for (const [k, v] of Object.entries(CAT_EMOJI)) {
    if (key.includes(k)) return v;
  }
  return "🍽️";
}

// ─── Product tags ────────────────────────────────────────────
function getProductTags(p: Product): { label: string; color: string }[] {
  const tags: { label: string; color: string }[] = [];
  const n = norm(p.name || "");
  const d = norm(p.description || "");
  const sub = norm(p.subcategory || "");

  if (n.includes("vege") || n.includes("wege") || d.includes("vege") || d.includes("wege"))
    tags.push({ label: "🌱 Vege", color: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20" });
  if (n.includes("pikant") || d.includes("pikant") || n.includes("spicy") || d.includes("spicy"))
    tags.push({ label: "🔥 Pikantne", color: "bg-orange-500/15 text-orange-400 ring-orange-500/20" });
  if (n.includes("new") || n.includes("nowosc") || n.includes("nowość"))
    tags.push({ label: "✨ Nowość", color: "bg-amber-500/15 text-amber-300 ring-amber-500/20" });

  return tags;
}

// ─── Check if product is a Set ───────────────────────────────
function isSetProduct(p: Product): boolean {
  const sub = norm(p.subcategory || "");
  const name = norm(p.name || "");
  return /zestaw|set/.test(sub) || /zestaw|set/.test(name);
}

/** Product image with fallbacks */
function ProductImg({ p, sizes = "50vw", cover = true }: { p: Product; sizes?: string; cover?: boolean }) {
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
      className={`${cover ? "object-cover" : "object-contain"} transition`}
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
      image_url: p.image_url ?? undefined,
    });
    setJustAdded((prev) => (prev.includes(p.id) ? prev : [...prev, p.id]));
    setTimeout(() => setJustAdded((prev) => prev.filter((id) => id !== p.id)), 900);
  };

  const updateCatArrows = useCallback(() => {
    // Kept for scroll event listener compatibility
  }, []);

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

  // ─── Lunch timer ────────────────────────────────────────
  const lunchTimeLeft = useMemo(() => {
    if (lunchClosed) return null;
    const { minutes } = getWarsawTimeInfo();
    const left = LUNCH_CUTOFF_MINUTES - minutes;
    if (left <= 0 || left > 300) return null;
    const h = Math.floor(left / 60);
    const m = left % 60;
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
  }, [lunchClosed]);

  // Czy aktywna kategoria to zestawy/lunche?
  const isSetCategory = /zestaw|set/i.test(activeCat);

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0a]">
      {/* ── Sticky Header ── */}
      <div 
        className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur-lg"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        {/* Title row */}
        <div className="px-5 mb-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-1">
                Nasze menu
              </p>
              <h1
                className="text-[22px] font-bold text-white tracking-tight"
                style={{ fontFamily: "var(--font-display), serif" }}
              >
                {activeCat === "Wszystko" ? "Wszystkie dania" : activeCat}
              </h1>
            </div>
            {!loading && (
              <span className="text-[12px] text-white/25 font-medium pb-0.5">
                {visible.length} {visible.length === 1 ? "pozycja" : visible.length < 5 ? "pozycje" : "pozycji"}
              </span>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <div className="relative">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQ("")}
              placeholder="Czego szukasz?"
              spellCheck={false}
              autoComplete="off"
              className="w-full bg-white/[0.05] text-white placeholder-white/25 outline-none pl-11 pr-4 py-3 text-[14px] rounded-xl border border-white/[0.06] focus:border-white/15 focus:bg-white/[0.07] transition-all"
              aria-label="Szukaj w menu"
            />
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"
                aria-label="Wyczyść"
              >
                <svg className="w-3.5 h-3.5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Lunch availability banner */}
        {lunchTimeLeft && activeCat !== "Wszystko" && /lunch/i.test(activeCat) && (
          <div className="mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
            <span className="text-amber-400 text-sm">⏰</span>
            <span className="text-[12px] font-medium text-amber-300">
              Dostępne jeszcze {lunchTimeLeft}
            </span>
          </div>
        )}

        {/* Categories with emoji */}
        <div className="border-b border-white/[0.05]">
          <div
            ref={catsRailRef}
            className="overflow-x-auto scroll-smooth overscroll-x-contain px-5 pb-3"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <div className="inline-flex flex-nowrap gap-1.5">
              {categories.map((c) => {
                const isActive = c === activeCat;
                const emoji = getCatEmoji(c);
                return (
                  <button
                    key={c}
                    type="button"
                    data-cat={c}
                    onClick={() => handleCatClick(c)}
                    aria-pressed={isActive}
                    className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-xl transition-all ${
                      isActive
                        ? "bg-[#a61b1b] text-white shadow-[0_2px_12px_rgba(166,27,27,0.3)]"
                        : "bg-white/[0.05] text-white/50 active:bg-white/10"
                    }`}
                  >
                    <span className="text-[14px] leading-none">{emoji}</span>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Products ── */}
      <div className="flex-1 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+120px)]">
        {loading ? (
          /* Skeleton loader */
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex gap-3.5 p-3.5 rounded-2xl product-enter"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="w-[88px] h-[88px] rounded-xl skeleton-pulse shrink-0" />
                <div className="flex-1 py-1 space-y-2.5">
                  <div className="h-4 rounded w-3/4 skeleton-pulse" />
                  <div className="h-3 rounded w-1/2 skeleton-pulse" />
                  <div className="h-5 rounded w-16 mt-auto skeleton-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-4xl mb-4">🔍</span>
            <p className="text-white/50 text-sm font-medium">Nic nie znaleziono</p>
            <p className="text-white/25 text-xs mt-1">Spróbuj innej frazy</p>
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="mt-5 text-[13px] text-white/60 font-medium px-5 py-2.5 rounded-xl bg-white/[0.06] ring-1 ring-white/[0.06] active:bg-white/10"
              >
                Wyczyść szukaj
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {visible.map((p, idx) => {
              const isAdded = justAdded.includes(p.id);
              const lunchBlocked = lunchClosed && isLunchProduct(p);
              const displayName = buildDisplayName(p);
              const isUnavailable = p.available === false || lunchBlocked;
              const isExpanded = !!expandedDesc[p.id];
              const descItems = formatSetDescription(p.description);
              const tags = getProductTags(p);
              const isSet = isSetProduct(p) && (isSetCategory || activeCat === "Wszystko");

              // ─── SET / FEATURED CARD (duży obrazek) ───
              if (isSet) {
                return (
                  <article
                    key={p.id}
                    onClick={() => setExpandedDesc(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                    className={`relative rounded-2xl overflow-hidden transition-all cursor-pointer product-enter ${
                      isUnavailable ? "opacity-40" : ""
                    }`}
                    style={{ animationDelay: `${Math.min(idx * 60, 400)}ms` }}
                  >
                    {/* Duży image */}
                    <div className="relative w-full aspect-[16/10] bg-white/[0.03]">
                      <ProductImg p={p} sizes="100vw" cover />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                      {/* Badges na obrazku */}
                      {lunchBlocked && (
                        <div className="absolute top-3 left-3 px-2.5 py-1 text-[10px] font-semibold bg-black/60 text-amber-300 rounded-lg backdrop-blur-sm">
                          ⏰ Do 16:00
                        </div>
                      )}
                      {p.available === false && (
                        <div className="absolute top-3 left-3 px-2.5 py-1 text-[10px] font-semibold bg-black/60 text-white/70 rounded-lg backdrop-blur-sm">
                          Niedostępne
                        </div>
                      )}

                      {/* Info overlay na dole obrazka */}
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <div className="flex items-end justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {tags.map((t) => (
                                  <span key={t.label} className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ring-1 ${t.color}`}>
                                    {t.label}
                                  </span>
                                ))}
                              </div>
                            )}
                            <h3
                              className="text-[17px] font-bold text-white leading-snug"
                              style={{ fontFamily: "var(--font-display), serif" }}
                            >
                              {displayName}
                            </h3>
                            {!isExpanded && descItems.length > 0 && (
                              <p className="text-[12px] text-white/50 mt-1 line-clamp-1">
                                {descItems.slice(0, 3).join(" · ")}
                              </p>
                            )}
                          </div>
                          <span className="text-xl font-bold text-white shrink-0">
                            {priceLabel(p)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Expandable description */}
                    {isExpanded && descItems.length > 0 && (
                      <div className="px-4 py-3 bg-white/[0.03] border-t border-white/[0.05]">
                        <ul className="space-y-1.5">
                          {descItems.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-[12px] text-white/45">
                              <span className="w-1 h-1 rounded-full bg-[#a61b1b] mt-1.5 shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Bottom bar: add button */}
                    <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03]">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExpandedDesc(prev => ({ ...prev, [p.id]: !prev[p.id] })); }}
                        className="text-[12px] text-white/40 font-medium flex items-center gap-1"
                      >
                        <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        {isExpanded ? "Zwiń" : "Skład"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleAdd(p); }}
                        disabled={isUnavailable}
                        aria-label={`Dodaj ${displayName}`}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
                          isAdded
                            ? "bg-emerald-500 text-white cart-bounce"
                            : "bg-[#a61b1b] text-white active:scale-[0.97] active:bg-[#8a1515]"
                        } disabled:opacity-30 disabled:cursor-not-allowed`}
                      >
                        {isAdded ? (
                          <>
                            <svg className="w-4 h-4 cart-check-flash" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            Dodano
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Dodaj
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                );
              }

              // ─── COMPACT CARD (standardowe produkty) ───
              return (
                <article
                  key={p.id}
                  onClick={() => setExpandedDesc(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                  className={`relative flex gap-3.5 p-3.5 rounded-2xl transition-all cursor-pointer product-enter ${
                    isUnavailable ? "opacity-40" : ""
                  } ${
                    isExpanded
                      ? "bg-white/[0.05] ring-1 ring-white/[0.06]"
                      : "bg-white/[0.025] active:bg-white/[0.05]"
                  }`}
                  style={{ animationDelay: `${Math.min(idx * 60, 400)}ms` }}
                >
                  {/* Image */}
                  <div className="relative shrink-0 w-[88px] h-[88px] rounded-xl overflow-hidden bg-white/[0.03]">
                    <ProductImg p={p} sizes="88px" cover />
                    {lunchBlocked && (
                      <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                        <span className="text-[9px] font-semibold text-amber-300 text-center px-1.5 py-0.5 bg-black/50 rounded">
                          Do 16:00
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col py-0.5">
                    {/* Tags */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {tags.map((t) => (
                          <span key={t.label} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ring-1 ${t.color}`}>
                            {t.label}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[14px] font-semibold text-white leading-snug">
                        {displayName}
                      </h3>
                      {p.description && (
                        <svg 
                          className={`w-3.5 h-3.5 text-white/15 shrink-0 mt-0.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} 
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>

                    {/* Description */}
                    {p.description && (
                      <div className={`overflow-hidden transition-all ${
                        isExpanded ? "max-h-[500px] mt-2" : "max-h-10 mt-1"
                      }`}>
                        {isExpanded ? (
                          <ul className="space-y-1">
                            {descItems.map((item, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-[12px] text-white/40">
                                <span className="w-1 h-1 rounded-full bg-[#a61b1b]/60 mt-1.5 shrink-0" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[12px] text-white/30 line-clamp-1">
                            {descItems.slice(0, 3).join(" · ")}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Price + Add */}
                    <div className="mt-auto pt-2 flex items-center justify-between">
                      <span className="text-[16px] font-bold text-white">
                        {priceLabel(p)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleAdd(p); }}
                        disabled={isUnavailable}
                        aria-label={`Dodaj ${displayName}`}
                        className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center transition-all ${
                          isAdded
                            ? "bg-emerald-500 text-white cart-bounce"
                            : "bg-white/[0.08] text-white/70 ring-1 ring-white/[0.06] active:scale-95 active:bg-[#a61b1b] active:text-white active:ring-0"
                        } disabled:opacity-25 disabled:cursor-not-allowed`}
                      >
                        {isAdded ? (
                          <svg className="w-4 h-4 cart-check-flash" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Unavailable badge */}
                  {p.available === false && (
                    <div className="absolute top-3 left-3 px-2 py-0.5 text-[9px] font-semibold bg-black/60 text-white/60 rounded backdrop-blur-sm">
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
