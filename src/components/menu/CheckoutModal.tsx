// src/components/menu/CheckoutModal.tsx
"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useDeferredValue,
  useCallback,
} from "react";
import Script from "next/script";
import { X, ShoppingBag, Truck } from "lucide-react";
import clsx from "clsx";
import QRCode from "react-qr-code";
import { useSession } from "@supabase/auth-helpers-react";
import { createClient } from "@supabase/supabase-js";
import { toZonedTime } from "date-fns-tz";
import useIsClient from "@/lib/useIsClient";
import useCartStore from "@/store/cartStore";
import AddressAutocomplete from "@/components/menu/AddressAutocomplete";

/* ---------- ENV / const ---------- */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
declare global {
  interface Window {
    turnstile?: any;
  }
}

const TERMS_VERSION = process.env.NEXT_PUBLIC_TERMS_VERSION || "2025-09-15";
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const THANKS_QR_URL =
  process.env.NEXT_PUBLIC_REVIEW_QR_URL || "https://g.co/kgs/47NSDMH";

/** QR do opinii Google per miasto (fallback: THANKS_QR_URL) */
const CITY_REVIEW_QR_URLS: Record<string, string> = {
  ciechanow: process.env.NEXT_PUBLIC_REVIEW_QR_CIECHANOW || THANKS_QR_URL,
  przasnysz: process.env.NEXT_PUBLIC_REVIEW_QR_PRZASNYSZ || THANKS_QR_URL,
  szczytno: process.env.NEXT_PUBLIC_REVIEW_QR_SZCZYTNO || THANKS_QR_URL,
  plonsk: process.env.NEXT_PUBLIC_REVIEW_QR_PLONSK || THANKS_QR_URL,
  mlawa: process.env.NEXT_PUBLIC_REVIEW_QR_MLAWA || THANKS_QR_URL,
  pultusk: process.env.NEXT_PUBLIC_REVIEW_QR_PULTUSK || THANKS_QR_URL,
};

/** WYMÓG: adres musi być wybrany z Autocomplete (posiadamy współrzędne) */
const REQUIRE_AUTOCOMPLETE = true;

type OrderOption = "takeaway" | "delivery";
type Zone = {
  id: string;
  min_distance_km: number;
  max_distance_km: number;
  min_order_value: number;
  cost: number;
  free_over: number | null;
  eta_min_minutes: number;
  eta_max_minutes: number;
  pricing_type?: "per_km" | "flat";
  active?: boolean;
};
type ProductDb = {
  id: string;
  name: string;
  subcategory: string | null;
  description: string | null;
};
type Promo =
  | { code: string; type: "percent" | "amount"; value: number }
  | null;

/* Sushi sosy i dodatki */
const SAUCES = [
  "Sos sojowy",
  "Teryiaki",
  "Spicy Mayo",
  "Mango",
  "Sriracha",
  "Żurawina",
];
const EXTRAS = ["Tempura", "Płatek sojowy", "Tamago", "Ryba pieczona"];
const SWAP_FEE_NAME = "Zamiana w zestawie";

/* Helper: rozpoznanie specjalnej California z opcją Ryby pieczonej +2 zł */
function isSpecialCaliforniaBakedFishProduct(
  name: string,
  description?: string | null
): boolean {
  const text = `${name} ${description || ""}`.toLowerCase();
  if (!text.includes("california")) return false;

  // Szukamy zestawu słów: łosoś surowy + paluszek krabowy + krewetka
  return (
    text.includes("łosoś") &&
    text.includes("surow") &&
    text.includes("paluszek krabowy") &&
    text.includes("krewet")
  );
}

/* Spójne liczenie ceny dodatków (także 2 zł dla spec. California) */
function computeAddonPrice(addon: string, product?: ProductDb | null): number {
  if (SAUCES.includes(addon)) return 3;
  if (addon === SWAP_FEE_NAME) return 5;

  // Domyślna cena dodatków typu Tempura / Płatek / Tamago / Ryba pieczona
  const price = 4;

  if (!product) return price;

  const subcat = (product.subcategory || "").toLowerCase();
  const isSpecialCalifornia =
    subcat === "california" &&
    isSpecialCaliforniaBakedFishProduct(product.name, product.description);

  // Wyjątek: specjalna California – Ryba pieczona +2 zł
  if (addon === "Ryba pieczona" && isSpecialCalifornia) {
    return 2;
  }

  return price;
}

/* helper dla widoczności elementu (używany przez Turnstile) */
const isVisible = (el: HTMLDivElement | null) => !!el && !!el.offsetParent;

/* ---------- helpers ---------- */
const accentBtn =
  "bg-gradient-to-b from-[#b31217] to-[#7a0b0b] text-white shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] ring-1 ring-black/30";

/* ================= GODZINY OTWARCIA PER MIASTO ================= */
type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = niedziela
type Range = [h: number, m: number, H: number, M: number];

const CITY_SCHEDULE: Record<
  string,
  Partial<Record<Day, Range>> & { default?: Range }
> = {
  // Ciechanów: pon–czw i niedz 12:00–20:30, piątek 12:00–21:30, sobota 12:00–20:30
  ciechanow: {
    0: [12, 0, 20, 30], // nd
    1: [12, 0, 20, 30], // pn
    2: [12, 0, 20, 30], // wt
    3: [12, 0, 20, 30], // śr
    4: [12, 0, 21, 30], // pt
    5: [12, 0, 20, 30], // sob
    6: [12, 0, 20, 30],
  },
  // Przasnysz i Szczytno: codziennie 12:00–20:30
  przasnysz: { default: [12, 0, 20, 30] },
  szczytno: { default: [12, 0, 20, 30] },
};

const tz = "Europe/Warsaw";
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (r: Range) => `${pad(r[0])}:${pad(r[1])}–${pad(r[2])}:${pad(r[3])}`;
const MIN_SCHEDULE_MINUTES = 60;

function todayRangeFor(
  slug: string,
  d = toZonedTime(new Date(), tz)
): Range | null {
  const sch = CITY_SCHEDULE[slug] ?? CITY_SCHEDULE["przasnysz"];
  const r = sch[d.getDay() as Day] ?? sch.default ?? null;
  return r ?? null;
}

function isOpenFor(slug: string, d = toZonedTime(new Date(), tz)) {
  const r = todayRangeFor(slug, d);
  if (!r) return { open: false, label: "zamknięte", range: null as Range | null };
  const mins = d.getHours() * 60 + d.getMinutes();
  const o = r[0] * 60 + r[1];
  const c = r[2] * 60 + r[3];
  return { open: mins >= o && mins <= c, label: fmt(r), range: r };
}
/* ================================================================= */

/* Czas dostawy wskazany przez klienta */
const buildClientDeliveryTime = (
  selectedOption: OrderOption | null,
  deliveryTimeOption: "asap" | "schedule",
  scheduledTime: string
): string | null => {
  if (selectedOption !== "delivery") return null;
  if (deliveryTimeOption === "asap") return "asap";
  const [hours, minutes] = scheduledTime.split(":").map(Number);
  const nowZoned = toZonedTime(new Date(), tz);
  const dt = new Date(nowZoned);
  dt.setHours(hours, minutes, 0, 0);
  if (dt.getTime() < nowZoned.getTime()) dt.setDate(dt.getDate() + 1);
  return dt.toISOString();
};

const safeFetch = async (url: string, opts: RequestInit) => {
  const res = await fetch(url, { credentials: "same-origin", ...opts });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  return data;
};

/** Etykieta i slug restauracji z pierwszego segmentu URL */
function getRestaurantCityFromPath(): { slug: string; label: string } {
  if (typeof window === "undefined") return { slug: "", label: "wybranym mieście" };
  const first = window.location.pathname.split("/").filter(Boolean)[0] || "";
  const slug = first.toLowerCase();
  const MAP: Record<string, string> = {
    ciechanow: "Ciechanów",
    szczytno: "Szczytno",
    przasnysz: "Przasnysz",
    plonsk: "Płońsk",
    mlawa: "Mława",
    pultusk: "Pułtusk",
  };
  const label =
    MAP[slug] ||
    (slug ? slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "wybranym mieście");
  return { slug, label };
}

/* NEW: prosty hook do wykrycia mobile (Tailwind lg = 1024) */
function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width:${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, [breakpoint]);
  return isMobile;
}

/* NEW: górny pasek akcji tylko na mobile */
function MobileTopBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:hidden sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-black/10 -mx-6 px-6 py-2">
      {children}
    </div>
  );
}

/* ===== utile produktu i zestawu ===== */
const normalize = (s: string) => s.toLowerCase();

function parseSetComposition(desc?: string | null) {
  if (!desc) return [] as { qty: number; cat: string; from: string }[];
  // przykład: "16 szt, SUROWY: 6x Futomaki łosoś philadelphia surowy, 8x Hosomaki ogórek, ..."
  const listPart = desc.split(":").slice(1).join(":") || desc;
  const chunks = listPart.split(/[,;]/).map((c) => c.trim());
  const rows: { qty: number; cat: string; from: string }[] = [];
  const re = /^(\d+)\s*x\s*(Futomaki|California|Hosomaki|Nigiri)\s+(.+)$/i;
  chunks.forEach((c) => {
    const m = c.match(re);
    if (m) {
      const qty = parseInt(m[1], 10) || 1;
      const cat = m[2];
      const from = m[3].replace(/\s+za\s+1\s*zł.*$/i, "").trim();
      rows.push({ qty, cat, from });
    }
  });
  return rows;
}

/* ---------- Item w koszyku ---------- */
const ProductItem: React.FC<{
  prod: any;
  productCategory: (name: string) => string;
  productsDb: ProductDb[];
  optionsByCat: Record<string, string[]>;
  helpers: {
    addAddon: (name: string, addon: string) => void;
    removeAddon: (name: string, addon: string) => void;
    swapIngredient: (name: string, from: string, to: string) => void;
    removeItem: (name: string) => void;
    removeWholeItem: (name: string) => void;
  };
}> = ({ prod, productCategory, productsDb, optionsByCat, helpers }) => {
  const { addAddon, removeAddon, swapIngredient, removeItem, removeWholeItem } = helpers;

  const byName = useMemo(() => {
    const map = new Map<string, ProductDb>();
    productsDb.forEach((p) => map.set(p.name, p));
    return map;
  }, [productsDb]);

  const prodInfo = byName.get(prod.name);
  const subcat = (prodInfo?.subcategory || "").toLowerCase();
  const isSet = subcat === "zestawy";
  const isSpec = subcat === "specjały";

  const setRows = useMemo(
    () => (isSet ? parseSetComposition(prodInfo?.description) : []),
    [isSet, prodInfo?.description]
  );

  // NOWE: odczyt aktualnej zamiany dla danej rolki w ZESTAWIE
  const getSetSwapCurrent = (rowFrom: string): string => {
    const swaps = Array.isArray(prod.swaps) ? prod.swaps : [];
    const found = swaps.find(
      (s: any) =>
        s &&
        typeof s.from === "string" &&
        s.from.toLowerCase() === rowFrom.toLowerCase()
    );
    return (found?.to as string) || rowFrom;
  };

  const priceNum =
    typeof prod.price === "string" ? parseFloat(prod.price) : prod.price || 0;
  const addonsCost = (prod.addons ?? []).reduce((sum: number, addon: string) => {
    const unit = computeAddonPrice(addon, prodInfo);
    return sum + unit;
  }, 0);
  const lineTotal = (priceNum + addonsCost) * (prod.quantity || 1);

  const canUseExtra = (extra: string): boolean => {
    // Zestawy – patrzymy na skład
    if (isSet) {
      const hasFuto = setRows.some((row) => /futomaki/i.test(row.cat));
      if (extra === "Tamago" && hasFuto) return true;
      if (extra === "Ryba pieczona") {
        // surowy zestaw może mieć opcję pieczoną
        return /SUROWY/i.test(prodInfo?.description || "");
      }
      return false;
    }

    // Pojedyncze rolki
    if (subcat === "california") {
      // wyjątek – specjalna California z opcją pieczonej ryby
      if (
        extra === "Ryba pieczona" &&
        isSpecialCaliforniaBakedFishProduct(prod.name, prodInfo?.description || "")
      ) {
        return true;
      }
      // pozostałe California bez dodatków
      return false;
    }

    if (subcat === "hosomaki") {
      // Hoso/Hosomaki – tylko Tempura jako dodatek
      return extra === "Tempura";
    }

    if (subcat === "futomaki") {
      if (extra === "Ryba pieczona") {
        // tylko rolki surowe
        return /surowy/i.test(prod.name);
      }
      if (extra === "Tamago") return true;
      return extra === "Tempura" || extra === "Płatek sojowy";
    }

    if (subcat === "nigiri") return false;

    return false;
  };

  const toggleAddon = (a: string) => {
    const on = (prod.addons ?? []).includes(a);
    const allowed = EXTRAS.includes(a) ? canUseExtra(a) : true; // sosy zawsze
    if (!allowed) return;
    if (on) removeAddon(prod.name, a);
    else addAddon(prod.name, a);
  };

  const sameCatOptions = (name: string) => {
    const cat = (productCategory(name) || "").toLowerCase();
    if (!cat || cat === "specjały" || cat === "zestawy") return [];
    return optionsByCat[cat] || [];
  };

  // NOWE: osobne funkcje do zamian
  const doSetSwap = (rowFrom: string, to: string) => {
    const current = getSetSwapCurrent(rowFrom);
    if (!to || to === current) return;
    // dla zestawów pilnujemy tylko, żeby w ogóle coś wybrano – puli pilnujemy na poziomie selecta
    swapIngredient(prod.name, rowFrom, to);

    // opłata za zamianę w zestawie
    if (!(prod.addons ?? []).includes(SWAP_FEE_NAME)) {
      addAddon(prod.name, SWAP_FEE_NAME);
    }
  };

  const doSingleSwap = (from: string, to: string) => {
    if (!to || to === from) return;

    const fromCat = (productCategory(from) || "").toLowerCase();
    const toCat = (productCategory(to) || "").toLowerCase();

    const same =
      (fromCat.includes("futomaki") && toCat.includes("futomaki")) ||
      (fromCat.includes("california") && toCat.includes("california")) ||
      (fromCat.includes("hosomaki") && toCat.includes("hosomaki")) ||
      (fromCat.includes("nigiri") && toCat.includes("nigiri"));

    if (!same) return;
    if (toCat === "specjały") return; // zakaz wymiany na specjały

    swapIngredient(prod.name, from, to);
  };

  return (
    <div className="border border-black/10 bg-white p-3">
      <div className="flex justify-between items-center font-semibold mb-2">
        <span className="text-black">
          {prod.name} x{prod.quantity || 1}
        </span>
        <span className="text-black">
          {lineTotal.toFixed(2).replace(".", ",")} zł
        </span>
      </div>

      <div className="text-xs text-black/80 space-y-3">
        {/* Edycja składu ZESTAWU: każda rolka ma wybór zamiany w obrębie kategorii */}
        {isSet && setRows.length > 0 && (
          <div className="space-y-2">
            <div className="font-semibold">Zamiany w zestawie</div>
            {setRows.map((row, i) => {
              const catKey = normalize(row.cat);
              const pool = (optionsByCat[catKey] || []).filter(
                (n) => (productCategory(n) || "").toLowerCase() !== "specjały"
              );
              const current = getSetSwapCurrent(row.from); // BIEŻĄCA wartosc z prod.swaps lub default
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-1 rounded bg-gray-50 border border-gray-200">
                    {row.qty}× {row.cat}
                  </span>
                  <span className="text-black/70">zamień:</span>
                  <select
                    className="border border-black/15 rounded px-2 py-1 bg-white"
                    value={current}
                    onChange={(e) => doSetSwap(row.from, e.target.value)}
                  >
                    {[current, ...pool.filter((n) => n !== current)].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
            <p className="text-[11px] text-black/60">
              Zamiany tylko w obrębie tej samej kategorii (Futomaki ↔ Futomaki, Hosomaki ↔
              Hosomaki itd.). Bez specjałów. Dodajemy pozycję „{SWAP_FEE_NAME}”.
            </p>
          </div>
        )}

        {/* Uniwersalne sosy */}
        <div>
          <div className="font-semibold mb-1">Sosy:</div>
          <div className="flex flex-wrap gap-2">
            {SAUCES.map((s) => {
              const on = prod.addons?.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleAddon(s)}
                  className={clsx(
                    "px-2 py-1 rounded text-xs border",
                    on
                      ? "bg-black text-white border-black"
                      : "bg-white text-black hover:bg-gray-50 border-gray-200"
                  )}
                >
                  {on ? `✓ ${s}` : `+ ${s}`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dodatki z ograniczeniami wg kategorii */}
        <div>
          <div className="font-semibold mb-1">Dodatki:</div>
          <div className="flex flex-wrap gap-2">
            {EXTRAS.map((ex) => {
              const allowed = canUseExtra(ex);
              const on = prod.addons?.includes(ex);
              return (
                <button
                  key={ex}
                  onClick={() => allowed && toggleAddon(ex)}
                  className={clsx(
                    "px-2 py-1 rounded text-xs border",
                    !allowed
                      ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-200"
                      : on
                      ? "bg-black text-white border-black"
                      : "bg-white text-black hover:bg-gray-50 border-gray-200"
                  )}
                >
                  {on ? `✓ ${ex}` : `+ ${ex}`}
                </button>
              );
            })}
          </div>
          {subcat === "california" && (
            <p className="text-[11px] text-black/60 mt-1">
              California = rolki z ryżem na zewnątrz. Standardowo nie dodajemy do nich dodatków –
              wyjątek stanowi wybrana pozycja z łososiem surowym, paluszkiem krabowym i krewetką
              obłożoną łososiem, gdzie dostępna jest opcja „Ryba pieczona” (+2 zł).
            </p>
          )}
          {subcat === "hosomaki" && (
            <p className="text-[11px] text-black/60 mt-1">
              Hosomaki (Hoso) = cienkie rolki z jednym składnikiem. Można dodać jedynie Tempurę,
              a w zamianach wybierasz tylko inne Hosomaki.
            </p>
          )}
          {subcat === "futomaki" && (
            <p className="text-[11px] text-black/60 mt-1">
              Futomaki (Futo) = grubsze rolki z kilkoma składnikami. Dostępne dodatki: Tempura,
              Płatek sojowy, Tamago, a przy rolkach surowych także „Ryba pieczona”.
            </p>
          )}
          {isSet && (
            <p className="text-[11px] text-black/60 mt-1">
              W zestawach zamieniasz rolki tylko w obrębie kategorii (Futomaki ↔ Futomaki,
              Hosomaki ↔ Hosomaki, California ↔ California, Nigiri ↔ Nigiri). Jeśli w składzie
              zestawu są Futomaki, możesz dodać Tamago, a w zestawach surowych dostępna jest też
              opcja „Ryba pieczona”.
            </p>
          )}
        </div>

        {/* Zamiana pojedynczej pozycji w obrębie kategorii (dla niezestawów) */}
        {!isSet && !isSpec && (
          <div>
            <div className="font-semibold mb-1">Zamień na inne w tej kategorii:</div>
            <select
              className="border border-black/15 rounded px-2 py-1 bg-white"
              value={prod.name}
              onChange={(e) => doSingleSwap(prod.name, e.target.value)}
            >
              {[prod.name, ...sameCatOptions(prod.name).filter((n) => n !== prod.name)].map(
                (n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                )
              )}
            </select>
            <p className="text-[11px] text-black/60 mt-1">
              Zamiana tylko w obrębie tej samej kategorii. Bez wymiany na Specjały.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end items-center mt-2 gap-2 flex-wrap text-[11px]">
        <button onClick={() => removeItem(prod.name)} className="text-red-600 underline">
          Usuń 1 szt.
        </button>
        <button onClick={() => removeWholeItem(prod.name)} className="text-red-600 underline">
          Usuń produkt
        </button>
      </div>
    </div>
  );
};

function PromoSection({
  promo,
  promoError,
  onApply,
  onClear,
}: {
  promo: Promo;
  promoError: string | null;
  onApply: (code: string) => void;
  onClear: () => void;
}) {
  const [localCode, setLocalCode] = useState("");
  const deferred = useDeferredValue(localCode);
  const handleApply = useCallback(() => onApply(deferred), [deferred, onApply]);

  return (
    <div className="mt-3">
      <h4 className="font-semibold text-black mb-2">Kod promocyjny</h4>
      <div className="flex gap-2">
        <input
          type="text"
          value={localCode}
          onChange={(e) => setLocalCode(e.target.value)}
          placeholder="Wpisz kod"
          className="flex-1 border border-black/15 rounded-xl px-3 py-2 text-sm bg-white"
        />
        {!promo ? (
          <button
            onClick={handleApply}
            className={`px-3 py-2 rounded-xl text-sm font-semibold ${accentBtn}`}
          >
            Zastosuj
          </button>
        ) : (
          <button onClick={onClear} className="px-3 py-2 rounded-xl text-sm border border-black/15">
            Usuń
          </button>
        )}
      </div>
      {promoError && <p className="text-xs text-red-600 mt-1">{promoError}</p>}
      {promo && (
        <p className="text-xs text-green-700 mt-1">
          Zastosowano kod <b>{promo.code}</b> —{" "}
          {promo.type === "percent" ? `${promo.value}%` : `${promo.value.toFixed(2)} zł`} rabatu.
        </p>
      )}
    </div>
  );
}

/* Sterowanie ilością pałeczek – minus po lewej, plus po prawej */
function ChopsticksControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(10, n));
  const dec = () => onChange(clamp(value - 1));
  const inc = () => onChange(clamp(value + 1));

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-black">Ilość pałeczek</span>
        <span className="text-[11px] text-black/60">0 = nie potrzebuję</span>
      </div>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={dec}
          className="h-11 w-11 rounded-full border border-black/20 bg-black text-white text-xl flex items-center justify-center"
        >
          –
        </button>
        <div className="min-w-[56px] text-center text-lg font-semibold">{value}</div>
        <button
          type="button"
          onClick={inc}
          className="h-11 w-11 rounded-full border border-black/20 bg-black text-white text-xl flex items-center justify-center"
        >
          +
        </button>
      </div>
    </div>
  );
}

/* ---------- Main ---------- */
export default function CheckoutModal() {
  const isClient = useIsClient();
  const session = useSession();
  const isLoggedIn = !!session?.user;

  const {
    isCheckoutOpen,
    closeCheckoutModal: originalCloseCheckoutModal,
    checkoutStep,
    goToStep,
    nextStep,
    items,
    clearCart,
    removeItem,
    removeWholeItem,
    addAddon,
    removeAddon,
    swapIngredient,
  } = useCartStore();

  const isMobile = useIsMobile();

  const [notes, setNotes] = useState<{ [key: number]: string }>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [flatNumber, setFlatNumber] = useState("");
  const [optionalAddress, setOptionalAddress] = useState("");

  const [selectedOption, setSelectedOption] = useState<OrderOption | null>(null);
  const [deliveryTimeOption, setDeliveryTimeOption] = useState<"asap" | "schedule">("asap");

  const [productsDb, setProductsDb] = useState<ProductDb[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [restLoc, setRestLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryInfo, setDeliveryInfo] = useState<{ cost: number; eta: string } | null>(null);

  const [legalAccepted, setLegalAccepted] = useState(false);
  const [promo, setPromo] = useState<Promo>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [tsReady, setTsReady] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const tsIdRef = useRef<any>(null);
  const tsMobileRef = useRef<HTMLDivElement | null>(null);
  const tsDesktopRef = useRef<HTMLDivElement | null>(null);

  const [deliveryMinOk, setDeliveryMinOk] = useState(true);
  const [deliveryMinRequired, setDeliveryMinRequired] = useState(0);
  const [outOfRange, setOutOfRange] = useState(false);
  const [custCoords, setCustCoords] = useState<{ lat: number; lng: number } | null>(null);

  const sessionEmail = session?.user?.email || "";
  const effectiveEmail = (contactEmail || sessionEmail).trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validEmail = emailRegex.test(effectiveEmail);

  const { slug: restaurantSlug, label: restaurantCityLabel } = getRestaurantCityFromPath();
  const thanksQrUrl = CITY_REVIEW_QR_URLS[restaurantSlug] || THANKS_QR_URL;

  // Godziny dla miasta + min/max time input
  const openInfo = useMemo(() => isOpenFor(restaurantSlug), [restaurantSlug]);
  const timeMin = openInfo.range ? `${pad(openInfo.range[0])}:${pad(openInfo.range[1])}` : "12:00";
  const timeMax = openInfo.range ? `${pad(openInfo.range[2])}:${pad(openInfo.range[3])}` : "23:59";
  const [scheduledTime, setScheduledTime] = useState<string>(timeMin);
  useEffect(() => {
    if (deliveryTimeOption === "schedule") {
      setScheduledTime((prev) => {
        const inside = prev >= timeMin && prev <= timeMax;
        return inside ? prev : timeMin;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeMin, timeMax, deliveryTimeOption]);

  useEffect(() => {
    if (isLoggedIn && session) {
      setName(session.user.user_metadata?.full_name || "");
      setPhone(session.user.user_metadata?.phone || "");
      setContactEmail(session.user.email || "");
      setStreet(session.user.user_metadata?.street || "");
      setPostalCode(session.user.user_metadata?.postal_code || "");
      setCity(session.user.user_metadata?.city || "");
      setFlatNumber(session.user.user_metadata?.flat_number || "");
    }
  }, [isLoggedIn, session]);

  /* NOWE: pobieranie produktów + restauracji (lat/lng) + stref dla danej restauracji */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // produkty – globalnie
      const prodRes = await supabase
        .from("products")
        .select("id,name,subcategory,description");

      if (!cancelled && !prodRes.error && prodRes.data) {
        setProductsDb((prodRes.data as ProductDb[]) || []);
      }

      // jeśli nie mamy sluga restauracji – kończymy na produktach
      if (!restaurantSlug) return;

      // restauracja po slug
      const restRes = await supabase
        .from("restaurants")
        .select("id, lat, lng")
        .eq("slug", restaurantSlug)
        .maybeSingle();

      if (cancelled || restRes.error || !restRes.data) return;

      const rest: any = restRes.data;

      if (!cancelled && rest.lat && rest.lng) {
        setRestLoc({ lat: rest.lat, lng: rest.lng });
      }

      // strefy tylko dla tej restauracji
      const dzRes = await supabase
        .from("delivery_zones")
        .select("*")
        .eq("restaurant_id", rest.id)
        .order("min_distance_km", { ascending: true });

      if (!cancelled && !dzRes.error && dzRes.data) {
        setZones(dzRes.data as Zone[]);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [restaurantSlug]);

  // ESC zamyka modal + blokada scrolla body
  useEffect(() => {
    if (!isCheckoutOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeCheckoutModal();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isCheckoutOpen, closeCheckoutModal]);

  // Turnstile – stabilne callbacki
  const renderTurnstile = useCallback(
    (target: HTMLDivElement | null) => {
      if (!TURNSTILE_SITE_KEY || !window.turnstile || !isVisible(target)) return;
      try {
        setTurnstileError(false);
        tsIdRef.current = window.turnstile.render(target!, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (t: string) => setTurnstileToken(t),
          "error-callback": () => {
            setTurnstileToken(null);
            setTurnstileError(true);
          },
          "expired-callback": () => {
            setTurnstileToken(null);
            try {
              window.turnstile?.reset(tsIdRef.current);
            } catch {}
          },
          "timeout-callback": () => {
            setTurnstileToken(null);
            try {
              window.turnstile?.reset(tsIdRef.current);
            } catch {}
          },
          retry: "auto",
          theme: "auto",
          appearance: "always",
          ["refresh-expired"]: "auto",
        });
      } catch {
        setTurnstileError(true);
      }
    },
    [] // setState i refy są stabilne
  );

  const removeTurnstile = useCallback(() => {
    try {
      if (tsIdRef.current && window.turnstile) {
        window.turnstile.remove(tsIdRef.current);
      }
    } catch {}
    tsIdRef.current = null;
    setTurnstileToken(null);
    setTurnstileError(false);
  }, []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !tsReady) return;
    if (isCheckoutOpen && checkoutStep === 3) {
      renderTurnstile(tsMobileRef.current);
      renderTurnstile(tsDesktopRef.current);
      return () => removeTurnstile();
    }
    removeTurnstile();
  }, [isCheckoutOpen, checkoutStep, tsReady, renderTurnstile, removeTurnstile]);

  const productsByName = useMemo(() => {
    const map = new Map<string, ProductDb>();
    productsDb.forEach((p) => map.set(p.name, p));
    return map;
  }, [productsDb]);

  const productCategory = useCallback(
    (name: string) => productsByName.get(name)?.subcategory || "",
    [productsByName]
  );

  const optionsByCat = useMemo(() => {
    const out: Record<string, string[]> = {};
    productsDb.forEach((p) => {
      const cat = (p.subcategory || "").toLowerCase();
      if (!cat || cat === "specjały" || cat === "zestawy") return;
      out[cat] = out[cat] || [];
      out[cat].push(p.name);
    });
    Object.values(out).forEach((arr) => arr.sort((a, b) => a.localeCompare(b)));
    return out;
  }, [productsDb]);

  const baseTotal = useMemo<number>(() => {
    return items.reduce((acc: number, it: any) => {
      const qty = it.quantity || 1;
      const priceNum = typeof it.price === "string" ? parseFloat(it.price) : it.price || 0;
      const productDb = productsByName.get(it.name);
      const addonsCost = (it.addons ?? []).reduce((sum: number, addon: string) => {
        const unit = computeAddonPrice(addon, productDb || undefined);
        return sum + unit;
      }, 0);
      return acc + (priceNum + addonsCost) * qty;
    }, 0);
  }, [items, productsByName]);

  const packagingCost = selectedOption ? 2 : 0;
  const subtotal = baseTotal + packagingCost;

  const getItemLineTotal = useCallback(
    (it: any) => {
      const qty = it.quantity || 1;
      const priceNum = typeof it.price === "string" ? parseFloat(it.price) : it.price || 0;
      const productDb = productsByName.get(it.name);
      const addonsCost = (it.addons ?? []).reduce((sum: number, addon: string) => {
        const unit = computeAddonPrice(addon, productDb || undefined);
        return sum + unit;
      }, 0);
      return (priceNum + addonsCost) * qty;
    },
    [productsByName]
  );

  const calcDelivery = async (custLat: number, custLng: number) => {
    if (!restLoc) return;
    try {
      const resp = await fetch(
        `/api/distance?origin=${restLoc.lat},${restLoc.lng}&destination=${custLat},${custLng}`
      );
      const { distance_km, error } = await resp.json();
      if (error) return;

      const zone = zones
        .filter((z) => z.active !== false)
        .find((z) => distance_km >= z.min_distance_km && distance_km <= z.max_distance_km);

      if (!zone) {
        setOutOfRange(true);
        setDeliveryMinOk(false);
        setDeliveryMinRequired(0);
        setDeliveryInfo({ cost: 0, eta: "Poza zasięgiem" });
        return;
      }
      setOutOfRange(false);

      const perKm =
        (zone.pricing_type ?? (zone.min_distance_km === 0 ? "flat" : "per_km")) === "per_km";
      let cost = perKm ? zone.cost * distance_km : zone.cost;
      if (zone.free_over != null && subtotal >= zone.free_over) cost = 0;

      const minOk = subtotal >= (zone.min_order_value || 0);
      setDeliveryMinOk(minOk);
      setDeliveryMinRequired(zone.min_order_value || 0);

      const eta = `${zone.eta_min_minutes}-${zone.eta_max_minutes} min`;
      setDeliveryInfo({ cost: Math.max(0, Math.round(cost * 100) / 100), eta });
    } catch {}
  };

  const onAddressSelect = (address: string, lat: number, lng: number) => {
    setStreet(address);
    if (lat && lng) {
      setCustCoords({ lat, lng });
      calcDelivery(lat, lng);
    }
  };

  const discount = useMemo(() => {
    if (!promo) return 0;
    const base = subtotal + (deliveryInfo?.cost || 0);
    const val =
      promo.type === "percent" ? base * (Number(promo.value) / 100) : Number(promo.value || 0);
    return Math.max(0, Math.min(val, base));
  }, [promo, subtotal, deliveryInfo]);

  const totalWithDelivery = Math.max(0, subtotal + (deliveryInfo?.cost || 0) - discount);
  const shouldHideOrderActions = Boolean(TURNSTILE_SITE_KEY && turnstileError);

  const [submitting, setSubmitting] = useState(false);

  const closeCheckoutModal = useCallback(() => {
    originalCloseCheckoutModal();
    setPromo(null);
    setPromoError(null);
    setOrderSent(false);
    setErrorMessage(null);
    setConfirmCityOk(false);
    setLegalAccepted(false);
    setSubmitting(false);
    goToStep(1);
    removeTurnstile();
  }, [originalCloseCheckoutModal, goToStep, removeTurnstile]);

  const productHelpers = {
    addAddon,
    removeAddon,
    swapIngredient,
    removeItem,
    removeWholeItem,
  };

  const guardEmail = () => {
    if (!validEmail) {
      setErrorMessage("Podaj poprawny adres e-mail – wyślemy potwierdzenie i link śledzenia.");
      return false;
    }
    return true;
  };

  const applyPromo = async (codeRaw: string) => {
    setPromoError(null);
    const code = codeRaw.trim();
    if (!code) return;
    const currentBase = subtotal + (deliveryInfo?.cost || 0);
    try {
      const { data, error } = await supabase
        .from("discount_codes")
        .select("*")
        .ilike("code", code)
        .eq("active", true)
        .maybeSingle();

      if (!error && data) {
        const nowIso = new Date().toISOString();
        if (data.expires_at && data.expires_at < nowIso) throw new Error("Kod wygasł.");
        if (typeof data.min_order === "number" && currentBase < data.min_order) {
          throw new Error(`Minimalna wartość zamówienia to ${data.min_order.toFixed(2)} zł.`);
        }
        const type = data.type === "amount" ? "amount" : "percent";
        const value = Number(data.value || 0);
        if (value <= 0) throw new Error("Nieprawidłowa wartość kodu.");
        setPromo({ code: data.code, type, value });
        return;
      }
      const resp = await safeFetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, total: currentBase }),
      });
      if (resp?.valid) {
        setPromo({ code: resp.code, type: resp.type, value: Number(resp.value) });
        return;
      }
      throw new Error(resp?.message || "Kod nieprawidłowy.");
    } catch (e: any) {
      setPromo(null);
      setPromoError(e.message || "Nie udało się zastosować kodu.");
    }
  };
  const clearPromo = () => {
    setPromo(null);
    setPromoError(null);
  };

  const ensureFreshToken = async () => {
    if (!TURNSTILE_SITE_KEY) return true;
    if (turnstileToken) return true;
    try {
      if (window.turnstile && tsIdRef.current) window.turnstile.reset(tsIdRef.current);
      await new Promise((r) => setTimeout(r, 400));
      return !!turnstileToken;
    } catch {
      return false;
    }
  };

  const [confirmCityOk, setConfirmCityOk] = useState(false);
  const [orderSent, setOrderSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* Ilość pałeczek – globalnie dla zamówienia */
  const [chopsticksQty, setChopsticksQty] = useState<number>(0);

  const handleSubmitOrder = async () => {
    if (submitting) return;
    setErrorMessage(null);

    if (!selectedOption) {
      setErrorMessage("Wybierz sposób odbioru.");
      return;
    }
    if (!legalAccepted) {
      setErrorMessage("Zaznacz akceptację regulaminu i polityki prywatności.");
      return;
    }
    if (!confirmCityOk) {
      setErrorMessage("Potwierdź miasto restauracji przed złożeniem zamówienia.");
      return;
    }

    const chk = isOpenFor(restaurantSlug);
    if (!chk.open) {
      setErrorMessage(
        `Zamówienia dla ${restaurantCityLabel} przyjmujemy dziś ${chk.label}.`
      );
      return;
    }

    // walidacja czasu przy "na godzinę" – minimum 60 minut od teraz
    if (selectedOption === "delivery" && deliveryTimeOption === "schedule") {
      const [h, m] = scheduledTime.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) {
        setErrorMessage("Podaj prawidłową godzinę dostawy.");
        return;
      }
      const nowZoned = toZonedTime(new Date(), tz);
      const dt = new Date(nowZoned);
      dt.setHours(h, m, 0, 0);
      if (dt.getTime() < nowZoned.getTime()) {
        dt.setDate(dt.getDate() + 1);
      }
      const diffMinutes = (dt.getTime() - nowZoned.getTime()) / 60000;
      if (diffMinutes < MIN_SCHEDULE_MINUTES) {
        setErrorMessage(
          `Przy wyborze dostawy „na godzinę” minimalny czas to ${MIN_SCHEDULE_MINUTES} minut od teraz.`
        );
        return;
      }
    }

    if (!guardEmail()) return;
    if (TURNSTILE_SITE_KEY && !(await ensureFreshToken())) {
      setErrorMessage("Weryfikacja formularza nie powiodła się.");
      return;
    }

    if (selectedOption === "delivery") {
      if (REQUIRE_AUTOCOMPLETE && !custCoords) {
        setErrorMessage(
          "Wybierz adres z listy (podpowiedzi Google), aby potwierdzić dostawę."
        );
        return;
      }
      if (outOfRange) {
        setErrorMessage("Adres jest poza zasięgiem dostawy.");
        return;
      }
      if (!deliveryMinOk) {
        setErrorMessage(
          `Minimalna wartość zamówienia dla tej strefy to ${deliveryMinRequired.toFixed(2)} zł.`
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const client_delivery_time = buildClientDeliveryTime(
        selectedOption,
        deliveryTimeOption,
        scheduledTime
      );
      const slug = restaurantSlug;

      try {
        await fetch(`/api/restaurants/ensure-cookie?restaurant=${encodeURIComponent(slug)}`, {
          method: "GET",
          credentials: "same-origin",
        });
      } catch {}

      const orderPayload: any = {
        selected_option: selectedOption,
        payment_method:
          selectedOption === "delivery" ? "Gotówka u kierowcy" : "Gotówka przy odbiorze",
        user: isLoggedIn ? session!.user.id : null,
        name,
        phone,
        contact_email: effectiveEmail,
        delivery_cost: deliveryInfo?.cost || 0,
        total_price: totalWithDelivery,
        discount_amount: discount || 0,
        promo_code: promo?.code || null,
        legal_accept: {
          terms_version: TERMS_VERSION,
          privacy_version: TERMS_VERSION,
          marketing_opt_in: false,
        },
        status: "placed",
        notice_payment:
          selectedOption === "delivery" ? "Płatność wyłącznie gotówką u kierowcy" : null,
        /* ilość pałeczek – globalnie dla zamówienia */
        chopsticks_qty: Math.max(0, Math.min(10, Number(chopsticksQty) || 0)),
      };
      if (selectedOption === "delivery") {
        orderPayload.street = street || null;
        orderPayload.postal_code = postalCode || null;
        orderPayload.city = city || null;
        orderPayload.flat_number = flatNumber || null;
        orderPayload.client_delivery_time = client_delivery_time;
        if (custCoords) {
          orderPayload.delivery_lat = custCoords.lat;
          orderPayload.delivery_lng = custCoords.lng;
        }
      } else if (optionalAddress.trim()) {
        orderPayload.address = optionalAddress.trim();
      }

      const itemsPayload = items.map((item: any, index: number) => {
        const product = productsDb.find((p) => (p as any).name === item.name);
        return {
          product_id: product?.id,
          name: item.name,
          quantity: item.quantity || 1,
          unit_price: item.price,
          options: {
            addons: item.addons,
            swaps: item.swaps,
            note: notes[index] || "",
          },
        };
      });

      await safeFetch(`/api/orders/create?restaurant=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-turnstile-response": turnstileToken || "",
          "x-restaurant-slug": slug,
        },
        body: JSON.stringify({ orderPayload, itemsPayload, turnstileToken, restaurant: slug }),
      });

      clearCart();
      setOrderSent(true);
    } catch (err: any) {
      setErrorMessage(err.message || "Wystąpił błąd podczas składania zamówienia.");
      try {
        if (window.turnstile && tsIdRef.current) window.turnstile.reset(tsIdRef.current);
      } catch {}
    } finally {
      setSubmitting(false);
    }
  };

  if (!isClient || !isCheckoutOpen) return null;

  const OPTIONS: { key: OrderOption; label: string; Icon: any }[] = [
    { key: "takeaway", label: "Na wynos", Icon: ShoppingBag },
    { key: "delivery", label: "Dostawa", Icon: Truck },
  ];

  const LegalConsent = (
    <label className="flex items-start gap-2 text-xs leading-5 text-black">
      <input
        type="checkbox"
        checked={legalAccepted}
        onChange={(e) => setLegalAccepted(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        Akceptuję{" "}
        <a href="/legal/regulamin" target="_blank" rel="noopener noreferrer" className="underline">
          Regulamin
        </a>{" "}
        oraz{" "}
        <a
          href="/legal/polityka-prywatnosci"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Politykę prywatności
        </a>{" "}
        (v{TERMS_VERSION}).
      </span>
    </label>
  );

  return (
    <>
      {TURNSTILE_SITE_KEY && (
        <Script
          id="cf-turnstile"
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          async
          defer
          strategy="afterInteractive"
          onLoad={() => setTsReady(true)}
        />
      )}

      <div
        className="fixed inset-0 z-[58] bg-black/70 grid place-items-center p-4"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeCheckoutModal();
        }}
      >
        <div
          className="w-full max-w-5xl bg-white text-black shadow-2xl grid grid-rows-[auto,1fr] max-h-[75vh]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* HEADER */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
            <h2 className="text-xl font-semibold">Zamówienie — {restaurantCityLabel}</h2>
            {!orderSent && (
              <button
                aria-label="Zamknij"
                onClick={closeCheckoutModal}
                className="p-2 rounded-full hover:bg-black/5"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* SCROLL */}
          <div className="overflow-y-auto overscroll-contain">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 p-6">
              {/* MAIN */}
              <div>
                {orderSent ? (
                  <div className="min-h-[320px] flex flex-col items-center justify-center text-center space-y-5 px-4">
                    <div className="bg-white p-4 rounded-2xl shadow flex flex-col items-center gap-2">
                      <div className="bg-white p-3 rounded-xl">
                        <QRCode value={thanksQrUrl} size={170} />
                      </div>
                      <p className="text-xs text-black/60 max-w-xs">
                        Zeskanuj kod lub kliknij poniższy przycisk, aby ocenić lokal w Google.
                      </p>
                    </div>
                    <h3 className="text-2xl font-bold">Dziękujemy za zamówienie!</h3>
                    <p className="text-black/70">
                      Potwierdzenie i link do śledzenia wysłaliśmy na Twój adres e-mail.
                    </p>
                    <div className="flex justify-center gap-3 flex-wrap">
                      <button
                        onClick={() => window.open(thanksQrUrl, "_blank")}
                        className={`px-4 py-2 rounded-xl ${accentBtn}`}
                      >
                        Zostaw opinię w Google
                      </button>
                      <button
                        onClick={closeCheckoutModal}
                        className="px-4 py-2 rounded-xl border border-black/15"
                      >
                        Zamknij
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {errorMessage && (
                      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-red-700">
                        {errorMessage}
                      </div>
                    )}

                    {/* STEP 1 (MOBILE): Koszyk + pałeczki pod zamianami */}
                    {isMobile && checkoutStep === 1 && (
                      <div className="space-y-6">
                        <MobileTopBar>
                          <div className="flex justify-end">
                            <button
                              onClick={nextStep}
                              disabled={items.length === 0}
                              className={`min-w-[160px] py-2 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
                            >
                              Dalej →
                            </button>
                          </div>
                        </MobileTopBar>

                        <h3 className="text-2xl font-bold">Wybrane produkty</h3>

                        <div className="space-y-3 max-h-[360px] overflow-y-auto">
                          {items.map((item, idx) => (
                            <div key={idx} className="space-y-1">
                              <ProductItem
                                prod={item}
                                productCategory={productCategory}
                                productsDb={productsDb}
                                optionsByCat={optionsByCat}
                                helpers={productHelpers}
                              />
                              <textarea
                                className="w-full text-xs border border-black/15 rounded-xl px-2 py-1 bg-white"
                                placeholder="Notatka do produktu"
                                value={notes[idx] || ""}
                                onChange={(e) => setNotes({ ...notes, [idx]: e.target.value })}
                              />
                            </div>
                          ))}
                          {items.length === 0 && (
                            <p className="text-center text-black/60">Brak produktów w koszyku.</p>
                          )}
                        </div>

                        {/* Ilość pałeczek – pod zamianami (mobile) */}
                        <ChopsticksControl value={chopsticksQty} onChange={setChopsticksQty} />
                      </div>
                    )}

                    {/* STEP 1 DESKTOP / STEP 2 MOBILE — Sposób odbioru */}
                    {((!isMobile && checkoutStep === 1) ||
                      (isMobile && checkoutStep === 2)) && (
                      <div className="space-y-6">
                        {isMobile && (
                          <MobileTopBar>
                            <div className="flex justify-end">
                              <button
                                onClick={() => nextStep()}
                                disabled={!selectedOption}
                                className={`min-w-[160px] py-2 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
                              >
                                Dalej →
                              </button>
                            </div>
                          </MobileTopBar>
                        )}

                        <h3 className="text-2xl font-bold">Sposób odbioru</h3>

                        <div className="grid grid-cols-2 gap-3">
                          {OPTIONS.map(({ key, label, Icon }) => (
                            <button
                              key={key}
                              onClick={() => setSelectedOption(key)}
                              className={clsx(
                                "flex flex-col items-center justify-center border px-3 py-4 transition",
                                selectedOption === key
                                  ? "bg-yellow-400 text-black border-yellow-500"
                                  : "bg-gray-50 text-black border-black/10 hover:bg-gray-100"
                              )}
                            >
                              <Icon size={22} />
                              <span className="mt-1 text-sm font-medium">{label}</span>
                            </button>
                          ))}
                        </div>

                        {selectedOption === "delivery" && (
                          <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm">
                            Płatność: <b>gotówka u kierowcy</b>.
                          </div>
                        )}

                        {selectedOption === "delivery" && (
                          <div className="space-y-2">
                            <h4 className="font-semibold">Czas dostawy</h4>
                            <div className="flex flex-wrap gap-6 items-center">
                              <label className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="timeOption"
                                  value="asap"
                                  checked={deliveryTimeOption === "asap"}
                                  onChange={() => setDeliveryTimeOption("asap")}
                                />
                                <span>Jak najszybciej</span>
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="timeOption"
                                  value="schedule"
                                  checked={deliveryTimeOption === "schedule"}
                                  onChange={() => setDeliveryTimeOption("schedule")}
                                />
                                <span>Na godzinę</span>
                              </label>
                              {deliveryTimeOption === "schedule" && (
                                <input
                                  type="time"
                                  className="border border-black/15 rounded-xl px-2 py-1"
                                  min={timeMin}
                                  max={timeMax}
                                  value={scheduledTime}
                                  onChange={(e) => setScheduledTime(e.target.value)}
                                />
                              )}
                            </div>
                            <p className="text-xs text-black/60">
                              Dzisiejsze godziny w {restaurantCityLabel}: {openInfo.label}
                            </p>
                          </div>
                        )}

                        {!isMobile && (
                          <div className="flex justify-end">
                            <button
                              onClick={() => nextStep()}
                              disabled={!selectedOption}
                              className={`min-w-[220px] py-2 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
                            >
                              Dalej →
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* STEP 2 DESKTOP / STEP 3 MOBILE — Dane kontaktowe */}
                    {((!isMobile && checkoutStep === 2) ||
                      (isMobile && checkoutStep === 3)) && (
                      <div className="space-y-6">
                        <h3 className="text-2xl font-bold">Dane kontaktowe</h3>

                        {selectedOption === "delivery" && (
                          <>
                            <AddressAutocomplete
                              onAddressSelect={onAddressSelect}
                              setCity={setCity}
                              setPostalCode={setPostalCode}
                              setFlatNumber={setFlatNumber}
                            />
                            <p className="text-xs text-black/60">
                              Najpierw wybierz adres z listy Google – dopiero wtedy pola poniżej
                              odblokują się do edycji.
                            </p>

                            <div className="grid grid-cols-1 gap-2">
                              <input
                                type="text"
                                placeholder="Adres (ulica i numer domu)"
                                className="w-full px-3 py-2 border border-black/15 rounded-xl bg-white disabled:bg-gray-100 disabled:text-black/50 disabled:cursor-not-allowed"
                                value={street}
                                onChange={(e) => setStreet(e.target.value)}
                                disabled={REQUIRE_AUTOCOMPLETE && !custCoords}
                              />
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="Numer mieszkania (opcjonalnie)"
                                  className="flex-1 px-3 py-2 border border-black/15 rounded-xl bg-white disabled:bg-gray-100 disabled:text-black/50 disabled:cursor-not-allowed"
                                  value={flatNumber}
                                  onChange={(e) => setFlatNumber(e.target.value)}
                                  disabled={REQUIRE_AUTOCOMPLETE && !custCoords}
                                />
                                <input
                                  type="text"
                                  placeholder="Kod pocztowy"
                                  className="flex-1 px-3 py-2 border border-black/15 rounded-xl bg-white disabled:bg-gray-100 disabled:text-black/50 disabled:cursor-not-allowed"
                                  value={postalCode}
                                  onChange={(e) => setPostalCode(e.target.value)}
                                  disabled={REQUIRE_AUTOCOMPLETE && !custCoords}
                                />
                              </div>
                              <input
                                type="text"
                                placeholder="Miasto"
                                className="w-full px-3 py-2 border border-black/15 rounded-xl bg-white disabled:bg-gray-100 disabled:text-black/50 disabled:cursor-not-allowed"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                disabled={REQUIRE_AUTOCOMPLETE && !custCoords}
                              />
                              {REQUIRE_AUTOCOMPLETE && !custCoords && (
                                <p className="text-xs text-red-600">
                                  Wpisanie adresu ręcznie jest zablokowane – wybierz pozycję z listy
                                  podpowiedzi Google.
                                </p>
                              )}
                            </div>
                          </>
                        )}

                        {selectedOption === "takeaway" && (
                          <div className="rounded-xl bg-gray-50 border border-black/10 p-3 text-sm">
                            Odbiór osobisty w lokalu. Płatność przy odbiorze gotówką.
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-2">
                          <input
                            type="text"
                            placeholder="Imię"
                            className="w-full px-3 py-2 border border-black/15 rounded-xl bg-white"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                          />
                          <input
                            type="tel"
                            placeholder="Telefon"
                            className="w-full px-3 py-2 border border-black/15 rounded-xl bg-white"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                          />
                          {selectedOption === "takeaway" && (
                            <input
                              type="text"
                              placeholder="Uwagi do odbioru (opcjonalnie)"
                              className="w-full px-3 py-2 border border-black/15 rounded-xl bg-white"
                              value={optionalAddress}
                              onChange={(e) => setOptionalAddress(e.target.value)}
                            />
                          )}
                          <input
                            type="email"
                            placeholder="Email (wymagany do potwierdzenia)"
                            className="w-full px-3 py-2 border border-black/15 rounded-xl bg-white"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                          />
                          {contactEmail !== "" && !validEmail && (
                            <p className="text-xs text-red-600">Podaj poprawny adres e-mail.</p>
                          )}
                        </div>

                        <div className="flex justify-between mt-2">
                          <button
                            onClick={() => goToStep(isMobile ? 2 : 1)}
                            className="px-4 py-2 rounded-xl border border-black/15"
                          >
                            ← Wstecz
                          </button>
                          {!isMobile && (
                            <button
                              onClick={nextStep}
                              disabled={
                                !name ||
                                !phone ||
                                !validEmail ||
                                (selectedOption === "delivery" &&
                                  (!street ||
                                    !postalCode ||
                                    !city ||
                                    (REQUIRE_AUTOCOMPLETE && !custCoords)))
                              }
                              className={`px-4 py-2 rounded-xl text-white font-semibold ${accentBtn} disabled:opacity-50`}
                            >
                              Dalej →
                            </button>
                          )}
                        </div>

                        {/* mobile: potwierdzenia + Zamawiam (bez pola pałeczek, bo jest w kroku 1) */}
                        {isMobile && (
                          <div className="mt-3 rounded-2xl border border-black/10 bg-gray-50 p-4 space-y-3">
                            <h4 className="text-lg font-semibold">Potwierdzenia</h4>
                            <div className="space-y-3">
                              {LegalConsent}
                              <label className="flex items-start gap-2 text-xs leading-5 text-black">
                                <input
                                  type="checkbox"
                                  checked={confirmCityOk}
                                  onChange={(e) => setConfirmCityOk(e.target.checked)}
                                  className="mt-0.5"
                                />
                                <span>
                                  Uwaga: składasz zamówienie do restauracji w{" "}
                                  <b>{restaurantCityLabel}</b>. Potwierdzam, że to prawidłowe miasto.
                                </span>
                              </label>

                              {TURNSTILE_SITE_KEY ? (
                                <div>
                                  <h4 className="font-semibold mb-1">Weryfikacja</h4>
                                  {turnstileError ? (
                                    <p className="text-sm text-red-600">
                                      Nie udało się załadować weryfikacji.
                                    </p>
                                  ) : (
                                    <>
                                      <div ref={tsMobileRef} />
                                      <p className="text-[11px] text-black/60 mt-1">
                                        Chronimy formularz przed botami.
                                      </p>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <p className="text-[11px] text-black/60">
                                  Weryfikacja Turnstile wyłączona (brak klucza).
                                </p>
                              )}
                            </div>

                            {!shouldHideOrderActions && (
                              <button
                                onClick={handleSubmitOrder}
                                disabled={
                                  submitting ||
                                  !legalAccepted ||
                                  !confirmCityOk ||
                                  (TURNSTILE_SITE_KEY ? !turnstileToken : false)
                                }
                                className={`w-full mt-2 py-2 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
                              >
                                {submitting ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <span className="h-4 w-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                                    Przetwarzanie...
                                  </span>
                                ) : (
                                  "✅ Zamawiam"
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* STEP 3 DESKTOP — Podsumowanie + edycja pozycji + pałeczki pod zamianami */}
                    {!isMobile && checkoutStep === 3 && (
                      <div className="space-y-6">
                        <h3 className="text-2xl font-bold text-center">Podsumowanie</h3>

                        {selectedOption === "delivery" && (
                          <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm text-center">
                            <b>Płatność wyłącznie gotówką u kierowcy.</b>
                          </div>
                        )}

                        <div className="flex flex-col gap-6">
                          <div className="space-y-3 max-h-[360px] overflow-y-auto">
                            {items.map((item, idx) => (
                              <div key={idx} className="space-y-1">
                                <ProductItem
                                  prod={item}
                                  productCategory={productCategory}
                                  productsDb={productsDb}
                                  optionsByCat={optionsByCat}
                                  helpers={productHelpers}
                                />
                                <textarea
                                  className="w-full text-xs border border-black/15 rounded-xl px-2 py-1 bg-white"
                                  placeholder="Notatka do produktu"
                                  value={notes[idx] || ""}
                                  onChange={(e) => setNotes({ ...notes, [idx]: e.target.value })}
                                />
                              </div>
                            ))}
                            {items.length === 0 && (
                              <p className="text-center text-black/60">Brak produktów w koszyku.</p>
                            )}
                          </div>
                        </div>

                        {/* Ilość pałeczek – pod zamianami (desktop, krok 3) */}
                        <ChopsticksControl value={chopsticksQty} onChange={setChopsticksQty} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* SIDEBAR (desktop) – wyśrodkowane */}
              {!orderSent && (
                <aside className="hidden lg:flex">
                  <div className="sticky top-4 w-[340px] mx-auto border border-black/10 bg-white p-5 shadow-xl text-black space-y-4 text-left">
                    <h4 className="text-xl font-bold text-center">Podsumowanie</h4>

                    {/* lista produktów */}
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {items.length === 0 ? (
                        <p className="text-sm text-black/60 text-center">Brak produktów.</p>
                      ) : (
                        items.map((it: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="truncate pr-2">
                              {it.name} ×{it.quantity || 1}
                            </span>
                            <span>{getItemLineTotal(it).toFixed(2)} zł</span>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex justify-between">
                      <span>Produkty:</span>
                      <span>{baseTotal.toFixed(2)} zł</span>
                    </div>
                    {selectedOption && (
                      <div className="flex justify-between">
                        <span>Opakowanie:</span>
                        <span>2.00 zł</span>
                      </div>
                    )}
                    {deliveryInfo && (
                      <div className="flex justify-between">
                        <span>Dostawa:</span>
                        <span>{deliveryInfo.cost.toFixed(2)} zł</span>
                      </div>
                    )}

                    <PromoSection
                      promo={promo}
                      promoError={promoError}
                      onApply={applyPromo}
                      onClear={clearPromo}
                    />
                    {discount > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>Rabat:</span>
                        <span>-{discount.toFixed(2)} zł</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold border-t pt-2">
                      <span>RAZEM:</span>
                      <span>{totalWithDelivery.toFixed(2)} zł</span>
                    </div>
                    {deliveryInfo && (
                      <p className="text-xs text-black/60 text-center">ETA: {deliveryInfo.eta}</p>
                    )}

                    <div className="space-y-2">
                      {LegalConsent}
                      <label className="flex items-start gap-2 text-xs leading-5 text-black">
                        <input
                          type="checkbox"
                          checked={confirmCityOk}
                          onChange={(e) => setConfirmCityOk(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>
                          Uwaga: składasz zamówienie do restauracji w{" "}
                          <b>{restaurantCityLabel}</b>. Potwierdzam, że to prawidłowe miasto.
                        </span>
                      </label>

                      <p className="text-[11px] text-black/60 text-center">
                        Dzisiejsze godziny w {restaurantCityLabel}: {openInfo.label}
                      </p>

                      {TURNSTILE_SITE_KEY ? (
                        <div className="mt-1">
                          <h4 className="font-semibold mb-1">Weryfikacja</h4>
                          {turnstileError ? (
                            <p className="text-sm text-red-600">
                              Nie udało się załadować weryfikacji.
                            </p>
                          ) : (
                            <>
                              <div ref={tsDesktopRef} />
                              <p className="text-[11px] text-black/60 mt-1">
                                Chronimy formularz przed botami.
                              </p>
                            </>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-black/60">
                          Weryfikacja Turnstile wyłączona (brak klucza).
                        </p>
                      )}

                      {!shouldHideOrderActions && (
                        <button
                          onClick={handleSubmitOrder}
                          disabled={
                            submitting ||
                            !legalAccepted ||
                            !confirmCityOk ||
                            (TURNSTILE_SITE_KEY ? !turnstileToken : false)
                          }
                          className={`w-full mt-2 py-2 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
                        >
                          {submitting ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="h-4 w-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                              Przetwarzanie...
                            </span>
                          ) : (
                            "✅ Zamawiam"
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
