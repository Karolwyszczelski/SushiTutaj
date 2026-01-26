"use client";


import { createClient } from "@supabase/supabase-js";
import { toZonedTime } from "date-fns-tz";

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

/** Telefony do lokali – używane w sekcji "Nie możesz znaleźć swojego adresu?" */
const CITY_PHONE: Record<string, string> = {
  ciechanow: "+48 780 072 372",
  przasnysz: "+48 518 166 888",
  szczytno: "+48 510 700 995",
};

/** Zwraca numer telefonu dla aktualnego miasta (albo null, jeśli nie ma) */
function getRestaurantPhone(slug: string): string | null {
  const s = (slug || "").toLowerCase();
  return CITY_PHONE[s] || null;
}

/** Domyślne fallbacki (gdy brak configu z API) */
const DEFAULT_REQUIRE_AUTOCOMPLETE = true;
const DEFAULT_PACKAGING_COST = 3; // zł



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

// --- NOWE TYPY ---
type DbOption = {
  id: string;
  name: string;
  price_modifier: number;
  position?: number;
};
type DbOptionGroup = {
  id: string;
  name: string;
  type: "radio" | "checkbox";
  min_select: number;
  max_select: number;
  options: DbOption[];
};
// Łącznik
type DbProductOptionLink = {
  option_group: DbOptionGroup;
};

// Zaktualizowany typ produktu
type ProductDb = {
  id: string;
  name: string;
  subcategory: string | null;
  description: string | null;
  restaurant_id?: string | null;
  product_option_groups?: DbProductOptionLink[]; // <-- To pole jest kluczowe
};

/* —— RABATY —— */
type ApplyScope =
  | "all"
  | "include_categories"
  | "exclude_categories"
  | "include_products"
  | "exclude_products";

type DiscountCodeRow = {
  id: string;
  code: string | null;
  active: boolean | null;
  type: "percent" | "amount" | null;
  value: number | null;
  min_order: number | null;
  expires_at: string | null;
  restaurant_id: string | null;
  description?: string | null;
  require_code: boolean | null;
  apply_scope: ApplyScope | null;
  include_categories: string[] | null;
  exclude_categories: string[] | null;
  include_products: string[] | null;
  exclude_products: string[] | null;
};

type Promo =
  | {
      id: string;
      code: string | null;
      type: "percent" | "amount";
      value: number;
      apply_scope: ApplyScope;
      include_categories: string[] | null;
      exclude_categories: string[] | null;
      include_products: string[] | null;
      exclude_products: string[] | null;
      min_order: number | null;
      require_code: boolean;
    }
  | null;


export type LoyaltyChoice = "keep" | "use_4" | "use_8";

/* --- KONFIG PROGRAMU LOJALNOŚCIOWEGO (SPÓJNE Z BACKENDEM) --- */
/**
 * Naliczanie naklejek: liczymy od kwoty "base" (produkty + opakowanie, BEZ dostawy)
 * - od 50 zł  -> 1 naklejka
 * - od 200 zł -> 2 naklejki
 * - od 300 zł -> 3 naklejki
 */
const LOYALTY_MIN_ORDER_BASE = 50; // najniższy próg
const LOYALTY_EARN_TIER_2 = 200;
const LOYALTY_EARN_TIER_3 = 300;
const LOYALTY_MAX_EARN_PER_ORDER = 3;

// Statusy zamówień, które liczą się do naklejek (jak dotychczas w UI)
const LOYALTY_ELIGIBLE_STATUSES = ["accepted", "completed"] as const;

// Nagrody
const LOYALTY_PERCENT = 30;
const LOYALTY_REWARD_ROLL_COUNT = 4;     // darmowa rolka
const LOYALTY_REWARD_PERCENT_COUNT = 8;  // -30% (spala 8 naklejek)

/** Ile naklejek *powinno* wpaść za dane zamówienie (wg reguł backendu). */
function computeEarnedStickersFromBase(baseWithoutDelivery: number): number {
  const base = Number(baseWithoutDelivery || 0);
  if (!Number.isFinite(base) || base < LOYALTY_MIN_ORDER_BASE) return 0;
  if (base >= LOYALTY_EARN_TIER_3) return 3;
  if (base >= LOYALTY_EARN_TIER_2) return 2;
  return 1;
}


/* Sushi sosy i dodatki */
const BASE_SAUCES = [
  "Sos sojowy",
  "Teryiaki",
  "Spicy Mayo",
  "Mango",
  "Sriracha",
  "Żurawina",
];

/**
 * Grupy synonimów składników - produkty w tej samej grupie to de facto to samo.
 * Używane do filtrowania listy zamian, żeby nie pokazywać "zamień surimi na paluszek krabowy".
 * Każda grupa to tablica fragmentów nazw (lowercase), które oznaczają ten sam składnik.
 */
const INGREDIENT_SYNONYMS: string[][] = [
  // Surimi = Paluszek krabowy (to to samo - przetworzony produkt z ryby)
  ["surimi", "paluszek krabowy", "paluszkiem krabowym", "krab"],
];

/**
 * Sprawdza czy dwa produkty są synonimami (ten sam składnik pod inną nazwą).
 * @param name1 - pełna nazwa pierwszego produktu
 * @param name2 - pełna nazwa drugiego produktu
 * @returns true jeśli produkty są synonimami i nie powinny być dostępne jako zamiana
 */
function areIngredientSynonyms(name1: string, name2: string): boolean {
  const n1 = (name1 || "").toLowerCase();
  const n2 = (name2 || "").toLowerCase();
  
  if (n1 === n2) return false; // ta sama nazwa - nie są "synonimami" w sensie duplikatu
  
  for (const group of INGREDIENT_SYNONYMS) {
    const match1 = group.some(syn => n1.includes(syn));
    const match2 = group.some(syn => n2.includes(syn));
    // Jeśli oba produkty mają składniki z tej samej grupy synonimów - to synonimy
    if (match1 && match2) return true;
  }
  
  return false;
}

// dodatkowe sosy do frytek z batatów (tylko Przasnysz / Szczytno)
const BATATA_SAUCES = ["Sos czekoladowy", "Sos toffi"];

// do wyceny – wszystkie sosy liczymy po 2 zł
const ALL_SAUCES = [...BASE_SAUCES, ...BATATA_SAUCES];

const EXTRAS = ["Tempura", "Płatek sojowy", "Tamago", "Ryba pieczona"];
const SWAP_FEE_NAME = "Zamiana w zestawie";

// ===== DB-DRIVEN OPTIONS (warianty / modyfikatory) =====
const DBVAR_PREFIX = "DBVAR|"; // DBVAR|<variantId>|<priceCents>|<name>
const DBMOD_PREFIX = "DBMOD|"; // DBMOD|<groupId>|<modifierId>|<priceCents>|<name>

type DbVariant = { id: string; name: string; price_delta_cents: number; position?: number };
type DbModifier = { id: string; name: string; price_delta_cents: number; position?: number };
type DbGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  is_required: boolean;
  position?: number;
  modifiers: DbModifier[];
};
type DbProductOptions = {
  product_id: string;
  variants: DbVariant[];
  groups: DbGroup[];
  variant_groups: Record<string, DbGroup[]>;
};

function buildDbVarAddon(v: DbVariant) {
  const priceCents = Number(v.price_delta_cents || 0);
  return `${DBVAR_PREFIX}${v.id}|${priceCents}|${v.name}`;
}
function parseDbVarAddon(a: string) {
  if (!a?.startsWith(DBVAR_PREFIX)) return null;
  const parts = a.split("|");
  if (parts.length < 3) return null;
  const variantId = parts[1];
  const priceCents = Number(parts[2] || 0);
  const name = parts.slice(3).join("|") || "";
  return { variantId, priceCents, name };
}

function buildDbModAddon(groupId: string, m: DbModifier) {
  const priceCents = Number(m.price_delta_cents || 0);
  return `${DBMOD_PREFIX}${groupId}|${m.id}|${priceCents}|${m.name}`;
}
function parseDbModAddon(a: string) {
  if (!a?.startsWith(DBMOD_PREFIX)) return null;
  const parts = a.split("|");
  if (parts.length < 4) return null;
  const groupId = parts[1];
  const modifierId = parts[2];
  const priceCents = Number(parts[3] || 0);
  const name = parts.slice(4).join("|") || "";
  return { groupId, modifierId, priceCents, name };
}

const fmtPlnFromCents = (cents: number) =>
  (Math.max(0, Number(cents || 0)) / 100).toFixed(2).replace(".", ",");


/** Cennik dodatków (poza sosami) */
const EXTRA_PRICES: Record<string, number> = {
  Tempura: 4,
  "Płatek sojowy": 3,
  Tamago: 4,
  "Ryba pieczona": 2, // zawsze 2 zł
};

/* NOWE: nazwy addonów dla pieczenia zestawów/rolek */
const RAW_SET_BAKE_ALL = "Zamiana całego zestawu na pieczony";
const RAW_SET_BAKE_ALL_LEGACY =
  "Zamiana całego zestawu surowego na pieczony (+5 zł)"; // dla starych zamówień
const RAW_SET_BAKE_ROLL_PREFIX = "Zamiana surowej rolki na pieczoną: ";

/** Dodatki przypisane do konkretnej rolki w zestawie */
const SET_ROLL_EXTRA_PREFIX = "Dodatek do rolki: ";

/** Addon oznaczający powiększenie zestawu (np. +6 szt za 1 zł) */
const SET_UPGRADE_ADDON = "Powiększenie zestawu";

/** Dopłata za wersję pieczoną całego zestawu – per zestaw (z menu) */
const SET_BAKE_PRICES: Record<string, number> = {
  "zestaw 2": 2,
  "zestaw 5": 6,
  "zestaw 7": 2,
  "zestaw 10": 2,
  "zestaw 11": 8,
  "zestaw 12": 4,
  "zestaw 13": 8,
};

type SetUpgradeInfo = {
  basePieces: number;
  extraPieces: number;
  totalPieces: number;
  price: number; // dopłata w zł
};

/**
 * Parsuje opis typu:
 * "28 szt + 6 szt za 1 zł = 34 szt 129 zł ..."
 * "72 szt + 14 szt za 2 zł = 86 szt 279 zł ..."
 */
function parseSetUpgradeInfo(
  product?: ProductDb | null
): SetUpgradeInfo | null {
  if (!product?.description) return null;
  const text = product.description.toLowerCase().replace(",", ".");

  const re =
    /(\d+)\s*szt[^+\d]*\+\s*(\d+)\s*szt\s*za\s*(\d+)\s*zł[^=]*=\s*(\d+)\s*szt/;
  const m = text.match(re);
  if (!m) return null;

  const basePieces = Number(m[1]);
  const extraPieces = Number(m[2]);
  const price = Number(m[3]);
  const totalPieces = Number(m[4]);

  if (
    !Number.isFinite(basePieces) ||
    !Number.isFinite(extraPieces) ||
    !Number.isFinite(price)
  ) {
    return null;
  }

  return { basePieces, extraPieces, totalPieces, price };
}

function getSetUpgradePrice(product?: ProductDb | null): number | null {
  const info = parseSetUpgradeInfo(product || null);
  return info ? info.price : null;
}

function getSetBakePriceForProduct(product?: ProductDb | null): number | null {
  if (!product) return null;
  const name = product.name.toLowerCase();
  for (const key of Object.keys(SET_BAKE_PRICES)) {
    if (name.startsWith(key)) {
      return SET_BAKE_PRICES[key];
    }
  }
  return null;
}

/* Helper: rozpoznanie specjalnej California z opcją Ryby pieczonej +2 zł
   – po składnikach, bez wymogu słowa "California" w nazwie */
function isSpecialCaliforniaBakedFishProduct(
  name: string,
  description?: string | null
): boolean {
  const text = `${name} ${description || ""}`.toLowerCase();

  // łosoś + info, że jest surowy
  const hasSalmon =
    text.includes("łosoś") || text.includes("losos");
  const isRaw =
    text.includes("surowy") ||
    text.includes("surowe") ||
    text.includes("surowa") ||
    text.includes("surow");

  // paluszek krabowy / krab – różne odmiany
  const hasCrab =
    text.includes("paluszek krabowy") ||
    text.includes("paluszki krabowe") ||
    text.includes("paluszkiem krabowym") ||
    text.includes("krabowy") ||
    text.includes("krab");

  // krewetka / krewetki – łapiemy po "krewet"
  const hasShrimp = text.includes("krewet");

  return hasSalmon && isRaw && hasCrab && hasShrimp;
}

function normalizePlain(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase();
}

function isSetMonthName(name?: string | null): boolean {
  const n0 = normalizePlain(String(name || ""));
  const n = n0.replace(/[\s\-_]+/g, " ").trim(); // unifikacja separatorów
  return n.includes("zestaw miesiaca") || n.includes("zestaw miesiac");
}

function isSetMonthProduct(product?: ProductDb | null): boolean {
  return isSetMonthName(product?.name);
}


/* ================= SAUCE PRICING (FREE ALLOWANCES) ================= */

// Jeśli kiedyś zrobisz różne ceny sosów – zmieniasz tylko tutaj.
const SAUCE_PRICES: Record<string, number> = Object.fromEntries(
  ALL_SAUCES.map((s) => [s, 2])
);

const sauceUnitPrice = (s: string) => {
  const p = SAUCE_PRICES[s];
  return Number.isFinite(p) ? Number(p) : 2;
};

const isSauceAddon = (a: string) => ALL_SAUCES.includes(a);

// Priorytet “które sosy najpierw wpadają jako darmowe” przy regule COUNT.
// (Jeśli ceny kiedyś się różnią – tu masz deterministykę.)
const SAUCE_PRIORITY: string[] = [
  "Sos sojowy",
  "Teryiaki",
  "Spicy Mayo",
  "Mango",
  "Sriracha",
  "Żurawina",
  "Sos czekoladowy",
  "Sos toffi",
];

function pluralizeSos(n: number) {
  const nn = Math.abs(Math.trunc(Number(n || 0)));
  const mod10 = nn % 10;
  const mod100 = nn % 100;

  if (nn === 1) return "sos";
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "sosy";
  return "sosów";
}

function buildDefaultFreeSaucesForRule(rule: SauceRule): string[] {
  if (!rule) return [];

  const eligible = Array.isArray(rule.eligible) ? rule.eligible : [];
  const eligibleSet = new Set(eligible);
  const out: string[] = [];

  if (rule.kind === "perSauce") {
    const fb = rule.freeBySauce || {};
    for (const [s, qRaw] of Object.entries(fb)) {
      const q = Math.max(0, Math.floor(Number(qRaw || 0)));
      if (!q) continue;
      if (!eligibleSet.has(s)) continue;
      for (let i = 0; i < q; i++) out.push(s);
    }
    return out;
  }

  if (rule.kind === "count") {
    const freeCount = Math.max(0, Math.floor(Number(rule.freeCount || 0)));
    if (!freeCount) return [];

    const ordered = [
      ...SAUCE_PRIORITY.filter((s) => eligibleSet.has(s)),
      ...eligible.filter((s) => !SAUCE_PRIORITY.includes(s)),
    ];

    if (!ordered.length) return [];

    for (let i = 0; i < freeCount; i++) {
      out.push(ordered[i % ordered.length]);
    }
    return out;
  }

  return [];
}

function summarizeSauceList(list: string[]): string {
  if (!list?.length) return "";
  const m = new Map<string, number>();
  for (const s of list) m.set(s, (m.get(s) ?? 0) + 1);

  return Array.from(m.entries())
    .map(([s, q]) => `${s} ×${q}`)
    .join(", ");
}


type SauceRule =
  | { kind: "none"; eligible: string[]; hint?: string }
  | { kind: "count"; eligible: string[]; freeCount: number; hint?: string }
  | {
      kind: "perSauce";
      eligible: string[];
      freeBySauce: Record<string, number>;
      hint?: string;
    };

function getSaucesForProductName(name: string, restaurantSlug: string): string[] {
  const city = (restaurantSlug || "").toLowerCase();
  const full = normalizePlain(name || "");

  // Frytki z batatów tylko Przasnysz / Szczytno (tak jak masz już w kodzie)
  const isSweetPotato =
    (city === "szczytno" || city === "przasnysz") &&
    (full.includes("frytki z batat") || full.includes("frytki batat"));

  return isSweetPotato
    ? ["Spicy Mayo", "Teryiaki", "Sos czekoladowy", "Sos toffi"]
    : BASE_SAUCES;
}

function parseSetNumber(namePlain: string): number | null {
  // łapie: "zestaw 10", "zestaw10", "zestaw-10"
  const m = namePlain.match(/\bzestaw[\s\-]*([0-9]{1,3})\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function getFreeCountForSetLike(namePlain: string): number | null {
  // 100 szt / 100szt => 4
  if (/\b100\s*szt\b/i.test(namePlain) || /\b100szt\b/i.test(namePlain)) return 4;

  // Zestawy numerowane
  const n = parseSetNumber(namePlain);
  if (n != null) {
    if (n >= 1 && n <= 7) return 1;
    if (n >= 8 && n <= 12) return 2;
    if (n === 13) return 3;
  }

  // Tutaj Specjal (łapiemy też literówki typu "turtaj")
  if (namePlain.includes("tutaj specjal") || namePlain.includes("turtaj specjal")) return 2;

  // Zestaw miesiąca
  if (namePlain.includes("zestaw miesiaca") || namePlain.includes("zestaw miesiąca")) return 1;

  // Nigiri set
  if (namePlain.includes("nigiri set") || namePlain.includes("set nigiri")) return 1;

  // Lunch 1/2/3
  if (/\blunch[\s\-]*[123]\b/i.test(namePlain)) return 1;

  // Vege set 1/2
  if (/\bvege[\s\-]*set[\s\-]*[12]\b/i.test(namePlain)) return 1;

  return null;
}

function getSauceRuleForItem(params: {
  itemName: string;
  subcatLc: string;
  restaurantSlug: string;
}): SauceRule {
  const itemName = params.itemName || "";
  const namePlain = normalizePlain(itemName);
  const sub = (params.subcatLc || "").toLowerCase();
  const saucesForProduct = getSaucesForProductName(itemName, params.restaurantSlug);

  // Przystawki specjalne:
  const isTempuraMix = namePlain.includes("tempura mix");
  const isShrimpTempura =
    namePlain.includes("krewetki w tempurze") ||
    namePlain.includes("krewetka w tempurze");

  if (isTempuraMix) {
    return {
      kind: "perSauce",
      eligible: saucesForProduct,
      freeBySauce: { Teryiaki: 1, "Spicy Mayo": 1 },
      hint: "W cenie: 1× Teryiaki + 1× Spicy Mayo gratis.",
    };
  }

  if (isShrimpTempura) {
    return {
      kind: "perSauce",
      eligible: saucesForProduct,
      freeBySauce: { Teryiaki: 1, "Spicy Mayo": 1 },
      hint: "W cenie: 1× Teryiaki + 1× Spicy Mayo gratis.",
    };
  }

  // Frytki z batatów: 1 wybrany sos gratis (z puli batatowej)
  const isSweetPotato =
    saucesForProduct.length === 4 &&
    (namePlain.includes("frytki z batat") || namePlain.includes("frytki batat"));

  if (isSweetPotato) {
    return {
      kind: "count",
      eligible: saucesForProduct,
      freeCount: 1,
      hint: "W cenie: 1 wybrany sos gratis (z puli do batatów).",
    };
  }

    // Zestawy / specjały / sety / lunche / “set-like”
  const isSetLike =
    sub === "zestawy" ||
    sub.includes("specja") || // "specjały" / "specjaly"
    namePlain.includes("zestaw") ||
    namePlain.includes(" set ") ||
    namePlain.includes("lunch") ||
    /\bset\b/i.test(namePlain);

  if (isSetLike) {
    const free = getFreeCountForSetLike(namePlain);
    const freeSoy = Math.max(0, free ?? 1); // default 1 dla innych setów
    return {
      kind: "perSauce",
      eligible: saucesForProduct,
      freeBySauce: { "Sos sojowy": freeSoy },
      hint: `W cenie: ${freeSoy}× Sos sojowy gratis.`,
    };
  }

    // START: single rolls => 1 sauce free (COUNT)
  const isSingleRoll =
    !isSetLike &&
    (
      sub.includes("rolk") ||
      sub.includes("california") ||
      sub.includes("uramaki") ||
      sub.includes("futomaki") ||
      sub.includes("hosomaki") ||
      sub.includes("maki") ||
      namePlain.includes("california") ||
      namePlain.includes("roll") ||
      namePlain.includes("uramaki") ||
      namePlain.includes("futomaki") ||
      namePlain.includes("hosomaki") ||
      namePlain.includes("maki")
    );

  if (isSingleRoll) {
    return {
      kind: "count",
      eligible: saucesForProduct,
      freeCount: 1,
      hint: "W cenie: 1 sos gratis.",
    };
  }
  // END: single rolls => 1 sauce free (COUNT)



  // Reszta: brak darmowych sosów (ale jeśli ktoś doda – liczymy normalnie)
  return { kind: "none", eligible: saucesForProduct };
}

function computeSauceCostFromAddons(addons: unknown, rule: SauceRule) {
  const arr: string[] = Array.isArray(addons) ? (addons as any[]).filter((x) => typeof x === "string") : [];
  const countsAll = new Map<string, number>();

  for (const a of arr) {
  const aa = String(a).trim();
  if (!isSauceAddon(aa)) continue;
  countsAll.set(aa, (countsAll.get(aa) ?? 0) + 1);
}


  // Sosy spoza eligible (gdyby kiedyś UI/baza dołożyła coś nietypowego)
  const eligibleSet = new Set(rule.eligible);
  let nonEligibleCost = 0;
  for (const [s, q] of countsAll.entries()) {
    if (eligibleSet.has(s)) continue;
    nonEligibleCost += q * sauceUnitPrice(s);
  }

  // Teraz liczymy tylko eligible z uwzględnieniem darmowych
  const countsEligible = new Map<string, number>();
  for (const [s, q] of countsAll.entries()) {
    if (!eligibleSet.has(s)) continue;
    countsEligible.set(s, q);
  }

  const chargedBySauce: Record<string, number> = {};
  const freeBySauce: Record<string, number> = {};

  const applyCharge = (s: string, chargedQty: number, freeQty: number) => {
    if (chargedQty > 0) chargedBySauce[s] = (chargedBySauce[s] ?? 0) + chargedQty;
    if (freeQty > 0) freeBySauce[s] = (freeBySauce[s] ?? 0) + freeQty;
  };

  let eligibleCost = 0;

  if (rule.kind === "none") {
    for (const [s, q] of countsEligible.entries()) {
      eligibleCost += q * sauceUnitPrice(s);
      applyCharge(s, q, 0);
    }
    return { cost: eligibleCost + nonEligibleCost, chargedBySauce, freeBySauce };
  }

  if (rule.kind === "perSauce") {
    for (const [s, q] of countsEligible.entries()) {
      const free = Math.max(0, Number(rule.freeBySauce[s] ?? 0));
      const freeUsed = Math.min(q, free);
      const charged = Math.max(0, q - freeUsed);
      eligibleCost += charged * sauceUnitPrice(s);
      applyCharge(s, charged, freeUsed);
    }
    return { cost: eligibleCost + nonEligibleCost, chargedBySauce, freeBySauce };
  }

  // kind === "count"
  let freeRemaining = Math.max(0, Number(rule.freeCount || 0));

  // deterministyczna kolejność: priorytet + reszta
  const ordered = [
    ...SAUCE_PRIORITY.filter((s) => countsEligible.has(s)),
    ...Array.from(countsEligible.keys()).filter((s) => !SAUCE_PRIORITY.includes(s)),
  ];

  for (const s of ordered) {
    const q = countsEligible.get(s) ?? 0;
    const freeUsed = Math.min(q, freeRemaining);
    freeRemaining -= freeUsed;
    const charged = Math.max(0, q - freeUsed);

    eligibleCost += charged * sauceUnitPrice(s);
    applyCharge(s, charged, freeUsed);
  }

  return { cost: eligibleCost + nonEligibleCost, chargedBySauce, freeBySauce };
}

function computeNonSauceAddonsCost(addons: unknown, product?: ProductDb | null): number {
  const arr: string[] = Array.isArray(addons) ? (addons as any[]).filter((x) => typeof x === "string") : [];
  let sum = 0;
  for (const a of arr) {
  const aa = String(a).trim();
  if (isSauceAddon(aa)) continue; // sosy liczymy osobno (bo są darmowe limity)
  sum += computeAddonPrice(aa, product ?? null);
}
  return sum;
}

// START: ComputeAddonsCostWithSaucesResult
export type ComputeAddonsCostWithSaucesResult = {
  addonsCost: number;
  sauceHint?: string;
  sauceBreakdown?: any;
  sauceRule?: any;
};
// END: ComputeAddonsCostWithSaucesResult


function computeAddonsCostWithSauces(params: {
  addons: unknown;
  product: ProductDb | null | undefined;
  itemName: string;
  subcat: string;
  restaurantSlug: string;
}): ComputeAddonsCostWithSaucesResult {
  const rule = getSauceRuleForItem({
    itemName: params.itemName,
    subcatLc: (params.subcat || "").toLowerCase(),
    restaurantSlug: params.restaurantSlug,
  });

  const nonSauce = computeNonSauceAddonsCost(params.addons, params.product ?? null);
  const sauce = computeSauceCostFromAddons(params.addons, rule);

    return {
    addonsCost: nonSauce + sauce.cost,
    sauceHint: rule.hint,
    sauceBreakdown: sauce, // <- chargedBySauce / freeBySauce / cost
    sauceRule: rule,       // <- żeby UI mogło to opisać
  };
}

/* =================================================================== */


/**
 * California „obłożona” – np. obłożona łososiem na wierzchu.
 * Używamy tego, żeby rozróżnić:
 * - Californię obłożoną
 * - Californię „czystą” (bez obłożenia na wierzchu)
 */
function isCaliforniaToppedByText(
  name: string,
  description?: string | null
): boolean {
  const txt = normalizePlain(`${name || ""} ${description || ""}`);

  return (
    txt.includes("oblozon") ||  // obłożona / obłożony / obłożone
    txt.includes("oblozona") ||
    txt.includes("oblozone") ||
    txt.includes("na wierzchu") // np. „łosoś na wierzchu”
  );
}

function isDessertProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const sub = (prodInfo?.subcategory || "").toLowerCase();
  if (sub.includes("deser")) return true; // "deser", "desery"

  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${prodInfo?.description || ""}`
    .toLowerCase()
    .trim();

  // słowa-klucze – dopasuj, jeśli masz inne nazwy w menu
  return (
    text.includes("mochi") ||
    text.includes("deser") ||
    text.includes("ciasto") ||
    text.includes("brownie") ||
    text.includes("sernik") ||
    text.includes("lody")
  );
}



function isSushiSpecjalProduct(
  prod: any,
  prodInfo?: ProductDb | null
): boolean {
  // Zbieramy wszystko, co może zawierać nazwę / kategorię tego zestawu
  const pieces: string[] = [];

  if (prod?.name) pieces.push(String(prod.name));
  if ((prod as any)?.baseName) pieces.push(String((prod as any).baseName));
  if ((prod as any)?.subcategory) pieces.push(String((prod as any).subcategory));

  if (prodInfo?.name) pieces.push(prodInfo.name);
  if (prodInfo?.subcategory) pieces.push(prodInfo.subcategory);
  if (prodInfo?.description) pieces.push(prodInfo.description || "");

  if (!pieces.length) return false;

  const text = normalizePlain(pieces.join(" | ")); // bez ogonków, małe litery

  const hasSushi = text.includes("sushi");
  const hasSpecjal = text.includes("specjal"); // łapie też "specjał"

  if (!hasSushi || !hasSpecjal) return false;

  // Opcjonalne zawężenie do zestawów
  const isSetLike =
    text.includes("zestaw") ||
    text.includes("zestawy") ||
    text.includes("100 szt"); // Twój przypadek

  return isSetLike || true; // na razie i tak zwracamy true, jeśli jest "sushi" + "specjal"
}

function computeAddonPrice(addon: string, product?: ProductDb | null): number {
  addon = String(addon || "").trim();
  // 1. NAJPIERW: Szukamy ceny w opcjach pobranych z bazy danych
  if (product && product.product_option_groups) {
    for (const link of product.product_option_groups) {
      const foundOption = link.option_group.options.find(o => o.name === addon);
      if (foundOption) {
         // Cena w bazie jest w groszach (np. 200), dzielimy przez 100
         return foundOption.price_modifier / 100;
      }
    }
  }
   // DB: modyfikatory / warianty (cena w centach w samym stringu addona)
  if (addon.startsWith(DBMOD_PREFIX)) {
    const p = parseDbModAddon(addon);
    return p ? (p.priceCents || 0) / 100 : 0;
  }
  if (addon.startsWith(DBVAR_PREFIX)) {
    const p = parseDbVarAddon(addon);
    return p ? (p.priceCents || 0) / 100 : 0;
  }
  if (ALL_SAUCES.includes(addon)) return 2;
  if (addon === SWAP_FEE_NAME) {
    // Zestaw miesiąca: nawet jeśli dopłata "przetrwa" w addonach, nie naliczamy jej
    if (isSetMonthProduct(product || null)) return 0;
    return 5;
  }


  // Wersja pieczona całego zestawu – cena zależy od konkretnego zestawu
  if (addon === RAW_SET_BAKE_ALL || addon === RAW_SET_BAKE_ALL_LEGACY) {
    const p = getSetBakePriceForProduct(product || null);
    return typeof p === "number" ? p : 5;
  }

  // Powiększony zestaw (np. "+6 szt za 1 zł", "+14 szt za 2 zł")
  if (addon === SET_UPGRADE_ADDON) {
    const p = getSetUpgradePrice(product || null);
    return typeof p === "number" ? p : 1; // fallback 1 zł
  }

  // pojedyncza surowa rolka w zestawie -> pieczona
  if (addon.startsWith(RAW_SET_BAKE_ROLL_PREFIX)) return 2;

  // ----- Dodatki typu Tempura / Płatek sojowy / Tamago / Ryba pieczona -----
  // Mogą występować:
  // - jako sam addon ("Tempura", "Ryba pieczona")
  // - jako addon per rolka w zestawie: "Dodatek do rolki: <cat> <opis> — <nazwa dodatku>"

  let label = addon;

  if (addon.startsWith(SET_ROLL_EXTRA_PREFIX)) {
    const after = addon.slice(SET_ROLL_EXTRA_PREFIX.length).trim();
    const parts = after.split("—");
    const maybeExtra = (parts[1] || parts[0] || "").trim();
    const foundBase = EXTRAS.find((ex) =>
      maybeExtra.toLowerCase().includes(ex.toLowerCase())
    );
    if (foundBase) {
      label = foundBase; // "Tempura" / "Płatek sojowy" / "Tamago" / "Ryba pieczona"
    }
  }

  const extraPrice = EXTRA_PRICES[label as keyof typeof EXTRA_PRICES];
  if (typeof extraPrice === "number") return extraPrice;

  // Fallback – gdyby pojawił się nieskonfigurowany addon
  return 4;
}

/* helper dla widoczności elementu (używany przez Turnstile) */
const isVisible = (el: HTMLDivElement | null) => !!el && !!el.offsetParent;

/* ---------- helpers ---------- */
const accentBtn =
  "bg-gradient-to-b from-[#b31217] to-[#7a0b0b] text-white shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] ring-1 ring-black/30";

/* ================= GODZINY OTWARCIA PER MIASTO ================= */
type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = niedziela
type Range = [h: number, m: number, H: number, M: number];

/** Pojedyncza blokada godzin (z API /api/admin/blocked-times) */
type BlockedTime = {
  id: string;
  /** Data w formacie YYYY-MM-DD (w strefie Europe/Warsaw) */
  date: string;
  /** Czy cały dzień jest zablokowany */
  full_day: boolean;
  /** Początek blokady HH:mm (lub null przy full_day) */
  from_time: string | null;
  /** Koniec blokady HH:mm (lub null przy full_day) */
  to_time: string | null;
};

const CITY_SCHEDULE: Record<
  string,
  Partial<Record<Day, Range>> & { default?: Range }
> = {
  ciechanow: {
  0: [12, 0, 20, 30],
  1: [12, 0, 20, 30],
  2: [12, 0, 20, 30],
  3: [12, 0, 20, 30],
  4: [12, 0, 20, 30], // czwartek 20:30
  5: [12, 0, 21, 30], // piątek 21:30
  6: [12, 0, 20, 30],
},
  przasnysz: { default: [12, 0, 20, 30] },
  szczytno: { default: [12, 0, 20, 30] },
};

const tz = "Europe/Warsaw";
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (r: Range) => `${pad(r[0])}:${pad(r[1])}–${pad(r[2])}:${pad(r[3])}`;
const MIN_SCHEDULE_MINUTES = 60;

const SLOT_STEP_MINUTES = 20; // co ile minut pokazujemy sloty

type CheckoutConfig = {
  tz?: string;
  schedule?: Partial<Record<Day, Range>> & { default?: Range };
  minScheduleMinutes?: number;
  slotStepMinutes?: number;
  packagingCost?: number;
  requireAutocomplete?: boolean;
};

const normalizeRange = (v: any): Range | null => {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const n = v.map((x) => Number(x));
  if (n.some((x) => !Number.isFinite(x))) return null;
  return [n[0], n[1], n[2], n[3]] as Range;
};

// Akceptuje camelCase i snake_case z backendu
function normalizeCheckoutConfig(raw: any): CheckoutConfig | null {
  if (!raw || typeof raw !== "object") return null;

  const cfg: CheckoutConfig = {};

  const sch = raw.schedule ?? raw.opening_hours ?? raw.city_schedule ?? null;
  if (sch && typeof sch === "object") {
    const out: any = {};
    const def = normalizeRange(sch.default);
    if (def) out.default = def;

    for (const k of Object.keys(sch)) {
      if (k === "default") continue;
      const day = Number(k);
      if (Number.isFinite(day) && day >= 0 && day <= 6) {
        const r = normalizeRange((sch as any)[k]);
        if (r) out[day] = r;
      }
    }

    if (Object.keys(out).length) cfg.schedule = out;
  }

  const n = (x: any) => {
    const v = Number(x);
    return Number.isFinite(v) ? v : undefined;
  };

  cfg.minScheduleMinutes = n(raw.minScheduleMinutes ?? raw.min_schedule_minutes);
  cfg.slotStepMinutes = n(raw.slotStepMinutes ?? raw.slot_step_minutes);
  cfg.packagingCost = n(raw.packagingCost ?? raw.packaging_cost);

  const ra = raw.requireAutocomplete ?? raw.require_autocomplete;
  if (typeof ra === "boolean") cfg.requireAutocomplete = ra;

  const tzRaw = raw.tz ?? raw.timezone;
  if (typeof tzRaw === "string" && tzRaw.length > 3) cfg.tz = tzRaw;

  return cfg;
}

function resolveScheduleForSlug(
  slug: string,
  cfg: CheckoutConfig | null
): Partial<Record<Day, Range>> & { default?: Range } {
  if (cfg?.schedule && Object.keys(cfg.schedule).length) return cfg.schedule;
  return CITY_SCHEDULE[slug] ?? CITY_SCHEDULE["przasnysz"];
}

function todayRangeForSchedule(
  schedule: Partial<Record<Day, Range>> & { default?: Range },
  d = toZonedTime(new Date(), tz)
): Range | null {
  const r = schedule[d.getDay() as Day] ?? schedule.default ?? null;
  return r ?? null;
}

function isOpenForSchedule(
  schedule: Partial<Record<Day, Range>> & { default?: Range },
  d = toZonedTime(new Date(), tz)
) {
  const r = todayRangeForSchedule(schedule, d);
  if (!r) return { open: false, label: "zamknięte", range: null as Range | null };

  const mins = d.getHours() * 60 + d.getMinutes();
  const o = r[0] * 60 + r[1];
  const c = r[2] * 60 + r[3];

  return { open: mins >= o && mins <= c, label: fmt(r), range: r };
}


// HH:mm z minut
const minutesToHHMM = (mins: number) =>
  `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

// START: roundUpToStep
// Zaokrągla w górę do kroku (np. 0.5 zł)
function roundUpToStep(value: number, step = 0.5): number {
  const v = Number(value);
  const s = Number(step);
  if (!Number.isFinite(v) || !Number.isFinite(s) || s <= 0) return 0;

  const out = Math.ceil(v / s) * s;
  // ochrona na floaty (np. 5.5000000001)
  return Math.round(out * 100) / 100;
}
// END: roundUpToStep



function todayRangeFor(slug: string, d = toZonedTime(new Date(), tz)): Range | null {
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

/* ===== helper do sprawdzania blokad godzin ===== */

const dateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
};

const hmToMinutes = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

/**
 * Sprawdza, czy dana data/godzina wpada w dowolną blokadę
 * (pełny dzień albo zakres godzinowy).
 */
function isDateTimeBlocked(dt: Date, blocks: BlockedTime[]): boolean {
  if (!blocks || !blocks.length) return false;

  const key = dateKey(dt);
  const minutes = dt.getHours() * 60 + dt.getMinutes();

  return blocks.some((b) => {
    if (!b || !b.date) return false;
    if (b.date !== key) return false;

    // cały dzień zablokowany
    if (b.full_day) return true;

    const from = hmToMinutes(b.from_time);
    const to = hmToMinutes(b.to_time);
    if (from == null || to == null) return false;

    // blokujemy [from, to) – od początku włącznie, do końca bez ostatniej minuty
    return minutes >= from && minutes < to;
  });
}
/* ================================================================= */

/* Czas realizacji wskazany przez klienta (dostawa + na wynos) */
const buildClientDeliveryTime = (
  selectedOption: OrderOption | null,
  deliveryTimeOption: "asap" | "schedule",
  scheduledTime: string
): string | null => {
  if (!selectedOption) return null;
  if (deliveryTimeOption === "asap") return "asap";

  const [hours, minutes] = scheduledTime.split(":").map(Number);
  const nowZoned = toZonedTime(new Date(), tz);
  const dt = new Date(nowZoned);
  dt.setHours(hours, minutes, 0, 0);

  // jeśli klient wybierze godzinę z przeszłości – traktujemy jako jutro
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

  if (!res.ok) {
    const err: any = new Error(
      data?.error || data?.message || `HTTP ${res.status}`
    );
    err.status = res.status;
    err.code = data?.code;
    err.data = data;
    throw err;
  }

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
  };
  const label =
    MAP[slug] ||
    (slug ? slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "wybranym mieście");
  return { slug, label };
}

/* prosty hook do wykrycia mobile (Tailwind lg = 1024) */


/* ===== utile produktu i zestawu ===== */
const normalize = (s: string) => s.toLowerCase();

/* NOWE: prefiks kategorii w nazwach (Futomak, Hosomak, California, Nigiri) */
const CATEGORY_PREFIX: Record<string, string> = {
  futomaki: "Futomak",
  hosomaki: "Hosomak",
  california: "California",
  nigiri: "Nigiri",
};

/** Spróbuj odgadnąć kategorię po samej nazwie produktu */
function inferCategoryFromName(name?: string | null): string | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();

  if (n.startsWith("futomak")) return "futomaki";
  if (n.startsWith("hosomak")) return "hosomaki";
  if (n.startsWith("california")) return "california";
  if (n.startsWith("nigiri")) return "nigiri";

  return null;
}

/** Dodaje prefiks kategorii do nazwy, jeśli nie jest już zawarty */
function withCategoryPrefix(name: string, subcategory?: string | null): string {
  const base = (name || "").trim();
  if (!base) return base;

  const lowerBase = base.toLowerCase();

  // jeśli nazwa już zawiera jakikolwiek znany prefiks – zostawiamy jak jest
  const alreadyPrefixed = [
    "futomak ",
    "futomaki ",
    "hosomak ",
    "california ",
    "nigiri ",
  ].some((p) => lowerBase.startsWith(p));
  if (alreadyPrefixed) return base;

  // najpierw kategoria z nazwy, dopiero potem z pola subcategory
  const inferred = inferCategoryFromName(base);
  const key = (inferred || (subcategory || "").toLowerCase()) as keyof typeof CATEGORY_PREFIX;
  const prefix = CATEGORY_PREFIX[key];
  if (!prefix) return base;

  const capitalized = base[0].toUpperCase() + base.slice(1);
  return `${prefix} ${capitalized}`;
}

function parseSetComposition(desc?: string | null) {
  if (!desc) {
    return [] as { qty: number; cat: string; from: string }[];
  }

  // przykład: "16 szt, SUROWY: 6x Futomaki łosoś philadelphia surowy, 8x Hosomaki ogórek, +6x Futomaki krewetka w tempurze za 1 zł!"
  const listPart = desc.split(":").slice(1).join(":") || desc;

  const rows: { qty: number; cat: string; from: string }[] = [];

  // Szukamy wszystkich sekwencji typu:
  // "+6x Futomaki krewetka w tempurze za 1 zł"
  // "8x Hosomaki ogórek"
  //
  // Działa nawet jeśli zapisy są sklejone bez przecinka:
  // "8x Hosomaki ogórek +6x Futomaki krewetka..."
  const re =
    /[+\-–•]?\s*(\d+)\s*x\s*(Futomaki|California|Hosomaki|Nigiri)\s+(.+?)(?=(?:[,;\n]|[+\-–•]\s*\d+\s*x\s*(?:Futomaki|California|Hosomaki|Nigiri)|$))/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(listPart)) !== null) {
    const qty = parseInt(m[1], 10) || 1;
    const cat = m[2];

      // NOWA LOGIKA CZYSZCZENIA:
    // 1. Usuwamy frazy typu "za 1 zł"
    // 2. Usuwamy frazy o wersji pieczonej wraz z nawiasami, gwiazdkami i ceną
    const from = m[3]
      .replace(/\s+za\s*\d+\s*z[łl].*$/i, "")
      .replace(/\s*\**\(?wersja pieczona.*?\)?\s*\**\s*(?:\+\s*\d+\s*z[łl])?/gi, "")
      .trim();

    if (!from) continue;

    rows.push({ qty, cat, from });
  }

  return rows;
}

type SetSwapPayload = {
  qty: number;
  from: string;     // np. "Futomaki łosoś philadelphia surowy"
  to: string;       // np. "Futomak Vege"
  addons?: string[]; // np. ["Tempura", "Płatek sojowy"]
};

/** Kopia logiki klucza z ProductItem.normalizeSetRowKey – tylko na potrzeby payloadu */
function normalizeSetRowKeyForPayload(row: {
  qty: number;
  cat: string;
  from: string;
}): string {
  const cat = (row.cat || "").trim();
  const from = (row.from || "").trim();
  if (!from) return cat;

  // rozbijamy po "+" bo w zestawach często są miksy typu
  // "krewetka + łosoś surowy"
  const parts = from
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);

  const isFishPart = (s: string) => {
    const l = s.toLowerCase();
    return (
      l.includes("łosoś") ||
      l.includes("losos") ||
      l.includes("tuńczyk") ||
      l.includes("tunczyk")
    );
  };

  // Nie redukujemy klucza do samej "ryby" – inaczej dodatki (np. Tempura)
  // mogą mieć ten sam prefix i zliczać się tylko raz.
  if (parts.length > 1) {
    const fishParts = parts.filter(isFishPart);
    const nonFishParts = parts.filter((p) => !isFishPart(p));

    // ryba na początek, ale reszta zostaje (żeby miks był unikalny)
    const ordered =
      fishParts.length > 0 ? [...fishParts, ...nonFishParts] : parts;

    return `${cat} ${ordered.join(" + ")}`.replace(/\s+/g, " ").trim();
  }

  return `${cat} ${from}`.replace(/\s+/g, " ").trim();
}


/** Buduje strukturalne info o zamianach w zestawie + dodatkach per rolka dla danej pozycji z koszyka */
function buildSetSwapsPayload(
  item: any,
  product?: ProductDb | undefined
): SetSwapPayload[] {
    

  if (!product) return [];
  // Zestaw miesiąca: nie wysyłamy żadnych zamian/struktur swapów
  if (isSetMonthProduct(product || null)) return [];
  const subcat = (product.subcategory || "").toLowerCase();
  if (subcat !== "zestawy") return [];

  const rows = parseSetComposition(product.description);
  if (!rows.length) return [];

  const swapsArr = Array.isArray(item.swaps) ? item.swaps : [];
  const addonsArr = Array.isArray(item.addons) ? item.addons : [];

  const result: SetSwapPayload[] = [];

  rows.forEach((row) => {
    const baseLabel = `${row.cat} ${row.from}`.replace(/\s+/g, " ").trim();

    // Używamy pełnego klucza (z kategorią) do wyszukiwania swap
    // aby rozróżnić rolki z tym samym składnikiem w różnych kategoriach
    const rowKeyBase = normalizeSetRowKeyForPayload(row);
    
    const foundSwap = swapsArr.find(
      (s: any) =>
        s &&
        typeof s.from === "string" &&
        s.from.toLowerCase() === rowKeyBase.toLowerCase()
    );

    const toLabel = (foundSwap?.to as string) || row.from;

    const prefix = `${SET_ROLL_EXTRA_PREFIX}${rowKeyBase} — `;
    const rowExtras = addonsArr
      .filter(
        (a: any) => typeof a === "string" && (a as string).startsWith(prefix)
      )
      .map((a: any) => (a as string).slice(prefix.length).trim())
      .filter(Boolean);

    result.push({
      qty: row.qty,
      from: baseLabel,
      to: toLabel,
      addons: rowExtras.length ? rowExtras : undefined,
    });
  });

  return result;
}

/** Ładny tekst do notatki (kitchen_note / panel) z listy zamian */
function buildSetSwapsNote(swaps: SetSwapPayload[]): string {
  if (!swaps || !swaps.length) return "";
  return swaps
    .map((s) => {
      const addons =
        s.addons && s.addons.length
          ? ` (+ ${s.addons.join(", ")})`
          : "";
      return `${s.qty}× ${s.from} → ${s.to}${addons}`;
    })
    .join("; ");
}

function isAlreadyBakedOrTempura(text: string): boolean {
  const t = (text || "").toLowerCase();
  const hasBaked = t.includes("pieczon"); // pieczona / pieczony / pieczone
  const hasTempura = t.includes("tempur"); // tempura / w tempurze
  return hasBaked || hasTempura;
}

/* ---------- Item w koszyku ---------- */

export type {
  ApplyScope,
  BlockedTime,
  CheckoutConfig,
  Day,
  DbGroup,
  DbModifier,
  DbOption,
  DbOptionGroup,
  DbProductOptionLink,
  DbProductOptions,
  DbVariant,
  DiscountCodeRow,
  OrderOption,
  ProductDb,
  Promo,
  Range,
  SauceRule,
  SetSwapPayload,
  SetUpgradeInfo,
  Zone,
};

export {
  ALL_SAUCES,
  BASE_SAUCES,
  BATATA_SAUCES,
  CATEGORY_PREFIX,
  CITY_PHONE,
  CITY_REVIEW_QR_URLS,
  CITY_SCHEDULE,
  DBMOD_PREFIX,
  DBVAR_PREFIX,
  DEFAULT_PACKAGING_COST,
  DEFAULT_REQUIRE_AUTOCOMPLETE,
  EXTRAS,
  EXTRA_PRICES,
  LOYALTY_ELIGIBLE_STATUSES,
  LOYALTY_MIN_ORDER_BASE,
  LOYALTY_PERCENT,
  LOYALTY_REWARD_PERCENT_COUNT,
  LOYALTY_REWARD_ROLL_COUNT,
  MIN_SCHEDULE_MINUTES,
  RAW_SET_BAKE_ALL,
  RAW_SET_BAKE_ALL_LEGACY,
  RAW_SET_BAKE_ROLL_PREFIX,
  SAUCE_PRICES,
  SAUCE_PRIORITY,
  SET_BAKE_PRICES,
  SET_ROLL_EXTRA_PREFIX,
  SET_UPGRADE_ADDON,
  SLOT_STEP_MINUTES,
  SWAP_FEE_NAME,
  TERMS_VERSION,
  THANKS_QR_URL,
  TURNSTILE_SITE_KEY,
  accentBtn,
  LOYALTY_EARN_TIER_2,
  LOYALTY_EARN_TIER_3,
  LOYALTY_MAX_EARN_PER_ORDER,
  buildClientDeliveryTime,
  buildDbModAddon,
  buildDbVarAddon,
  buildDefaultFreeSaucesForRule,
  buildSetSwapsNote,
  buildSetSwapsPayload,
  computeAddonPrice,
  computeAddonsCostWithSauces,
  computeEarnedStickersFromBase,
  computeNonSauceAddonsCost,
  computeSauceCostFromAddons,
  dateKey,
  fmt,
  fmtPlnFromCents,
  getFreeCountForSetLike,
  getRestaurantCityFromPath,
  getRestaurantPhone,
  getSauceRuleForItem,
  getSaucesForProductName,
  getSetBakePriceForProduct,
  getSetUpgradePrice,
  hmToMinutes,
  inferCategoryFromName,
  isAlreadyBakedOrTempura,
  isCaliforniaToppedByText,
  isDateTimeBlocked,
  isDessertProduct,
  isOpenFor,
  isOpenForSchedule,
  isSauceAddon,
  isSpecialCaliforniaBakedFishProduct,
  isSushiSpecjalProduct,
  isVisible,
  minutesToHHMM,
  roundUpToStep,
  normalize,
  normalizeCheckoutConfig,
  normalizePlain,
  normalizeRange,
  normalizeSetRowKeyForPayload,
  pad,
  parseDbModAddon,
  parseDbVarAddon,
  parseSetComposition,
  parseSetNumber,
  parseSetUpgradeInfo,
  pluralizeSos,
  resolveScheduleForSlug,
  safeFetch,
  sauceUnitPrice,
  summarizeSauceList,
  supabase,
  todayRangeFor,
  todayRangeForSchedule,
  tz,
  withCategoryPrefix,
  isSetMonthName,
  isSetMonthProduct,
  areIngredientSynonyms,
};
