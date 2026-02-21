// src/components/menu/MenuSection.tsx
"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import type { CSSProperties } from "react";
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

/**
 * Formatuje opis zestawu: rozdziela elementy na osobne linie.
 * Np. "16 szt, SUROWY: 6x Futomaki łosoś, 8x Hosomaki" →
 *   ["16 szt, SUROWY:", "6x Futomaki łosoś", "8x Hosomaki"]
 */
const formatSetDescription = (desc: string | null): string[] => {
  if (!desc) return [];
  
  // Znajdź nagłówek (np. "16 szt, SUROWY:" lub "22 szt, MIESZANY:")
  const headerMatch = desc.match(/^(\d+\s*szt\.?\s*,?\s*(?:SUROWY|MIESZANY|PIECZONY|WEGE|VEGE)?\s*:?)\s*/i);
  
  const lines: string[] = [];
  let rest = desc;
  
  if (headerMatch) {
    lines.push(headerMatch[1].trim());
    rest = desc.slice(headerMatch[0].length);
  }
  
  // Podziel pozostałą część po przecinkach, ale uwzględnij wzorce jak "6x", "8x" itp.
  // Każdy element zaczyna się od liczby + "x" (np. "6x Futomaki")
  const items = rest.split(/,\s*/).filter(Boolean);
  
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    
    // Sprawdź czy w środku jest "Wersja pieczona" - jeśli tak, rozdziel
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

const normalizeDisplay = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/**
 * Mapuje kolejność produktów zestawowych na numery Zestaw 1-N.
 * Używa cache globalnego żeby zachować spójność numeracji.
 */
let setDisplayCache: Map<string, string> | null = null;

const buildDisplayName = (p: Product): string => {
  const base = p.name || "";
  const sub = (p.subcategory || "").toLowerCase();
  const baseLower = normalizeDisplay(base);
  
  // Sprawdź czy to zestaw (set w nazwie lub kategorii)
  const isSet = /zestaw|set/.test(sub) || /zestaw|set/i.test(baseLower);
  
  if (isSet) {
    // Jeśli już zaczyna się od "Zestaw" - zostaw
    if (/^zestaw\s+\d+/i.test(base)) {
      return base;
    }
    
    // Wyciągnij numer z nazwy
    const num = extractSetNumber(base);
    if (num !== null) {
      return `Zestaw ${num}`;
    }
    
    // Jeśli nie ma numeru, użyj nazwy z "Zestaw" prefix
    // np. "Nigiri set" -> "Zestaw Nigiri"
    const cleanName = base
      .replace(/\bset\b/gi, "")
      .replace(/\bzestaw\b/gi, "")
      .replace(/\bvege\b/gi, "Vege")
      .replace(/\s+/g, " ")
      .trim();
    return cleanName ? `Zestaw ${cleanName}` : base;
  }
  
  // Standardowa logika dla nie-zestawów
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

// START: lunch time helpers (Warsaw)
// Lunche dostępne: pon-pt 12:00-16:00
const LUNCH_START_MINUTES = 12 * 60; // 12:00
const LUNCH_CUTOFF_MINUTES = 16 * 60; // 16:00

const getWarsawTimeInfo = () => {
  try {
    const now = new Date();
    
    // Pobierz dzień tygodnia w strefie Warsaw
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
    
    // Sprawdź dzień tygodnia (sob/ndz = weekend)
    const weekday = dayParts.find((p) => p.type === "weekday")?.value ?? "";
    const isWeekend = weekday === "sob" || weekday === "niedz" || weekday === "sob." || weekday === "niedz." || weekday === "so" || weekday === "nd";

    return { minutes, isWeekend };
  } catch {
    // fallback: czas lokalny przeglądarki
    const d = new Date();
    const day = d.getDay();
    const isWeekend = day === 0 || day === 6; // 0 = niedziela, 6 = sobota
    return { 
      minutes: d.getHours() * 60 + d.getMinutes(),
      isWeekend 
    };
  }
};

// Sprawdza czy lunche są obecnie NIEDOSTĘPNE
const isLunchUnavailable = () => {
  const { minutes, isWeekend } = getWarsawTimeInfo();
  // Niedostępne gdy: weekend LUB poza godzinami 12:00-16:00
  return isWeekend || minutes < LUNCH_START_MINUTES || minutes >= LUNCH_CUTOFF_MINUTES;
};

const isLunchProduct = (p: Product) => {
  const cat = norm(String(p.subcategory ?? ""));
  const name = norm(String(p.name ?? ""));
  return /lunch|lunche/.test(cat) || name.startsWith("lunch ");
};
// END: lunch time helpers


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

// prosty hook do wykrycia mobile (Tailwind lg ~ 1024px)
function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width:${breakpoint - 1}px)`);

    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}

export default function MenuSection() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const { addItem } = useCartStore() as any;
  const isMobile = useIsMobile();

  // START: lunchClosed state (Warsaw time)
  // Lunche dostępne tylko pon-pt 12:00-16:00
const [lunchClosed, setLunchClosed] = useState(false);

useEffect(() => {
  const tick = () => {
    setLunchClosed(isLunchUnavailable());
  };

  tick();
  const id = window.setInterval(tick, 30_000);
  return () => window.clearInterval(id);
}, []);
// END: lunchClosed state


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
  const [visibleLimit, setVisibleLimit] = useState<number>(8);


  const catsRailRef = useRef<HTMLDivElement | null>(null);
  const [catsCanLeft, setCatsCanLeft] = useState(false);
  const [catsCanRight, setCatsCanRight] = useState(false);

  const stopProp = (e: any) => e.stopPropagation();

  // ---------------- SLUG → restaurant_id ----------------
  useEffect(() => {
    const readSlug = () => {
      if (typeof window === "undefined") return null;

      // 1) slug z pierwszego segmentu ścieżki: /przasnysz, /ciechanow/regulamin
      try {
        const path = window.location.pathname || "";
        const segments = path.split("/").filter(Boolean);
        if (segments.length > 0) {
          return segments[0]; // "przasnysz", "ciechanow", "szczytno", ...
        }
      } catch {
        // ignore
      }

      // 2) localStorage – gdyby ktoś wszedł np. z /?slug=...
      const keys = ["citySlug", "branch", "restaurantSlug", "restaurant_slug"];
      for (const k of keys) {
        try {
          const v = window.localStorage.getItem(k);
          if (v) return v;
        } catch {
          // brak dostępu do localStorage
        }
      }

      // 3) query param ?slug=
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

        if (mounted) {
          setRestaurantId(r?.id ?? null);
        }
      } else {
        const { data: rFirst } = await supabase
          .from("restaurants")
          .select("id")
          .limit(1)
          .maybeSingle<RestaurantIdRow>();

        if (mounted) {
          setRestaurantId(rFirst?.id ?? null);
        }
      }

      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  // ---------------- produkty dla danego restaurant_id ----------------
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

      // unikamy duplikatów po id
      const uniqueMap = new Map<string, Product>();
      for (const p of rows) {
        if (!uniqueMap.has(p.id)) uniqueMap.set(p.id, p);
      }
      const unique = Array.from(uniqueMap.values());

            // sortowanie z preferencją: Zestawy → Lunche → reszta
      // Zestawy: Zestaw 1–13 → Vege set 1–2 → pozostałe sety
      // Lunche: Lunch 1–N
      const items = unique.slice().sort((a, b) => {
        const catA = a.subcategory || "Inne";
        const catB = b.subcategory || "Inne";
        const catNormA = normalizeDisplay(catA);
        const catNormB = normalizeDisplay(catB);
        const nameNormA = normalizeDisplay(a.name || "");
        const nameNormB = normalizeDisplay(b.name || "");

        const posA =
          typeof a.position === "number"
            ? a.position
            : Number.POSITIVE_INFINITY;
        const posB =
          typeof b.position === "number"
            ? b.position
            : Number.POSITIVE_INFINITY;

        const groupOf = (catNorm: string, nameNorm: string) => {
          const isSet =
            /zestaw|set/.test(catNorm) || /zestaw|set/.test(nameNorm);
          if (isSet) return 0;

          const isLunch =
            /lunch|lunche/.test(catNorm) || nameNorm.startsWith("lunch ");
          if (isLunch) return 1;

          return 2;
        };

        const gA = groupOf(catNormA, nameNormA);
        const gB = groupOf(catNormB, nameNormB);
        if (gA !== gB) return gA - gB;

        // ----- ZESTAWY -----
        if (gA === 0) {
          const getSetKey = (p: Product) => {
            const n = normalizeDisplay(p.name || "");
            const s = normalizeDisplay(p.subcategory || "");
            const isSetInner = /zestaw|set/.test(s) || /zestaw|set/.test(n);
            if (!isSetInner) return null;

            const isVege = n.includes("vege") || n.includes("wege");
            const isNigiri = n.includes("nigiri");
            const num = extractSetNumber(p.name);
            
            // Priorytet sortowania:
            // 0: "Zestaw X" (bez vege/nigiri, z numerem) - np. "Zestaw 1", "Zestaw 2"
            // 1: Vege sety - np. "Vege set 1"
            // 2: Nigiri set
            // 3: Inne sety bez numeru
            let group = 3;
            
            if (!isVege && !isNigiri && num !== null) {
              group = 0; // Zwykłe zestawy z numerem (Zestaw 1-13)
            } else if (isVege) {
              group = 1; // Vege sety
            } else if (isNigiri) {
              group = 2; // Nigiri set
            }

            const order = num !== null ? num : Number.POSITIVE_INFINITY;

            return { group, order };
          };

          const keyA = getSetKey(a);
          const keyB = getSetKey(b);

          if (keyA && keyB) {
            if (keyA.group !== keyB.group) return keyA.group - keyB.group;
            if (keyA.order !== keyB.order) return keyA.order - keyB.order;
          }

          // fallback w obrębie zestawów
          const catCmp = catNormA.localeCompare(catNormB, "pl");
          if (catCmp !== 0) return catCmp;
          if (posA !== posB) return posA - posB;
          return (a.name || "").localeCompare(b.name || "", "pl");
        }

        // ----- LUNCHE -----
        if (gA === 1) {
          const nA = extractSetNumber(a.name);
          const nB = extractSetNumber(b.name);
          const oA = nA ?? Number.POSITIVE_INFINITY;
          const oB = nB ?? Number.POSITIVE_INFINITY;

          if (oA !== oB) return oA - oB;
          if (posA !== posB) return posA - posB;
          return (a.name || "").localeCompare(b.name || "", "pl");
        }

        // ----- RESZTA -----
        const catCmp = catNormA.localeCompare(catNormB, "pl");
        if (catCmp !== 0) return catCmp;
        if (posA !== posB) return posA - posB;
        return (a.name || "").localeCompare(b.name || "", "pl");
      });

      setProducts(items);

            // kategorie: Wszystko → Zestawy → Lunche → reszta
      const rawCats = Array.from(
        new Set(items.map((p) => p.subcategory || "Inne"))
      ).sort((a, b) => a.localeCompare(b, "pl"));

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

    return () => {
      mounted = false;
    };
  }, [restaurantId, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const term = norm(q.trim());

    return products.filter((p) => {
      // 1) produkt wyłączony w panelu – w ogóle go nie pokazujemy
      if (p.available === false) return false;

      // 2) filtr kategorii
      const inCat =
        activeCat === "Wszystko" || (p.subcategory || "Inne") === activeCat;
      if (!inCat) return false;

      // 3) brak frazy – wszystko z danej kategorii
      if (!term) return true;

      // 4) wyszukiwanie po nazwie / opisie / kategorii
      const name = norm(p.name || "");
      const desc = norm(p.description || "");
      const sub = norm(p.subcategory || "");

      return name.includes(term) || desc.includes(term) || sub.includes(term);
    });
  }, [products, activeCat, q]);

  // limit widocznych pozycji: desktop 8, mobile 4
  useEffect(() => {
    setVisibleLimit(isMobile ? 4 : 8);
  }, [isMobile, activeCat, q, visible.length]);

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
  setTimeout(
    () => setJustAdded((prev) => prev.filter((id) => id !== p.id)),
    900
  );
};


  const arrowBtnSm =
    `h-10 w-10 rounded-full text-white ${ACCENT} ring-1 ring-black/30 ` +
    `shadow-[0_10px_18px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] ` +
    `hover:[filter:brightness(1.06)] active:[filter:brightness(0.96)] disabled:opacity-40 disabled:cursor-not-allowed`;

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
    const lunchBlocked = lunchClosed && isLunchProduct(p);
    const expanded = !!expandedDesc[p.id];
    const displayName = buildDisplayName(p);

    return (
      <article
        key={p.id}
        tabIndex={0}
        className="group relative bg-white/[0.02] rounded-2xl overflow-hidden border border-white/5 hover:border-white/10 transition-all"
      >
        <div className="relative aspect-square bg-black/50 overflow-hidden">
          <ProductImg p={p} sizes="50vw" />
          {lunchBlocked && (
            <div className="absolute top-2 left-2 px-2 py-1 text-[10px] font-medium bg-black/60 backdrop-blur-sm text-white rounded-lg">
              Lunch do 16:00
            </div>
          )}
          {p.available === false && (
            <div className="absolute top-2 right-2 px-2 py-1 text-[10px] font-medium bg-[#a61b1b] text-white rounded-lg">
              Niedostępne
            </div>
          )}
        </div>

        <div className="p-3">
          <h4 className="text-[13px] font-semibold leading-snug text-white">
            {displayName}
          </h4>

          {p.description && (
            <div className="mt-1.5 text-[11px] font-light text-white/50 leading-relaxed">
              {(() => {
                const lines = formatSetDescription(p.description);
                const showAll = expanded || lines.length <= 4;
                const displayLines = showAll ? lines : lines.slice(0, 3);
                return (
                  <>
                    <ul className="space-y-0.5 list-none">
                      {displayLines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                      {!showAll && <li className="text-white/30">…</li>}
                    </ul>
                    {lines.length > 4 && (
                      <button
                        type="button"
                        className="mt-1.5 text-[10px] text-white/40 hover:text-white/60 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedDesc((s) => ({
                            ...s,
                            [p.id]: !s[p.id],
                          }));
                        }}
                        aria-expanded={expanded}
                      >
                        {expanded ? "Pokaż mniej ↑" : "Pokaż więcej ↓"}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-bold text-white">
              {priceLabel(p)}
            </span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAdd(p);
              }}
              disabled={p.available === false || lunchBlocked}
              aria-label={`Dodaj ${displayName}`}
              className={`h-10 w-10 shrink-0 rounded-full text-white ${ACCENT}
                shadow-[0_6px_20px_rgba(166,27,27,0.4)]
                hover:[filter:brightness(1.08)] active:scale-95 transition-all
                disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <ShoppingCart className="h-4 w-4 mx-auto my-auto" />
            </button>
          </div>

          {isAdded && (
            <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-black flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </div>
      </article>
    );
  };

  const CardDesktop = ({ p }: { p: Product }) => {
    const isAdded = justAdded.includes(p.id);
    const lunchBlocked = lunchClosed && isLunchProduct(p);
    const expanded = !!expandedDesc[p.id];
    const displayName = buildDisplayName(p);

    return (
      <article
        key={p.id}
        tabIndex={0}
        onClick={() => !lunchBlocked && handleAdd(p)}
        className="group relative bg-white/[0.02] rounded-2xl overflow-hidden border border-white/5 hover:border-white/15 transition-all cursor-pointer"
      >
        <div className="relative aspect-square bg-black/50 overflow-hidden">
          <ProductImg p={p} sizes="33vw" />
          {lunchBlocked && (
            <div className="absolute top-3 left-3 px-3 py-1.5 text-xs font-medium bg-black/60 backdrop-blur-sm text-white rounded-lg">
              Lunch do 16:00
            </div>
          )}
          {p.available === false && (
            <div className="absolute top-3 right-3 px-3 py-1.5 text-xs font-medium bg-[#a61b1b] text-white rounded-lg">
              Niedostępne
            </div>
          )}
        </div>

        <div className="p-4">
          <h4 className="text-base font-semibold leading-snug text-white">
            {displayName}
          </h4>

          {p.description && (
            <div className="mt-2 text-sm font-light text-white/50 leading-relaxed">
              {(() => {
                const lines = formatSetDescription(p.description);
                const showAll = expanded || lines.length <= 5;
                const displayLines = showAll ? lines : lines.slice(0, 4);
                return (
                  <>
                    <ul className="space-y-0.5 list-none">
                      {displayLines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                      {!showAll && <li className="text-white/30">…</li>}
                    </ul>
                    {lines.length > 5 && (
                      <button
                        type="button"
                        className="mt-2 text-xs text-white/40 hover:text-white/60 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedDesc((s) => ({
                            ...s,
                            [p.id]: !s[p.id],
                          }));
                        }}
                        aria-expanded={expanded}
                      >
                        {expanded ? "Pokaż mniej ↑" : "Pokaż więcej ↓"}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <span className="text-base font-bold text-white">
              {priceLabel(p)}
            </span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAdd(p);
              }}
              disabled={p.available === false || lunchBlocked}
              aria-label={`Dodaj ${displayName}`}
              className={`h-11 w-11 shrink-0 rounded-full text-white ${ACCENT}
                shadow-[0_8px_24px_rgba(166,27,27,0.4)]
                hover:[filter:brightness(1.08)] active:scale-95 transition-all
                disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <ShoppingCart className="h-5 w-5 mx-auto my-auto" />
            </button>
          </div>

          {isAdded && (
            <span className="absolute top-3 right-3 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-black flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </div>
      </article>
    );
  };

  return (
    <section
      id="menu"
      className="relative z-[60] w-full text-white scroll-mt-24"
      style={
        {
          backgroundColor: "#0b0b0b",
          ["--gutter" as any]: GUTTER,
          ["--menu-tl-w" as any]: MENU_TL.w,
          ["--menu-tl-h" as any]: MENU_TL.h,
          ["--menu-tl-x" as any]: MENU_TL.x,
          ["--menu-tl-y" as any]: MENU_TL.y,
          ["--menu-tl-z" as any]: MENU_TL.z,
          ["--menu-tl-opacity" as any]: MENU_TL.opacity,
          ["--menu-tl-scale" as any]: MENU_TL.scale,
          ["--menu-tl-rot" as any]: MENU_TL.rot,
          ["--menu-br-w" as any]: MENU_BR.w,
          ["--menu-br-h" as any]: MENU_BR.h,
          ["--menu-br-x" as any]: MENU_BR.x,
          ["--menu-br-y" as any]: MENU_BR.y,
          ["--menu-br-z" as any]: MENU_BR.z,
          ["--menu-br-opacity" as any]: MENU_BR.opacity,
          ["--menu-br-scale" as any]: MENU_BR.scale,
          ["--menu-br-rot" as any]: MENU_BR.rot,
        } as CSSProperties
      }
    >
      {/* dekoracje desktop */}
      <div
        aria-hidden
        className="hidden md:block absolute"
        style={{
          left: "calc(50px + var(--menu-tl-x))",
          top: "var(--menu-tl-y)",
          width: "var(--menu-tl-w)",
          height: "var(--menu-tl-h)",
          zIndex: "var(--menu-tl-z)" as any,
          opacity: "var(--menu-tl-opacity)" as any,
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
          right: "calc(50px + var(--menu-br-x))",
          bottom: "var(--menu-br-y)",
          width: "var(--menu-br-w)",
          height: "var(--menu-br-h)",
          zIndex: "var(--menu-br-z)" as any,
          opacity: "var(--menu-br-opacity)" as any,
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
      <div className="md:hidden px-6 pt-16 pb-10">
        <h3 className="mb-3 text-xs tracking-[0.25em] font-thin text-white/60 text-center">
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
                  className={`px-4 py-2 text-sm font-medium rounded-full border transition-all ${
                    c === activeCat
                      ? "bg-[#a61b1b] text-white border-[#a61b1b] shadow-[0_4px_12px_rgba(166,27,27,0.4)]"
                      : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* search */}
        <div className="mt-4 relative z-10">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            placeholder="Szukaj po nazwie…"
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-black text-white placeholder-white/50 outline-none px-4 py-3 text-sm font-light rounded-md border border-white/15"
            aria-label="Szukaj po nazwie"
          />
        </div>

        {/* lista produktów – grid + pokaż więcej */}
        {loading ? (
          <div className="mt-6 grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-44 bg:white/5 bg-white/5 rounded-md" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="mt-6 text-white/60 text-sm text-center">
            Brak pozycji.
          </p>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4">
              {visible.slice(0, visibleLimit).map((p) => (
                <CardMobile key={p.id} p={p} />
              ))}
            </div>
            {visibleLimit < visible.length && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleLimit(visible.length)}
                  className="px-4 py-2 text-sm rounded-full border border-white/40 bg-white/5 text-white hover:bg-white/10"
                >
                  Pokaż więcej
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ---------- DESKTOP ---------- */}
      <div
        className="hidden md:block relative z-10 mx-auto w-full max-w-7xl"
        style={{ paddingLeft: GUTTER, paddingRight: GUTTER }}
      >
        <div className="py-14 md:py-20 grid grid-cols-12 gap-10">
          {/* SIDEBAR */}
          <aside className="hidden md:block col-span-3">
            <div className="sticky top-20">
              <h3 className="mb-4 text-xs tracking-widest font-light text-white/60">
                MENU
              </h3>

              <nav className="mt-2 flex flex-col gap-1">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-full text-left px-4 py-2.5 text-sm font-medium rounded-lg transition-all
                      ${
                        c === activeCat
                          ? "bg-[#a61b1b] text-white shadow-[0_4px_12px_rgba(166,27,27,0.4)]"
                          : "text-white/70 hover:text-white hover:bg-white/10"
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

            {/* lista produktów – grid + pokaż więcej */}
            {loading ? (
              <div className="grid grid-cols-3 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-72 bg-white/5 rounded-md" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <p className="text-white/60 text-sm font-light">Brak pozycji.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-6">
                  {visible.slice(0, visibleLimit).map((p) => (
                    <CardDesktop key={p.id} p={p} />
                  ))}
                </div>
                {visibleLimit < visible.length && (
                  <div className="mt-8 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit(visible.length)}
                      className="px-5 py-2 text-sm rounded-full border border-white/40 bg-white/5 text-white hover:bg-white/10"
                    >
                      Pokaż więcej
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
