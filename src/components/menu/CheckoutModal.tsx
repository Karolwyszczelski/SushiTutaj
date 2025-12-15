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
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";


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
type ProductDb = {
  id: string;
  name: string;
  subcategory: string | null;
  description: string | null;
  restaurant_id?: string | null;
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


  type LoyaltyChoice = "keep" | "use_4" | "use_8";

  /* --- KONFIG PROGRAMU LOJALNOŚCIOWEGO --- */
// Minimalna baza do naliczenia 1 naklejki – produkty + opakowanie, bez dostawy
const LOYALTY_MIN_ORDER_BASE = 50; // zł

// Statusy zamówień, które liczą się do naklejek
const LOYALTY_ELIGIBLE_STATUSES = ["accepted", "completed"] as const;

const LOYALTY_PERCENT = 30;
const LOYALTY_REWARD_ROLL_COUNT = 4;
const LOYALTY_REWARD_PERCENT_COUNT = 8;

// 50 zł = 1 naklejka, 100 zł = 2 itd., max 8
function computeEarnedStickersFromBase(baseWithoutDelivery: number): number {
  const base = Number(baseWithoutDelivery || 0);
  if (base < LOYALTY_MIN_ORDER_BASE) return 0;
  return Math.min(LOYALTY_REWARD_PERCENT_COUNT, Math.floor(base / LOYALTY_MIN_ORDER_BASE));
}

// Zaokrąglanie opłaty za dostawę do "ładnych" kwot (np. 5.00 / 5.50 / 6.00)
const roundUpToStep = (value: number, step = 0.5) => {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
  const result = Math.ceil(value / step) * step;
  return Math.round(result * 100) / 100; // bezpieczeństwo na floatach
};


/* Sushi sosy i dodatki */
const BASE_SAUCES = [
  "Sos sojowy",
  "Teryiaki",
  "Spicy Mayo",
  "Mango",
  "Sriracha",
  "Żurawina",
];

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

/* NOWE: bazowe opcje do tatara – bez dopłaty */
const TARTAR_BASES = [
  "Wyłożone: na awokado",
  "Wyłożone: na chipsach krewetkowych",
];

const TARTAR_DEFAULT_BASE = "Wyłożone: na awokado";



/* Warianty pierożków Gyoza – bez dopłat, tylko informacja dla kuchni */
const GYOZA_ADDON_PREFIX = "Gyoza: ";
const GYOZA_VARIANTS = [
  `${GYOZA_ADDON_PREFIX}warzywne`,
  `${GYOZA_ADDON_PREFIX}z kurczakiem`,
] as const;
type GyozaVariant = (typeof GYOZA_VARIANTS)[number];

/* Warianty wody – gazowana / niegazowana, też bez dopłaty (tylko info) */
const WATER_ADDON_PREFIX = "Woda: ";
const WATER_VARIANTS = [
  `${WATER_ADDON_PREFIX}gazowana`,
  `${WATER_ADDON_PREFIX}niegazowana`,
] as const;
type WaterVariant = (typeof WATER_VARIANTS)[number];

/* Bubble tea – wybór smaku */
const BUBBLE_TEA_ADDON_PREFIX = "Bubble tea: ";
const BUBBLE_TEA_VARIANTS = [
  `${BUBBLE_TEA_ADDON_PREFIX}mango`,
  `${BUBBLE_TEA_ADDON_PREFIX}brzoskwinia`,
  `${BUBBLE_TEA_ADDON_PREFIX}jabłko`,
] as const;
type BubbleTeaVariant = (typeof BUBBLE_TEA_VARIANTS)[number];

/* Ramune – wybór smaku */
const RAMUNE_ADDON_PREFIX = "Ramune: ";
const RAMUNE_VARIANTS = [
  `${RAMUNE_ADDON_PREFIX}kiwi`,
  `${RAMUNE_ADDON_PREFIX}truskawka`,
  `${RAMUNE_ADDON_PREFIX}winogrono`,
  `${RAMUNE_ADDON_PREFIX}jabłko`,
  `${RAMUNE_ADDON_PREFIX}lichi`,
  `${RAMUNE_ADDON_PREFIX}arbuz`,
  `${RAMUNE_ADDON_PREFIX}lemoniada`,
] as const;
type RamuneVariant = (typeof RAMUNE_VARIANTS)[number];

/* Soki – smak */
const JUICE_ADDON_PREFIX = "Sok: ";
const JUICE_VARIANTS = [
  `${JUICE_ADDON_PREFIX}jabłko`,
  `${JUICE_ADDON_PREFIX}pomarańcza`,
  `${JUICE_ADDON_PREFIX}multiwitamina`,
] as const;
type JuiceVariant = (typeof JUICE_VARIANTS)[number];

/* Lipton – smak */
const LIPTON_ADDON_PREFIX = "Lipton: ";
const LIPTON_VARIANTS = [
  `${LIPTON_ADDON_PREFIX}Brzoskwinia`,
  `${LIPTON_ADDON_PREFIX}Cytryna`,
  `${LIPTON_ADDON_PREFIX}Herbata Zielona`,
] as const;
type LiptonVariant = (typeof LIPTON_VARIANTS)[number];

/* Coca-Cola / Pepsi – zwykła / zero */
const COLA_ADDON_PREFIX = "Cola: ";
const COLA_VARIANTS = [
  `${COLA_ADDON_PREFIX}Klasyczna`,
  `${COLA_ADDON_PREFIX}Zero`,
] as const;
type ColaVariant = (typeof COLA_VARIANTS)[number];

const PEPSI_ADDON_PREFIX = "Pepsi: ";
const PEPSI_VARIANTS = [
  `${PEPSI_ADDON_PREFIX}Klasyczna`,
  `${PEPSI_ADDON_PREFIX}Zero`, // albo "Zero" jeśli wolisz nazewnictwo
] as const;
type PepsiVariant = (typeof PEPSI_VARIANTS)[number];

const FANTA_ADDON_PREFIX = "Fanta: ";
const FANTA_VARIANTS = [
  `${FANTA_ADDON_PREFIX}Klasyczna`,
  `${FANTA_ADDON_PREFIX}Zero`,
] as const;
type FantaVariant = (typeof FANTA_VARIANTS)[number];

const SPRITE_ADDON_PREFIX = "Sprite: ";
const SPRITE_VARIANTS = [
  `${SPRITE_ADDON_PREFIX}Klasyczna`,
  `${SPRITE_ADDON_PREFIX}Zero`,
] as const;
type SpriteVariant = (typeof SPRITE_VARIANTS)[number];

/* 7UP – zwykła / zero */
const SEVENUP_ADDON_PREFIX = "7UP: ";
const SEVENUP_VARIANTS = [
  `${SEVENUP_ADDON_PREFIX}Klasyczna`,
  `${SEVENUP_ADDON_PREFIX}Zero`,
] as const;
type SevenUpVariant = (typeof SEVENUP_VARIANTS)[number];


type SoftDrinkVariant =
  | ColaVariant
  | PepsiVariant
  | FantaVariant
  | SpriteVariant
  | SevenUpVariant;

type SoftDrinkGroup = {
  title: string;
  prefix: string;
  variants: readonly SoftDrinkVariant[];
};

/* Zestaw SUSHI SPECJAŁ – proporcje pieczone/surowe */
const SUSHI_SPECJAL_ADDON_PREFIX = "SUSHI SPECJAŁ: ";
const SUSHI_SPECJAL_VARIANTS = [
  `${SUSHI_SPECJAL_ADDON_PREFIX}100% pieczone`,
  `${SUSHI_SPECJAL_ADDON_PREFIX}80% pieczone / 20% surowe`,
  `${SUSHI_SPECJAL_ADDON_PREFIX}60% pieczone / 40% surowe`,
  `${SUSHI_SPECJAL_ADDON_PREFIX}50% pieczone / 50% surowe`,
  `${SUSHI_SPECJAL_ADDON_PREFIX}40% pieczone / 60% surowe`,
  `${SUSHI_SPECJAL_ADDON_PREFIX}20% pieczone / 80% surowe`,
  `${SUSHI_SPECJAL_ADDON_PREFIX}100% surowe`,
] as const;
type SushiSpecjalVariant = (typeof SUSHI_SPECJAL_VARIANTS)[number];

/* Sashimi – wybór rodzaju */
const SASHIMI_ADDON_PREFIX = "Sashimi: ";
const SASHIMI_VARIANTS = [
  `${SASHIMI_ADDON_PREFIX}łosoś`,
  `${SASHIMI_ADDON_PREFIX}mix`,
  `${SASHIMI_ADDON_PREFIX}tuńczyk`,
] as const;
type SashimiVariant = (typeof SASHIMI_VARIANTS)[number];



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


  // Reszta: brak darmowych sosów (ale jeśli ktoś doda – liczymy normalnie)
  return { kind: "none", eligible: saucesForProduct };
}

function computeSauceCostFromAddons(addons: unknown, rule: SauceRule) {
  const arr: string[] = Array.isArray(addons) ? (addons as any[]).filter((x) => typeof x === "string") : [];
  const countsAll = new Map<string, number>();

  for (const a of arr) {
    if (!isSauceAddon(a)) continue;
    countsAll.set(a, (countsAll.get(a) ?? 0) + 1);
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
    if (isSauceAddon(a)) continue; // sosy liczymy osobno (bo są darmowe limity)
    sum += computeAddonPrice(a, product ?? null);
  }
  return sum;
}

function computeAddonsCostWithSauces(params: {
  addons: unknown;
  product: ProductDb | null | undefined;
  itemName: string;
  subcat: string;
  restaurantSlug: string;
}): { addonsCost: number; sauceHint?: string } {
  const rule = getSauceRuleForItem({
    itemName: params.itemName,
    subcatLc: (params.subcat || "").toLowerCase(),
    restaurantSlug: params.restaurantSlug,
  });

  const nonSauce = computeNonSauceAddonsCost(params.addons, params.product ?? null);
  const sauce = computeSauceCostFromAddons(params.addons, rule);

  return { addonsCost: nonSauce + sauce.cost, sauceHint: rule.hint };
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

function isGyozaProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${
    prodInfo?.description || ""
  }`
    .toLowerCase()
    .trim();

  if (!text) return false;

  // łapiemy "gyoza", "pierożki gyoza" itd.
  return text.includes("gyoza");
}

function isWaterProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${
    prodInfo?.description || ""
  }`
    .toLowerCase()
    .trim();

  if (!text) return false;

  // łapiemy "woda", "woda mineralna" itd.
  return text.includes("woda");
}

function isSashimiProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${prodInfo?.description || ""}`
    .toLowerCase()
    .trim();

  if (!text) return false;

  // tylko "Sashimi ..."
  const isSashimi = text.includes("sashimi");
  if (!isSashimi) return false;

  // chcesz to tylko w przystawkach:
  const sub = (prodInfo?.subcategory || "").toLowerCase();
  if (sub && !sub.includes("przystawk")) return false;

  return true;
}


function isBubbleTeaProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${
    prodInfo?.description || ""
  }`
    .toLowerCase()
    .trim();

  if (!text) return false;

  return (
    text.includes("bubble tea") ||
    text.includes("bubbletea") ||
    text.includes("buble tea") ||
    text.includes("boba")
  );
}

function isRamuneProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${
    prodInfo?.description || ""
  }`
    .toLowerCase()
    .trim();

  if (!text) return false;

  return text.includes("ramune");
}

function isJuiceProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${
    prodInfo?.description || ""
  }`
    .toLowerCase()
    .trim();

  if (!text) return false;

  return text.includes("sok");
}

function isLiptonProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${
    prodInfo?.description || ""
  }`
    .toLowerCase()
    .trim();

  if (!text) return false;

  return text.includes("lipton");
}

function isColaProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${
    prodInfo?.description || ""
  }`
    .toLowerCase()
    .trim();

  if (!text) return false;

  return (
    text.includes("coca-cola") ||
    text.includes("coca cola") ||
    text.includes("cola")

  );
}

function isPepsiProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${
    prodInfo?.description || ""
  }`
    .toLowerCase()
    .trim();
  return !!text && text.includes("pepsi");
}

function isFantaProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${
    prodInfo?.description || ""
  }`
    .toLowerCase()
    .trim();
  return !!text && text.includes("fanta");
}

function isSpriteProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${
    prodInfo?.description || ""
  }`
    .toLowerCase()
    .trim();
  return !!text && text.includes("sprite");
}

function isSevenUpProduct(prod: any, prodInfo?: ProductDb | null): boolean {
  const text = `${prod?.name || ""} ${prodInfo?.name || ""} ${prodInfo?.description || ""}`
    .toLowerCase()
    .trim();

  if (!text) return false;

  return text.includes("7up") || text.includes("7-up") || text.includes("7 up");
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
  if (addon === SWAP_FEE_NAME) return 5;

  // Bazowe opcje podania tatara – 0 zł
  if (TARTAR_BASES.includes(addon)) return 0;

  // Wariant pierożków Gyoza – 0 zł, tylko informacja
  if (addon.startsWith(GYOZA_ADDON_PREFIX)) return 0;

   // Wariant wody – 0 zł, tylko informacja
  if (addon.startsWith(WATER_ADDON_PREFIX)) return 0;

  // Bubble tea / Ramune / soki / Lipton / Cola – też 0 zł
  if (
    addon.startsWith(BUBBLE_TEA_ADDON_PREFIX) ||
    addon.startsWith(RAMUNE_ADDON_PREFIX) ||
    addon.startsWith(JUICE_ADDON_PREFIX) ||
    addon.startsWith(LIPTON_ADDON_PREFIX) ||
    addon.startsWith(COLA_ADDON_PREFIX) ||
    addon.startsWith(SUSHI_SPECJAL_ADDON_PREFIX) ||
    addon.startsWith(PEPSI_ADDON_PREFIX) ||
  addon.startsWith(FANTA_ADDON_PREFIX) ||
  addon.startsWith(SPRITE_ADDON_PREFIX) ||
  addon.startsWith(SEVENUP_ADDON_PREFIX) ||
  addon.startsWith(SASHIMI_ADDON_PREFIX)
  
  ) {
    return 0;
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

/* Kontrolka ilości pałeczek – używana w podsumowaniu / koszyku */
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
        <span className="text-[11px] text-black/60">
          0 = nie potrzebuję
        </span>
      </div>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={dec}
          className="h-11 w-11 rounded-[20px] border border-black/20 bg-transparent text-white text-xl flex items-center justify-center"
        >
          –
        </button>
        <div className="min-w-[56px] text-center text-lg font-semibold">
          {value}
        </div>
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

    // obcinamy końcówki typu "za 1 zł!", "za 2zl" itd.
    const from = m[3]
      .replace(/\s+za\s*\d+\s*z[łl].*$/i, "")
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

  if (parts.length > 1) {
    const fishParts = parts.filter(isFishPart);
    if (fishParts.length === 1) {
      return `${cat} ${fishParts[0]}`.replace(/\s+/g, " ").trim();
    }
    if (fishParts.length > 1) {
      return `${cat} ${fishParts.join(" + ")}`.replace(/\s+/g, " ").trim();
    }
  }

  return `${cat} ${from}`.replace(/\s+/g, " ").trim();
}

/** Buduje strukturalne info o zamianach w zestawie + dodatkach per rolka dla danej pozycji z koszyka */
function buildSetSwapsPayload(
  item: any,
  product?: ProductDb | undefined
): SetSwapPayload[] {
  if (!product) return [];
  const subcat = (product.subcategory || "").toLowerCase();
  if (subcat !== "zestawy") return [];

  const rows = parseSetComposition(product.description);
  if (!rows.length) return [];

  const swapsArr = Array.isArray(item.swaps) ? item.swaps : [];
  const addonsArr = Array.isArray(item.addons) ? item.addons : [];

  const result: SetSwapPayload[] = [];

  rows.forEach((row) => {
    const baseLabel = `${row.cat} ${row.from}`.replace(/\s+/g, " ").trim();

    const foundSwap = swapsArr.find(
      (s: any) =>
        s &&
        typeof s.from === "string" &&
        s.from.toLowerCase() === row.from.toLowerCase()
    );

    const toLabel = (foundSwap?.to as string) || row.from;

    const rowKeyBase = normalizeSetRowKeyForPayload(row);
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
const ProductItem: React.FC<{
  prod: any;
  productCategory: (name: string) => string;
  productsDb: ProductDb[];
  optionsByCat: Record<string, string[]>;
  restaurantSlug: string;
  dbOptionsByProductId: Record<string, DbProductOptions>;
  helpers: {
  addAddon: (name: string, addon: string, opts?: { allowDuplicate?: boolean }) => void;
  removeAddon: (name: string, addon: string, opts?: { removeOne?: boolean }) => void;
  swapIngredient: (name: string, from: string, to: string) => void;
  removeItem: (name: string) => void;
  removeWholeItem: (name: string) => void;
  
};
}> = ({
  prod,
  productCategory,
  productsDb,
  optionsByCat,
  restaurantSlug,
  dbOptionsByProductId,
  helpers,
}) => {
  const { addAddon, removeAddon, swapIngredient, removeItem, removeWholeItem } =
    helpers;

  const byName = useMemo(() => {
    const map = new Map<string, ProductDb>();
    productsDb.forEach((p) => map.set(p.name, p));
    return map;
  }, [productsDb]);

  const byId = useMemo(() => {
    const map = new Map<string, ProductDb>();
    productsDb.forEach((p) => map.set(p.id, p));
    return map;
  }, [productsDb]);

  const prodInfo =
    (prod.product_id && byId.get(prod.product_id)) ||
    (prod.id && byId.get(prod.id)) ||
    (prod.baseName && byName.get(prod.baseName)) ||
    byName.get(prod.name);

   // kategoria: najpierw po nazwie, potem z bazy
  const inferredCat = inferCategoryFromName(prodInfo?.name || prod.name);
  const subcat = (inferredCat || prodInfo?.subcategory || "").toLowerCase();

  const isSet = subcat === "zestawy";
  const isSpec = subcat === "specjały";

  const productSubcat =
    inferredCat ||
    prodInfo?.subcategory ||
    productCategory(prod.baseName || prod.name);

  const singleCurrentName = useMemo(() => {
    if (isSet || isSpec) return prod.name as string;
    const swaps = Array.isArray((prod as any).swaps)
      ? (prod as any).swaps
      : [];
    const found = swaps.find(
      (s: any) =>
        s &&
        typeof s.from === "string" &&
        s.from.toLowerCase() === (prod.name || "").toLowerCase()
    );
    return (found?.to as string) || prod.name;
  }, [isSet, isSpec, prod.swaps, prod.name]);

  const setRows = useMemo(
    () => (isSet ? parseSetComposition(prodInfo?.description) : []),
    [isSet, prodInfo?.description]
  );

  const normalizeSetRowKey = (
    row: { qty: number; cat: string; from: string }
  ) => {
    const cat = (row.cat || "").trim();
    const from = (row.from || "").trim();
    if (!from) return cat;

    // rozbijamy po "+" bo w zestawach często są miksy typu
    // "krewetka + łosoś surowy"
    const parts = from.split("+").map((p) => p.trim()).filter(Boolean);

    const isFishPart = (s: string) => {
      const l = s.toLowerCase();
      return (
        l.includes("łosoś") ||
        l.includes("losos") ||
        l.includes("tuńczyk") ||
        l.includes("tunczyk")
      );
    };

    if (parts.length > 1) {
      const fishParts = parts.filter(isFishPart);
      if (fishParts.length === 1) {
        // preferujemy część z łososiem / tuńczykiem
        return `${cat} ${fishParts[0]}`.replace(/\s+/g, " ").trim();
      }
      if (fishParts.length > 1) {
        return `${cat} ${fishParts.join(" + ")}`.replace(/\s+/g, " ").trim();
      }
    }

    // fallback: cały opis, ale znormalizowane spacje
    return `${cat} ${from}`.replace(/\s+/g, " ").trim();
  };

  // dopłata za wersję pieczoną całego zestawu (jeśli jest przewidziana w menu)
  const setBakePrice = isSet ? getSetBakePriceForProduct(prodInfo) : null;

  // info o powiększeniu (np. 28 szt + 6 szt za 1 zł = 34 szt)
  const setUpgradeInfo = isSet ? parseSetUpgradeInfo(prodInfo) : null;

  const isWholeSetBaked =
    (prod.addons ?? []).includes(RAW_SET_BAKE_ALL) ||
    (prod.addons ?? []).includes(RAW_SET_BAKE_ALL_LEGACY);

  const isSetUpgraded = (prod.addons ?? []).includes(SET_UPGRADE_ADDON);

  const isRawRow = (row: { qty: number; cat: string; from: string }) =>
    /surowy/i.test(row.from);

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

    const productId =
    (prodInfo?.id as string | undefined) ||
    (prod.product_id as string | undefined) ||
    (prod.id as string | undefined);

  const dbCfg = productId ? dbOptionsByProductId[productId] : null;

  const addonsArr: string[] = Array.isArray(prod.addons) ? (prod.addons as string[]) : [];

  const currentDbVariantId = useMemo(() => {
    const found = addonsArr.find((a) => typeof a === "string" && a.startsWith(DBVAR_PREFIX));
    return found ? parseDbVarAddon(found)?.variantId ?? null : null;
  }, [addonsArr]);

  const activeDbGroups = useMemo(() => {
    if (!dbCfg) return [] as DbGroup[];
    const base = Array.isArray(dbCfg.groups) ? dbCfg.groups : [];
    const vg = currentDbVariantId && dbCfg.variant_groups
      ? (dbCfg.variant_groups[currentDbVariantId] || [])
      : [];
    // uniq po id
    const m = new Map<string, DbGroup>();
    for (const g of base) m.set(g.id, g);
    for (const g of vg) m.set(g.id, g); // wariant może nadpisać
    return Array.from(m.values()).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [dbCfg, currentDbVariantId]);

  const hasDbOptions = !!dbCfg && ((dbCfg.variants?.length || 0) > 0 || activeDbGroups.length > 0);

  const clearDbVariant = () => {
    for (const a of addonsArr) {
      if (typeof a === "string" && a.startsWith(DBVAR_PREFIX)) removeAddon(prod.name, a);
    }
  };

  const setDbVariant = (variantId: string) => {
    if (!dbCfg?.variants?.length) return;

    const target = dbCfg.variants.find((v) => v.id === variantId);
    if (!target) return;

    // zdejmij poprzedni wariant
    clearDbVariant();

    // usuń modyfikatory z grup wariantowych (żeby nie wisiały po zmianie wariantu)
    const allVariantGroupIds = new Set<string>();
    Object.values(dbCfg.variant_groups || {}).forEach((gs) => gs.forEach((g) => allVariantGroupIds.add(g.id)));
    for (const a of addonsArr) {
      const p = parseDbModAddon(a);
      if (p && allVariantGroupIds.has(p.groupId)) removeAddon(prod.name, a);
    }

    // dodaj nowy
    addAddon(prod.name, buildDbVarAddon(target));
  };

  const selectedCountInGroup = (groupId: string) =>
    addonsArr.filter((a) => {
      const p = parseDbModAddon(a);
      return p?.groupId === groupId;
    }).length;

  const hasModifierInGroup = (groupId: string, modifierId: string) =>
    addonsArr.some((a) => {
      const p = parseDbModAddon(a);
      return p?.groupId === groupId && p?.modifierId === modifierId;
    });

  const clearGroup = (groupId: string) => {
    for (const a of addonsArr) {
      const p = parseDbModAddon(a);
      if (p?.groupId === groupId) removeAddon(prod.name, a);
    }
  };

  const toggleDbModifier = (group: DbGroup, mod: DbModifier) => {
    const key = buildDbModAddon(group.id, mod);
    const on = hasModifierInGroup(group.id, mod.id);

    const min = Math.max(0, Number(group.min_select || 0));
    const max = Math.max(min, Number(group.max_select || min));

    // radio (max<=1)
    if (max <= 1) {
      if (on) {
        // można odznaczyć tylko jeśli min=0
        if (min === 0) removeAddon(prod.name, key);
        return;
      }
      clearGroup(group.id);
      addAddon(prod.name, key);
      return;
    }

    // multi
    if (on) {
      removeAddon(prod.name, key);
      return;
    }

    const cnt = selectedCountInGroup(group.id);
    if (cnt >= max) return; // blokada
    addAddon(prod.name, key);
  };


  const priceNum =
    typeof prod.price === "string" ? parseFloat(prod.price) : prod.price || 0;
  const { addonsCost, sauceHint } = useMemo(() => {
  return computeAddonsCostWithSauces({
    addons: prod.addons ?? [],
    product: prodInfo ?? null,
    itemName: String(prodInfo?.name || prod.name || ""),
    subcat: String(subcat || ""),
    restaurantSlug,
  });
}, [prod.addons, prodInfo, prod.name, subcat, restaurantSlug]);
  const lineTotal = (priceNum + addonsCost) * (prod.quantity || 1);

  // Czy dany extra jest dozwolony dla tego produktu
  const canUseExtra = (extra: string): boolean => {
    if (isSet) {
      // w zestawach używamy canUseExtraForRow (per rolka)
      return false;
    }

    if (!prodInfo) return false;

    const catForLogic =
      inferCategoryFromName(prodInfo.name) ||
      inferCategoryFromName(prod.name) ||
      prodInfo.subcategory ||
      subcat ||
      "";

    const s = catForLogic.toLowerCase();

    // === California ===
    if (s.includes("california")) {
      if (extra === "Ryba pieczona") {
        const text = `${prod.name} ${prodInfo.description || ""}`;
        // jeśli ta California jest już pieczona / w tempurze – nie dokładamy „Ryby pieczonej”
        if (isAlreadyBakedOrTempura(text)) return false;

        return isSpecialCaliforniaBakedFishProduct(
          prod.name,
          prodInfo.description || ""
        );
      }
      // do California nie dokładamy innych EXTRAS poza tą jedną opcją
      return false;
    }

    // === Hosomaki / Hoso ===
    if (s.includes("hoso")) {
      // Hoso mają tylko Tempurę
      return extra === "Tempura";
    }

    // === Futomaki / Futo ===
    if (s.includes("futo")) {
      if (extra === "Ryba pieczona") {
        const text = `${prod.name} ${prodInfo.description || ""}`;
        // jeśli futomak jest już pieczony / w tempurze – nie pokazujemy „Ryby pieczonej”
        if (isAlreadyBakedOrTempura(text)) return false;
        // tylko przy surowych futomakach
        return /surowy/i.test(text);
      }
      if (extra === "Tamago") return true;
      return extra === "Tempura" || extra === "Płatek sojowy";
    }

    // === Nigiri ===
    if (s.includes("nigiri")) {
      // Nigiri z łososiem / tuńczykiem – tylko Ryba pieczona (opalana)
      const text = `${prodInfo.name} ${prodInfo.description || ""}`.toLowerCase();
      const fishNigiri =
        text.includes("łosoś") ||
        text.includes("losos") ||
        text.includes("tuńczyk") ||
        text.includes("tunczyk");
      return extra === "Ryba pieczona" && fishNigiri;
    }

    return false;
  };

  const doSetSwap = (rowFrom: string, to: string) => {
    const current = getSetSwapCurrent(rowFrom);
    if (!to || to === current) return;

    // ważne: backend/store trzyma zamianę po ORYGINALNEJ nazwie z opisu zestawu
    swapIngredient(prod.name, rowFrom, to);

    // jednorazowa opłata za zamiany w zestawie
    if (!(prod.addons ?? []).includes(SWAP_FEE_NAME)) {
      addAddon(prod.name, SWAP_FEE_NAME);
    }
  };

  // Frytki z batatów z przystawek – tylko w Szczytnie i Przasnyszu
   const isSweetPotatoFries = useMemo(() => {
    const city = (restaurantSlug || "").toLowerCase();
    if (city !== "szczytno" && city !== "przasnysz") return false;

    // bierzemy nazwę z koszyka + ewentualnie z bazy
    const text = `${prod.name || ""} ${
      prodInfo?.name || ""
    } ${prodInfo?.description || ""}`.toLowerCase();

    return (
      text.includes("frytki z batat") ||
      text.includes("frytki batat")
    );
  }, [prod, prodInfo, restaurantSlug]);

  const saucesForProduct = useMemo(() => {
  return isSweetPotatoFries
    ? ["Spicy Mayo", "Teryiaki", "Sos czekoladowy", "Sos toffi"]
    : BASE_SAUCES;
}, [isSweetPotatoFries]);

const sauceQtyMap = useMemo(() => {
  const arr: string[] = Array.isArray(prod.addons) ? (prod.addons as string[]) : [];
  const allowed = new Set(saucesForProduct);

  const m = new Map<string, number>();
  for (const a of arr) {
    if (typeof a !== "string") continue;
    if (!allowed.has(a)) continue;
    m.set(a, (m.get(a) ?? 0) + 1);
  }
  return m;
}, [prod.addons, saucesForProduct]);

const getSauceQty = useCallback(
  (s: string) => sauceQtyMap.get(s) ?? 0,
  [sauceQtyMap]
);

const incSauce = useCallback(
  (s: string) => addAddon(prod.name, s, { allowDuplicate: true }),
  [addAddon, prod.name]
);

const decSauce = useCallback(
  (s: string) => removeAddon(prod.name, s, { removeOne: true }),
  [removeAddon, prod.name]
);


  // Tatar: globalnie (wszystkie miasta) — przystawki + tatar z łososia/tuńczyka
const isTartar = useMemo(() => {
  if (!prodInfo) return false;

  const sub = (prodInfo.subcategory || "").toLowerCase();
  if (!sub.includes("przystawk")) return false;

  const text = `${prodInfo.name} ${prodInfo.description || ""}`.toLowerCase();
  if (!text.includes("tatar")) return false;

  const hasFish =
    text.includes("łosoś") ||
    text.includes("łososia") ||
    text.includes("losos") ||
    text.includes("lososia") ||
    text.includes("łososi") ||
    text.includes("lososi") ||
    text.includes("tuńczyk") ||
    text.includes("tunczyk") ||
    text.includes("tuńczyka") ||
    text.includes("tunczyka");

  return hasFish;
}, [prodInfo]);

    // ===== TATAR: wybór sposobu podania (max 1, bez dopłaty) =====
  const currentTartarBase = useMemo<string | null>(() => {
    if (!isTartar) return null;
    const arr: string[] = Array.isArray(prod.addons) ? (prod.addons as string[]) : [];
    const found = arr.find((a) => typeof a === "string" && TARTAR_BASES.includes(a));
    return found || null;
  }, [isTartar, prod.addons]);

  const setTartarBase = useCallback(
    (base: string) => {
      if (!isTartar) return;

      // zdejmij poprzedni wybór
      TARTAR_BASES.forEach((b) => {
        if ((prod.addons ?? []).includes(b)) removeAddon(prod.name, b);
      });

      // ustaw nowy
      addAddon(prod.name, base);
    },
    [isTartar, prod.addons, prod.name, addAddon, removeAddon]
  );

  // domyślnie: "na awokado", jeśli użytkownik jeszcze nie wybrał
  useEffect(() => {
    if (!isTartar) return;
    if (currentTartarBase) return;
    addAddon(prod.name, TARTAR_DEFAULT_BASE);
  }, [isTartar, currentTartarBase, addAddon, prod.name]);


   // Pierożki Gyoza – wybór wariantu (warzywne / z kurczakiem)
  const isGyoza = useMemo(
    () => isGyozaProduct(prod, prodInfo),
    [prod, prodInfo]
  );

  // Woda – wybór: gazowana / niegazowana
  const isWater = useMemo(
    () => isWaterProduct(prod, prodInfo),
    [prod, prodInfo]
  );

  // Bubble tea – wybór smaku
  const isBubbleTea = useMemo(
    () => isBubbleTeaProduct(prod, prodInfo),
    [prod, prodInfo]
  );

  // Ramune – wybór smaku
  const isRamune = useMemo(
    () => isRamuneProduct(prod, prodInfo),
    [prod, prodInfo]
  );

  // Soki – smak
  const isJuice = useMemo(
    () => isJuiceProduct(prod, prodInfo),
    [prod, prodInfo]
  );

  // Lipton – smak
  const isLipton = useMemo(
    () => isLiptonProduct(prod, prodInfo),
    [prod, prodInfo]
  );

  const isDessert = useMemo(
  () => isDessertProduct(prod, prodInfo),
  [prod, prodInfo]
);

  const softDrink = useMemo<"cola" | "pepsi" | "fanta" | "sprite" | "7up" | null>(() => {
  if (isSevenUpProduct(prod, prodInfo)) return "7up";
  if (isPepsiProduct(prod, prodInfo)) return "pepsi";
  if (isFantaProduct(prod, prodInfo)) return "fanta";
  if (isSpriteProduct(prod, prodInfo)) return "sprite";
  if (isColaProduct(prod, prodInfo)) return "cola";
  return null;
}, [prod, prodInfo]);

// 1) Najpewniejsza detekcja: po subkategorii z DB (napoje = bez sosów)
const drinkSubcatPlain = useMemo(
  () =>
    normalizePlain(
      String(prodInfo?.subcategory || productSubcat || subcat || "")
    ),
  [prodInfo?.subcategory, productSubcat, subcat]
);

const isDrinkBySubcat = drinkSubcatPlain.includes("napoj"); // łapie "napoje", "napój", itd.

const isDrink =
  isDrinkBySubcat ||
  !!softDrink ||
  isWater ||
  isBubbleTea ||
  isRamune ||
  isJuice ||
  isLipton;

const showSauces = !isDrink && !isDessert;

// 2) Bezpiecznik: jeśli to napój/deser, usuń sosy z addonów (żeby nie naliczało kosztu)
  // ===== SOSY: reguła + auto-ustawienie gratisów dla zestawów/set-like =====
  const itemNameForSauces = useMemo(
    () => String(prodInfo?.name || prod.name || ""),
    [prodInfo?.name, prod.name]
  );

  const sauceRule = useMemo(
    () =>
      getSauceRuleForItem({
        itemName: itemNameForSauces,
        subcatLc: String(subcat || ""),
        restaurantSlug,
      }),
    [itemNameForSauces, subcat, restaurantSlug]
  );

  // identyczna definicja “set-like” jak w getSauceRuleForItem (żeby nie łapać np. napojów)
  const shouldAutoPrefillFreeSauces = useMemo(() => {
    const namePlain = normalizePlain(itemNameForSauces);
    const subPlain = String(subcat || "").toLowerCase();

    const isSetLike =
      subPlain === "zestawy" ||
      namePlain.includes("zestaw") ||
      namePlain.includes(" set ") ||
      namePlain.includes("lunch") ||
      /\bset\b/i.test(namePlain);

    return isSetLike;
  }, [itemNameForSauces, subcat]);

  const freeSaucesTotal = useMemo(() => {
    if (sauceRule.kind === "count") {
      return Math.max(0, Number(sauceRule.freeCount || 0));
    }
    if (sauceRule.kind === "perSauce") {
      return Object.values(sauceRule.freeBySauce || {}).reduce(
        (acc, v) => acc + Math.max(0, Number(v || 0)),
        0
      );
    }
    return 0;
  }, [sauceRule]);

  const defaultFreeSauces = useMemo(() => {
    if (!shouldAutoPrefillFreeSauces) return [];
    return buildDefaultFreeSaucesForRule(sauceRule);
  }, [shouldAutoPrefillFreeSauces, sauceRule]);

  const defaultFreeSaucesSummary = useMemo(
    () => summarizeSauceList(defaultFreeSauces),
    [defaultFreeSauces]
  );

  const didAutoInitSaucesRef = useRef(false);

  useEffect(() => {
    // nie nadpisujemy UX po pierwszej inicjalizacji
    if (didAutoInitSaucesRef.current) return;

    // tylko gdy sosy w ogóle są widoczne (nie napoje/desery)
    if (!showSauces) return;

    // tylko dla zestawów / set-like
    if (!shouldAutoPrefillFreeSauces) return;

    const arr: string[] = Array.isArray(prod.addons) ? (prod.addons as string[]) : [];
    const alreadyHasAnySauce = arr.some((a) => typeof a === "string" && isSauceAddon(a));

    // auto-prefill TYLKO jeśli klient jeszcze nic nie wybrał
    if (!alreadyHasAnySauce && defaultFreeSauces.length > 0) {
      didAutoInitSaucesRef.current = true;
      defaultFreeSauces.forEach((s) => addAddon(prod.name, s, { allowDuplicate: true }));
      return;
    }

    // jeśli już są sosy (klient kliknął) — nie ruszamy
    if (alreadyHasAnySauce) {
      didAutoInitSaucesRef.current = true;
    }
  }, [
    showSauces,
    shouldAutoPrefillFreeSauces,
    defaultFreeSauces,
    prod.addons,
    prod.name,
    addAddon,
  ]);



const SOFT_DRINK_GROUP = useMemo<SoftDrinkGroup | null>(() => {
  if (!softDrink) return null;

  switch (softDrink) {
    case "pepsi":
      return {
        title: "Wariant napoju",
        prefix: PEPSI_ADDON_PREFIX,
        variants: PEPSI_VARIANTS as readonly SoftDrinkVariant[],
      };

    case "fanta":
      return {
        title: "Wariant napoju",
        prefix: FANTA_ADDON_PREFIX,
        variants: FANTA_VARIANTS as readonly SoftDrinkVariant[],
      };

    case "sprite":
      return {
        title: "Wariant napoju",
        prefix: SPRITE_ADDON_PREFIX,
        variants: SPRITE_VARIANTS as readonly SoftDrinkVariant[],
      };

    case "7up":
      return {
        title: "Wariant napoju",
        prefix: SEVENUP_ADDON_PREFIX,
        variants: SEVENUP_VARIANTS as readonly SoftDrinkVariant[],
      };

    case "cola":
    default:
      return {
        title: "Wariant napoju",
        prefix: COLA_ADDON_PREFIX,
        variants: COLA_VARIANTS as readonly SoftDrinkVariant[],
      };
  }
}, [softDrink]);


const isSashimi = useMemo(() => isSashimiProduct(prod, prodInfo), [prod, prodInfo]);

const currentSashimiVariant = useMemo<SashimiVariant | null>(() => {
  if (!isSashimi) return null;
  const addonsArr = Array.isArray(prod.addons) ? (prod.addons as string[]) : [];
  const found = addonsArr.find(
    (a) => typeof a === "string" && SASHIMI_VARIANTS.includes(a as SashimiVariant)
  ) as SashimiVariant | undefined;
  return found ?? null;
}, [isSashimi, prod.addons]);

const setSashimiVariant = (variant: SashimiVariant | null) => {
  SASHIMI_VARIANTS.forEach((v) => {
    if (prod.addons?.includes(v)) removeAddon(prod.name, v);
  });
  if (variant) addAddon(prod.name, variant);
};


  // Zestaw SUSHI SPECJAŁ 100 szt – wybór proporcji pieczone/surowe
  const isSushiSpecjal = useMemo(
    () => isSushiSpecjalProduct(prod, prodInfo),
    [prod, prodInfo]
  );

  const currentGyozaVariant = useMemo<GyozaVariant | null>(() => {
    if (!isGyoza) return null;
    const addonsArr = Array.isArray(prod.addons)
      ? (prod.addons as string[])
      : [];
    const found = addonsArr.find((a) =>
      typeof a === "string" &&
      GYOZA_VARIANTS.includes(a as GyozaVariant)
    ) as GyozaVariant | undefined;
    return found ?? null;
  }, [isGyoza, prod.addons]);

  const setGyozaVariant = (variant: GyozaVariant | null) => {
    // zdejmujemy poprzedni wybór
    GYOZA_VARIANTS.forEach((v) => {
      if (prod.addons?.includes(v)) removeAddon(prod.name, v);
    });
    if (variant) {
      addAddon(prod.name, variant);
    }
  };

  const currentWaterVariant = useMemo<WaterVariant | null>(() => {
    if (!isWater) return null;
    const addonsArr = Array.isArray(prod.addons)
      ? (prod.addons as string[])
      : [];
    const found = addonsArr.find((a) =>
      typeof a === "string" &&
      WATER_VARIANTS.includes(a as WaterVariant)
    ) as WaterVariant | undefined;
    return found ?? null;
  }, [isWater, prod.addons]);

  const setWaterVariant = (variant: WaterVariant | null) => {
    // zdejmujemy poprzedni wybór
    WATER_VARIANTS.forEach((v) => {
      if (prod.addons?.includes(v)) removeAddon(prod.name, v);
    });
    if (variant) {
      addAddon(prod.name, variant);
    }
  };

  const currentBubbleTeaVariant = useMemo<BubbleTeaVariant | null>(() => {
    if (!isBubbleTea) return null;
    const addonsArr = Array.isArray(prod.addons)
      ? (prod.addons as string[])
      : [];
    const found = addonsArr.find((a) =>
      typeof a === "string" &&
      BUBBLE_TEA_VARIANTS.includes(a as BubbleTeaVariant)
    ) as BubbleTeaVariant | undefined;
    return found ?? null;
  }, [isBubbleTea, prod.addons]);

  const setBubbleTeaVariant = (variant: BubbleTeaVariant | null) => {
    BUBBLE_TEA_VARIANTS.forEach((v) => {
      if (prod.addons?.includes(v)) removeAddon(prod.name, v);
    });
    if (variant) addAddon(prod.name, variant);
  };

  const currentRamuneVariant = useMemo<RamuneVariant | null>(() => {
    if (!isRamune) return null;
    const addonsArr = Array.isArray(prod.addons)
      ? (prod.addons as string[])
      : [];
    const found = addonsArr.find((a) =>
      typeof a === "string" &&
      RAMUNE_VARIANTS.includes(a as RamuneVariant)
    ) as RamuneVariant | undefined;
    return found ?? null;
  }, [isRamune, prod.addons]);

  const setRamuneVariant = (variant: RamuneVariant | null) => {
    RAMUNE_VARIANTS.forEach((v) => {
      if (prod.addons?.includes(v)) removeAddon(prod.name, v);
    });
    if (variant) addAddon(prod.name, variant);
  };

  const currentJuiceVariant = useMemo<JuiceVariant | null>(() => {
    if (!isJuice) return null;
    const addonsArr = Array.isArray(prod.addons)
      ? (prod.addons as string[])
      : [];
    const found = addonsArr.find((a) =>
      typeof a === "string" &&
      JUICE_VARIANTS.includes(a as JuiceVariant)
    ) as JuiceVariant | undefined;
    return found ?? null;
  }, [isJuice, prod.addons]);

  const setJuiceVariant = (variant: JuiceVariant | null) => {
    JUICE_VARIANTS.forEach((v) => {
      if (prod.addons?.includes(v)) removeAddon(prod.name, v);
    });
    if (variant) addAddon(prod.name, variant);
  };

  const currentLiptonVariant = useMemo<LiptonVariant | null>(() => {
    if (!isLipton) return null;
    const addonsArr = Array.isArray(prod.addons)
      ? (prod.addons as string[])
      : [];
    const found = addonsArr.find((a) =>
      typeof a === "string" &&
      LIPTON_VARIANTS.includes(a as LiptonVariant)
    ) as LiptonVariant | undefined;
    return found ?? null;
  }, [isLipton, prod.addons]);

  const setLiptonVariant = (variant: LiptonVariant | null) => {
    LIPTON_VARIANTS.forEach((v) => {
      if (prod.addons?.includes(v)) removeAddon(prod.name, v);
    });
    if (variant) addAddon(prod.name, variant);
  };

  const currentSoftDrinkVariant = useMemo<SoftDrinkVariant | null>(() => {
  if (!SOFT_DRINK_GROUP) return null;

  const addonsArr: string[] = Array.isArray(prod.addons) ? prod.addons : [];
  const found = addonsArr.find(
    (a): a is SoftDrinkVariant =>
      SOFT_DRINK_GROUP.variants.includes(a as SoftDrinkVariant)
  );

  return found ?? null;
}, [SOFT_DRINK_GROUP, prod.addons]);

const setSoftDrinkVariant = (variant: SoftDrinkVariant | null) => {
  [...COLA_VARIANTS,
  ...PEPSI_VARIANTS,
  ...FANTA_VARIANTS,
  ...SPRITE_VARIANTS,
  ...SEVENUP_VARIANTS,
].forEach((v) => {
  if (prod.addons?.includes(v)) removeAddon(prod.name, v);
});

  if (variant) addAddon(prod.name, variant);
};

   const currentSushiSpecjalVariant = useMemo<SushiSpecjalVariant | null>(
    () => {
      if (!isSushiSpecjal) return null;
      const addonsArr = Array.isArray(prod.addons)
        ? (prod.addons as string[])
        : [];
      const found = addonsArr.find((a) =>
        typeof a === "string" &&
        SUSHI_SPECJAL_VARIANTS.includes(a as SushiSpecjalVariant)
      ) as SushiSpecjalVariant | undefined;
      return found ?? null;
    },
    [isSushiSpecjal, prod.addons]
  );

  const setSushiSpecjalVariant = (variant: SushiSpecjalVariant | null) => {
    // zdejmujemy poprzedni wybór, żeby zawsze był max 1 wariant
    SUSHI_SPECJAL_VARIANTS.forEach((v) => {
      if (prod.addons?.includes(v)) removeAddon(prod.name, v);
    });
    if (variant) {
      addAddon(prod.name, variant);
    }
  };

  const toggleAddon = (a: string) => {
  const on = (prod.addons ?? []).includes(a);
  const isExtra = EXTRAS.includes(a);
  const allowed = isExtra ? canUseExtra(a) : true;
  if (!allowed) return;

  if (on) {
    removeAddon(prod.name, a);
    return;
  }

  // jeśli to jeden z EXTRAS -> usuń pozostałe EXTRAS (radio-like)
  if (isExtra) {
    EXTRAS.forEach((ex) => {
      if ((prod.addons ?? []).includes(ex)) {
        removeAddon(prod.name, ex);
      }
    });
  }

  addAddon(prod.name, a);
};

  const toggleWholeSetBake = () => {
    const on = isWholeSetBaked;
    if (on) {
      // zdejmujemy oba możliwe labele, na wszelki wypadek
      removeAddon(prod.name, RAW_SET_BAKE_ALL);
      removeAddon(prod.name, RAW_SET_BAKE_ALL_LEGACY);
    } else {
      addAddon(prod.name, RAW_SET_BAKE_ALL);
      // przy wersji pieczonej całego zestawu wyłączamy pieczenie pojedynczych rolek
      setRows.forEach((row) => {
        const rowKeyBase = normalizeSetRowKey(row);
        const label = RAW_SET_BAKE_ROLL_PREFIX + rowKeyBase;
        if ((prod.addons ?? []).includes(label)) {
          removeAddon(prod.name, label);
        }
      });
    }
  };

  const setSetSize = (upgraded: boolean) => {
    if (!setUpgradeInfo) return;
    if (upgraded) {
      if (!isSetUpgraded) addAddon(prod.name, SET_UPGRADE_ADDON);
    } else {
      if (isSetUpgraded) removeAddon(prod.name, SET_UPGRADE_ADDON);
    }
  };

  // WYŚWIETLANA NAZWA W KOSZYKU: kategoria + nazwa (dla pojedynczych rolek)
  const displayTitle = useMemo(() => {
    if (isSet || isSpec) return prod.name as string;
    return withCategoryPrefix(singleCurrentName, productSubcat);
  }, [isSet, isSpec, prod.name, singleCurrentName, productSubcat]);

  return (
    <div className="border border-black/10 bg-white p-3">
     <div className="flex items-center justify-between gap-2 font-semibold mb-2 min-w-0">
  <span className="text-black min-w-0 flex-1 truncate">
    {displayTitle} x{prod.quantity || 1}
  </span>
  <span className="text-black shrink-0">
    {lineTotal.toFixed(2).replace(".", ",")} zł
  </span>
</div>

      <div className="text-xs text-black/80 space-y-3">
        {isSet && setRows.length > 0 && (
          <div className="space-y-2">
            <div className="font-semibold">Zamiany w zestawie</div>
            {setRows.map((row, i) => {
  const catKey = normalize(row.cat);
  const isCaliforniaRow = /california/i.test(row.cat || "");

  const current = getSetSwapCurrent(row.from);
  const currentProduct =
    byName.get(current) || byName.get(row.from) || prodInfo;

  // bazowa pula zamian w obrębie kategorii (bez specjałów)
  let pool = (optionsByCat[catKey] || []).filter(
    (n) =>
      (productCategory(n) || "").toLowerCase() !== "specjały"
  );

  // DLA CALIFORNI: filtrujemy tylko do tej samej „klasy”
  // – obłożona ↔ obłożona
  // – klasyczna ↔ klasyczna
  if (isCaliforniaRow) {
    const currentIsTopped = currentProduct
      ? isCaliforniaToppedByText(
          currentProduct.name,
          currentProduct.description
        )
      : isCaliforniaToppedByText(row.from, null);

    pool = pool.filter((n) => {
      const p = byName.get(n);
      if (!p) return false;
      const pIsTopped = isCaliforniaToppedByText(p.name, p.description);
      return pIsTopped === currentIsTopped;
    });
  }

  // OPCJE SELECTA:
  // - aktualnie wybrana rolka (current)
  // - oryginalna rolka z opisu zestawu (row.from)
  // - pozostałe rolki z puli
  const rawOptions = [current, row.from, ...pool];
  const selectOptions = Array.from(new Set(rawOptions));

  // znormalizowany klucz tej rolki w zestawie
  const rowKeyBase = normalizeSetRowKey(row);

  // pieczenie konkretnej rolki w zestawie
  const rollAddonLabel = RAW_SET_BAKE_ROLL_PREFIX + rowKeyBase;
  const rawRow = isRawRow(row);
  const rollBaked = (prod.addons ?? []).includes(rollAddonLabel);

  const toggleRowBake = () => {
    if (!rawRow || isWholeSetBaked) return;
    if (rollBaked) {
      removeAddon(prod.name, rollAddonLabel);
    } else {
      addAddon(prod.name, rollAddonLabel);
    }
  };

  // Dodatki per konkretną rolkę
  const extraKey = (ex: string) =>
    `${SET_ROLL_EXTRA_PREFIX}${rowKeyBase} — ${ex}`;

  const rowCatLc = (row.cat || "").toLowerCase();

  const text = `${currentProduct?.name || row.cat} ${
    currentProduct?.description || row.from
  }`.toLowerCase();

  const canUseExtraForRow = (ex: string): boolean => {
    const parentNameLc = (prodInfo?.name || prod.name || "").toLowerCase();

    // SPEC CASE: w Zestawie 2 hosomaki bez dodatków
    if (parentNameLc.startsWith("zestaw 2") && rowCatLc.includes("hosomaki")) {
      return false;
    }

    // === California w zestawie ===
    if (rowCatLc.includes("california")) {
      if (ex === "Ryba pieczona") {
        const rowText = row.from.toLowerCase();
        // jeśli ta California jest już pieczona / w tempurze – blokujemy
        if (isAlreadyBakedOrTempura(rowText)) return false;

        return isSpecialCaliforniaBakedFishProduct(
          currentProduct?.name || "",
          currentProduct?.description || ""
        );
      }
      // inne EXTRAS wyłączone dla Californii w zestawach
      return false;
    }

    // === Hosomaki / Hoso ===
    if (rowCatLc.includes("hosomaki") || rowCatLc.includes("hoso")) {
      // Hoso mają tylko Tempurę
      return ex === "Tempura";
    }

    // === Futomaki / Futo ===
    if (rowCatLc.includes("futomaki") || rowCatLc.includes("futo")) {
      const rowText = row.from.toLowerCase();
      if (ex === "Ryba pieczona") {
        if (isAlreadyBakedOrTempura(rowText)) return false;
        return /surowy/i.test(rowText);
      }
      if (ex === "Tamago") return true;
      return ex === "Tempura" || ex === "Płatek sojowy";
    }

    // === Nigiri ===
    if (rowCatLc.includes("nigiri")) {
      if (ex !== "Ryba pieczona") return false;
      const hasFish =
        text.includes("łosoś") ||
        text.includes("losos") ||
        text.includes("tuńczyk") ||
        text.includes("tunczyk");
      return hasFish;
    }

    return false;
  };

  return (
    <div key={i} className="flex flex-col gap-2">
  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 min-w-0">
        <span className="px-2 py-1 rounded bg-gray-50 border border-gray-200">
          {row.qty}× {row.cat}
        </span>

        {/* DLA KAŻDEJ ROLKI (także California) jest select – ale dla California pool jest przefiltrowany */}
        <span className="text-black/70">zamień:</span>
        <select
          className="border border-black/15 rounded px-2 py-2 bg-white w-full sm:w-auto max-w-full"
      value={current}
      onChange={(e) => doSetSwap(row.from, e.target.value)}
        >
          {selectOptions.map((n) => (
            <option key={n} value={n}>
              {n === row.from
                ? `Skład zestawu — ${withCategoryPrefix(n, row.cat)}`
                : withCategoryPrefix(n, row.cat)}
            </option>
          ))}
        </select>

        {rawRow && (
          <button
            type="button"
            onClick={toggleRowBake}
            disabled={isWholeSetBaked}
            className={clsx(
              "px-2 py-1 rounded text-[11px] border",
              isWholeSetBaked
                ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-200"
                : rollBaked
                ? "bg-black text-white border-black"
                : "bg-white text-black hover:bg-gray-50 border-gray-200"
            )}
          >
            {rollBaked
              ? "✓ Ta rolka pieczona (+2 zł)"
              : "+ Zamień tę rolkę na pieczoną (+2 zł)"}
          </button>
        )}
      </div>

      {/* Dodatki dla tej KONKRETNEJ rolki */}
      <div className="flex flex-wrap items-center gap-2 pl-2">
        <span className="text-black/70 text-[11px]">
          Dodatki do tej rolki:
        </span>
        {EXTRAS.map((ex) => {
          const key = extraKey(ex);
          const allowed = canUseExtraForRow(ex);
          const on = (prod.addons ?? []).includes(key);
          return (
            <button
              key={ex}
              type="button"
              onClick={() => {
  if (!allowed) return;

  if (on) {
    // klik w aktywny -> zdejmij
    removeAddon(prod.name, key);
    return;
  }

  // klik w nowy -> usuń WSZYSTKIE inne dodatki dla tej rolki (radio-like)
  EXTRAS.forEach((ex2) => {
    const k2 = extraKey(ex2);
    if ((prod.addons ?? []).includes(k2)) {
      removeAddon(prod.name, k2);
    }
  });

  // i ustaw wybrany
  addAddon(prod.name, key);
}}
              className={clsx(
                "px-2 py-1 rounded text-[11px] border",
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
    </div>
  );
})}

            {/* Rozmiar zestawu: standard vs powiększony (+szt za 1–2 zł) */}
            {setUpgradeInfo && (
              <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 space-y-1">
                <div className="font-semibold text-[11px]">
                  Rozmiar zestawu:
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSetSize(false)}
                    className={clsx(
                      "px-2 py-1 rounded border",
                      !isSetUpgraded
                        ? "bg-black text-white border-black"
                        : "bg-white text-black hover:bg-gray-50 border-gray-200"
                    )}
                  >
                    Standard – {setUpgradeInfo.basePieces} szt
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetSize(true)}
                    className={clsx(
                      "px-2 py-1 rounded border",
                      isSetUpgraded
                        ? "bg-black text-white border-black"
                        : "bg-white text-black hover:bg-gray-50 border-gray-200"
                    )}
                  >
                    Powiększony – {setUpgradeInfo.totalPieces} szt (
                    +{setUpgradeInfo.extraPieces} szt za{" "}
                    {setUpgradeInfo.price} zł)
                  </button>
                </div>
              </div>
            )}

            <p className="text-[11px] text-black/60">
  Zamiany tylko w obrębie tej samej kategorii (Futomaki ↔ Futomaki,
  Hosomaki ↔ Hosomaki, California ↔ California itd.). California
  może być zamieniana tylko na inne rolki California z tej samej
  „klasy” (obłożone ↔ obłożone, klasyczne ↔ klasyczne). Bez
  specjałów. Dodajemy pozycję „{SWAP_FEE_NAME}”.
</p>

            {isSet && setBakePrice != null && (
              <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 px-2 py-2 space-y-1">
                <div className="font-semibold text-[11px]">
                  Wersja pieczona całego zestawu:
                </div>
                <label className="flex items-center gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    checked={isWholeSetBaked}
                    onChange={toggleWholeSetBake}
                  />
                  <span>
                    Zamień cały zestaw na pieczony (+{setBakePrice} zł)
                  </span>
                </label>
                {isWholeSetBaked && (
                  <p className="text-[10px] text-black/60">
                    Dla całego zestawu naliczana jest jedna dopłata +
                    {setBakePrice} zł. Indywidualne pieczenie pojedynczych
                    rolek w tym wariancie jest wyłączone.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {showSauces && (
  <div className="mt-2">
    <div className="font-semibold mb-2">Sosy</div>
    {/* info o sosach (przeniesione nad listę) */}
<p className="text-[11px] text-black/60 -mt-1 mb-2">
  {sauceHint ? `${sauceHint} ` : ""}
  Dodatkowe porcje liczymy wg cennika sosów (obecnie 2 zł / porcja).
</p>
        {shouldAutoPrefillFreeSauces && freeSaucesTotal > 0 && (
      <div className="mb-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
        <div className="text-[11px] font-semibold text-black">
          W cenie masz {freeSaucesTotal} {pluralizeSos(freeSaucesTotal)} gratis.
        </div>
        {defaultFreeSaucesSummary ? (
          <div className="text-[11px] text-black/70">
            Domyślnie wybieramy: {defaultFreeSaucesSummary}. Możesz zmienić ilości poniżej.
          </div>
        ) : null}
      </div>
    )}


    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
      <div className="grid grid-cols-[1fr_120px] items-center px-3 py-2 bg-gray-50 text-[11px] font-semibold text-black/70">
        <span>Sos</span>
        <span className="text-right">Ilość</span>
      </div>

      <div className="divide-y divide-black/5">
        {saucesForProduct.map((s) => {
          const qty = getSauceQty(s);

          return (
            <div
              key={s}
              className={clsx(
                "grid grid-cols-[1fr_120px] items-center gap-2 px-3 py-2",
                qty > 0 ? "bg-white" : "bg-white"
              )}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-black leading-snug break-words">
                  {s}
                </div>
                <div className="text-[11px] text-black/60">
                  2,00 zł / porcja
                </div>
              </div>

              <div className="flex items-center justify-end gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => decSauce(s)}
                  disabled={qty === 0}
                  className={clsx(
                    "h-9 w-9 rounded-xl border text-base leading-none flex items-center justify-center",
                    qty === 0
                      ? "opacity-40 cursor-not-allowed border-gray-200 bg-white"
                      : "border-gray-300 hover:bg-gray-50 bg-white"
                  )}
                  aria-label={`Usuń porcję: ${s}`}
                >
                  –
                </button>

                <span className="w-8 text-center text-sm font-semibold text-black/70 tabular-nums">
                  {qty}
                </span>

                <button
                  type="button"
                  onClick={() => incSauce(s)}
                  className="h-9 w-9 rounded-xl border border-black bg-black text-white text-base leading-none flex items-center justify-center hover:opacity-90"
                  aria-label={`Dodaj porcję: ${s}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
)}

{isSashimi && (
  <div>
    <div className="font-semibold mb-1">Rodzaj Sashimi</div>
    <p className="text-[11px] text-black/60 mb-1">
      Wybierz rodzaj Sashimi. Informacja trafi do kuchni – bez dopłaty.
    </p>

    <div className="flex flex-wrap gap-2">
      {SASHIMI_VARIANTS.map((variant) => {
        const isActive = currentSashimiVariant === variant;
        const label = variant.replace(SASHIMI_ADDON_PREFIX, "");
        return (
          <button
            key={variant}
            type="button"
            onClick={() => setSashimiVariant(isActive ? null : (variant as SashimiVariant))}
            className={clsx(
              "px-2 py-1 rounded text-xs border",
              isActive
                ? "bg-black text-white border-black"
                : "bg-white text-black hover:bg-gray-50 border-gray-200"
            )}
          >
            {isActive ? `✓ ${label}` : label}
          </button>
        );
      })}
    </div>

    {!currentSashimiVariant && (
      <p className="text-xs text-red-600 mt-1">
        Wybierz rodzaj Sashimi (łosoś / mix / tuńczyk).
      </p>
    )}
  </div>
)}


                {isGyoza && (
          <div>
            <div className="font-semibold mb-1">
              Rodzaj pierożków Gyoza
            </div>
            <p className="text-[11px] text-black/60 mb-1">
              Wybierz farsz do Gyoza. Informacja trafi do kuchni – bez dopłaty.
            </p>
            <div className="flex flex-wrap gap-2">
              {GYOZA_VARIANTS.map((variant) => {
                const isActive = currentGyozaVariant === variant;
                const label = variant.replace(GYOZA_ADDON_PREFIX, "");
                return (
                  <button
                    key={variant}
                    type="button"
                    onClick={() =>
                      setGyozaVariant(
                        isActive ? null : (variant as GyozaVariant)
                      )
                    }
                    className={clsx(
                      "px-2 py-1 rounded text-xs border",
                      isActive
                        ? "bg-black text-white border-black"
                        : "bg-white text-black hover:bg-gray-50 border-gray-200"
                    )}
                  >
                    {isActive ? `✓ ${label}` : label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

                {isWater && (
          <div>
            <div className="font-semibold mb-1">Rodzaj wody</div>
            <p className="text-[11px] text-black/60 mb-1">
              Wybierz, czy chcesz wodę gazowaną czy niegazowaną. Informacja trafi do kuchni – bez dopłaty.
            </p>
            <div className="flex flex-wrap gap-2">
              {WATER_VARIANTS.map((variant) => {
                const isActive = currentWaterVariant === variant;
                const label = variant.replace(WATER_ADDON_PREFIX, "");
                return (
                  <button
                    key={variant}
                    type="button"
                    onClick={() =>
                      setWaterVariant(
                        isActive ? null : (variant as WaterVariant)
                      )
                    }
                    className={clsx(
                      "px-2 py-1 rounded text-xs border",
                      isActive
                        ? "bg-black text-white border-black"
                        : "bg-white text-black hover:bg-gray-50 border-gray-200"
                    )}
                  >
                    {isActive ? `✓ ${label}` : label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

         {isBubbleTea && (
          <div>
            <div className="font-semibold mb-1">Smak Bubble tea</div>
            <p className="text-[11px] text-black/60 mb-1">
              Wybierz smak Bubble tea. Informacja trafi do kuchni – bez dopłaty.
            </p>
            <div className="flex flex-wrap gap-2">
              {BUBBLE_TEA_VARIANTS.map((variant) => {
                const isActive = currentBubbleTeaVariant === variant;
                const label = variant.replace(BUBBLE_TEA_ADDON_PREFIX, "");
                return (
                  <button
                    key={variant}
                    type="button"
                    onClick={() =>
                      setBubbleTeaVariant(
                        isActive ? null : (variant as BubbleTeaVariant)
                      )
                    }
                    className={clsx(
                      "px-2 py-1 rounded text-xs border",
                      isActive
                        ? "bg-black text-white border-black"
                        : "bg-white text-black hover:bg-gray-50 border-gray-200"
                    )}
                  >
                    {isActive ? `✓ ${label}` : label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isRamune && (
          <div>
            <div className="font-semibold mb-1">Smak Ramune</div>
            <p className="text-[11px] text-black/60 mb-1">
              Wybierz smak Ramune. Informacja trafi do kuchni – bez dopłaty.
            </p>
            <div className="flex flex-wrap gap-2">
              {RAMUNE_VARIANTS.map((variant) => {
                const isActive = currentRamuneVariant === variant;
                const label = variant.replace(RAMUNE_ADDON_PREFIX, "");
                return (
                  <button
                    key={variant}
                    type="button"
                    onClick={() =>
                      setRamuneVariant(
                        isActive ? null : (variant as RamuneVariant)
                      )
                    }
                    className={clsx(
                      "px-2 py-1 rounded text-xs border",
                      isActive
                        ? "bg-black text-white border-black"
                        : "bg-white text-black hover:bg-gray-50 border-gray-200"
                    )}
                  >
                    {isActive ? `✓ ${label}` : label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isJuice && (
          <div>
            <div className="font-semibold mb-1">Smak soku</div>
            <p className="text-[11px] text-black/60 mb-1">
              Wybierz smak soku. Informacja trafi do kuchni – bez dopłaty.
            </p>
            <div className="flex flex-wrap gap-2">
              {JUICE_VARIANTS.map((variant) => {
                const isActive = currentJuiceVariant === variant;
                const label = variant.replace(JUICE_ADDON_PREFIX, "");
                return (
                  <button
                    key={variant}
                    type="button"
                    onClick={() =>
                      setJuiceVariant(
                        isActive ? null : (variant as JuiceVariant)
                      )
                    }
                    className={clsx(
                      "px-2 py-1 rounded text-xs border",
                      isActive
                        ? "bg-black text-white border-black"
                        : "bg-white text-black hover:bg-gray-50 border-gray-200"
                    )}
                  >
                    {isActive ? `✓ ${label}` : label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isLipton && (
          <div>
            <div className="font-semibold mb-1">Smak Liptona</div>
            <p className="text-[11px] text-black/60 mb-1">
              Wybierz smak mrożonej herbaty Lipton. Informacja trafi do kuchni – bez dopłaty.
            </p>
            <div className="flex flex-wrap gap-2">
              {LIPTON_VARIANTS.map((variant) => {
                const isActive = currentLiptonVariant === variant;
                const label = variant.replace(LIPTON_ADDON_PREFIX, "");
                return (
                  <button
                    key={variant}
                    type="button"
                    onClick={() =>
                      setLiptonVariant(
                        isActive ? null : (variant as LiptonVariant)
                      )
                    }
                    className={clsx(
                      "px-2 py-1 rounded text-xs border",
                      isActive
                        ? "bg-black text-white border-black"
                        : "bg-white text-black hover:bg-gray-50 border-gray-200"
                    )}
                  >
                    {isActive ? `✓ ${label}` : label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {SOFT_DRINK_GROUP && (
  <div>
    <div className="font-semibold mb-1">{SOFT_DRINK_GROUP.title}</div>
    <p className="text-[11px] text-black/60 mb-1">
      Wybierz wariant napoju. Informacja trafi do kuchni – bez dopłaty.
    </p>
    <div className="flex flex-wrap gap-2">
      {SOFT_DRINK_GROUP.variants.map((variant) => {
        const isActive = currentSoftDrinkVariant === variant;
        const label = variant.replace(SOFT_DRINK_GROUP.prefix, "");
        return (
          <button
            key={variant}
            type="button"
            onClick={() => setSoftDrinkVariant(isActive ? null : variant)}
            className={clsx(
              "px-2 py-1 rounded text-xs border",
              isActive
                ? "bg-black text-white border-black"
                : "bg-white text-black hover:bg-gray-50 border-gray-200"
            )}
          >
            {isActive ? `✓ ${label}` : label}
          </button>
        );
      })}
    </div>
  </div>
)}

        {isSushiSpecjal && (
  <div>
    <div className="font-semibold mb-1">
      Proporcje pieczone / surowe w zestawie
    </div>
    <p className="text-[11px] text-black/60 mb-1">
      Wybierz, jaką część zestawu chcesz w wersji pieczonej. Informacja trafia
      bezpośrednio do kuchni – bez dopłaty.
    </p>

    <div className="flex flex-wrap gap-2">
      {SUSHI_SPECJAL_VARIANTS.map((variant) => {
        const isActive = currentSushiSpecjalVariant === variant;
        const label = variant.replace(SUSHI_SPECJAL_ADDON_PREFIX, "");
        return (
          <button
            key={variant}
            type="button"
            onClick={() =>
              setSushiSpecjalVariant(
                isActive ? null : (variant as SushiSpecjalVariant)
              )
            }
            className={clsx(
              "px-2 py-1 rounded text-xs border",
              isActive
                ? "bg-black text-white border-black"
                : "bg-white text-black hover:bg-gray-50 border-gray-200"
            )}
          >
            {isActive ? `✓ ${label}` : label}
          </button>
        );
      })}
    </div>

    <p className="text-[11px] text-black/60 mt-2">
      Jeżeli masz uczulenie na któryś ze składników, napisz to proszę w notatce
      do tego zestawu poniżej.
    </p>
  </div>
)}

        {!isSet && (
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
                California = rolki z ryżem na zewnątrz. Standardowo nie dodajemy
                do nich dodatków – wyjątek stanowią wybrane pozycje z surowym
                łososiem, paluszkiem krabowym i/lub krewetką obłożoną łososiem.
                Tylko przy takich pozycjach dostępna jest opcja „Ryba pieczona”
                (+2 zł).
              </p>
            )}

            {subcat === "hosomaki" && (
              <p className="text-[11px] text-black/60 mt-1">
                Hosomaki (Hoso) = cienkie rolki z jednym składnikiem. Można
                dodać jedynie Tempurę, a przy zamianach wybierasz wyłącznie inne
                Hosomaki.
              </p>
            )}

            {subcat === "futomaki" && (
              <p className="text-[11px] text-black/60 mt-1">
                Futomaki (Futo) = grubsze rolki z kilkoma składnikami. Dostępne
                dodatki: Tempura, Płatek sojowy, Tamago, a przy rolkach surowych
                także „Ryba pieczona”.
              </p>
            )}

            {isSet && (
              <p className="text-[11px] text-black/60 mt-1">
                W zestawach zamieniasz rolki tylko w obrębie tej samej kategorii
                (Futomaki ↔ Futomaki, Hosomaki ↔ Hosomaki, California ↔
                California, Nigiri ↔ Nigiri). Jeśli w zestawie są Futomaki,
                możesz dodać Tamago, a w zestawach z surową rybą dostępna jest
                opcja „Ryba pieczona” dla wybranych rolek.
              </p>
            )}
          </div>
        )}

               {isTartar && (
  <div className="mt-2">
    <div className="font-semibold mb-2">TATAR ŁOSOŚ / TUŃCZYK</div>

    <div className="flex flex-wrap gap-2">
      {TARTAR_BASES.map((base) => {
        const active = (currentTartarBase || TARTAR_DEFAULT_BASE) === base;
        const label = base.replace(/^Podanie:\s*/i, "");
        return (
          <button
            key={base}
            type="button"
            onClick={() => setTartarBase(base)}
            className={clsx(
              "px-2 py-1 rounded text-xs border",
              active
                ? "bg-black text-white border-black"
                : "bg-white text-black hover:bg-gray-50 border-gray-200"
            )}
          >
            {active ? `✓ ${label}` : label}
          </button>
        );
      })}
    </div>
  </div>
)}
      </div>

      <div className="flex justify-end items-center mt-2 gap-2 flex-wrap text-[15px]">
        <button
          onClick={() => removeItem(prod.name)}
          className="text-red-600 underline"
        >
          Usuń 1 szt.
        </button>
        <button
          onClick={() => removeWholeItem(prod.name)}
          className="text-red-600 underline"
        >
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
  const isManual = promo?.require_code ?? false;

  useEffect(() => {
    if (promo && promo.require_code && promo.code) {
      setLocalCode(promo.code);
    } else if (!promo) {
      setLocalCode("");
    }
  }, [promo]);

  return (
    <div className="mt-3">
      <h4 className="font-semibold text-black mb-2">
        {promo && !promo.require_code ? "Promocja" : "Kod promocyjny"}
      </h4>
      <div className="flex gap-2">
        <input
          type="text"
          value={localCode}
          onChange={(e) => setLocalCode(e.target.value)}
          placeholder="Wpisz kod"
          className="flex-1 border border-black/15 rounded-xl px-3 py-2 text-sm bg-white"
          disabled={isManual}
        />
        {isManual ? (
          <button
            onClick={onClear}
            className="px-3 py-2 rounded-xl text-sm border border-black/15"
          >
            Usuń
          </button>
        ) : (
          <button
            onClick={handleApply}
            className={`px-3 py-2 rounded-xl text-sm font-semibold ${accentBtn}`}
          >
            Zastosuj
          </button>
        )}
      </div>
      {promoError && <p className="text-xs text-red-600 mt-1">{promoError}</p>}
      {promo && (
        <p className="text-xs text-green-700 mt-1">
          {promo.require_code ? (
            <>
              Zastosowano kod <b>{promo.code}</b> —{" "}
            </>
          ) : (
            <>Zastosowano promocję automatyczną — </>
          )}
          {promo.type === "percent"
            ? `${promo.value}%`
            : `${promo.value.toFixed(2)} zł`}{" "}
          rabatu.
        </p>
      )}
    </div>
  );
}

/* ---------- Main ---------- */
export default function CheckoutModal() {
  const isClient = useIsClient();
  const session = useSession();
  const isLoggedIn = !!session?.user;
  const supabaseAuth = createClientComponentClient();

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

  // zamiast useSearchParams – czytamy query przez window.location.search
  const [reservationId, setReservationId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const r = params.get("reservation");
    if (!r) {
      setReservationId(null);
      return;
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      r.trim()
    );
    setReservationId(isUuid ? r.trim() : null);
  }, []);

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
const [scheduledTime, setScheduledTime] = useState<string>("");


  const [productsDb, setProductsDb] = useState<ProductDb[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [restLoc, setRestLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
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

  // 2C) Reset stanów dostawy przy przełączeniu na "Na wynos"
const resetDeliveryState = useCallback(() => {
  // wyliczenia dostawy / walidacje stref
  setDeliveryInfo(null);
  setOutOfRange(false);
  setDeliveryMinOk(true);
  setDeliveryMinRequired(0);

  // koordynaty z Google (kluczowe, bo bez tego delivery powinno startować od zera)
  setCustCoords(null);

  // pola adresowe (żeby nie “wisiał” stary adres w tle)
  setStreet("");
  setPostalCode("");
  setCity("");
  setFlatNumber("");
}, []);

const handleSelectOption = useCallback(
  (opt: OrderOption) => {
    setSelectedOption(opt);

    if (opt === "takeaway") {
      resetDeliveryState();
      // (opcjonalnie) jeśli chcesz, żeby "na godzinę" też się resetowało przy na wynos:
      // setDeliveryTimeOption("asap");
      // setScheduledTime("");
    } else {
      // (opcjonalnie) jeśli przechodzisz na dostawę, możesz czyścić pole uwag do odbioru:
      // setOptionalAddress("");
    }
  },
  [resetDeliveryState]
);


  const sessionEmail = session?.user?.email || "";
  const effectiveEmail = (contactEmail || sessionEmail).trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validEmail = emailRegex.test(effectiveEmail);

  const { slug: restaurantSlug, label: restaurantCityLabel } = getRestaurantCityFromPath();
  const thanksQrUrl = CITY_REVIEW_QR_URLS[restaurantSlug] || THANKS_QR_URL;
  const restaurantPhone = getRestaurantPhone(restaurantSlug);

  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfig | null>(null);

    // DB options (warianty / modyfikatory) per produkt
  const [dbOptionsByProductId, setDbOptionsByProductId] = useState<Record<string, DbProductOptions>>({});

  useEffect(() => {
    if (!restaurantSlug || !isCheckoutOpen) {
      setDbOptionsByProductId({});
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(
          `/api/public/product-options?restaurant=${encodeURIComponent(restaurantSlug)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const arr: DbProductOptions[] = Array.isArray(json?.items) ? json.items : [];
        const map: Record<string, DbProductOptions> = {};
        for (const it of arr) {
          if (it?.product_id) map[String(it.product_id)] = it;
        }

        if (!cancelled) setDbOptionsByProductId(map);
      } catch {
        if (!cancelled) setDbOptionsByProductId({});
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, isCheckoutOpen]);


const requireAutocomplete =
  checkoutConfig?.requireAutocomplete ?? DEFAULT_REQUIRE_AUTOCOMPLETE;

const packagingUnit =
  checkoutConfig?.packagingCost ?? DEFAULT_PACKAGING_COST;

const minScheduleMinutes =
  checkoutConfig?.minScheduleMinutes ?? MIN_SCHEDULE_MINUTES;

const slotStepMinutes =
  checkoutConfig?.slotStepMinutes ?? SLOT_STEP_MINUTES;


const scheduleDef = useMemo(
  () => resolveScheduleForSlug(restaurantSlug, checkoutConfig),
  [restaurantSlug, checkoutConfig]
);

const openInfo = useMemo(
  () => isOpenForSchedule(scheduleDef),
  [scheduleDef]
);


  /** Blokady godzin dla aktualnej restauracji */
const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);

const scheduleSlots = useMemo(() => {
  if (!isCheckoutOpen) return [];
  const r = openInfo.range;
  if (!r) return [];

  const nowZoned = toZonedTime(new Date(), tz);
  const nowMins = nowZoned.getHours() * 60 + nowZoned.getMinutes();

  const openMins = r[0] * 60 + r[1];
  const closeMins = r[2] * 60 + r[3];

  // min: teraz + MIN_SCHEDULE_MINUTES, ale nie wcześniej niż otwarcie
  const minAllowedRaw = Math.max(openMins, nowMins + minScheduleMinutes);
const step = slotStepMinutes;
  const minAllowed = Math.ceil(minAllowedRaw / step) * step;

  if (minAllowed > closeMins) return [];

  const out: string[] = [];
  const base = new Date(nowZoned);

  for (let m = minAllowed; m <= closeMins; m += step) {
    const hh = Math.floor(m / 60);
    const mm = m % 60;

    const dt = new Date(base);
    dt.setHours(hh, mm, 0, 0);

    // filtr blokad z panelu
    if (isDateTimeBlocked(dt, blockedTimes)) continue;

    out.push(minutesToHHMM(m));
  }

  return out;
}, [isCheckoutOpen, openInfo.range, blockedTimes, minScheduleMinutes, slotStepMinutes]);

const canSchedule = scheduleSlots.length > 0;

const [loyaltyStickers, setLoyaltyStickers] = useState<number | null>(null);
const [loyaltyChoice, setLoyaltyChoice] = useState<LoyaltyChoice>("keep");
const [loyaltyLoading, setLoyaltyLoading] = useState(false);


  useEffect(() => {
  if (deliveryTimeOption !== "schedule") return;

  // jeśli brak slotów – nie pozwalamy na "Na godzinę"
  if (scheduleSlots.length === 0) {
    setDeliveryTimeOption("asap");
    return;
  }

  setScheduledTime((prev) => (scheduleSlots.includes(prev) ? prev : scheduleSlots[0]));
}, [deliveryTimeOption, scheduleSlots]);

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

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Jeżeli nie ma sluga (np. strona główna) – bierz wszystkie produkty jak do tej pory
      if (!restaurantSlug) {
        const prodRes = await supabase
          .from("products")
          .select("id,name,subcategory,description,restaurant_id");

        if (!cancelled && !prodRes.error && prodRes.data) {
          setProductsDb((prodRes.data as ProductDb[]) || []);
        }
        return;
      }

      // 1) restauracja po slugu
      const restRes = await supabase
        .from("restaurants")
        .select("id, lat, lng")
        .eq("slug", restaurantSlug)
        .maybeSingle();

      if (cancelled || restRes.error || !restRes.data) return;
      const rest: any = restRes.data;

      if (!cancelled) {
        if (rest.lat && rest.lng) {
          setRestLoc({ lat: rest.lat, lng: rest.lng });
        }
        setRestaurantId(rest.id as string);
      }

      // 2) dane zależne od restauracji: produkty + strefy dostawy
      const [prodRes, dzRes] = await Promise.all([
        supabase
          .from("products")
          .select("id,name,subcategory,description,restaurant_id")
          .eq("restaurant_id", rest.id),
        supabase
          .from("delivery_zones")
          .select("*")
          .eq("restaurant_id", rest.id)
          .order("min_distance_km", { ascending: true }),
      ]);

      if (!cancelled && !prodRes.error && prodRes.data) {
        setProductsDb((prodRes.data as ProductDb[]) || []);
      }
      if (!cancelled && !dzRes.error && dzRes.data) {
        setZones(dzRes.data as Zone[]);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [restaurantSlug]);

  // Pobranie blokad godzin dla aktualnej restauracji (tylko gdy modal otwarty)
useEffect(() => {
  if (!restaurantSlug || !isCheckoutOpen) {
    setBlockedTimes([]);
    return;
  }

  let cancelled = false;

  const loadBlocked = async () => {
    try {
      const res = await fetch(
        `/api/admin/blocked-times?restaurant=${encodeURIComponent(
          restaurantSlug
        )}`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();

      // API może zwrócić [row] albo { items:[row] } – bierzemy bezpiecznie tablicę
      const raw: any[] = Array.isArray(json)
        ? json
        : Array.isArray((json as any)?.items)
        ? (json as any).items
        : [];

      if (cancelled) return;

      const mapped: BlockedTime[] = raw.map((row: any) => ({
        id: String(row.id),
        date: row.date, // 'YYYY-MM-DD'
        full_day: !!row.full_day,
        // obsłużymy też nazwy time_from / time_to, jeśli tak jest w API
        from_time: row.from_time ?? row.time_from ?? null,
        to_time: row.to_time ?? row.time_to ?? null,
      }));

      setBlockedTimes(mapped);
    } catch (e) {
      console.error("Nie udało się pobrać blokad godzin", e);
      if (!cancelled) {
        setBlockedTimes([]);
      }
    }
  };

  loadBlocked();

  return () => {
    cancelled = true;
  };
}, [restaurantSlug, isCheckoutOpen]);

useEffect(() => {
  if (!restaurantSlug || !isCheckoutOpen) {
    setCheckoutConfig(null);
    return;
  }

  let cancelled = false;
  const ac = new AbortController();

  const load = async () => {
    try {
      // DOSTOSUJ ŚCIEŻKĘ jeśli masz inną.
      const res = await fetch(
        `/api/public/checkout-config?restaurant=${encodeURIComponent(restaurantSlug)}`,
        { cache: "no-store", signal: ac.signal }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const cfg = normalizeCheckoutConfig(json);

      if (!cancelled) setCheckoutConfig(cfg);
    } catch {
      // fallback: zostaje null, czyli leci Twoja obecna logika
      if (!cancelled) setCheckoutConfig(null);
    }
  };

  load();

  return () => {
    cancelled = true;
    ac.abort();
  };
}, [restaurantSlug, isCheckoutOpen]);


     useEffect(() => {
  // jeśli modal zamknięty albo user niezalogowany – czyścimy stan
  if (!isCheckoutOpen || !isLoggedIn || !session?.user?.id) {
    setLoyaltyStickers(null);
    setLoyaltyChoice("keep");
    return;
  }

  let cancelled = false;

  const load = async () => {
    try {
      setLoyaltyLoading(true);

      const { data, error } = await supabaseAuth
        .from("loyalty_accounts")
        .select("stickers")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) throw error;

      const stickers = Math.max(
        0,
        Math.min(LOYALTY_REWARD_PERCENT_COUNT, Number(data?.stickers ?? 0))
      );

      setLoyaltyStickers(stickers);
      setLoyaltyChoice("keep");
    } catch (e) {
      console.error("Loyalty: błąd pobierania loyalty_accounts", e);
      if (!cancelled) {
        setLoyaltyStickers(0);
        setLoyaltyChoice("keep");
      }
    } finally {
      if (!cancelled) setLoyaltyLoading(false);
    }
  };

  load();

  return () => {
    cancelled = true;
  };
}, [isCheckoutOpen, isLoggedIn, session?.user?.id, supabaseAuth]);


  const [submitting, setSubmitting] = useState(false);
  const [confirmCityOk, setConfirmCityOk] = useState(false);
  const [orderSent, setOrderSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [chopsticksQty, setChopsticksQty] = useState<number>(0);

  const getTurnstileToken = useCallback((): string | null => {
  if (!TURNSTILE_SITE_KEY) return null;
  if (turnstileToken) return turnstileToken;

  // awaryjnie: czasem stan nie nadąża, a widget ma już response
  try {
    const t = window.turnstile?.getResponse?.(tsIdRef.current);
    return t ? String(t) : null;
  } catch {
    return null;
  }
}, [turnstileToken]);

const resetTurnstile = useCallback(() => {
  setTurnstileToken(null);
  setTurnstileError(false);
  try {
    if (window.turnstile && tsIdRef.current) {
      window.turnstile.reset(tsIdRef.current);
    }
  } catch {}
}, []);


  // Turnstile – remove jako useCallback
  const removeTurnstile = useCallback(() => {
    try {
      if (tsIdRef.current && window.turnstile) window.turnstile.remove(tsIdRef.current);
    } catch {}
    tsIdRef.current = null;
    setTurnstileToken(null);
    setTurnstileError(false);
  }, []);

  // Zamknięcie modala jako stabilny callback
  const closeCheckoutModal = useCallback(() => {
    originalCloseCheckoutModal();
    setPromo(null);
    setPromoError(null);
    setOrderSent(false);
    setErrorMessage(null);
    setConfirmCityOk(false);
    setLegalAccepted(false);
    setSubmitting(false);
    setLoyaltyChoice("keep");
  setLoyaltyStickers(null);
  setLoyaltyLoading(false);
    goToStep(1);
    removeTurnstile();
  }, [originalCloseCheckoutModal, goToStep, removeTurnstile]);

  // ESC zamyka modal + blokada scrolla body
  useEffect(() => {
    if (!isCheckoutOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeCheckoutModal();
    window.addEventListener("keydown", onKey);
    const prevBody = document.body.style.overflow;
const prevHtml = document.documentElement.style.overflow;

document.body.style.overflow = "hidden";
document.documentElement.style.overflow = "hidden";

return () => {
  window.removeEventListener("keydown", onKey);
  document.body.style.overflow = prevBody;
  document.documentElement.style.overflow = prevHtml;
};
  }, [isCheckoutOpen, closeCheckoutModal]);

  // Turnstile – render jako useCallback
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
    []
  );

  // Turnstile – efekt z pełnymi dependencies
  useEffect(() => {
  if (!TURNSTILE_SITE_KEY || !tsReady) return;

  if (isCheckoutOpen && checkoutStep === 3 && !orderSent) {
    renderTurnstile(tsMobileRef.current);
    renderTurnstile(tsDesktopRef.current);
    return () => removeTurnstile();
  }

  removeTurnstile();
}, [isCheckoutOpen, checkoutStep, tsReady, orderSent, renderTurnstile, removeTurnstile]);

  const productsByName = useMemo(() => {
    const map = new Map<string, ProductDb>();
    productsDb.forEach((p) => map.set(p.name, p));
    return map;
  }, [productsDb]);

  const productsById = useMemo(() => {
    const map = new Map<string, ProductDb>();
    productsDb.forEach((p) => map.set(p.id, p));
    return map;
  }, [productsDb]);

  const productCategory = useCallback(
    (name: string) => productsByName.get(name)?.subcategory || "",
    [productsByName]
  );

  const resolveProduct = useCallback(
    (item: any): ProductDb | undefined => {
      const pid = item.product_id ?? item.id;
      if (pid && productsById.get(pid)) {
        return productsById.get(pid);
      }
      if (item.baseName && productsByName.get(item.baseName)) {
        return productsByName.get(item.baseName);
      }
      if (item.name && productsByName.get(item.name)) {
        return productsByName.get(item.name);
      }
      return undefined;
    },
    [productsById, productsByName]
  );

  const optionsByCat = useMemo(() => {
    const out: Record<string, string[]> = {};

    productsDb.forEach((p) => {
      const cat = (p.subcategory || "").toLowerCase();
      if (!cat || cat === "specjały" || cat === "zestawy") return;

      const arr = (out[cat] ||= []);
      if (!arr.includes(p.name)) {
        // unikamy duplikatów nazw w obrębie kategorii
        arr.push(p.name);
      }
    });

    Object.values(out).forEach((arr) =>
      arr.sort((a, b) => a.localeCompare(b))
    );

    return out;
  }, [productsDb]);

  const baseTotal = useMemo<number>(() => {
    return items.reduce((acc: number, it: any) => {
      const qty = it.quantity || 1;
      const priceNum =
        typeof it.price === "string" ? parseFloat(it.price) : it.price || 0;
      const productDb = resolveProduct(it);
      const { addonsCost } = computeAddonsCostWithSauces({
  addons: it.addons ?? [],
  product: productDb ?? null,
  itemName: String(productDb?.name || it.name || ""),
  subcat: String((productDb?.subcategory || "") as string),
  restaurantSlug,
});
return acc + (priceNum + addonsCost) * qty;
    }, 0);
  }, [items, resolveProduct, restaurantSlug]);

  const packagingCost = selectedOption ? packagingUnit : 0;
  const subtotal = baseTotal + packagingCost;

  const getItemLineTotal = useCallback(
    (it: any) => {
      const qty = it.quantity || 1;
      const priceNum =
        typeof it.price === "string" ? parseFloat(it.price) : it.price || 0;
      const productDb = resolveProduct(it);
      const { addonsCost } = computeAddonsCostWithSauces({
  addons: it.addons ?? [],
  product: productDb ?? null,
  itemName: String(productDb?.name || it.name || ""),
  subcat: String((productDb?.subcategory || "") as string),
  restaurantSlug,
});
return (priceNum + addonsCost) * qty;
    }, [resolveProduct, restaurantSlug]);

  const isProductEligibleForPromo = useCallback(
    (prodDb: ProductDb, p: NonNullable<Promo>): boolean => {
      const norm = (s: string) => s.toLowerCase().trim();
      const scope = p.apply_scope || "all";
      const cat = norm(prodDb.subcategory || "");
      const name = norm(prodDb.name || "");
      const slug = name.replace(/\s+/g, "-");

      const matchAny = (list: string[] | null) => {
        if (!list || list.length === 0) return false;
        return list.some((raw) => {
          const token = norm(raw);
          if (!token) return false;
          return (
            cat === token ||
            name === token ||
            slug === token ||
            name.includes(token) ||
            slug.includes(token)
          );
        });
      };

      const inCatInclude = matchAny(p.include_categories);
      const inCatExclude = matchAny(p.exclude_categories);
      const inProdInclude = matchAny(p.include_products);
      const inProdExclude = matchAny(p.exclude_products);

      switch (scope) {
        case "include_categories":
          return inCatInclude;
        case "exclude_categories":
          return !inCatExclude;
        case "include_products":
          return inProdInclude;
        case "exclude_products":
          return !inProdExclude;
        case "all":
        default:
          if (inCatExclude || inProdExclude) return false;
          return true;
      }
    },
    []
  );

  const computeDiscountBase = useCallback(
    (p: NonNullable<Promo>): number => {
      return items.reduce((sum, it: any) => {
        const prodDb = resolveProduct(it);
        if (!prodDb) return sum;
        if (!isProductEligibleForPromo(prodDb, p)) return sum;
        const qty = it.quantity || 1;
        const priceNum =
          typeof it.price === "string" ? parseFloat(it.price) : it.price || 0;
        // UWAGA: rabat liczony tylko od ceny produktu (bez dodatków)
        return sum + priceNum * qty;
      }, 0);
    },
    [items, resolveProduct, isProductEligibleForPromo]
  );

  const calcDelivery = useCallback(
  async (custLat: number, custLng: number) => {
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
      const roundedDelivery = roundUpToStep(Math.max(0, cost), 0.5);
setDeliveryInfo({ cost: roundedDelivery, eta });
    } catch {
      // opcjonalnie: setDeliveryInfo(null)
    }
  },
  [restLoc, zones, subtotal]
);


  const onAddressSelect = (address: string, lat: number, lng: number) => {
    setStreet(address);
    if (lat && lng) {
      setCustCoords({ lat, lng });
      calcDelivery(lat, lng);
    }
  };

  useEffect(() => {
  if (selectedOption !== "delivery") return;
  if (!custCoords) return;
  calcDelivery(custCoords.lat, custCoords.lng);
}, [selectedOption, custCoords, calcDelivery]);

const deliveryCost =
  selectedOption === "delivery" ? (deliveryInfo?.cost || 0) : 0;



  const discount = useMemo(() => {
    if (!promo) return 0;
    const base = computeDiscountBase(promo as NonNullable<Promo>);
    if (base <= 0) return 0;
    const val =
      promo.type === "percent"
        ? base * (Number(promo.value) / 100)
        : Number(promo.value || 0);
   const totalCap = baseTotal + packagingCost + deliveryCost;
    return Math.max(0, Math.min(val, totalCap));
  }, [promo, computeDiscountBase, baseTotal, packagingCost, deliveryCost]);

  const canUseLoyalty4 =
  isLoggedIn &&
  typeof loyaltyStickers === "number" &&
  loyaltyStickers >= 4 &&
  loyaltyStickers < 8;
  
const hasAutoLoyaltyDiscount =
  isLoggedIn &&
  typeof loyaltyStickers === "number" &&
  loyaltyStickers >= 8;

const totalWithDelivery = Math.max(0, subtotal + deliveryCost - discount);
  const shouldHideOrderActions = Boolean(TURNSTILE_SITE_KEY && turnstileError);

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
    if (!restaurantId) {
      setPromoError("Brak przypisanej restauracji do zamówienia.");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("discount_codes")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("active", true)
        .eq("require_code", true)
        .ilike("code", code)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // fallback na ewentualny stary endpoint /api/promo/validate
        const currentTotal = baseTotal + packagingCost + (deliveryInfo?.cost || 0);
        const resp = await safeFetch("/api/promo/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, total: currentTotal }),
        });
        if (resp?.valid) {
          const type = resp.type === "amount" ? "amount" : "percent";
          const valueNum = Number(resp.value || 0);
          if (valueNum <= 0) throw new Error("Nieprawidłowa wartość kodu.");
          const legacyPromo: NonNullable<Promo> = {
            id: "legacy",
            code: resp.code || code,
            type,
            value: valueNum,
            apply_scope: "all",
            include_categories: null,
            exclude_categories: null,
            include_products: null,
            exclude_products: null,
            min_order: null,
            require_code: true,
          };
          setPromo(legacyPromo);
          return;
        }
        throw new Error(resp?.message || "Kod nieprawidłowy.");
      }

      const row = data as DiscountCodeRow;
      const promoState = {
        id: row.id,
        code: row.code,
        type: row.type === "amount" ? "amount" : "percent",
        value: Number(row.value || 0),
        apply_scope: (row.apply_scope as ApplyScope) || "all",
        include_categories: row.include_categories || null,
        exclude_categories: row.exclude_categories || null,
        include_products: row.include_products || null,
        exclude_products: row.exclude_products || null,
        min_order: row.min_order,
        require_code: true,
      } as NonNullable<Promo>;

      if (promoState.value <= 0) {
        throw new Error("Nieprawidłowa wartość kodu.");
      }

      const baseForThis = computeDiscountBase(promoState);
      if (baseForThis <= 0) {
        throw new Error("Kod nie dotyczy żadnych produktów w koszyku.");
      }

      const now = new Date();
      if (row.expires_at && new Date(row.expires_at) < now) {
        throw new Error("Kod wygasł.");
      }

      if (
        typeof row.min_order === "number" &&
        row.min_order > 0 &&
        baseForThis < row.min_order
      ) {
        throw new Error(
          `Minimalna wartość zamówienia dla tego kodu to ${row.min_order.toFixed(
            2
          )} zł (liczona tylko z cen produktów).`
        );
      }

      setPromo(promoState);
    } catch (e: any) {
      setPromo(null);
      setPromoError(e.message || "Nie udało się zastosować kodu.");
    }
  };

  const clearPromo = () => {
    setPromo(null);
    setPromoError(null);
  };

  // Automatyczne promocje (require_code = false)
  useEffect(() => {
    if (!restaurantId || items.length === 0) {
      // przy pustym koszyku zostawiamy ewentualny ręczny kod, ale czyścimy auto
      setPromo((current) => (current && current.require_code ? current : null));
      return;
    }

    let cancelled = false;

    const loadAuto = async () => {
      try {
        const { data, error } = await supabase
          .from("discount_codes")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .eq("active", true)
          .eq("require_code", false);

        if (error || !data) return;

        const rows = data as DiscountCodeRow[];
        let best: NonNullable<Promo> | null = null;
        let bestDiscount = 0;

        rows.forEach((row) => {
          const promoState = {
            id: row.id,
            code: row.code,
            type: row.type === "amount" ? "amount" : "percent",
            value: Number(row.value || 0),
            apply_scope: (row.apply_scope as ApplyScope) || "all",
            include_categories: row.include_categories || null,
            exclude_categories: row.exclude_categories || null,
            include_products: row.include_products || null,
            exclude_products: row.exclude_products || null,
            min_order: row.min_order,
            require_code: false,
          } as NonNullable<Promo>;

          if (promoState.value <= 0) return;

          const base = computeDiscountBase(promoState);
          if (base <= 0) return;

          const now = new Date();
          if (row.expires_at && new Date(row.expires_at) < now) return;

          if (
            typeof row.min_order === "number" &&
            row.min_order > 0 &&
            base < row.min_order
          ) {
            return;
          }

          const disc =
            promoState.type === "percent"
              ? base * (promoState.value / 100)
              : promoState.value;

          if (disc > bestDiscount) {
            bestDiscount = disc;
            best = promoState;
          }
        });

        if (cancelled) return;

        setPromo((current) => {
          // ręcznie wpisany kod ma priorytet
          if (current && current.require_code) return current;
          return best;
        });
      } catch {
        // brak auto-promki = cisza
      }
    };

    loadAuto();

    return () => {
      cancelled = true;
    };
  }, [restaurantId, items, computeDiscountBase]);

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

  const handleSubmitOrder = async () => {
    if (submitting) return;
    setErrorMessage(null);

    if (!items || items.length === 0) {
  setErrorMessage("Koszyk jest pusty.");
  return;
}

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

    const chk = isOpenForSchedule(scheduleDef);
    if (!chk.open) {
      setErrorMessage(
        `Zamówienia dla ${restaurantCityLabel} przyjmujemy dziś ${chk.label}.`
      );
      return;
    }

   if (deliveryTimeOption === "schedule" && selectedOption) {
    if (!scheduleSlots.includes(scheduledTime)) {
    setErrorMessage(
      "Wybrana godzina jest niedostępna. Wybierz jedną z dostępnych godzin."
    );
    return;
  }
  const [h, m] = scheduledTime.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    setErrorMessage(
      selectedOption === "delivery"
        ? "Podaj prawidłową godzinę dostawy."
        : "Podaj prawidłową godzinę odbioru."
    );
    return;
  }

  const nowZoned = toZonedTime(new Date(), tz);
  const dt = new Date(nowZoned);
  dt.setHours(h, m, 0, 0);

  // jeśli klient wybierze godzinę z przeszłości – traktujemy jako jutro
  if (dt.getTime() < nowZoned.getTime()) {
    dt.setDate(dt.getDate() + 1);
  }

  const diffMinutes = (dt.getTime() - nowZoned.getTime()) / 60000;
  if (diffMinutes < minScheduleMinutes) {
  setErrorMessage(
    `Przy wyborze realizacji „na godzinę” minimalny czas to ${minScheduleMinutes} minut od teraz.`
  );
  return;
}

  // NOWE: sprawdzenie blokad godzin z panelu admina
  if (isDateTimeBlocked(dt, blockedTimes)) {
    setErrorMessage(
      "Wybrana godzina jest niedostępna (zablokowana w systemie). Wybierz inną godzinę."
    );
    return;
  }
}

// WALIDACJA: Sashimi musi mieć wybrany wariant (łosoś / mix / tuńczyk)
for (const it of items as any[]) {
  const p = resolveProduct(it);
  if (!isSashimiProduct(it, p || null)) continue;

  const addonsArr: string[] = Array.isArray(it.addons) ? it.addons : [];
  const hasVariant = addonsArr.some(
    (a) => typeof a === "string" && SASHIMI_VARIANTS.includes(a as any)
  );

  if (!hasVariant) {
    setErrorMessage(
      `Wybierz rodzaj Sashimi (łosoś / mix / tuńczyk) przy pozycji: ${it.name || "Sashimi"}.`
    );
    return;
  }
}


    if (!guardEmail()) return;
    const tsToken = getTurnstileToken();

if (TURNSTILE_SITE_KEY && !tsToken) {
  setErrorMessage("Zaznacz weryfikację antybot i spróbuj ponownie.");
  return;
}

    if (selectedOption === "delivery") {
      if (requireAutocomplete && !custCoords) {
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
  delivery_cost: selectedOption === "delivery" ? (deliveryInfo?.cost || 0) : 0,
  total_price: totalWithDelivery,
  discount_amount: discount || 0,
  promo_code: promo?.code || (promo && !promo.require_code ? "AUTO" : null),
  legal_accept: {
    terms_version: TERMS_VERSION,
    privacy_version: TERMS_VERSION,
    marketing_opt_in: false,
  },
  status: "placed",
  notice_payment:
    selectedOption === "delivery" ? "Płatność wyłącznie gotówką u kierowcy" : null,
  chopsticks_qty: Math.max(0, Math.min(10, Number(chopsticksQty) || 0)),
  reservation_id: reservationId || null,
  loyalty_choice: !isLoggedIn
  ? null
  : hasAutoLoyaltyDiscount
  ? "use_8"
  : canUseLoyalty4 && loyaltyChoice === "use_4"
  ? "use_4"
  : "keep",

loyalty_stickers_before:
  isLoggedIn && typeof loyaltyStickers === "number" ? loyaltyStickers : null,
  // NOWE: zapisujemy godzinę również dla "Na wynos"
  client_delivery_time,
};

      if (selectedOption === "delivery") {
  orderPayload.street = street || null;
  orderPayload.postal_code = postalCode || null;
  orderPayload.city = city || null;
  orderPayload.flat_number = flatNumber || null;
  if (custCoords) {
    orderPayload.delivery_lat = custCoords.lat;
    orderPayload.delivery_lng = custCoords.lng;
  }
} else if (selectedOption === "takeaway") {
  if (optionalAddress.trim()) {
    orderPayload.address = optionalAddress.trim();
  }
}

       const itemsPayload = items.map((item: any, index: number) => {
        const product = resolveProduct(item);

        // NOWE: zamiany w zestawie + dodatki per rolka
        const setSwaps = buildSetSwapsPayload(item, product);

        // tekst z notatki użytkownika + tekst z zamian
        const userNote = notes[index] || "";
        const swapsNote = buildSetSwapsNote(setSwaps);
        const combinedNote =
          userNote && swapsNote
            ? `${userNote} | ${swapsNote}`
            : userNote || swapsNote || "";

        return {
          product_id: product?.id ?? item.product_id ?? item.id ?? null,
          name: item.name,
          quantity: item.quantity || 1,
          unit_price: item.price,
          options: {
            addons: item.addons,
            swaps: item.swaps,
            set_swaps: setSwaps.length ? setSwaps : undefined, // struktura do panelu
            note: combinedNote, // to pole czyta backend (opt.note)
            restaurant: slug,
          },
        };
      });

     const tsToken = getTurnstileToken();

await safeFetch(`/api/orders/create?restaurant=${encodeURIComponent(slug)}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "cf-turnstile-response": tsToken || "",
    "x-restaurant-slug": slug,
  },
  body: JSON.stringify({
    orderPayload,
    itemsPayload,
    // najlepiej nie duplikować tokenu, ale jak zostawisz to też przeżyje
    // turnstileToken: tsToken,
    restaurant: slug,
  }),
});
      clearCart();
      setOrderSent(true);
    } catch (err: any) {
  // jeśli backend zwróci 409 + TURNSTILE_RETRY (timeout-or-duplicate)
  if (err?.status === 409 || err?.code === "TURNSTILE_RETRY") {
    setErrorMessage("Weryfikacja wygasła lub została użyta ponownie. Zweryfikuj się jeszcze raz i spróbuj.");
    resetTurnstile();
    return;
  }

  setErrorMessage(err?.message || "Wystąpił błąd podczas składania zamówienia.");
  resetTurnstile();
} finally {
  setSubmitting(false);

  // krytyczne: nie pozwól na ponowne wysłanie tego samego tokenu
  // (na sukcesie też OK, ale możesz zamiast tego removeTurnstile() przy orderSent)
  if (!orderSent) resetTurnstile();
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
      <a
        href="/legal/regulamin"
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-[#de1d13] visited:text-[#de1d13] hover:opacity-80"
      >
        Regulamin
      </a>{" "}
      oraz{" "}
      <a
        href="/legal/polityka-prywatnosci"
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-[#de1d13] visited:text-[#de1d13] hover:opacity-80"
      >
        Politykę prywatności
      </a>{" "}
      (v{TERMS_VERSION}).
    </span>
  </label>
);

/* ================= START: SHARED PRICE SUMMARY ================= */

const pln = (v: number) =>
  `${Number(v || 0).toFixed(2).replace(".", ",")} zł`;

const PriceSummaryCard = (
  <div className="rounded-2xl border border-black/10 bg-white p-4 space-y-4">
    <div className="flex items-center justify-between gap-3">
      <h4 className="text-sm font-semibold">Podsumowanie cen</h4>
      {selectedOption === "delivery" && deliveryInfo?.eta ? (
        <span className="text-[11px] text-black/60">
          ETA: {deliveryInfo.eta}
        </span>
      ) : null}
    </div>

    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-black/70">Produkty</span>
        <span className="font-semibold">{pln(baseTotal)}</span>
      </div>

      {selectedOption ? (
        <div className="flex items-center justify-between">
          <span className="text-black/70">Opakowanie</span>
          <span className="font-semibold">{pln(packagingCost)}</span>
        </div>
      ) : null}

      {selectedOption === "delivery" ? (
        <div className="flex items-center justify-between">
          <span className="text-black/70">Dostawa</span>
          <span className="font-semibold">{pln(deliveryCost)}</span>
        </div>
      ) : null}

      {discount > 0 ? (
        <div className="flex items-center justify-between">
          <span className="text-black/70">Rabat</span>
          <span className="font-semibold text-green-700">
            -{pln(discount)}
          </span>
        </div>
      ) : null}

      <div className="h-px bg-black/10 my-2" />

      <div className="flex items-center justify-between text-base">
        <span className="font-semibold">Do zapłaty</span>
        <span className="font-bold">{pln(totalWithDelivery)}</span>
      </div>
    </div>

    <PromoSection
      promo={promo}
      promoError={promoError}
      onApply={applyPromo}
      onClear={clearPromo}
    />

    <div className="text-[11px] text-black/60">
      Ceny zawierają VAT.{" "}
      {selectedOption === "delivery"
        ? "Płatność: gotówka u kierowcy."
        : "Płatność: gotówka przy odbiorze."}
    </div>
  </div>
);

/* ================== END: SHARED PRICE SUMMARY ================== */


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
  className="fixed inset-0 z-[58] bg-black/70 grid place-items-stretch lg:place-items-center p-0 lg:p-4 overflow-hidden"
  role="dialog"
  aria-modal="true"
  onMouseDown={(e) => {
    if (e.target === e.currentTarget) closeCheckoutModal();
  }}
>
        <div
  className="w-full max-w-5xl bg-white text-black shadow-2xl grid grid-rows-[auto,1fr] h-screen h-[100dvh] lg:h-auto lg:max-h-[90vh]"
  onMouseDown={(e) => e.stopPropagation()}
>
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b border-black/10 min-w-0">
  <h2 className="text-base sm:text-xl font-semibold min-w-0 truncate">
            Zamówienie — {restaurantCityLabel}
          </h2>
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

        <div className="min-h-0 overflow-y-auto overscroll-contain modal-scroll">
          <div
    className={clsx(
      "grid grid-cols-1 gap-6 p-6",
      !orderSent && "lg:grid-cols-[1fr_380px]"
    )}
  >
            <div>
              {orderSent ? (
                <div className="min-h-[320px] flex flex-col items-center justify-center text-center space-y-5 px-4">
                  <div className="bg-white p-4 rounded-2xl shadow flex flex-col items-center gap-2">
                    <div className="bg-white p-3 rounded-xl">
                      <QRCode value={thanksQrUrl} size={170} />
                    </div>
                    <p className="text-xs text-black/60 max-w-xs">
                      Zeskanuj kod lub kliknij poniższy przycisk, aby ocenić
                      lokal w Google.
                    </p>
                  </div>
                  {!orderSent && (
  <div className="hidden lg:block">
    <div className="lg:sticky lg:top-6 space-y-4">
      {PriceSummaryCard}
    </div>
  </div>
)}

                  <h3 className="text-2xl font-bold">
                    Dziękujemy za zamówienie!
                  </h3>
                  <p className="text-black/70">
                    Potwierdzenie i link do śledzenia wysłaliśmy na Twój adres
                    e-mail.
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

                  {/* KROK 1 MOBILE: lista produktów */}
                  {checkoutStep === 1 && (
                    <div className="space-y-6">
                      <h3 className="text-2xl font-bold">Wybrane produkty</h3>

                      <div className="space-y-3 max-h-[360px] overflow-y-auto">
                        {items.map((item, idx) => (
                          <div key={idx} className="space-y-1">
                            <ProductItem
                              prod={item}
                              productCategory={productCategory}
                              productsDb={productsDb}
                              optionsByCat={optionsByCat}
                              restaurantSlug={restaurantSlug}
                              helpers={productHelpers}
                              dbOptionsByProductId={dbOptionsByProductId}
                            />
                            <textarea
                              className="w-full text-xs border border-black/15 rounded-xl px-2 py-1 bg-white"
                              placeholder="Notatka do produktu (np. alergie, zamiany składników)"
                              value={notes[idx] || ""}
                              onChange={(e) =>
                                setNotes({ ...notes, [idx]: e.target.value })
                              }
                            />
                          </div>
                        ))}
                        {items.length === 0 && (
                          <p className="text-center text-black/60">
                            Brak produktów w koszyku.
                          </p>
                        )}
                      </div>

                      <ChopsticksControl
                        value={chopsticksQty}
                        onChange={setChopsticksQty}
                      />

                      <div className="pt-2 border-t border-black/10 flex justify-end">
                        <button
                          onClick={nextStep}
                          disabled={items.length === 0}
                          className={`min-w-[160px] py-2 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
                        >
                          Dalej →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* KROK 1 DESKTOP / KROK 2 MOBILE: sposób odbioru */}
                  {/* KROK 2: sposób odbioru */}
{checkoutStep === 2 && (
                    <div className="space-y-6">
                      <h3 className="text-2xl font-bold">Sposób odbioru</h3>

                      <div className="grid grid-cols-2 gap-3">
                        {OPTIONS.map(({ key, label, Icon }) => (
                          <button
                            key={key}
                            onClick={() => handleSelectOption(key)}
                            className={clsx(
                              "flex flex-col items-center justify-center border px-3 py-4 transition",
                              selectedOption === key
                                ? "bg-yellow-400 text-black border-yellow-500"
                                : "bg-gray-50 text-black border-black/10 hover:bg-gray-100"
                            )}
                          >
                            <Icon size={22} />
                            <span className="mt-1 text-sm font-medium">
                              {label}
                            </span>
                          </button>
                        ))}
                      </div>

                      {selectedOption === "delivery" && (
                        <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm">
                          Płatność: <b>gotówka u kierowcy</b>.
                        </div>
                      )}

                     {selectedOption && (
  <div className="space-y-2">
    <h4 className="font-semibold">
      {selectedOption === "delivery" ? "Czas dostawy" : "Czas odbioru"}
    </h4>
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
          disabled={!canSchedule}
          onChange={() => {
            if (!canSchedule) return;
            setDeliveryTimeOption("schedule");
          }}
        />
        <span>
          Na godzinę{!canSchedule ? " (brak wolnych slotów)" : ""}
        </span>
      </label>

      {deliveryTimeOption === "schedule" && canSchedule && (
        <select
          className="border border-black/15 rounded-xl px-2 py-1 bg-white"
          value={scheduledTime}
          onChange={(e) => setScheduledTime(e.target.value)}
        >
          {scheduleSlots.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}

      {deliveryTimeOption === "schedule" && !canSchedule && (
        <span className="text-xs text-red-600">
          Brak dostępnych godzin na dziś — wybierz „Jak najszybciej”.
        </span>
      )}
    </div>
    <p className="text-xs text-black/60">
      Dzisiejsze godziny w {restaurantCityLabel}: {openInfo.label}
    </p>
  </div>
)}

                      <div className="flex justify-between gap-3 pt-2 border-t border-black/10">
                        <button
  type="button"
  onClick={() => goToStep(1)}
  className="px-4 py-2 rounded-xl border border-black/15"
>
  ← Cofnij
</button>
                        <div className="flex-1 flex justify-end">
                          <button
                            onClick={nextStep}
                            disabled={!selectedOption}
                            className={`min-w-[220px] py-2 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
                          >
                            Dalej →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                   {/* KROK 3: dane kontaktowe + podsumowanie mobile */}
{checkoutStep === 3 && isMobile && (
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

                          {/* INFO: gdy nie ma adresu na liście */}
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-black/70">
                            <span>Nie możesz znaleźć swojego adresu?</span>
                            {restaurantPhone && (
                              <a
                                href={`tel:${restaurantPhone.replace(
                                  /\s+/g,
                                  ""
                                )}`}
                                className="inline-flex items-center justify-center rounded-full border border-black/15 px-3 py-1 font-semibold hover:bg-gray-100 text-black"
                              >
                                Zadzwoń do nas
                              </a>
                            )}
                          </div>

                          <p className="text-xs text-black/60">
                            Najpierw wybierz adres z listy Google – dopiero
                            wtedy pola poniżej odblokują się do edycji.
                          </p>

                          <div className="grid grid-cols-1 gap-2">
                            <input
                              type="text"
                              placeholder="Adres (ulica i numer domu)"
                              className="w-full px-3 py-2 border border-black/15 rounded-xl bg-white disabled:bg-gray-100 disabled:text-black/50 disabled:cursor-not-allowed"
                              value={street}
                              onChange={(e) => setStreet(e.target.value)}
                              disabled={requireAutocomplete && !custCoords}
                            />
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Numer mieszkania (opcjonalnie)"
                                className="flex-1 px-3 py-2 border border-black/15 rounded-xl bg-white disabled:bg-gray-100 disabled:text-black/50 disabled:cursor-not-allowed"
                                value={flatNumber}
                                onChange={(e) =>
                                  setFlatNumber(e.target.value)
                                }
                                disabled={requireAutocomplete && !custCoords}
                              />
                              <input
                                type="text"
                                placeholder="Kod pocztowy"
                                className="flex-1 px-3 py-2 border border-black/15 rounded-xl bg-white disabled:bg-gray-100 disabled:text-black/50 disabled:cursor-not-allowed"
                                value={postalCode}
                                onChange={(e) =>
                                  setPostalCode(e.target.value)
                                }
                                disabled={requireAutocomplete && !custCoords}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Miasto"
                              className="w-full px-3 py-2 border border-black/15 rounded-xl bg-white disabled:bg-gray-100 disabled:text-black/50 disabled:cursor-not-allowed"
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              disabled={requireAutocomplete && !custCoords}
                            />
                            {requireAutocomplete && !custCoords && (
  <p className="text-xs text-red-600">
    Wpisanie adresu ręcznie jest zablokowane –
    wybierz pozycję z listy podpowiedzi Google.
  </p>
)}
                          </div>
                        </>
                      )}

                      {selectedOption === "takeaway" && (
                        <div className="rounded-xl bg-gray-50 border border-black/10 p-3 text-sm">
                          Odbiór osobisty w lokalu. Płatność przy odbiorze
                          gotówką.
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
                            onChange={(e) =>
                              setOptionalAddress(e.target.value)
                            }
                          />
                        )}
                        <input
                          type="email"
                          placeholder="Email (wymagany do potwierdzenia)"
                          className="w-full px-3 py-2 border border-black/15 rounded-xl bg-white"
                          value={contactEmail}
                          onChange={(e) =>
                            setContactEmail(e.target.value)
                          }
                        />
                        {contactEmail !== "" && !validEmail && (
                          <p className="text-xs text-red-600">
                            Podaj poprawny adres e-mail.
                          </p>
                        )}
                      </div>

                      <div className="flex justify-between mt-2">
                        <button
                          onClick={() => goToStep(2)}
                          className="px-4 py-2 rounded-xl border border-black/15"
                        >
                          ← Cofnij
                        </button>

                        {/* Na desktopie dalej przechodzimy do kroku 3 (podsumowanie).
                            Na mobile nie ma kroku 4 – zamawianie kończymy przyciskiem
                            „✅ Zamawiam” niżej. */}
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
                                  (requireAutocomplete && !custCoords)))
                            }
                            className={`px-4 py-2 rounded-xl text-white font-semibold ${accentBtn} disabled:opacity-50`}
                          >
                            Dalej →
                          </button>
                        )}
                      </div>

                      {isMobile && (
                        <p className="mt-2 text-xs text-black/60">
                          Przewiń niżej, aby zobaczyć podsumowanie, zgody i
                          przycisk „✅ Zamawiam”.
                        </p>
                      )}

                      {/* MOBILE: podsumowanie + zgody + Turnstile */}
                      {isMobile && (
                        <div className="mt-3 space-y-4">
                          {/* Podsumowanie cen */}
                          <div className="rounded-2xl border border-black/10 bg-white p-4 space-y-2">
                            <h4 className="text-lg font-semibold">Podsumowanie</h4>

<p className="text-[11px] text-black/60">
  {selectedOption === "delivery"
    ? "Sposób: dostawa"
    : selectedOption === "takeaway"
    ? "Sposób: odbiór osobisty"
    : "Sposób: —"}
</p>

{/* Lista pozycji (żeby było widać co wybrane) */}
<div className="space-y-2 max-h-[180px] overflow-y-auto border-y border-black/10 py-2">
  {items.length === 0 ? (
    <p className="text-sm text-black/60 text-center">Brak produktów.</p>
  ) : (
    items.map((it: any, i: number) => {
      const label = withCategoryPrefix(it.name, productCategory(it.name));
      const qty = it.quantity || 1;
      return (
        <div key={i} className="flex justify-between text-sm">
          <span className="truncate pr-2">
            {label} ×{qty}
          </span>
          <span>{getItemLineTotal(it).toFixed(2)} zł</span>
        </div>
      );
    })
  )}
</div>

<div className="space-y-1 text-sm">
  <div className="flex justify-between">
    <span>Produkty:</span>
    <span>{baseTotal.toFixed(2)} zł</span>
  </div>

  {selectedOption && (
    <div className="flex justify-between">
      <span>Opakowanie:</span>
      <span>{packagingUnit.toFixed(2)} zł</span>
    </div>
  )}

  {/* Dostawa: pokazuj zawsze przy delivery (fallback gdy jeszcze nie policzona) */}
  {selectedOption === "delivery" && (
    <div className="flex justify-between">
      <span>Dostawa:</span>
      <span>
        {deliveryInfo && typeof deliveryInfo.cost === "number"
          ? `${deliveryInfo.cost.toFixed(2)} zł`
          : "—"}
      </span>
    </div>
  )}

                              {selectedOption === "delivery" && deliveryInfo && (
  <div className="flex justify-between">
    <span>Dostawa:</span>
    <span>{deliveryInfo.cost.toFixed(2)} zł</span>
  </div>
)}
                            </div>

                            {/* LOYALTY – MOBILE */}
                            {isLoggedIn && (
                              <div className="mt-2">
                                {loyaltyLoading ? (
                                  <p className="text-[11px] text-black/60">
                                    Sprawdzamy Twoje naklejki...
                                  </p>
                                ) : (
                                  typeof loyaltyStickers === "number" && (
                                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs space-y-2">
                                      <div>
                                        Masz{" "}
                                        <b>{loyaltyStickers}</b> naklejek w
                                        programie lojalnościowym.
                                      </div>

                                      {canUseLoyalty4 && (
                                        <div className="space-y-1">
                                          <div className="font-semibold text-sm">
                                            Czy chcesz wymienić 4 naklejki na
                                            darmową rolkę?
                                          </div>
                                          <label className="flex items-center gap-2">
                                            <input
                                              type="radio"
                                              name="loyalty_choice_mobile"
                                              value="use_4"
                                              checked={
                                                loyaltyChoice === "use_4"
                                              }
                                              onChange={() =>
                                                setLoyaltyChoice("use_4")
                                              }
                                            />
                                            <span>
                                              Tak, wykorzystaj 4 naklejki w tym
                                              zamówieniu.
                                            </span>
                                          </label>
                                          <label className="flex items-center gap-2">
                                            <input
                                              type="radio"
                                              name="loyalty_choice_mobile"
                                              value="keep"
                                              checked={
                                                loyaltyChoice === "keep"
                                              }
                                              onChange={() =>
                                                setLoyaltyChoice("keep")
                                              }
                                            />
                                            <span>
                                              Nie teraz, zbieram dalej.
                                            </span>
                                          </label>
                                        </div>
                                      )}

                                      {!canUseLoyalty4 &&
                                        hasAutoLoyaltyDiscount && (
                                          <div className="font-semibold text-sm">
                                            Masz już co najmniej 8 naklejek –
                                            rabat lojalnościowy doliczymy przy
                                            realizacji zamówienia.
                                          </div>
                                        )}
                                    </div>
                                  )
                                )}
                              </div>
                            )}

                            <PromoSection
                              promo={promo}
                              promoError={promoError}
                              onApply={applyPromo}
                              onClear={clearPromo}
                            />

                            {discount > 0 && (
                              <div className="flex justify-between text-sm text-green-700">
                                <span>Rabat:</span>
                                <span>-{discount.toFixed(2)} zł</span>
                              </div>
                            )}

                            <div className="flex justify-between font-semibold border-t border-black/10 pt-2">
                              <span>RAZEM:</span>
                              <span>
                                {totalWithDelivery.toFixed(2)} zł
                              </span>
                            </div>

                            {selectedOption === "delivery" && (
  <p className="text-[11px] text-black/60 text-center mt-1">
    {deliveryInfo?.eta ? `ETA: ${deliveryInfo.eta}` : "ETA: wybierz adres, aby policzyć dostawę"}
  </p>
)}
                          </div>

                          {/* Potwierdzenia + Turnstile */}
                          <div className="rounded-2xl border border-black/10 bg-gray-50 p-4 space-y-3">
                            <h4 className="text-lg font-semibold">
                              Potwierdzenia
                            </h4>
                            <div className="space-y-3">
                              {LegalConsent}
                              <label className="flex items-start gap-2 text-xs leading-5 text-black">
                                <input
                                  type="checkbox"
                                  checked={confirmCityOk}
                                  onChange={(e) =>
                                    setConfirmCityOk(e.target.checked)
                                  }
                                  className="mt-0.5"
                                />
                                <span>
                                  Uwaga: składasz zamówienie do restauracji w{" "}
                                  <b>{restaurantCityLabel}</b>. Potwierdzam, że
                                  to prawidłowe miasto.
                                </span>
                              </label>

                              {TURNSTILE_SITE_KEY ? (
                                <div>
                                  <h4 className="font-semibold mb-1">
                                    Weryfikacja
                                  </h4>
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
                                  Weryfikacja Turnstile wyłączona (brak
                                  klucza).
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
                                  (TURNSTILE_SITE_KEY
                                    ? !turnstileToken
                                    : false)
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
                      )}
                    </div>
                  )}

                  {/* KROK 4 DESKTOP: podsumowanie + pałeczki */}
{!isMobile && checkoutStep === 4 && (
                    <div className="space-y-6">
                      <h3 className="text-2xl font-bold text-center">
                        Podsumowanie
                      </h3>

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
                                restaurantSlug={restaurantSlug}
                                helpers={productHelpers}
                                dbOptionsByProductId={dbOptionsByProductId}
                              />
                              <textarea
                                className="w-full text-xs border border-black/15 rounded-xl px-2 py-1 bg-white"
                                placeholder="Notatka do produktu (np. alergie, zamiany składników)"
                                value={notes[idx] || ""}
                                onChange={(e) =>
                                  setNotes({
                                    ...notes,
                                    [idx]: e.target.value,
                                  })
                                }
                              />
                            </div>
                          ))}
                          {items.length === 0 && (
                            <p className="text-center text-black/60">
                              Brak produktów w koszyku.
                            </p>
                          )}
                        </div>
                      </div>

                      <ChopsticksControl
                        value={chopsticksQty}
                        onChange={setChopsticksQty}
                      />

                      {/* NOWE: przycisk cofnięcia do kroku 2 (dane kontaktowe) */}
                      <div className="flex justify-between mt-2">
                        <button
                          type="button"
                          onClick={() => goToStep(3)}
                          className="px-4 py-2 rounded-xl border border-black/15"
                        >
                          ← Cofnij
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* PASEK BOCZNY PODSUMOWANIA (DESKTOP) */}
            {!orderSent && (
              <aside className="hidden lg:flex">
                <div className="sticky top-4 w-[340px] mx-auto border border-black/10 bg-white p-5 shadow-xl text-black space-y-4 text-left">
                  <h4 className="text-xl font-bold text-center">
                    Podsumowanie
                  </h4>

                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {items.length === 0 ? (
                      <p className="text-sm text-black/60 text-center">
                        Brak produktów.
                      </p>
                    ) : (
                      items.map((it: any, i: number) => {
                        const label = withCategoryPrefix(
                          it.name,
                          productCategory(it.name)
                        );
                        return (
                          <div
                            key={i}
                            className="flex justify-between text-sm"
                          >
                            <span className="truncate pr-2">
                              {label} ×{it.quantity || 1}
                            </span>
                            <span>
                              {getItemLineTotal(it).toFixed(2)} zł
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="flex justify-between">
                    <span>Produkty:</span>
                    <span>{baseTotal.toFixed(2)} zł</span>
                  </div>
                  {selectedOption && (
                    <div className="flex justify-between">
                      <span>Opakowanie:</span>
                      <span>{packagingUnit.toFixed(2)} zł</span>
                    </div>
                  )}
                  {deliveryInfo && (
                    <div className="flex justify-between">
                      <span>Dostawa:</span>
                      <span>{deliveryInfo.cost.toFixed(2)} zł</span>
                    </div>
                  )}

                  {/* LOYALTY – DESKTOP */}
                  {isLoggedIn && (
                    <div className="mt-2">
                      {loyaltyLoading ? (
                        <p className="text-[11px] text-black/60 text-center">
                          Sprawdzamy Twoje naklejki...
                        </p>
                      ) : (
                        typeof loyaltyStickers === "number" && (
                          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs space-y-2">
                            <div className="text-center">
                              Masz <b>{loyaltyStickers}</b> naklejek w
                              programie lojalnościowym.
                            </div>

                            {canUseLoyalty4 && (
                              <div className="space-y-1">
                                <div className="font-semibold text-sm text-center">
                                  Czy chcesz wymienić 4 naklejki na darmową
                                  rolkę?
                                </div>
                                <label className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name="loyalty_choice_desktop"
                                    value="use_4"
                                    checked={loyaltyChoice === "use_4"}
                                    onChange={() =>
                                      setLoyaltyChoice("use_4")
                                    }
                                  />
                                  <span>
                                    Tak, wykorzystaj 4 naklejki w tym
                                    zamówieniu.
                                  </span>
                                </label>
                                <label className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name="loyalty_choice_desktop"
                                    value="keep"
                                    checked={loyaltyChoice === "keep"}
                                    onChange={() =>
                                      setLoyaltyChoice("keep")
                                    }
                                  />
                                  <span>Nie teraz, zbieram dalej.</span>
                                </label>
                              </div>
                            )}

                            {!canUseLoyalty4 && hasAutoLoyaltyDiscount && (
                              <div className="font-semibold text-sm text-center">
                                Masz już co najmniej 8 naklejek – rabat
                                lojalnościowy doliczymy przy realizacji
                                zamówienia.
                              </div>
                            )}
                          </div>
                        )
                      )}
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
                    <p className="text-xs text-black/60 text-center">
                      ETA: {deliveryInfo.eta}
                    </p>
                  )}

                  <div className="space-y-2">
                    {LegalConsent}
                    <label className="flex items-start gap-2 text-xs leading-5 text-black">
                      <input
                        type="checkbox"
                        checked={confirmCityOk}
                        onChange={(e) =>
                          setConfirmCityOk(e.target.checked)
                        }
                        className="mt-0.5"
                      />
                      <span>
                        Uwaga: składasz zamówienie do restauracji w{" "}
                        <b>{restaurantCityLabel}</b>. Potwierdzam, że to
                        prawidłowe miasto.
                      </span>
                    </label>

                    <p className="text-[11px] text-black/60 text-center">
                      Dzisiejsze godziny w {restaurantCityLabel}:{" "}
                      {openInfo.label}
                    </p>

                    {TURNSTILE_SITE_KEY ? (
                      <div className="mt-1">
                        <h4 className="font-semibold mb-1">
                          Weryfikacja
                        </h4>
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
                          (TURNSTILE_SITE_KEY
                            ? !turnstileToken
                            : false)
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