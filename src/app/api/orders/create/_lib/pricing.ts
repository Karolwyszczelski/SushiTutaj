import "server-only";
import { computeAddonPriceBackend } from "@/lib/addons";
import type { ProductRow } from "./products";

/* ================= SAUCE PRICING (SERVER) ================= */

const SOY_SAUCE_CANON = "Sos sojowy";

const BASE_SAUCES_SERVER = [
  "Sos sojowy",
  "Teryiaki",
  "Spicy Mayo",
  "Mango",
  "Sriracha",
  "Żurawina",
] as const;

const BATATA_SAUCES_SERVER = ["Sos czekoladowy", "Sos toffi"] as const;

const ALL_SAUCES_SERVER = [...BASE_SAUCES_SERVER, ...BATATA_SAUCES_SERVER] as const;

// deterministyczna kolejność do reguły COUNT
const SAUCE_PRIORITY_SERVER: string[] = [
  "Sos sojowy",
  "Teryiaki",
  "Spicy Mayo",
  "Mango",
  "Sriracha",
  "Żurawina",
  "Sos czekoladowy",
  "Sos toffi",
];

type SauceRuleServer =
  | { kind: "none"; eligible: string[] }
  | { kind: "count"; eligible: string[]; freeCount: number }
  | { kind: "perSauce"; eligible: string[]; freeBySauce: Record<string, number> };

export function normalizePlainServer(input: string): string {
  return (input || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase();
}

function sauceKeyServer(s: string) {
  return normalizePlainServer(s).replace(/[^a-z0-9]/g, "");
}

const SAUCE_CANON_BY_KEY = (() => {
  const m = new Map<string, string>();
  for (const s of ALL_SAUCES_SERVER) m.set(sauceKeyServer(s), String(s));

  // aliasy:
  m.set(sauceKeyServer("Teriyaki"), "Teryiaki");
  m.set(sauceKeyServer("Teriyaki sauce"), "Teryiaki");
  return m;
})();

function canonicalSauceNameServer(label: string): string | null {
  const k = sauceKeyServer(label || "");
  return SAUCE_CANON_BY_KEY.get(k) || null;
}

function extractInlineQty(label: string): { base: string; qty: number } {
  const raw = (label ?? "").toString().trim();
  if (!raw) return { base: "", qty: 0 };

  // suffix: "coś ×2" / "coś x 2"
  const mSuffix = raw.match(/^(.*?)(?:\s*[×x]\s*)(\d+)\s*$/i);
  if (mSuffix) {
    const base = (mSuffix[1] ?? "").trim();
    const qty = Math.max(1, parseInt(mSuffix[2] ?? "1", 10));
    return { base, qty };
  }

  // prefix: "2× coś" / "2 x coś"
  const mPrefix = raw.match(/^(\d+)(?:\s*[×x]\s*)(.*)$/i);
  if (mPrefix) {
    const qty = Math.max(1, parseInt(mPrefix[1] ?? "1", 10));
    const base = (mPrefix[2] ?? "").trim();
    return { base, qty };
  }

  return { base: raw, qty: 1 };
}

function addonDisplayNameForRules(label: string): string {
  const s = (label ?? "").toString();

  // DBMOD|group|id|price|NAME
  if (s.startsWith("DBMOD|")) {
    const parts = s.split("|");
    if (parts.length >= 5) return parts.slice(4).join("|").trim();
  }
  // DBVAR|... (na przyszłość)
  if (s.startsWith("DBVAR|")) {
    const parts = s.split("|");
    if (parts.length >= 5) return parts.slice(4).join("|").trim();
  }

  // usuń dopiski cenowe na końcu
  return s
    .replace(/\s*\(\s*\+\s*\d+[.,]?\d*\s*zł\s*\)\s*$/i, "")
    .replace(/\s*\+\s*\d+[.,]?\d*\s*zł\s*$/i, "")
    .trim();
}

function getSaucesForProductNameServer(itemName: string, restaurantSlug: string): string[] {
  const city = (restaurantSlug || "").toLowerCase();
  const full = normalizePlainServer(itemName || "");

  const isSweetPotato =
    (city === "szczytno" || city === "przasnysz") &&
    (full.includes("frytki z batat") || full.includes("frytki batat"));

  return isSweetPotato
    ? ["Spicy Mayo", "Teryiaki", "Sos czekoladowy", "Sos toffi"]
    : Array.from(BASE_SAUCES_SERVER);
}

function parseSetNumberServer(namePlain: string): number | null {
  const m = namePlain.match(/\bzestaw[\s\-]*([0-9]{1,3})\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function getFreeSoyCountForItem(itemName: string, subcat?: string): number {
  const namePlain = normalizePlainServer(itemName);
  const subPlain = normalizePlainServer(subcat || "");

  if (/\b100\s*szt\b/i.test(namePlain) || /\b100szt\b/i.test(namePlain)) return 4;

  const setNo = parseSetNumberServer(namePlain);
  if (setNo != null) {
    if (setNo >= 1 && setNo <= 7) return 1;
    if (setNo >= 8 && setNo <= 12) return 2;
    if (setNo === 13) return 3;
  }

  if (namePlain.includes("tutaj specjal") || namePlain.includes("turtaj specjal")) return 2;
  if (namePlain.includes("zestaw miesiaca")) return 1;
  if (namePlain.includes("nigiri set") || namePlain.includes("set nigiri")) return 1;
  if (/\blunch[\s\-]*[123]\b/i.test(namePlain)) return 1;
  if (/\bvege[\s\-]*set[\s\-]*[12]\b/i.test(namePlain)) return 1;

  const isSetLike =
    subPlain === "zestawy" ||
    subPlain.includes("specja") ||
    namePlain.includes("zestaw") ||
    namePlain.includes(" set ") ||
    namePlain.includes("lunch") ||
    /\bset\b/i.test(namePlain);

  return isSetLike ? 1 : 0;
}

function getSauceRuleForItemServer(params: {
  itemName: string;
  subcat?: string;
  restaurantSlug: string;
}): SauceRuleServer {
  const itemName = params.itemName || "";
  const namePlain = normalizePlainServer(itemName);
  const subPlain = normalizePlainServer(params.subcat || "");
  const saucesForProduct = getSaucesForProductNameServer(itemName, params.restaurantSlug);

  const isTempuraMix = namePlain.includes("tempura mix");
  const isShrimpTempura =
    namePlain.includes("krewetki w tempurze") ||
    namePlain.includes("krewetka w tempurze");

  if (isTempuraMix || isShrimpTempura) {
    return {
      kind: "perSauce",
      eligible: saucesForProduct,
      freeBySauce: { Teryiaki: 1, "Spicy Mayo": 1 },
    };
  }

  const isSweetPotato =
    saucesForProduct.length === 4 &&
    (namePlain.includes("frytki z batat") || namePlain.includes("frytki batat"));

  if (isSweetPotato) {
    return { kind: "count", eligible: saucesForProduct, freeCount: 1 };
  }

  const isSetLike =
    subPlain === "zestawy" ||
    subPlain.includes("specja") ||
    namePlain.includes("zestaw") ||
    namePlain.includes(" set ") ||
    namePlain.includes("lunch") ||
    /\bset\b/i.test(namePlain);

  if (isSetLike) {
    const freeSoy = Math.max(0, getFreeSoyCountForItem(itemName, params.subcat) || 1);
    return {
      kind: "perSauce",
      eligible: saucesForProduct,
      freeBySauce: { [SOY_SAUCE_CANON]: freeSoy },
    };
  }

  // single rolls => 1 sos gratis (COUNT)
  // UWAGA: "hosomak" bez "i" też musi pasować (nazwa może być "Hosomak Łosoś")
  const isSingleRoll =
    !isSetLike &&
    (subPlain.includes("rolk") ||
      subPlain.includes("uramaki") ||
      subPlain.includes("futomaki") ||
      subPlain.includes("futomak") ||
      subPlain.includes("hosomaki") ||
      subPlain.includes("hosomak") ||
      subPlain.includes("maki") ||
      namePlain.includes("roll") ||
      namePlain.includes("uramaki") ||
      namePlain.includes("futomaki") ||
      namePlain.includes("futomak") ||
      namePlain.includes("hosomaki") ||
      namePlain.includes("hosomak") ||
      namePlain.includes("maki"));

  if (isSingleRoll) {
    return { kind: "count", eligible: saucesForProduct, freeCount: 1 };
  }

  return { kind: "none", eligible: saucesForProduct };
}

function sauceUnitPriceServer(canonSauceName: string): number {
  const p = Number(computeAddonPriceBackend(canonSauceName));
  return Number.isFinite(p) && p > 0 ? p : 2;
}

function computeSauceCostServer(
  sauceCounts: Map<string, number>,
  rule: SauceRuleServer
): number {
  if (!sauceCounts || sauceCounts.size === 0) return 0;

  const eligible = Array.isArray(rule?.eligible) ? rule.eligible : [];
  const eligibleSet = new Set(eligible);

  let nonEligibleCost = 0;
  const countsEligible = new Map<string, number>();

  for (const [s, qRaw] of sauceCounts.entries()) {
    const q = Math.max(0, Math.floor(Number(qRaw || 0)));
    if (!q) continue;

    if (!eligibleSet.has(s)) nonEligibleCost += q * sauceUnitPriceServer(s);
    else countsEligible.set(s, q);
  }

  let eligibleCost = 0;

  if (rule.kind === "none") {
    for (const [s, q] of countsEligible.entries()) eligibleCost += q * sauceUnitPriceServer(s);
    return eligibleCost + nonEligibleCost;
  }

  if (rule.kind === "perSauce") {
    const fb = rule.freeBySauce || {};
    for (const [s, q] of countsEligible.entries()) {
      const free = Math.max(0, Math.floor(Number(fb[s] ?? 0)));
      const freeUsed = Math.min(q, free);
      const charged = Math.max(0, q - freeUsed);
      eligibleCost += charged * sauceUnitPriceServer(s);
    }
    return eligibleCost + nonEligibleCost;
  }

  let freeRemaining = Math.max(0, Math.floor(Number(rule.freeCount || 0)));

  const ordered = [
    ...SAUCE_PRIORITY_SERVER.filter((s) => countsEligible.has(s)),
    ...Array.from(countsEligible.keys()).filter((s) => !SAUCE_PRIORITY_SERVER.includes(s)),
  ];

  for (const s of ordered) {
    const q = countsEligible.get(s) ?? 0;
    const freeUsed = Math.min(q, freeRemaining);
    freeRemaining -= freeUsed;
    const charged = Math.max(0, q - freeUsed);
    eligibleCost += charged * sauceUnitPriceServer(s);
  }

  return eligibleCost + nonEligibleCost;
}

export function computeAddonsCostBackend(
  addonsAny: any,
  itemName: string,
  subcat?: string,
  restaurantSlug?: string
): number {
  let labels: string[] = [];

  if (Array.isArray(addonsAny)) {
    labels = addonsAny.filter(Boolean).map((x) => String(x));
  } else if (typeof addonsAny === "string") {
    labels = addonsAny.trim() ? [addonsAny] : [];
  } else if (addonsAny && typeof addonsAny === "object") {
    for (const [k, v] of Object.entries(addonsAny)) {
      if (!k) continue;
      if (typeof v === "number" && Number.isFinite(v)) labels.push(`${k} ×${Math.max(1, Math.floor(v))}`);
      else if (typeof v === "string") {
        const m = v.match(/\d+/);
        const q = m ? Math.max(1, parseInt(m[0], 10)) : 1;
        labels.push(`${k} ×${q}`);
      } else if (v === true) labels.push(k);
    }
  }

  const expanded: string[] = [];
  for (const label of labels) {
    const { base, qty } = extractInlineQty(label);
    if (!base || qty <= 0) continue;
    for (let i = 0; i < qty; i++) expanded.push(base);
  }

  const sauceCounts = new Map<string, number>();
  let otherCost = 0;

  for (const rawLabel of expanded) {
    const displayName = addonDisplayNameForRules(rawLabel);
    const sauceCanon = canonicalSauceNameServer(displayName);

    if (sauceCanon) {
      sauceCounts.set(sauceCanon, (sauceCounts.get(sauceCanon) ?? 0) + 1);
      continue;
    }

    const isDbEncoded = rawLabel.startsWith("DBMOD|") || rawLabel.startsWith("DBVAR|");
    // Przekaż nazwę produktu żeby poprawnie policzyć cenę wersji pieczonej
    otherCost += computeAddonPriceBackend(isDbEncoded ? rawLabel : displayName, itemName);
  }

  const rule = getSauceRuleForItemServer({
    itemName,
    subcat,
    restaurantSlug: restaurantSlug || "",
  });

  const sauceCost = computeSauceCostServer(sauceCounts, rule);
  return otherCost + sauceCost;
}

export function recomputeTotalFromItems(
  itemsPayload: any[],
  productsMap: Map<string, ProductRow>,
  restaurantSlug: string
): number {
  return (itemsPayload || []).reduce((acc, it) => {
    const qty = it?.quantity || 1;

    const base =
      typeof it?.unit_price === "string" ? parseFloat(it.unit_price) : it?.unit_price || 0;

    const itemName = String(it?.name ?? it?.product?.name ?? "");
    const pid = String(it?.product_id ?? it?.productId ?? it?.id ?? "");
    const db = pid ? productsMap.get(pid) : undefined;

    const subcat = String(
      db?.subcategory ?? db?.category ?? it?.product?.subcategory ?? it?.product?.category ?? ""
    );

    const a1 = it?.addons;
    const a2 = it?.options?.addons;

    const addonsAny =
      Array.isArray(a1) || Array.isArray(a2)
        ? [...(Array.isArray(a1) ? a1 : []), ...(Array.isArray(a2) ? a2 : [])]
        : a2 ?? a1;

    const addonsCost = computeAddonsCostBackend(addonsAny, itemName, subcat, restaurantSlug);
    return acc + (base + addonsCost) * qty;
  }, 0);
}
