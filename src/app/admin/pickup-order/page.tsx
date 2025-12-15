// src/app/admin/pickup-order/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import EditOrderButton from "@/components/EditOrderButton";
import CancelButton from "@/components/CancelButton";
import clsx from "clsx";
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  type PushStatus =
  | "checking"
  | "subscribed"
  | "idle"
  | "not-allowed"
  | "unsupported"
  | "error";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw =
    typeof window !== "undefined"
      ? window.atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
  const outputArray = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) outputArray[i] = raw.charCodeAt(i);
  return outputArray;
}

type Any = Record<string, any>;
type PaymentMethod = "Gotówka" | "Terminal" | "Online";
type PaymentStatus = "pending" | "paid" | "failed" | null;

interface Order {
  id: string;
  name?: string;
  total_price: number;
  delivery_cost?: number | null;
  created_at: string;
  status: "new" | "pending" | "placed" | "accepted" | "cancelled" | "completed";
  clientDelivery?: string;
  deliveryTime?: string;
  address?: string;
  street?: string;
  flat_number?: string;
  city?: string;
  phone?: string;
  items?: any;
  order_items?: any;
  selected_option?: "takeaway" | "delivery";
  payment_method?: PaymentMethod;
  payment_status?: PaymentStatus;
  client_delivery_time?: string | null;
  scheduled_delivery_at?: string | null;

  /** NOWE: notatka klienta / dla lokalu */
  note?: string | null;
  /** (opcjonalnie) notatka kuchni z kolumny kitchen_note */
  kitchen_note?: string | null;


  // rabaty / kody / lojalność
  promo_code?: string | null;
  discount_amount?: number | null;
  loyalty_stickers_before?: number | null;
  loyalty_stickers_after?: number | null;
  loyalty_applied?: boolean | null;
  loyalty_reward_type?: string | null;
  loyalty_reward_value?: number | null;
  loyalty_min_order?: number | null;

  // rezerwacja
  reservation_id?: string | null;
  reservation_date?: string | null;
  reservation_time?: string | null;

  // liczba pałeczek – tylko do odczytu
  chopsticks?: number | null;
}

/* mapowanie płatności */
const fromDBPaymentMethod = (v: any): PaymentMethod => {
  const s = String(v ?? "").toLowerCase();
  if (["online", "p24", "blik", "card", "karta"].includes(s)) return "Online";
  if (s === "terminal") return "Terminal";
  return "Gotówka";
};
const toDBPaymentMethod = (v: PaymentMethod): string =>
  v === "Online" ? "online" : v === "Terminal" ? "terminal" : "cash";

const fromDBPaymentStatus = (v: any): PaymentStatus => {
  const s = String(v ?? "").toLowerCase();
  if (["paid", "success", "succeeded"].includes(s)) return "paid";
  if (["failed", "error"].includes(s)) return "failed";
  if (["pending", "processing", "inprogress", "authorized", "auth"].includes(s))
    return "pending";
  return null;
};

const TZ = "Europe/Warsaw";

const normalizeHHMM = (v: string): string | null => {
  const m = (v || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

/**
 * Buduje ISO (UTC) dla podanej godziny HH:MM w strefie TZ.
 * Jeśli wybrana godzina jest już „w przeszłości” dzisiaj — ustawia na jutro.
 */
const buildIsoFromHHMMInTZ = (hhmm: string, tz = TZ): string | null => {
  const norm = normalizeHHMM(hhmm);
  if (!norm) return null;

  const [hStr, mStr] = norm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);

  const now = new Date();
  const nowTz = toZonedTime(now, tz);

  const targetTz = new Date(nowTz);
  targetTz.setHours(h, m, 0, 0);

  if (targetTz.getTime() <= nowTz.getTime()) {
    targetTz.setDate(targetTz.getDate() + 1);
  }

  const utc = fromZonedTime(targetTz, tz);
  return utc.toISOString();
};

const buildIsoForOrderHHMM = (order: Order, hhmm: string, tz = TZ): string | null => {
  const norm = normalizeHHMM(hhmm);
  if (!norm) return null;

  const [hStr, mStr] = norm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);

  // Jeżeli klient podał konkretną DATĘ+GODZINĘ (scheduled_delivery_at),
  // to bierzemy datę z tego pola i ustawiamy tylko godzinę HH:MM w tej dacie.
  const baseDt = order.scheduled_delivery_at ? parseLooseDate(order.scheduled_delivery_at) : null;

  if (baseDt) {
    const baseTz = toZonedTime(baseDt, tz);
    const targetTz = new Date(baseTz);
    targetTz.setHours(h, m, 0, 0);
    const utc = fromZonedTime(targetTz, tz);
    return utc.toISOString();
  }

  // Fallback: buduj na dziś/jutro
  return buildIsoFromHHMMInTZ(norm, tz);
};

const hasClientFixedTime = (o: Order) => {
  const t = formatClientRequestedTime(o);
  return t !== "-" && t !== "Jak najszybciej";
};


const parseLooseDate = (value: string): Date | null => {
  const v = (value || "").trim();
  if (!v) return null;

  // "2025-12-12 19:00:00+00" -> "2025-12-12T19:00:00+00"
  let s = v.replace(" ", "T");

  // "+0000" -> "+00:00" (jeśli kiedyś przyjdzie bez dwukropka)
  s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatTimeLabel = (value?: string | null): string => {
  if (!value) return "-";

  const v = value.trim();
  const vLower = v.toLowerCase();
  if (vLower === "asap") return "Jak najszybciej";

  // 1) goła godzina "HH:MM" albo "H:MM"
  const m = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h < 24 && min >= 0 && min < 60) {
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }

  // 2) ISO / timestamptz (bezpiecznie)
  const dt = parseLooseDate(v);
  if (dt) return formatInTimeZone(dt, TZ, "HH:mm");

  return "-";
};

const formatClientRequestedTime = (o: Order): string => {
  // 1) jeśli klient wybrał konkretną datę/godzinę -> scheduled_delivery_at
  if (o.scheduled_delivery_at) return formatTimeLabel(o.scheduled_delivery_at);

  // 2) jeśli nie, to "asap" albo "HH:MM" z client_delivery_time
  if (o.client_delivery_time) return formatTimeLabel(o.client_delivery_time);

  // 3) kompatybilność wstecz (stare pole)
  return formatTimeLabel(o.clientDelivery ?? null);
};

const getOptionLabel = (opt?: Order["selected_option"]) =>
  opt === "delivery"
    ? "DOSTAWA"
    : opt === "takeaway"
    ? "NA WYNOS"
    : "BRAK";

const statusTone = (s: Order["status"]) =>
  s === "accepted"
    ? "ring-blue-200 bg-blue-50"
    : s === "cancelled"
    ? "ring-rose-200 bg-rose-50"
    : s === "completed"
    ? "ring-slate-200 bg-slate-50"
    : "ring-amber-200 bg-amber-50";

const toNumber = (x: any, d = 0) => {
  if (typeof x === "number" && !isNaN(x)) return x;
  const n = Number(x);
  return isFinite(n) ? n : d;
};

const parseProducts = (itemsData: any): any[] => {
  if (!itemsData) return [];
  if (typeof itemsData === "string") {
    try {
      return parseProducts(JSON.parse(itemsData));
    } catch {
      return itemsData
        .split(",")
        .map((n) => ({ name: n.trim(), quantity: 1, price: 0 }));
    }
  }
  if (Array.isArray(itemsData)) return itemsData;
  if (typeof itemsData === "object") {
    const keys = [
      "items",
      "order_items",
      "cart",
      "positions",
      "products",
      "lines",
    ];
    for (const k of keys)
      if (Array.isArray((itemsData as any)[k]))
        return (itemsData as any)[k];
    return [itemsData];
  }
  return [];
};

const collectStrings = (val: any): string[] => {
  if (!val) return [];
  if (typeof val === "string") return [val];
  if (Array.isArray(val))
    return val.flatMap((v) => collectStrings(v)).filter(Boolean);
  if (typeof val === "object") {
    const truthy = Object.entries(val)
      .filter(([, v]) => v === true || v === 1 || v === "1")
      .map(([k]) => k);
    if (truthy.length) return truthy;
    if ((val as any).items && Array.isArray((val as any).items))
      return collectStrings((val as any).items);
    const preferred = ["name", "title", "label", "value", "option", "variant"]
      .map((k) =>
        typeof (val as any)[k] === "string" ? (val as any)[k] : undefined
      )
      .filter(Boolean) as string[];
    if (preferred.length) return preferred;
  }
  return [];
};

const ADDON_LABEL_KEYS = [
  "label",
  "name",
  "title",
  "value",
  "option",
  "variant",
  "sauce",
  "sos",
  "sauce_name",
  "sos_name",
];

const ADDON_QTY_KEYS = ["qty", "quantity", "count", "times", "amount", "x"];

const PRICE_LIKE_KEYS = [
  "price",
  "unit_price",
  "total_price",
  "amount_price",
  "value_price",
  "cost",
  "fee",
  "surcharge",
  "dopłata",
];

const hasPriceLike = (obj: Any) =>
  PRICE_LIKE_KEYS.some((k) => obj && obj[k] != null && obj[k] !== "");

const readAddonQty = (obj: Any): number | null => {
  // qty/quantity/count/times traktujemy jako ilość zawsze,
  // amount/x tylko jeśli obiekt NIE wygląda na cenowy (żeby nie robić Tempura ×2 gdy 2 to dopłata)
  const priceLike = hasPriceLike(obj);

  for (const k of ADDON_QTY_KEYS) {
    if ((k === "amount" || k === "x") && priceLike) continue;

    const n = asPosInt(obj?.[k]);
    if (n != null) return n;
  }
  return null;
};


const asPosInt = (v: any): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
};

const hasQtySuffix = (s: string) => /\b(?:x|×)\s*\d+\b/i.test(s);

const stripNoteBeforePipe = (v?: string | null) => {
  if (!v) return undefined;
  const left = String(v).split("|")[0].trim();
  return left || undefined;
};


const normalizeLabelKey = (s: string) =>
  (s || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const extractExplicitQty = (label: string) => {
  const t = (label || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  // obsłuż "x2", "×2", "x 2", "× 2"
  const m = t.match(/\b(?:x|×)\s*(\d+)\b/i);
  if (!m) return { base: t, qty: 1, hasExplicit: false };

  const qty = Math.max(1, parseInt(m[1], 10) || 1);
  const base = t.replace(m[0], "").trim();
  return { base, qty, hasExplicit: true };
};

/**
 * Dedupe po "bazowej nazwie" dodatku.
 * - NIE sumuje duplikatów z różnych pól (bo to zwykle ten sam wybór zapisany 2×).
 * - Jeśli gdziekolwiek przyjdzie jawne ×N (lub qty), bierze największe N.
 */
const isSauceLabel = (s: string) => /\b(sos|sauce)\b/i.test(s || "");

/**
 * Sumuje duplikaty po "bazowej nazwie" dodatku.
 * - Jeśli w labelu jest jawne ×N/xN -> dolicza N.
 * - Jeśli label powtarza się bez ×N -> sumuje jako +1.
 * - Dla sosów pokazuje też ×1 (żeby kuchnia widziała ilość).
 */
const collapseLabelsWithQty = (labels: string[]): string[] => {
  const map = new Map<string, { base: string; count: number }>();
  const order: string[] = [];

  for (const raw of labels || []) {
    const cleaned = (raw || "").trim().replace(/\s+/g, " ");
    if (!cleaned) continue;

    const { base, qty, hasExplicit } = extractExplicitQty(cleaned);
    const baseClean = (base || "").trim().replace(/\s+/g, " ");
    const key = normalizeLabelKey(baseClean);
    if (!key) continue;

    const inc = hasExplicit ? Math.max(1, qty) : 1;

    if (!map.has(key)) {
      map.set(key, { base: baseClean, count: inc });
      order.push(key);
    } else {
      const cur = map.get(key)!;
      cur.count += inc;
      map.set(key, cur);
    }
  }

  return order.map((k) => {
    const row = map.get(k)!;
    const showQty = row.count > 1 || isSauceLabel(row.base);
    return showQty ? `${row.base} ×${row.count}` : row.base;
  });
};

const collectAddonLabels = (val: any): string[] => {
  if (!val) return [];
  if (typeof val === "string") return [val];

  if (Array.isArray(val)) {
    return val.flatMap((v) => collectAddonLabels(v)).filter(Boolean);
  }

  if (typeof val === "object") {
    const obj: Any = val;

    // forma: { label/name/title..., qty: 2 }
    const label =
      (ADDON_LABEL_KEYS
        .map((k) => (typeof obj[k] === "string" ? obj[k].trim() : ""))
        .find(Boolean) || "") as string;

    const qty = readAddonQty(obj);

    if (label) {
      if (qty && qty > 1 && !hasQtySuffix(label)) return [`${label} ×${qty}`];
      return [label];
    }

    // forma mapy: { "Sos czosnkowy": 2, "Imbir": 1 }
    const ignore = new Set([
      ...ADDON_QTY_KEYS,
      "id",
      "sku",
      "price",
      "unit_price",
      "total_price",
      "amount_price",
      "note",
      "comment",
      "type",
    ]);

    const out: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (!k || ignore.has(k)) continue;

      if (v === true || v === 1 || v === "1") {
        out.push(k);
        continue;
      }

      const q = asPosInt(v);
      if (q !== null) {
        out.push(q > 1 && !hasQtySuffix(k) ? `${k} ×${q}` : k);
        continue;
      }

      if (typeof v === "string" && v.trim()) {
        out.push(v.trim());
        continue;
      }

      if (typeof v === "object") out.push(...collectAddonLabels(v));
    }

    if (out.length) return out;

    if (obj.items && Array.isArray(obj.items)) return collectAddonLabels(obj.items);
  }

  return [];
};


const deepFindName = (root: Any): string | undefined => {
  const skipKeys = new Set([
    "addons",
    "extras",
    "toppings",
    "ingredients",
    "options",
    "selected_addons",
  ]);
  const nameMatchers = [
    /^name$/i,
    /^title$/i,
    /^label$/i,
    /product.*name/i,
    /menu.*name/i,
    /item.*name/i,
    /^menu_item_name$/i,
    /^item_name$/i,
    /^nazwa(_pl)?$/i,
  ];
  const q: Array<{ node: any }> = [{ node: root }];
  const seen = new Set<any>();
  while (q.length) {
    const { node } = q.shift()!;
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      q.push(...node.map((n) => ({ node: n })));
      continue;
    }
    for (const [k, v] of Object.entries(node)) {
      if (skipKeys.has(k)) continue;
      if (
        typeof v === "string" &&
        nameMatchers.some((r) => r.test(k)) &&
        v.trim()
      )
        return v.trim();
      if (typeof v === "object") q.push({ node: v });
    }
  }
  return undefined;
};



/* --------- Stałe z logiki CheckoutModal dla zestawów / sushi --------- */

const RAW_SET_BAKE_ALL = "Zamiana całego zestawu na pieczony";
const RAW_SET_BAKE_ALL_LEGACY =
  "Zamiana całego zestawu surowego na pieczony (+5 zł)";
const RAW_SET_BAKE_ROLL_PREFIX = "Zamiana surowej rolki na pieczoną: ";
const SET_ROLL_EXTRA_PREFIX = "Dodatek do rolki: ";
const SET_UPGRADE_ADDON = "Powiększenie zestawu";
const SWAP_FEE_NAME = "Zamiana w zestawie";
const TARTAR_BASES = [
  "Podanie: na awokado",
  "Podanie: na ryżu",
  "Podanie: na chipsach krewetkowych",
];

type SetRollExtra = {
  roll: string;
  extras: string[];
};
type SetMeta = {
  hasSwapFee: boolean;
  bakedWholeSet: boolean;
  bakedRolls: string[];
  setUpgrade: boolean;
  rollExtras: SetRollExtra[];
};

/** Wyciąga informacje o dodatkach specyficznych dla zestawów z listy stringów */
const parseSetAddonsFromAddons = (
  allAddons: string[]
): { plain: string[]; setMeta: SetMeta | null; tartarBases: string[] } => {
  const plain: string[] = [];
  const rollExtrasMap = new Map<string, string[]>();
  const bakedRolls: string[] = [];
  let bakedWholeSet = false;
  let setUpgrade = false;
  let hasSwapFee = false;
  const tartarBases: string[] = [];

  for (const rawLabel of allAddons) {
    const a = (rawLabel || "").trim();
    if (!a) continue;

    // cały zestaw pieczony
    if (a === RAW_SET_BAKE_ALL || a === RAW_SET_BAKE_ALL_LEGACY) {
      bakedWholeSet = true;
      continue;
    }

    // pojedyncza rolka pieczona
    if (a.startsWith(RAW_SET_BAKE_ROLL_PREFIX)) {
      const roll = a.slice(RAW_SET_BAKE_ROLL_PREFIX.length).trim();
      if (roll) bakedRolls.push(roll);
      continue;
    }

    // powiększony zestaw
    if (a === SET_UPGRADE_ADDON) {
      setUpgrade = true;
      // etykieta jest czytelna – zostawiamy też w "plain"
      plain.push(a);
      continue;
    }

    // opłata za zamiany w zestawie
    if (a === SWAP_FEE_NAME) {
  hasSwapFee = true;
  continue; // NIE pokazujemy tego w UI
}

    // baza podania tatara
    if (TARTAR_BASES.includes(a)) {
      tartarBases.push(a);
      // nie dublujemy już w plain
      continue;
    }

    // dodatek do konkretnej rolki w zestawie
    if (a.startsWith(SET_ROLL_EXTRA_PREFIX)) {
      const rest = a.slice(SET_ROLL_EXTRA_PREFIX.length).trim();
      const [rollLabelRaw, extraLabelRaw] = rest.split("—");
      const rollLabel = (rollLabelRaw || "").trim();
      const extraLabel = (extraLabelRaw || "").trim();
      if (rollLabel && extraLabel) {
        const arr = rollExtrasMap.get(rollLabel) || [];
        arr.push(extraLabel);
        rollExtrasMap.set(rollLabel, arr);
      } else {
        // nie udało się sparsować – traktuj jak zwykły dodatek
        plain.push(a);
      }
      continue;
    }

    // wszystko inne zostaje zwykłym dodatkiem
    plain.push(a);
  }

  const rollExtras: SetRollExtra[] = Array.from(
    rollExtrasMap.entries()
  ).map(([roll, extras]) => ({
    roll,
    extras,
  }));

  const hasAnySetMeta =
    bakedWholeSet || bakedRolls.length || setUpgrade || rollExtras.length;

  const setMeta: SetMeta | null = hasAnySetMeta
    ? {
        hasSwapFee,
        bakedWholeSet,
        bakedRolls,
        setUpgrade,
        rollExtras,
      }
    : null;

  return { plain, setMeta, tartarBases };
};

const cleanSwapText = (s: string) =>
  (s || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");

const stripLeadingQty = (s: string) =>
  cleanSwapText(s).replace(/^\s*\d+\s*[x×]\s*/i, "");

const stripSushiTypePrefix = (s: string) =>
  cleanSwapText(s).replace(
    /^(futomaki|hosomaki|uramaki|maki|nigiri|gunkan|california)\s+/i,
    ""
  );

const swapCompareKey = (s: string) =>
  stripSushiTypePrefix(stripLeadingQty(s)).toLowerCase();

const isNoOpSwapLoose = (from?: string, to?: string) => {
  const a = swapCompareKey(from || "");
  const b = swapCompareKey(to || "");
  return !!a && !!b && a === b;
};

const parseToFromLabel = (label: string) => {
  const t = cleanSwapText(label);
  if (!t) return { to: "", from: "" };

  // obsłuż "→" i "->"
  if (t.includes("→")) {
    const [left, right] = t.split("→").map((x) => cleanSwapText(x));
    return { from: left || "", to: right || "" };
  }
  if (t.includes("->")) {
    const [left, right] = t.split("->").map((x) => cleanSwapText(x));
    return { from: left || "", to: right || "" };
  }

  return { from: "", to: t };
};

const looksLikeAutoSwapSummary = (txt: string) => {
  const t = (txt || "").trim();
  if (!t) return false;

  const arrows = (t.match(/→/g) || []).length + (t.match(/->/g) || []).length;
  if (arrows === 0) return false;

  // typowe dla generatora: wiele zamian + separatory/ilości
  if (arrows >= 2) return true;
  if (t.includes(";") || t.includes("\n")) return true;
  if (/\b\d+\s*[x×]\s*\S+/.test(t)) return true;

  return false;
};

const hasArrow = (t: string) => (t || "").includes("→") || (t || "").includes("->");

const formatSetSwapLine = (s: any) => {
  const qty =
    typeof s?.qty === "number"
      ? s.qty
      : typeof s?.qty === "string"
      ? parseInt(String(s.qty).replace(/[^\d]/g, ""), 10)
      : undefined;

  const from = cleanSwapText(s?.from || "");
  const to = cleanSwapText(s?.to || "");

  if (!to) return "";

  const prefix =
    typeof qty === "number" && Number.isFinite(qty) && qty > 1 ? `${qty}× ` : "";

  // chcemy: FROM → TO
  if (from) return `${prefix}${from} → ${to}`;

  // fallback, gdy nie mamy FROM
  return `${prefix}${to}`;
};


const normalizeProduct = (raw: Any) => {
  // jeżeli przychodzi już "spłaszczony" obiekt z _raw – używamy oryginału
  const source: Any =
    raw && typeof raw === "object" && (raw as any)._raw
      ? (raw as any)._raw
      : raw;

  // NOWE: ujednolicone źródło options (dla koszyka i panelu)
  const srcOptions: Any | undefined =
    (source as any).options || (source as any)._src?.options || undefined;

  const shallow = [
    source.name,
    source.product_name,
    source.productName,
    source.title,
    source.label,
    source.menu_item_name,
    source.item_name,
    source.nazwa,
    source.nazwa_pl,
    typeof source.product === "string" ? source.product : undefined,
    source.product?.name,
    source.item?.name,
    source.product?.title,
  ].filter((x) => typeof x === "string" && x.trim()) as string[];

  const deep = deepFindName(source);
  const name = (shallow[0] || deep || "(bez nazwy)") as string;

  const isSet =
  /\b(zestaw|set)\b/i.test(name) ||
  /^set\b/i.test(name) ||
  /zestaw\s+\d+/i.test(name);


  const price = toNumber(
    source.price ??
      source.unit_price ??
      source.total_price ??
      source.amount_price ??
      source.item?.price ??
      0
  );
  const quantity =
    toNumber(source.quantity ?? source.qty ?? source.amount ?? 1, 1) || 1;

  // --- SWAPS (pojedyncze zamiany poza zestawami) ---
  const swapsRaw =
    (Array.isArray((source as any).swaps) && (source as any).swaps) ||
    (Array.isArray(srcOptions?.swaps) && srcOptions!.swaps) ||
    [];

  type SwapDetail = { from?: string; to?: string; label: string };

  const swapDetails: SwapDetail[] = (swapsRaw as any[])
    .map((s) => {
      if (!s) return null;
      const from = typeof s.from === "string" ? s.from.trim() : "";
      const to = typeof s.to === "string" ? s.to.trim() : "";
      if (!from && !to) return null;

      if (isNoOpSwapLoose(from, to)) return null;

      let label: string;
      if (from && to) label = `Zamiana: ${from} → ${to}`;
      else if (to) label = `Zamiana na: ${to}`;
      else label = `Zamiana: ${from}`;

      return {
        from: from || undefined,
        to: to || undefined,
        label,
      };
    })
    .filter(Boolean) as SwapDetail[];

  const swapLabels = swapDetails.map((s) => s.label);

  // --- set_swaps (zamiany w ZESTAWACH) ---
  const rawSetSwaps =
    (Array.isArray((source as any).set_swaps) && (source as any).set_swaps) ||
    (Array.isArray(srcOptions?.set_swaps) && srcOptions!.set_swaps) ||
    [];

  type SetSwapDetail = { qty?: number; from?: string; to: string; label: string };

  const setSwapsBase: SetSwapDetail[] = (rawSetSwaps as any[])
    .map((s) => {
      if (!s) return null;

      const rawQty = (s as any).qty;
      const qtyNum =
        typeof rawQty === "number"
          ? rawQty
          : typeof rawQty === "string"
          ? parseInt(rawQty.replace(/[^\d]/g, ""), 10)
          : undefined;

      const lbl = typeof (s as any).label === "string" ? String((s as any).label) : "";

      let from = cleanSwapText(typeof (s as any).from === "string" ? (s as any).from : "");
      let to = cleanSwapText(typeof (s as any).to === "string" ? (s as any).to : "");


      // 1) Czasem backend wkłada "FROM → TO" do pola `to` – rozbijamy
      if (!from && to && hasArrow(to)) {
        const p = parseToFromLabel(to);
        const pf = cleanSwapText(p.from || "");
        const pt = cleanSwapText(p.to || "");
        if (pt) {
          from = pf;
          to = pt;
        }
      }

      // 2) Jeśli nadal brakuje danych – próbuj z label
      if ((!to || !from) && lbl && hasArrow(lbl)) {
        const p = parseToFromLabel(lbl);
        if (!from) from = cleanSwapText(p.from || "");
        if (!to) to = cleanSwapText(p.to || "");
      }

      // 3) Jeśli nadal brak `to`, a label jest „gołe” – traktuj label jako `to`
      if (!to && lbl && !hasArrow(lbl)) {
        to = cleanSwapText(lbl);
      }

      if (!to) return null;

      return {
        qty: qtyNum,
        from: from || undefined,
        to,
        label: "", // uzupełnimy niżej
      } as SetSwapDetail;
    })
    .filter(Boolean) as SetSwapDetail[];

  // Uzupełnij FROM z `swapsRaw` (często to tam jest pełna para)
  const setSwapsFilled: SetSwapDetail[] = setSwapsBase
    .map((ss) => {
      let from = cleanSwapText(ss.from || "");
      const to = cleanSwapText(ss.to || "");

      if (!from && to) {
        const hit = swapDetails.find(
          (d) => d?.to && swapCompareKey(d.to) === swapCompareKey(to)
        );
        if (hit?.from) from = cleanSwapText(hit.from);
      }

      // usuń pseudo-zamiany typu "Futomaki X" → "X"
      if (from && to && isNoOpSwapLoose(from, to)) return null;

      const out: SetSwapDetail = {
        ...ss,
        from: from || undefined,
        to,
        label: formatSetSwapLine({ ...ss, from: from || undefined, to }),
      };

      // jak label pusty (brak to) – nie pokazujemy
      if (!out.label) return null;

      return out;
    })
    .filter(Boolean) as SetSwapDetail[];

  // Fallback: jeśli set_swaps puste, a mamy swapDetails (i to jest zestaw) – pokaż je jako "Zamiany w zestawie"
  const setSwapsFinal: SetSwapDetail[] =
    isSet && setSwapsFilled.length === 0 && swapDetails.length > 0
      ? (swapDetails
          .map((d) => {
            const from = cleanSwapText(d.from || "");
            const to = cleanSwapText(d.to || "");
            if (!to && !from) return null;
            if (from && to && isNoOpSwapLoose(from, to)) return null;
            const label = from && to ? `${from} → ${to}` : (to || from);
            return { qty: undefined, from: from || undefined, to: to || from, label };
          })
          .filter(Boolean) as SetSwapDetail[])
      : setSwapsFilled;

  // --- DODATKI ---
  const sourceAddonLabels = [
  ...collectAddonLabels(source.addons),
  ...collectAddonLabels(source.extras),
  ...collectAddonLabels(source.sauces ?? source.sosy ?? source.sos),
  ...collectAddonLabels(source.selected_addons),
  ...collectAddonLabels(source.toppings),
]
  .map((s) => (s || "").trim())
  .filter((s) => s && s !== "0");

const optionsAddonLabels = [
  ...collectAddonLabels(srcOptions?.addons),
  ...collectAddonLabels(srcOptions?.extras),
  ...collectAddonLabels(srcOptions?.sauces ?? srcOptions?.sosy ?? srcOptions?.sos),
]
  .map((s) => (s || "").trim())
  .filter((s) => s && s !== "0");

  // preferuj top-level (source.*), a z options dobierz tylko brakujące (bez dubli)
// UWAGA: nie robimy Set() na całej liście, bo Set “zjada” potencjalne x2 –
// dedupujemy tylko options względem source.
function mergeAddonLists(source: string[] = [], options: string[] = []): string[] {
  const out: string[] = [];
  const seenBase = new Set<string>();

  const keyOf = (label: string) => {
    const cleaned = (label || "").trim().replace(/\s+/g, " ");
    if (!cleaned) return "";
    // ignoruj “×N / xN” w kluczu porównania
    const { base } = extractExplicitQty(cleaned);
    return normalizeLabelKey(base);
  };

  // 1) source: zostawiamy jak jest (nawet jeśli się powtarza)
  for (const s of source) {
    const cleaned = (s || "").trim().replace(/\s+/g, " ");
    if (!cleaned || cleaned === "0") continue;
    out.push(cleaned);
    const k = keyOf(cleaned);
    if (k) seenBase.add(k);
  }

  // 2) options: dodaj tylko jeśli nie ma już w source (po bazowej nazwie)
  for (const s of options) {
    const cleaned = (s || "").trim().replace(/\s+/g, " ");
    if (!cleaned || cleaned === "0") continue;
    const k = keyOf(cleaned);
    if (!k || seenBase.has(k)) continue;
    out.push(cleaned);
    seenBase.add(k);
  }

  return out;
}


// preferuj top-level (source.*), a z options dobierz tylko brakujące (bez dubli)
const rawAddons = mergeAddonLists(sourceAddonLabels, optionsAddonLabels);

// UWAGA: nie robimy Set() – bo Set zjada x2
const { plain: plainRaw, setMeta: setMetaRaw, tartarBases } =
  parseSetAddonsFromAddons(rawAddons);

// sklej duplikaty do “×N” (np. Sos czosnkowy ×2)
const plain = collapseLabelsWithQty(plainRaw);

const setMeta: SetMeta | null = setMetaRaw
  ? {
      ...setMetaRaw,
      rollExtras: (setMetaRaw.rollExtras || []).map((r) => ({
        ...r,
        extras: collapseLabelsWithQty(r.extras || []),
      })),
    }
  : null;

// addony tylko addony (swapy pokazujemy osobno w UI)
const addons = collapseLabelsWithQty(plain);

  const ingredients = collectStrings(source.ingredients).length
    ? collectStrings(source.ingredients)
    : collectStrings(
        source.components ??
          source.composition ??
          source.sklad ??
          source.skladniki ??
          source.ingredients_list ??
          source.product?.ingredients
      );


  const description =
    (typeof source.description === "string" && source.description) ||
    (typeof source.opis === "string" && source.opis) ||
    (typeof source.product?.description === "string" &&
      source.product.description) ||
    undefined;

  const noteCandidate =
    (typeof srcOptions?.note === "string" && srcOptions.note) ||
    (typeof srcOptions?.customer_note === "string" && srcOptions.customer_note) ||
    (typeof srcOptions?.client_note === "string" && srcOptions.client_note) ||
    (typeof srcOptions?.comment === "string" && srcOptions.comment) ||
    (typeof (source as any).item_note === "string" && (source as any).item_note) ||
    (typeof (source as any).customer_note === "string" && (source as any).customer_note) ||
    (typeof (source as any).client_note === "string" && (source as any).client_note) ||
    (typeof source.note === "string" && source.note) ||
    (typeof source.comment === "string" && source.comment) ||
    undefined;

  // jeśli to wygląda jak auto-podsumowanie zamian (a mamy setSwaps) – nie pokazujemy tego jako "Notatka"
  const noteLeft = stripNoteBeforePipe(noteCandidate);

// jeśli po lewej coś jest — zawsze pokazujemy (to jest “prawdziwa” notatka klienta)
const note =
  noteLeft ??
  (isSet && noteCandidate && looksLikeAutoSwapSummary(noteCandidate)
    ? undefined
    : (noteCandidate || "").trim() || undefined);

  return {
    name,
    price,
    quantity,
    addons,
    ingredients,
    description,
    note,
    isSet,
    swaps: swapLabels,
    swapDetails,
    setMeta: isSet && setMeta ? setMeta : null,
    tartarBases,
    setSwaps: setSwapsFinal, // <--- NOWE: uporządkowane zamiany w zestawie
    _raw: source,
  };
};

const Badge: React.FC<{
  tone: "amber" | "blue" | "rose" | "slate" | "green" | "yellow";
  children: React.ReactNode;
}> = ({ tone, children }) => {
  const cls =
    tone === "amber"
      ? "bg-amber-100 text-amber-700 ring-amber-200"
      : tone === "blue"
      ? "bg-blue-100 text-blue-700 ring-blue-200"
      : tone === "rose"
      ? "bg-rose-100 text-rose-700 ring-rose-200"
      : tone === "green"
      ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
      : tone === "yellow"
      ? "bg-yellow-100 text-yellow-800 ring-yellow-200"
      : "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}
    >
      {children}
    </span>
  );
};

const InlineCountdown: React.FC<{
  targetTime: string;
  onComplete?: () => void;
}> = ({ targetTime, onComplete }) => {
  const [ms, setMs] = useState(
    () => Math.max(0, new Date(targetTime).getTime() - Date.now())
  );

  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false; // reset przy zmianie targetTime

    const id = window.setInterval(() => {
      const left = new Date(targetTime).getTime() - Date.now();
      const clamped = Math.max(0, left);
      setMs(clamped);

      if (left <= 0 && !doneRef.current) {
        doneRef.current = true;
        window.clearInterval(id);
        onComplete?.();
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [targetTime, onComplete]);

  const sec = Math.floor(ms / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");

  return (
    <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs text-white">
      {mm}:{ss}
    </span>
  );
};

const formatMinutes = (m: number): string => {
  if (m < 60) return `${m} min`;

  const h = Math.floor(m / 60);
  const rest = m % 60;

  if (rest === 0) return `${h} h`;       // 60 → 1 h, 120 → 2 h
  return `${h} h ${rest} min`;          // 80 → 1 h 20 min, 100 → 1 h 40 min
};

const AcceptButton: React.FC<{
  order: Order;
  onAccept: (minutes: number) => Promise<void> | void;
}> = ({ order, onAccept }) => {
  const [open, setOpen] = useState(false);

  const options: number[] = useMemo(
    () =>
      order.selected_option === "delivery"
        ? [20, 40, 60, 80, 100, 120]
        : [20, 40, 60, 80, 100, 120],
    [order.selected_option]
  );



  const [minutes, setMinutes] = useState<number>(options[0]);
  useEffect(() => setMinutes(options[0]), [options]);

  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        className="h-10 rounded-l-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow hover:bg-emerald-500"
        onClick={() => onAccept(minutes)}
      >
        Akceptuj ({formatMinutes(minutes)})
      </button>
      <button
        type="button"
        aria-label="Zmień czas"
        className="h-10 rounded-r-md border-l border-emerald-500 bg-emerald-600 px-2 text-white hover:bg-emerald-500"
        onClick={() => setOpen((o) => !o)}
      >
        ▾
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-10 w-48 overflow-hidden rounded-md border bg-white text-slate-900 shadow-lg">
          {options.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMinutes(m);
                setOpen(false);
                onAccept(m);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-slate-50"
            >
              <span>{formatMinutes(m)}</span>
              {minutes === m && (
                <span className="text-emerald-600">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const TimeQuickSet: React.FC<{
  order: Order;
  mode: "accept" | "set";
  disabled?: boolean;
  onApply: (hhmm: string) => Promise<void> | void;
}> = ({ order, mode, disabled, onApply }) => {
  const requested = useMemo(() => {
    const t = formatClientRequestedTime(order);
    return t !== "-" && t !== "Jak najszybciej" ? t : "";
  }, [order]);

  const currentLocal = useMemo(() => {
    const t = formatTimeLabel(order.deliveryTime ?? null);
    return t !== "-" && t !== "Jak najszybciej" ? t : "";
  }, [order.deliveryTime]);

  const initial = useMemo(() => {
    return mode === "accept" ? requested : currentLocal || requested;
  }, [mode, requested, currentLocal]);

  const [val, setVal] = useState<string>(initial || "");

  useEffect(() => {
    setVal(initial || "");
  }, [initial]);

  const label =
    mode === "accept"
      ? `Akceptuj (${val || "--:--"})`
      : `Ustaw (${val || "--:--"})`;

  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="time"
        step={60}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        disabled={disabled}
        className="h-10 w-[120px] rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm"
      />

      {requested && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setVal(requested)}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          title="Ustaw na czas wybrany przez klienta"
        >
          Czas klienta
        </button>
      )}

      <button
        type="button"
        disabled={disabled || !val}
        onClick={() => onApply(val)}
        className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white shadow hover:bg-emerald-600 disabled:opacity-50"
        title={
          mode === "accept"
            ? "Akceptuj zamówienie i ustaw godzinę"
            : "Nadpisz godzinę realizacji"
        }
      >
        {label}
      </button>
    </div>
  );
};


/* --------- Pałeczki – odczyt z różnych pól --------- */

const asInt = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
};

const CHOPSTICKS_KEYS = [
  "chopsticks_qty",
  "chopsticksQty",
  "chopsticksqty",
  "chopsticks_count",
  "chopsticksCount",
  "chopsticks",
  "paleczki",
  "paleczki_count",
  "paleczkiCount",
  "sticks",
  "ilosc_paleczek",
  "ilosc_paleczki",
  "ilosc_pałeczek",
];

const readNestedInt = (obj: any, keys: string[]): number | null => {
  for (const k of keys) {
    if (obj && typeof obj === "object" && k in obj) {
      const n = asInt((obj as any)[k]);
      if (n !== null) return n;
    }
  }
  return null;
};

const extractChopsticksFromOrderRaw = (o: any): number | null => {
  // top-level
  const top = readNestedInt(o, CHOPSTICKS_KEYS);
  if (top !== null) return top;

  // meta / options / data
  const deepCandidates = [
    o?.meta,
    o?.options,
    o?.data,
    o?.extra,
    o?.details,
    o?.legal_accept,
    o?.summary,
  ].filter(Boolean);
  for (const d of deepCandidates) {
    const n = readNestedInt(d, CHOPSTICKS_KEYS);
    if (n !== null) return n;
  }

  // w items JSON (niektóre systemy pakują tam ustawienia)
  try {
    const items = typeof o?.items === "string" ? JSON.parse(o.items) : o?.items;
    if (items && typeof items === "object") {
      const n =
        readNestedInt(items, CHOPSTICKS_KEYS) ??
        (Array.isArray(items)
          ? items.reduce<number | null>(
              (acc, it) => acc ?? extractChopsticksFromOrderRaw(it),
              null
            )
          : null);
      if (n !== null) return n;
    }
  } catch {}

  return null;
};

export default function PickupOrdersPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSlug = (searchParams.get("restaurant") || "").toLowerCase() || null;

  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) {
        router.replace("/admin/login"); // dostosuj jeśli masz inną ścieżkę
        return;
      }
      setAuthChecked(true);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, router]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

    // Powiadomienia push – status dla obsługi
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [pushError, setPushError] = useState<string | null>(null);

  // Sprawdzenie, czy przeglądarka obsługuje push i czy jest już subskrypcja
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported");
      return;
    }

    if (!VAPID_PUBLIC_KEY) {
      setPushStatus("error");
      setPushError(
        "Brak klucza VAPID (NEXT_PUBLIC_VAPID_PUBLIC_KEY). Skonfiguruj go w env."
      );
      return;
    }

    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const perm = Notification.permission;

        if (!reg) {
          setPushStatus(perm === "denied" ? "not-allowed" : "idle");
          return;
        }

        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setPushStatus("subscribed");
        } else {
          setPushStatus(perm === "denied" ? "not-allowed" : "idle");
        }
      } catch {
        setPushStatus("error");
        setPushError("Nie udało się sprawdzić statusu powiadomień.");
      }
    })();
  }, []);

 // Włączenie powiadomień push „na żądanie”
const enablePush = useCallback(async () => {
  try {
    setPushError(null);
    setPushStatus("checking");

    if (typeof window === "undefined") return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported");
      return;
    }

    if (!VAPID_PUBLIC_KEY) {
      setPushStatus("error");
      setPushError("Brak klucza VAPID (NEXT_PUBLIC_VAPID_PUBLIC_KEY). Skonfiguruj go w env.");
      return;
    }

    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setPushStatus("not-allowed");
      return;
    }

    // SW: użyj istniejącego albo zarejestruj
    const reg =
      (await navigator.serviceWorker.getRegistration()) ||
      (await navigator.serviceWorker.register("/sw.js"));

    // nie dubluj subskrypcji
    const existing = await reg.pushManager.getSubscription();

    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));

    // PushSubscription ma toJSON() – ale bezpiecznie wymuś "czysty" JSON
    const payload =
      typeof (sub as any).toJSON === "function"
        ? (sub as any).toJSON()
        : JSON.parse(JSON.stringify(sub));

    const res = await fetch("/api/admin/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // ważne (cookie restaurant_id/slug)
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[push] subscribe FAIL", res.status, txt);
      setPushStatus("error");
      setPushError("Nie udało się zapisać subskrypcji w bazie.");
      return;
    }

    setPushStatus("subscribed");
  } catch (e) {
    console.error("[push] enablePush error", e);
    setPushStatus("error");
    setPushError("Nie udało się włączyć powiadomień.");
  }
}, []);

  const [page, setPage] = useState(1);
  const perPage = 10;
  const [total, setTotal] = useState(0);

  const [filterStatus, setFilterStatus] = useState<
    "all" | Order["status"]
  >("all");
  const [filterOption, setFilterOption] = useState<
    "all" | Order["selected_option"]
  >("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);

  /* BOOT: ustaw serwerowe cookie, ale ignoruj 401 */
  useEffect(() => {
    const url = urlSlug
      ? `/api/restaurants/ensure-cookie?restaurant=${encodeURIComponent(
          urlSlug
        )}`
      : "/api/restaurants/ensure-cookie";
    fetch(url, { cache: "no-store" }).catch(() => {});
    setRestaurantSlug(urlSlug);
    setBooted(true);
  }, [urlSlug]);

  // Push: po BOOT (gdy cookies restauracji są już ustawione) dosyłamy istniejącą subskrypcję do backendu
useEffect(() => {
  if (!booted) return;
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  let cancelled = false;

  (async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;

      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;

      const res = await fetch("/api/admin/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(sub),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn("[push] sync existing FAIL", res.status, txt);
        if (!cancelled) {
          // nie psujemy statusu "subscribed" (bo w przeglądarce jest), tylko pokazujemy info
          setPushError(
            "Powiadomienia są włączone, ale nie udało się zsynchronizować subskrypcji z bazą. Kliknij „Włącz powiadomienia” ponownie."
          );
        }
      }
    } catch (e) {
      console.warn("[push] sync existing error", e);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [booted, restaurantSlug]);

 /* AUDIO – dźwięk nowego zamówienia */
const newOrderAudio = useRef<HTMLAudioElement | null>(null);
const audioUnlockedRef = useRef(false);

const unlockAudio = useCallback(async () => {
  try {
    if (typeof window === "undefined") return;
    if (!newOrderAudio.current) return;

    // trik: start w muted, żeby przeglądarka pozwoliła „zainicjować”
    const a = newOrderAudio.current;
    a.muted = true;
    a.currentTime = 0;
    await a.play();
    a.pause();
    a.currentTime = 0;
    a.muted = false;

    audioUnlockedRef.current = true;
    console.log("[audio] unlocked");
  } catch (e) {
    audioUnlockedRef.current = false;
    console.warn("[audio] unlock failed", e);
  }
}, []);

useEffect(() => {
  if (typeof window === "undefined") return;

  const src = "/new-order.mp3"; // MUSI być w /public/new-order.mp3
  const a = new Audio(src);
  a.preload = "auto";
  a.volume = 1;
  newOrderAudio.current = a;

  // spróbuj odblokować po pierwszym geście użytkownika
  const onFirstGesture = () => void unlockAudio();
  window.addEventListener("pointerdown", onFirstGesture, { once: true });
  window.addEventListener("keydown", onFirstGesture, { once: true });

  console.log("[audio] init", src);

  return () => {
    window.removeEventListener("pointerdown", onFirstGesture);
    window.removeEventListener("keydown", onFirstGesture);
  };
}, [unlockAudio]);

const playDing = useCallback(async () => {
  try {
    if (!newOrderAudio.current) {
      console.warn("[audio] missing Audio()");
      return;
    }

    // jeśli nie było gestu użytkownika — nie udawajmy, że zadziała
    if (!audioUnlockedRef.current) {
      console.warn("[audio] locked (no user gesture yet)");
      return;
    }

    newOrderAudio.current.currentTime = 0;
    await newOrderAudio.current.play();
    console.log("[audio] ding");
  } catch (err) {
    console.warn("[audio] play error", err);
  }
}, []);

  const prevIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const fetchingRef = useRef(false);
  const pendingRef = useRef(false);
  const editingRef = useRef<string | null>(null);

  const lastDingAtRef = useRef(0);
const dingOnce = useCallback(() => {
  const now = Date.now();
  if (now - lastDingAtRef.current < 1200) return; // anty-dubler
  lastDingAtRef.current = now;
  void playDing();
}, [playDing]);


  useEffect(() => {
    editingRef.current = editingOrderId;
  }, [editingOrderId]);

  useEffect(() => {
  if (!editingOrderId) return;

  const t = window.setTimeout(() => {
    console.warn("[pickup] watchdog: reset editingOrderId", editingOrderId);
    setEditingOrderId(null);
  }, 30000);

  return () => window.clearTimeout(t);
}, [editingOrderId]);

  // REF do fetchOrders (polling/realtime zawsze woła najnowszą wersję)
const fetchOrdersRef = useRef<
  (opts?: { silent?: boolean }) => void | Promise<void>
>(() => {});

const fetchOrders = useCallback(
  async (opts?: { silent?: boolean }) => {
    if (!booted) return;
    if (editingRef.current) return;

    if (fetchingRef.current) {
      pendingRef.current = true;
      return;
    }
    fetchingRef.current = true;

    try {
      if (!opts?.silent) setErrorMsg(null);
      if (!opts?.silent) setLoading(true);

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const offset = (page - 1) * perPage;
      const qs = new URLSearchParams({
        limit: String(perPage),
        offset: String(offset),
        scope: "all",
        t: String(Date.now()),
      });

      const slug = restaurantSlug || urlSlug;
      if (slug) qs.set("restaurant", slug);

      const res = await fetch(`/api/orders/current?${qs.toString()}`, {
        cache: "no-store",
        signal: ac.signal,
      });

      const json = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        if (!opts?.silent) {
          setOrders([]);
          setTotal(0);
          setErrorMsg(json?.error || "Błąd pobierania zamówień");
        } else {
          setErrorMsg((prev) => prev ?? (json?.error || "Błąd pobierania zamówień"));
        }
        return;
      }

      if (json?.restaurant_id && typeof json.restaurant_id === "string") {
        setRestaurantId(json.restaurant_id);
      }
      if (slug && !restaurantSlug) setRestaurantSlug(slug);

      const raw = Array.isArray(json.orders) ? json.orders : [];
      const totalCount = Number(json.totalCount || 0);

      const mapped: Order[] = raw.map((o: any) => {
        const chopsticksRaw =
          asInt(o.chopsticks_qty) ??
          asInt(o.chopsticksQty) ??
          asInt(o.chopsticksqty) ??
          asInt(o.chopsticks) ??
          extractChopsticksFromOrderRaw(o);

        const noteFromAddress =
          o.selected_option === "takeaway" &&
          typeof o.address === "string" &&
          o.address.trim()
            ? o.address.trim()
            : null;

        return {
          id: String(o.id),
          name: o.name ?? o.customer_name ?? o.client_name ?? undefined,
          total_price: toNumber(o.total_price),
          delivery_cost: o.delivery_cost ?? null,
          created_at: o.created_at,
          status: o.status,

          client_delivery_time: (o.client_delivery_time as string | undefined) ?? null,
          scheduled_delivery_at: (o.scheduled_delivery_at as string | undefined) ?? null,
          clientDelivery: (o.clientDelivery as string | undefined) ?? null,

          deliveryTime:
            (o.deliveryTime as string | undefined) ??
            (o.delivery_time as string | undefined) ??
            null,

          address:
            o.selected_option === "delivery"
              ? `${o.street || ""}${o.flat_number ? `, nr ${o.flat_number}` : ""}${o.city ? `, ${o.city}` : ""}`
              : o.address || "",

          street: o.street,
          flat_number: o.flat_number,
          city: o.city,
          phone: o.phone,
          items: o.items ?? o.order_items ?? [],
          selected_option: o.selected_option,
          payment_method: fromDBPaymentMethod(o.payment_method),
          payment_status: fromDBPaymentStatus(o.payment_status),

          note: o.note ?? noteFromAddress ?? null,
          kitchen_note: o.kitchen_note ?? null,

          promo_code: o.promo_code ?? null,
          discount_amount: o.discount_amount != null ? Number(o.discount_amount) || 0 : 0,

          loyalty_stickers_before:
            typeof o.loyalty_stickers_before === "number" ? o.loyalty_stickers_before : null,
          loyalty_stickers_after:
            typeof o.loyalty_stickers_after === "number" ? o.loyalty_stickers_after : null,
          loyalty_applied: o.loyalty_applied === true || o.loyalty_applied === 1 || o.loyalty_applied === "1",
          loyalty_reward_type: o.loyalty_reward_type ?? null,
          loyalty_reward_value: o.loyalty_reward_value != null ? Number(o.loyalty_reward_value) : null,
          loyalty_min_order: o.loyalty_min_order != null ? Number(o.loyalty_min_order) : null,

          reservation_id: o.reservation_id ?? null,
          reservation_date: o.reservation_date ?? null,
          reservation_time: o.reservation_time ?? null,

          chopsticks: chopsticksRaw ?? 0,
        };
      });

      setTotal(totalCount);

      mapped.sort((a, b) => {
        const ta = +new Date(a.created_at);
        const tb = +new Date(b.created_at);
        return sortOrder === "desc" ? tb - ta : ta - tb;
      });

      const prev = prevIdsRef.current;
      const newOnes = mapped.filter(
        (o) =>
          (o.status === "new" || o.status === "pending" || o.status === "placed") &&
          !prev.has(o.id)
      );
      if (initializedRef.current && newOnes.length > 0) dingOnce();

      prevIdsRef.current = new Set(mapped.map((o) => o.id));
      initializedRef.current = true;

      setOrders(mapped);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setErrorMsg("Błąd sieci");
        if (!opts?.silent) {
          setOrders([]);
          setTotal(0);
        }
      }
    } finally {
      if (!opts?.silent) setLoading(false);
      fetchingRef.current = false;

      if (pendingRef.current) {
        pendingRef.current = false;
        void fetchOrders({ silent: true });
      }
    }
  },
  [booted, page, perPage, restaurantSlug, urlSlug, sortOrder, playDing]
);

// aktualizuj ref po każdej zmianie fetchOrders
useEffect(() => {
  fetchOrdersRef.current = (opts) => void fetchOrders(opts);
}, [fetchOrders]);


  useEffect(() => {
    if (!authChecked) return;
    fetchOrders({ silent: true });
  }, [authChecked, fetchOrders]);

 // <-- NOWE: fallback polling zamówień co 8 sekund
  useEffect(() => {
    if (!authChecked) return;
    if (!booted) return;
    if (editingOrderId) return;

    const iv = setInterval(() => {
      void fetchOrdersRef.current({ silent: true });
    }, 5000);

    return () => clearInterval(iv);
  }, [authChecked, booted, editingOrderId]);
  

   /* realtime tylko dla tej restauracji */
  useEffect(() => {
    if (!authChecked) return;
    if (!booted) return;

    const filter = restaurantId ? `restaurant_id=eq.${restaurantId}` : undefined;

    const ch = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          ...(filter ? { filter } : {}),
        },
        (payload: any) => {
          const ev = payload?.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
const newStatus = String(payload?.new?.status ?? "");
const oldStatus = String(payload?.old?.status ?? "");

const isUnaccepted = (s: string) => ["new", "pending", "placed"].includes(s);

// ding na nowe zamówienie
if (ev === "INSERT" && isUnaccepted(newStatus)) dingOnce();

// ding gdy zamówienie "wchodzi" w new/pending/placed przez UPDATE
if (ev === "UPDATE" && !isUnaccepted(oldStatus) && isUnaccepted(newStatus)) dingOnce();

          if (restaurantId) {
            const ridNew = payload.new?.restaurant_id;
            const ridOld = payload.old?.restaurant_id;
            if (ridNew !== restaurantId && ridOld !== restaurantId) return;
          }
          void fetchOrdersRef.current({ silent: true });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, restaurantId, booted, authChecked]);

   /* polling płatności */
  useEffect(() => {
    if (!authChecked) return;

    const hasPending = orders.some(
      (o) => o.payment_method === "Online" && o.payment_status === "pending"
    );
    if (!hasPending || editingOrderId) return;

    const iv = setInterval(() => {
      void fetchOrdersRef.current({ silent: true });
    }, 3000);

    return () => clearInterval(iv);
  }, [authChecked, orders, editingOrderId]);

  // powtarzający się dźwięk dopóki są niezaakceptowane zamówienia
  const hasUnaccepted = useMemo(
    () =>
      orders.some((o) =>
        ["new", "pending", "placed"].includes(o.status)
      ),
    [orders]
  );
  useEffect(() => {
    if (!hasUnaccepted) return;
    // od razu jeden dźwięk
    void playDing();
    // i powtarzamy co 15 s, dopóki coś czeka
    const iv = setInterval(() => {
      void playDing();
    }, 15000);
    return () => clearInterval(iv);
  }, [hasUnaccepted, playDing]);

  const refreshPaymentStatus = async (id: string) => {
    try {
      setEditingOrderId(id);
      const res = await fetch(`/api/payments/p24/refresh?id=${id}`, {
        method: "POST",
      });
      if (!res.ok) return;
      const { payment_status } = await res.json();
      setOrders((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                payment_status: fromDBPaymentStatus(payment_status),
              }
            : o
        )
      );
    } finally {
      setEditingOrderId(null);
    }
  };

  const updateLocal = (id: string, upd: Partial<Order>) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...upd } : o)));

  const completeOrder = async (id: string) => {
  try {
    setEditingOrderId(id);
    setErrorMsg(null);

    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });

    const j = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      setErrorMsg(j?.error || `Nie udało się oznaczyć zamówienia jako zrealizowane. (${res.status})`);
      return;
    }

    updateLocal(id, { status: "completed" });
    fetchOrders({ silent: true }); // żeby przerzuciło do historii nawet jeśli realtime/polling się rozminie
  } finally {
    setEditingOrderId(null);
  }
};

  useEffect(() => {
  if (!authChecked || !booted) return;

  const refresh = () => {
    void fetchOrdersRef.current({ silent: true });
  };

  const onVis = () => {
    if (document.visibilityState === "visible") refresh();
  };

  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", onVis);

  return () => {
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", onVis);
  };
}, [authChecked, booted]);


  // Akceptacja – PATCH /api/orders/[id] → status + czas
  const acceptAndSetTime = async (order: Order, minutes: number) => {
  const eta = new Date(Date.now() + minutes * 60_000).toISOString();

  try {
    setEditingOrderId(order.id);
    setErrorMsg(null);

    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "accepted",
        // CZAS USTALANY PRZEZ LOKAL
        deliveryTime: eta,
        delivery_time: eta,
        // UWAGA: client_delivery_time zostaje taki, jak przyszedł z CheckoutModal
      }),
    });

    const j = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      setErrorMsg(j?.error || "Nie udało się zaakceptować zamówienia.");
      return;
    }

    const newDeliveryTime: string =
      (j.deliveryTime as string) ||
      (j.delivery_time as string) ||
      eta;

    updateLocal(order.id, {
      status: (j.status as Order["status"]) || "accepted",
      deliveryTime: newDeliveryTime,
      // jeśli backend zwróci client_delivery_time – bierzemy z odpowiedzi,
      // jeśli nie – zostawiamy to, co było (np. "asap" albo godzina z checkoutu)
      client_delivery_time:
  (j.client_delivery_time as string | undefined) ??
  order.client_delivery_time ??
  null,
scheduled_delivery_at:
  (j.scheduled_delivery_at as string | undefined) ??
  order.scheduled_delivery_at ??
  null,
    });
  } finally {
    setEditingOrderId(null);
  }
};

// Akceptacja z ABSOLUTNĄ godziną (HH:MM) – klient dostaje godzinę jak przy akceptacji
const acceptAndSetAbsoluteTime = async (order: Order, hhmm: string) => {
  const iso = buildIsoForOrderHHMM(order, hhmm, TZ);
  if (!iso) {
    setErrorMsg("Nieprawidłowa godzina. Użyj formatu HH:MM.");
    return;
  }

  try {
    setEditingOrderId(order.id);
    setErrorMsg(null);

    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "accepted",
        deliveryTime: iso,
        delivery_time: iso,
      }),
    });

    const j = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      setErrorMsg(j?.error || "Nie udało się zaakceptować zamówienia.");
      return;
    }

    const newDeliveryTime: string =
      (j.deliveryTime as string) || (j.delivery_time as string) || iso;

    updateLocal(order.id, {
      status: (j.status as Order["status"]) || "accepted",
      deliveryTime: newDeliveryTime,
      client_delivery_time:
        (j.client_delivery_time as string | undefined) ??
        order.client_delivery_time ??
        null,
      scheduled_delivery_at:
        (j.scheduled_delivery_at as string | undefined) ??
        order.scheduled_delivery_at ??
        null,
    });
  } finally {
    setEditingOrderId(null);
  }
};

// Nadpisanie godziny dla już zaakceptowanego zamówienia (HH:MM)
const setAbsoluteTime = async (order: Order, hhmm: string) => {
  const iso = buildIsoForOrderHHMM(order, hhmm, TZ);
  if (!iso) {
    setErrorMsg("Nieprawidłowa godzina. Użyj formatu HH:MM.");
    return;
  }

  try {
    setEditingOrderId(order.id);
    setErrorMsg(null);

    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryTime: iso, delivery_time: iso }),
    });

    const j = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) return;

    const newDeliveryTime: string =
      (j.deliveryTime as string) || (j.delivery_time as string) || iso;

    updateLocal(order.id, { deliveryTime: newDeliveryTime });
    fetchOrders({ silent: true });
  } finally {
    setEditingOrderId(null);
  }
};


  const extendTime = async (order: Order, minutes: number) => {
    const base =
      order.deliveryTime && !isNaN(Date.parse(order.deliveryTime))
        ? new Date(order.deliveryTime)
        : new Date();
    const dt = new Date(base.getTime() + minutes * 60000).toISOString();
    try {
      setEditingOrderId(order.id);
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryTime: dt, delivery_time: dt }),
      });
      if (!res.ok) return;
      updateLocal(order.id, { deliveryTime: dt });
      fetchOrders({ silent: true });
    } finally {
      setEditingOrderId(null);
    }
  };

  const restoreOrder = async (id: string) => {
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "new" }),
    });
    if (res.ok) {
      updateLocal(id, { status: "new" });
      fetchOrders({ silent: true });

    }
  };

  const paymentBadge = (o: Order) => {
    if (o.payment_method === "Online") {
      if (o.payment_status === "paid")
        return <Badge tone="green">OPŁACONE ONLINE</Badge>;
      if (o.payment_status === "failed")
        return <Badge tone="rose">ONLINE – BŁĄD</Badge>;
      return <Badge tone="yellow">ONLINE – OCZEKUJE</Badge>;
    }
    if (o.payment_method === "Terminal")
      return <Badge tone="blue">TERMINAL</Badge>;
    return <Badge tone="amber">GOTÓWKA</Badge>;
  };

  const plStickersWord = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return "naklejkę";
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "naklejki";
  return "naklejek";
};

const calcEarnedStickers = (o: Order) => {
  // jeśli użyto nagrody (rabat / darmowa rolka) – nie naliczamy naklejek
  if (o.loyalty_applied) return 0;

  const total = toNumber(o.total_price, 0);

  // progi:
  // < 50 zł  -> 0
  // 50–200  -> 1
  // >200–300 -> 2
  // >300    -> 3
  if (total < 50) return 0;
  if (total <= 200) return 1;
  if (total <= 300) return 2;
  return 3;
};



  // Program lojalnościowy – badge w nagłówku karty zamówienia

  const loyaltyBadge = (o: Order) => {
  const before =
    typeof o.loyalty_stickers_before === "number" ? o.loyalty_stickers_before : null;
  const afterRaw =
    typeof o.loyalty_stickers_after === "number" ? o.loyalty_stickers_after : null;

  const hasReward = !!o.loyalty_applied;
  const discount = typeof o.discount_amount === "number" ? o.discount_amount : 0;
  const minOrder = typeof o.loyalty_min_order === "number" ? o.loyalty_min_order : null;

  const earned = calcEarnedStickers(o);

  // Jeśli nie ma nagrody, to AFTER wyliczamy z BEFORE + earned (żeby nie pokazywać stale 0→1)
  const displayAfter =
    hasReward ? afterRaw : before !== null ? before + earned : afterRaw;

  const showStickerCounts = before !== null && displayAfter !== null;

  if (!hasReward && !showStickerCounts && earned <= 0) return null;

  let line2: string;
  if (hasReward) {
    if (o.loyalty_reward_type === "percent" && typeof o.loyalty_reward_value === "number") {
      line2 = `Nagroda: −${o.loyalty_reward_value}%${discount > 0 ? ` (−${discount.toFixed(2)} zł)` : ""}`;
    } else {
      line2 = "Nagroda: darmowa pozycja / rolka";
    }
  } else {
    line2 =
      earned > 0
        ? `To zamówienie dolicza ${earned} ${plStickersWord(earned)} w programie.`
        : minOrder
          ? `To zamówienie nie nalicza naklejek (poniżej ${minOrder.toFixed(2)} zł).`
          : "To zamówienie nie nalicza naklejek.";
  }

  return (
    <div className="inline-flex flex-col rounded-xl bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-800">
      <span className="font-semibold">Program lojalnościowy</span>
      <span>{line2}</span>

      {showStickerCounts && (
        <span className="mt-0.5">
          Naklejki: {before} → {displayAfter}
        </span>
      )}

      {minOrder && (
        <span className="mt-0.5 text-[10px] text-emerald-700">
          Program liczy zamówienia od {minOrder.toFixed(2)} zł.
        </span>
      )}
    </div>
  );
};

  const setPaymentMethod = async (o: Order, method: PaymentMethod) => {
    try {
      setEditingOrderId(o.id);
      const patch: any = { payment_method: toDBPaymentMethod(method) };
      if (method !== "Online") patch.payment_status = null;
      const res = await fetch(`/api/orders/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      updateLocal(o.id, {
        payment_method: method,
        payment_status: patch.payment_status ?? o.payment_status,
      });
    } finally {
      setEditingOrderId(null);
    }
  };

  const filtered = useMemo(
    () =>
      orders
        .filter((o) =>
          filterStatus === "all" ? true : o.status === filterStatus
        )
        .filter((o) =>
          filterOption === "all"
            ? true
            : o.selected_option === filterOption
        ),
    [orders, filterStatus, filterOption]
  );

  const newList = filtered.filter(
    (o) =>
      o.status === "new" || o.status === "pending" || o.status === "placed"
  );
  const currList = filtered.filter((o) => o.status === "accepted");
  const histList = filtered.filter(
    (o) => o.status === "cancelled" || o.status === "completed"
  );

  const compactSetSwapsInline = (
  setSwaps: Array<{ label: string }>,
  max = 2
) => {
  if (!setSwaps || setSwaps.length === 0) return "";
  const shown = setSwaps.slice(0, max).map((s) => s.label);
  const rest = setSwaps.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} (+${rest})` : shown.join(", ");
};

const limitList = <T,>(arr: T[], max: number) => {
  const list = Array.isArray(arr) ? arr : [];
  return {
    shown: list.slice(0, max),
    rest: Math.max(0, list.length - max),
  };
};

const formatSwapHuman = (s: any) => {
  const from = typeof s?.from === "string" ? s.from.trim() : "";
  const to = typeof s?.to === "string" ? s.to.trim() : "";
  const qty =
    typeof s?.qty === "number"
      ? s.qty
      : typeof s?.qty === "string"
      ? parseInt(String(s.qty).replace(/[^\d]/g, ""), 10)
      : undefined;

  const prefix =
    typeof qty === "number" && Number.isFinite(qty) && qty > 1 ? `${qty}× ` : "";

  if (from && to) return `${prefix}${from} → ${to}`;
  if (to) return `${prefix}→ ${to}`;
  if (from) return `${prefix}${from}`;

  // fallback
  return typeof s?.label === "string" ? s.label : "";
};

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;


  const ProductItem: React.FC<{
  raw: any;
  onDetails?: (p: any) => void;
}> = ({ raw, onDetails }) => {
  const p = normalizeProduct(raw);
  const isSet = !!p.isSet;

  // zamiany poza zestawami
  const swapDetails =
    ((p as any).swapDetails as Array<{ from?: string; to?: string; label: string }> | undefined) || [];

  const swapsHuman: string[] = swapDetails.length
    ? swapDetails.map((s) => formatSwapHuman(s)).filter(isNonEmptyString)
    : Array.isArray((p as any).swaps)
      ? (p as any).swaps.filter(isNonEmptyString)
      : [];

  // zamiany w zestawie (structured)
  const setSwaps =
    ((p as any).setSwaps as Array<{ qty?: number; from?: string; to?: string; label: string }> | undefined) || [];

  // dodatki / sosy bez swapów (swapy pokazujemy osobno)
  const addonsOnly = p.addons || [];

  const hasMetaBlock =
  addonsOnly.length > 0 ||
  (!isSet && swapsHuman.length > 0) ||
  setSwaps.length > 0 ||
  !!p.note;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-slate-900">
      {/* GÓRA: nazwa + cena */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Informacje ogólne
          </div>
          <div className="mt-1 truncate text-sm font-semibold">{p.name}</div>

          <div className="mt-1 text-[12px] text-slate-800">
            Ilość: <b className="text-slate-900">{p.quantity}</b>
          </div>

          {/* Zestaw – krótkie info (jeśli jest setMeta) */}
          {isSet && p.setMeta && (
            <div className="mt-2 space-y-1 text-[12px] text-slate-700">
              <div className="font-semibold text-slate-800">Zestaw</div>

              {p.setMeta.setUpgrade && <div>• Powiększenie zestawu</div>}

              {p.setMeta.bakedWholeSet ? (
                <div>• Wersja pieczona: cały zestaw</div>
              ) : p.setMeta.bakedRolls.length > 0 ? (
                <div>
                  • Pieczone rolki:{" "}
                  <span className="text-slate-800">{p.setMeta.bakedRolls.join(", ")}</span>
                </div>
              ) : null}

              {p.setMeta.rollExtras.length > 0 && (
                <div>
                  • Dodatki w rolkach:{" "}
                  <span className="text-slate-800">{p.setMeta.rollExtras.length}</span>
                  {p.setMeta.rollExtras.length === 1 ? " pozycja" : " pozycje"}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="whitespace-nowrap text-sm font-semibold text-amber-700">
          {p.price.toFixed(2)} zł
        </div>
      </div>

      {/* SZARY BLOK: dodatki/sosy + zamiany + notatka (wszystko pod sobą) */}
      {hasMetaBlock && (
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
          {/* Dodatki / sosy */}
          {addonsOnly.length > 0 && (
            <>
              <div className="text-[12px] font-semibold text-slate-800">Dodatki / sosy</div>
              <ul className="mt-1 ml-5 list-disc space-y-0.5 text-[12px] text-slate-700">
                {addonsOnly.map((a: string, i: number) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </>
          )}

          {/* Zamiany (poza zestawami) */}
          {!isSet && swapsHuman.length > 0 && (
            <div className={addonsOnly.length > 0 ? "mt-2 border-t border-slate-200 pt-2" : ""}>
              <div className="text-[12px] font-semibold text-slate-800">Zamiany</div>
              <ul className="mt-1 ml-5 list-disc space-y-0.5 text-[12px] text-slate-700">
                {swapsHuman.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Zamiany w zestawie (LINIA PO LINII, bez "+1 … zobacz…") */}
          {setSwaps.length > 0 && (
            <div
              className={
                addonsOnly.length > 0 || swapsHuman.length > 0
                  ? "mt-2 border-t border-slate-200 pt-2"
                  : ""
              }
            >
              <div className="text-[12px] font-semibold text-slate-800">Zamiany w zestawie</div>
              <ul className="mt-1 ml-5 list-disc space-y-0.5 text-[12px] text-slate-700">
                {setSwaps.map((s: any, i: number) => {
  const txt = formatSetSwapLine(s);
  if (!txt) return null;
  return <li key={i}>{txt}</li>;
})}
              </ul>
            </div>
          )}

          {/* Notatka pozycji (to co ludzie wpisują) */}
          {p.note && (
            <div
              className={
                addonsOnly.length > 0 || swapsHuman.length > 0 || setSwaps.length > 0
                  ? "mt-2 border-t border-slate-200 pt-2"
                  : ""
              }
            >
              <div className="text-[12px] font-semibold text-slate-800">Notatka</div>
              <div className="mt-0.5 whitespace-pre-line break-words text-[12px] italic text-slate-800">
                {p.note}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Szczegóły */}
      {onDetails && (
        <button
          onClick={() => onDetails(p)}
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
        >
          Szczegóły pozycji <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
};

  const ProductDetailsModal: React.FC<{
    product: any;
    onClose(): void;
  }> = ({ product, onClose }) => {
    // zawsze normalizujemy na bazie oryginalnego _raw
   const p = normalizeProduct(product);
    const title = p.quantity > 1 ? `${p.name} x${p.quantity}` : p.name;
    const isSet = !!p.isSet;

    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-md border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50"
            >
              Zamknij
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <b>Cena:</b> {p.price.toFixed(2)} zł
            </div>
            {p.description && (
              <div>
                <b>Opis:</b> {p.description}
              </div>
            )}
            {p.ingredients.length > 0 && (
              <div>
                <b>Składniki:</b>
                <ul className="ml-5 list-disc">
                  {p.ingredients.map((x: string, i: number) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}

            {isSet && p.setMeta && (
              <>
                <div className="mt-2">
  <b>Zamiany w zestawie:</b>{" "}
  {p.setSwaps && p.setSwaps.length > 0 ? (
    <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
      <div className="grid grid-cols-[72px_1fr_1fr] bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">
        <div>Ilość</div>
        <div>Wybrano</div>
        <div className="text-slate-500">Zamiast</div>
      </div>

      <div className="divide-y divide-slate-200">
        {p.setSwaps.map((s: any, i: number) => {
          const qty =
            typeof s?.qty === "number"
              ? s.qty
              : typeof s?.qty === "string"
              ? parseInt(String(s.qty).replace(/[^\d]/g, ""), 10)
              : 1;

          const chosen = cleanSwapText(s?.to || "");
          const from = cleanSwapText(s?.from || "");

          return (
            <div
              key={i}
              className="grid grid-cols-[72px_1fr_1fr] px-3 py-2 text-[12px]"
            >
              <div>{qty > 1 ? `${qty}×` : "1×"}</div>
              <div className="font-medium text-slate-900">{chosen || "—"}</div>
              <div className="text-slate-500">{from || "—"}</div>
            </div>
          );
        })}
      </div>
    </div>
  ) : (
    <span>brak</span>
  )}
</div>

                {p.setMeta.bakedWholeSet && (
                  <div>
                    <b>Wersja pieczona:</b> cały zestaw pieczony.
                  </div>
                )}

                {!p.setMeta.bakedWholeSet &&
                  p.setMeta.bakedRolls.length > 0 && (
                    <div>
                      <b>Pieczone rolki:</b>{" "}
                      {p.setMeta.bakedRolls.join(", ")}
                    </div>
                  )}

                {p.setMeta.setUpgrade && (
                  <div>
                    <b>Rozmiar zestawu:</b> powiększony (dopłata
                    wliczona w cenę).
                  </div>
                )}

                {/* Rolki – pełne szczegóły: zamiana / pieczenie / dodatki */}
                {(() => {
                  type RollInfo = {
                    name: string;
                    extras: string[];
                    baked: boolean;
                    swappedFrom?: string;
                  };

                  const map = new Map<string, RollInfo>();

                  const ensure = (nameRaw: string | undefined | null) => {
                    const name = (nameRaw || "").trim();
                    if (!name) return null;
                    if (!map.has(name)) {
                      map.set(name, {
                        name,
                        extras: [],
                        baked: false,
                      });
                    }
                    return map.get(name)!;
                  };

                  // dodatki przypisane do konkretnych rolek
                  for (const row of p.setMeta!.rollExtras || []) {
                    const ri = ensure(row.roll);
                    if (!ri) continue;
                    ri.extras.push(...row.extras);
                  }

                  // pieczone rolki
                  if (p.setMeta!.bakedWholeSet) {
                    for (const ri of map.values()) {
                      ri.baked = true;
                    }
                  } else {
                    for (const name of p.setMeta!.bakedRolls || []) {
                      const ri = ensure(name);
                      if (!ri) continue;
                      ri.baked = true;
                    }
                  }

                 // szczegóły zamian w ZESTAWIE – bierzemy z p.setSwaps (to jest canonical dla zestawów)
const setSwaps =
  (p as any).setSwaps as
    | { qty?: number; from?: string; to?: string; label: string }[]
    | undefined;

if (setSwaps && setSwaps.length) {
  for (const s of setSwaps) {
    const target = (s.to || "").trim();
    if (!target) continue;
    const ri = ensure(target);
    if (!ri) continue;

    const from = (s.from || "").trim();
    if (from && from !== target) {
      ri.swappedFrom = from;
    }
  }
}

                  const rows = Array.from(map.values());
                  if (!rows.length) return null;

                  return (
                    <div className="mt-1">
                      <b>Rolki – szczegóły:</b>
                      <ul className="ml-5 list-disc">
                        {rows.map((ri, i) => {
                          const parts: string[] = [];
                          if (ri.swappedFrom) {
                            parts.push(`zamiast: ${ri.swappedFrom}`);
                          }
                          if (p.setMeta!.bakedWholeSet || ri.baked) {
                            parts.push("pieczona");
                          }
                          if (ri.extras.length) {
                            parts.push(
                              `dodatki: ${ri.extras.join(", ")}`
                            );
                          }
                          const text =
                            parts.length > 0
                              ? parts.join(" · ")
                              : "bez zmian";
                          return (
                            <li key={i}>
                              <span className="font-medium">
                                {ri.name}:
                              </span>{" "}
                              {text}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })()}
              </>
            )}

            {p.tartarBases && p.tartarBases.length > 0 && !isSet && (
              <div>
                <b>Sposób podania:</b>{" "}
                {p.tartarBases
                  .map((b: string) => b.replace(/^Podanie:\s*/i, ""))
                  .join(", ")}
              </div>
            )}

            {!isSet && p.addons.length > 0 && (
  <div>
    <b>Dodatki ogólne:</b> {p.addons.join(", ")}
  </div>
)}

            {p.note && (
              <div className="italic text-slate-800">{p.note}</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const OrderCard: React.FC<{ o: Order }> = ({ o }) => {
    const prods = parseProducts(o.items);
    const sticks = typeof o.chopsticks === "number" ? o.chopsticks : 0;

    return (
      <article
        key={o.id}
        className={`rounded-2xl border bg-white p-5 shadow-sm ring-1 ${statusTone(
          o.status
        )} text-slate-900`}
      >
        <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold tracking-tight text-slate-900">
                {getOptionLabel(o.selected_option)}
              </h3>

              {loyaltyBadge(o)}

              {/* Status zamówienia */}
              <Badge
                tone={
                  o.status === "accepted"
                    ? "blue"
                    : o.status === "cancelled"
                    ? "rose"
                    : o.status === "completed"
                    ? "slate"
                    : "amber"
                }
              >
                {o.status.toUpperCase()}
              </Badge>

              {/* REZERWACJA: jeśli zamówienie ma reservation_id */}
              {o.reservation_id && (
  (() => {
    let timeLabel: string | null = null;
const lbl = formatClientRequestedTime(o);
if (lbl !== "-" && lbl !== "Jak najszybciej") {
  timeLabel = lbl;
} else if (o.reservation_time) {
  timeLabel = formatTimeLabel(o.reservation_time);
}

    return (
      <Badge tone="green">
        Rezerwacja{timeLabel ? ` · ${timeLabel}` : ""}
      </Badge>
    );
  })()
)}


              {paymentBadge(o)}
            </div>
            <div className="text-sm text-slate-700 flex flex-wrap gap-x-3 gap-y-1">
  <span>
    <b>Klient:</b> {o.name || "—"}
  </span>
  <span>
    <b>Czas (klient):</b> {formatClientRequestedTime(o)}
  </span>
  <span>
    <b>Czas (lokal):</b>{" "}
    {o.deliveryTime ? formatTimeLabel(o.deliveryTime) : "-"}
  </span>
</div>
          </div>
          <div className="flex flex-col items-end gap-1 text-sm sm:items-end">
            {o.status === "accepted" &&
              o.deliveryTime && (
                <InlineCountdown
                  targetTime={o.deliveryTime}
                  onComplete={() => completeOrder(o.id)}
                />
              )}
            <span className="text-xs text-slate-500">
              #{o.id.slice(0, 8)}
            </span>
            <span className="text-slate-600">
  {formatInTimeZone(new Date(o.created_at), TZ, "dd.MM.yyyy HH:mm")}
</span>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-3 text-sm text-slate-800">
            <div>
              <b>Kwota:</b> {o.total_price.toFixed(2)} zł
            </div>

            {typeof o.discount_amount === "number" &&
              o.discount_amount > 0 && (
                <div className="text-xs text-emerald-800">
                  Rabat: −{o.discount_amount.toFixed(2)} zł{" "}
                  {o.promo_code && (
                    <span className="ml-1">
                      (kod:{" "}
                      <span className="font-mono">
                        {o.promo_code}
                      </span>
                      )
                    </span>
                  )}
                  {o.loyalty_applied && !o.promo_code && (
                    <span className="ml-1">
                      (program lojalnościowy)
                    </span>
                  )}
                </div>
              )}

            {o.selected_option === "delivery" &&
              typeof o.delivery_cost === "number" && (
                <div>
                  <b>Dostawa:</b> {o.delivery_cost.toFixed(2)} zł
                </div>
              )}
            {o.selected_option === "delivery" &&
              o.address && (
                <div>
                  <b>Adres:</b> {o.address}
                </div>
              )}
            {o.phone && (
              <div>
                <b>Telefon:</b> {o.phone}
              </div>
            )}

            {/* Notatka klienta / dla lokalu – z kolumny `note` */}
{o.note && (
  <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2">
    <div className="text-xs font-semibold text-slate-700">
      Notatka klienta
    </div>
    <div className="mt-0.5 text-sm text-slate-900 whitespace-pre-line">
      {o.note}
    </div>
  </div>
)}

            <div className="mt-1">
              <b>Płatność:</b>{" "}
              <span className="mt-1 inline-flex items-center gap-2">
                <select
                  value={o.payment_method || "Gotówka"}
                  onChange={(e) =>
                    setPaymentMethod(
                      o,
                      e.target.value as PaymentMethod
                    )
                  }
                  className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 shadow-sm"
                  disabled={editingOrderId === o.id}
                >
                  <option>Gotówka</option>
                  <option>Terminal</option>
                  <option>Online</option>
                </select>

                {o.payment_method === "Online" ? (
                  <>
                    <span className="ml-1">{paymentBadge(o)}</span>
                    {o.payment_status === "pending" && (
                      <button
                        onClick={() =>
                          refreshPaymentStatus(o.id)
                        }
                        className="h-8 rounded-md bg-sky-600 px-2 text-xs font-semibold text-white shadow hover:bg-sky-500"
                        disabled={editingOrderId === o.id}
                      >
                        Odśwież status
                      </button>
                    )}
                  </>
                ) : (
                  <span className="ml-1">{paymentBadge(o)}</span>
                )}
              </span>
            </div>

            {/* Pałeczki – tylko odczyt z bazy */}
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  Pałeczki
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                  {sticks > 0 ? `${sticks} szt.` : "brak"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Klient{" "}
                {sticks > 0
                  ? `poprosił o ${sticks} szt. pałeczek.`
                  : "nie potrzebuje pałeczek."}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                Wartość pochodzi z zamówienia klienta (pole{" "}
                <code>chopsticks_qty</code> w tabeli <code>orders</code>).
              </p>
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">
                Produkty
              </div>
            </div>
            {prods.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                brak pozycji
              </div>
            ) : (
              <ul className="space-y-2">
                {prods.map((p: any, i: number) => (
                  <li key={i}>
                    <ProductItem
  raw={p}
  onDetails={(np) => setSelectedProduct(np?._raw ?? np)}
/>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
          {(o.status === "new" ||
            o.status === "pending" ||
            o.status === "placed") && (
            <>
              {hasClientFixedTime(o) ? (
  <TimeQuickSet
    order={o}
    mode="accept"
    disabled={editingOrderId === o.id}
    onApply={(hhmm) => acceptAndSetAbsoluteTime(o, hhmm)}
  />
) : (
  <AcceptButton
    order={o}
    onAccept={(m) => acceptAndSetTime(o, m)}
  />
)}
              <EditOrderButton
                orderId={o.id}
                currentProducts={parseProducts(o.items).map(
                  normalizeProduct
                )}
                currentSelectedOption={o.selected_option || "takeaway"}
                onOrderUpdated={(id, data) =>
                  data ? updateLocal(id, data) : fetchOrders()
                }
                onEditStart={() => setEditingOrderId(o.id)}
                onEditEnd={() => setEditingOrderId(null)}
              />
              <CancelButton
                orderId={o.id}
                onOrderUpdated={() => fetchOrders()}
              />
            </>
          )}

          {o.status === "accepted" && (
  <>
    <CancelButton
      orderId={o.id}
      onOrderUpdated={() => fetchOrders()}
    />

    {/* NOWE: ustawienie konkretnej godziny po akceptacji */}
    <TimeQuickSet
      order={o}
      mode="set"
      disabled={editingOrderId === o.id}
      onApply={(hhmm) => setAbsoluteTime(o, hhmm)}
    />

    {[20, 40, 60, 80].map((m) => (
      <button
        key={m}
        onClick={() => extendTime(o, m)}
        className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow hover:bg-emerald-500"
      >
        +{formatMinutes(m)}
      </button>
    ))}

    <EditOrderButton
      orderId={o.id}
      currentProducts={parseProducts(o.items).map(normalizeProduct)}
      currentSelectedOption={o.selected_option || "takeaway"}
      onOrderUpdated={(id, data) =>
        data ? updateLocal(id, data) : fetchOrders()
      }
      onEditStart={() => setEditingOrderId(o.id)}
      onEditEnd={() => setEditingOrderId(null)}
    />

    <button
      onClick={() => completeOrder(o.id)}
      disabled={editingOrderId === o.id}
      className="h-10 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white shadow hover:bg-sky-500"
    >
      Zrealizowany
    </button>
  </>
)}
          {o.status === "cancelled" && (
            <button
              onClick={() => restoreOrder(o.id)}
              className="h-10 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white shadow hover:bg-sky-500"
            >
              Przywróć
            </button>
          )}
        </footer>
      </article>
    );
  };

  const ProductList = ({
    list,
    title,
  }: {
    list: Order[];
    title: string;
  }) => (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">
          {title}
        </h2>
        <span className="text-xs text-slate-500">
          {list.length} zamówień
        </span>
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
          Brak pozycji w tej sekcji.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {list.map((o) => (
            <OrderCard key={o.id} o={o} />
          ))}
        </div>
      )}
    </section>
  );

  if (!authChecked) {
  return (
    <div className="p-6 text-sm text-slate-600">
      Ładowanie panelu…
    </div>
  );
}


  return (
    <div className="mx-auto max-w-6xl p-4 text-slate-900 sm:p-6">
      {errorMsg && (
        <div className="mb-3 rounded-2xl border border-rose-400 bg-rose-50 p-3 text-sm font-medium text-rose-900">
          {errorMsg}
        </div>
      )}

            {/* Status powiadomień push dla obsługi */}
      <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 sm:flex-row sm:items-center sm:justify-between sm:text-sm">
        <div>
          <p className="font-semibold">
            Powiadomienia o nowych zamówieniach
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600 sm:text-xs">
            Włącz powiadomienia, żeby widzieć nowe zamówienia nawet gdy ta karta
            jest w tle. Upewnij się, że dźwięk w komputerze jest włączony.
          </p>
          {pushError && (
            <p className="mt-1 text-[11px] text-rose-600">
              {pushError}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold sm:text-xs",
              pushStatus === "subscribed" &&
                "bg-emerald-100 text-emerald-800",
              pushStatus === "checking" && "bg-sky-100 text-sky-800",
              pushStatus === "idle" && "bg-amber-100 text-amber-800",
              pushStatus === "not-allowed" && "bg-rose-100 text-rose-800",
              pushStatus === "unsupported" &&
                "bg-slate-100 text-slate-700",
              pushStatus === "error" && "bg-rose-100 text-rose-800"
            )}
          >
            {pushStatus === "subscribed" && "Włączone"}
            {pushStatus === "checking" && "Sprawdzanie…"}
            {pushStatus === "idle" && "Wyłączone"}
            {pushStatus === "not-allowed" && "Zablokowane w przeglądarce"}
            {pushStatus === "unsupported" && "Brak wsparcia dla powiadomień"}
            {pushStatus === "error" && "Błąd powiadomień"}
          </span>

          {(pushStatus === "idle" || pushStatus === "error") && (
  <button
    type="button"
    onClick={enablePush}
    className="h-9 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow hover:bg-emerald-500"
  >
    Włącz powiadomienia
  </button>
)}

          {pushStatus === "not-allowed" && (
            <span className="text-[11px] text-slate-500 sm:text-xs">
              Odblokuj powiadomienia dla tej strony w ustawieniach przeglądarki.
            </span>
          )}
        </div>
      </div>

      {/* Instrukcja dla obsługi */}
      <div className="mb-4 rounded-2xl border border-amber-200 bg-white/300 p-3 text-xs sm:text-sm text-black-900">
        <p className="mb-1 font-semibold">
          Jak obsługiwać zamówienia:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <b>Nowe zamówienia</b> pojawiają się na górze. Ustal czas i
            kliknij <b>Akceptuj</b>, żeby rozpocząć realizację.
          </li>
          <li>
            Po akceptacji zamówienie trafia do sekcji{" "}
            <b>„Zamówienia w realizacji”</b>, a klient dostaje godzinę
            odbioru / dostawy.
          </li>
          <li>
            Po wydaniu zamówienia kliknij <b>„Zrealizowany”</b>, żeby
            zamknąć je w systemie.
          </li>
          <li>
            Jeśli widzisz blok „Program lojalnościowy”, oznacza to, że
            zamówienie nalicza naklejkę albo ma użyty rabat (np. −30%).
          </li>
        </ul>
      </div>

      {/* Pasek filtrów */}
      <div className="sticky top-0 z-10 -mx-4 mb-5 bg-white/90 p-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm"
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as any)
            }
          >
            <option value="all">Wszystkie statusy</option>
            <option value="new">Nowe</option>
            <option value="placed">Złożone</option>
            <option value="accepted">W trakcie</option>
            <option value="cancelled">Anulowane</option>
            <option value="completed">Zrealizowane</option>
          </select>
          <select
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm"
            value={filterOption}
            onChange={(e) =>
              setFilterOption(e.target.value as any)
            }
          >
            <option value="all">Wszystkie opcje</option>
            <option value="takeaway">Na wynos</option>
            <option value="delivery">Dostawa</option>
          </select>
          <button
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm"
            onClick={() =>
              setSortOrder((o) => (o === "desc" ? "asc" : "desc"))
            }
          >
            {sortOrder === "desc" ? "Najnowsze" : "Najstarsze"}
          </button>
          <button
            className="ml-auto h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow hover:bg-emerald-500"
            onClick={() => fetchOrders()}
            disabled={loading || !booted}
          >
            Odśwież
          </button>
        </div>
      </div>

      <ProductList list={newList} title="Nowe zamówienia" />
      <div className="mt-8" />
      <ProductList
        list={currList}
        title="Zamówienia w realizacji"
      />
      <div className="mt-8" />
      <ProductList list={histList} title="Historia" />

      {selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      <div className="mb-24 mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="h-10 rounded-md border border-slate-300 px-4 text-sm text-slate-800 disabled:opacity-50"
        >
          Poprzednia
        </button>
        <span className="text-sm text-slate-600">
          Strona {page} z {Math.max(1, Math.ceil(total / perPage))}
        </span>
        <button
          onClick={() =>
            setPage((p) =>
              p < Math.ceil(total / perPage) ? p + 1 : p
            )
          }
          disabled={page >= Math.ceil(total / perPage)}
          className="h-10 rounded-md border border-slate-300 px-4 text-sm text-slate-800 disabled:opacity-50"
        >
          Następna
        </button>
      </div>
    </div>
  );
}
