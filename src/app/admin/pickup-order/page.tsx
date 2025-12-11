// src/app/admin/pickup-order/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import EditOrderButton from "@/components/EditOrderButton";
import CancelButton from "@/components/CancelButton";
import clsx from "clsx";

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

  // 2) pełna data/czas (ISO itd.)
  const dt = new Date(v);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleTimeString("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return "-";
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
      plain.push(a);
      continue;
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

  // --- NOWE: set_swaps (zamiany w ZESTAWACH) ---
  const rawSetSwaps =
    (Array.isArray((source as any).set_swaps) && (source as any).set_swaps) ||
    (Array.isArray(srcOptions?.set_swaps) && srcOptions!.set_swaps) ||
    [];

  type SetSwapDetail = { qty?: number; from?: string; to?: string; label: string };

  const setSwaps: SetSwapDetail[] = (rawSetSwaps as any[])
    .map((s) => {
      if (!s) return null;
      const from = typeof s.from === "string" ? s.from.trim() : "";
      const to = typeof s.to === "string" ? s.to.trim() : "";
      const rawQty = (s as any).qty;

      const qtyNum =
        typeof rawQty === "number"
          ? rawQty
          : typeof rawQty === "string"
          ? parseInt(rawQty.replace(/[^\d]/g, ""), 10)
          : undefined;

      if (!from && !to) return null;

      let core = "";
      if (from && to) core = `${from} → ${to}`;
      else if (to) core = `na: ${to}`;
      else core = `z: ${from}`;

      const label =
        typeof qtyNum === "number" && !Number.isNaN(qtyNum) && qtyNum > 0
          ? `${qtyNum}× ${core}`
          : core;

      return {
        qty: qtyNum,
        from: from || undefined,
        to: to || undefined,
        label,
      };
    })
    .filter(Boolean) as SetSwapDetail[];

  // --- DODATKI ---
  const rawAddons = [
    ...collectStrings(source.addons),
    ...collectStrings(source.extras),
    ...collectStrings(srcOptions?.addons),
    ...collectStrings(source.selected_addons),
    ...collectStrings(source.toppings),
  ]
    .map((s) => (s || "").trim())
    .filter((s) => s && s !== "0");

  const uniqueAddons = Array.from(new Set(rawAddons));

  const { plain, setMeta, tartarBases } =
    parseSetAddonsFromAddons(uniqueAddons);

  const addons = [...plain, ...swapLabels];

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

  const note =
    (typeof source.note === "string" && source.note) ||
    (typeof source.comment === "string" && source.comment) ||
    (typeof srcOptions?.note === "string" && srcOptions.note) ||
    undefined;

  const isSet =
    /^zestaw\b/i.test(name) ||
    /^set\b/i.test(name) ||
    /zestaw\s+\d+/i.test(name);

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
    setSwaps, // <--- NOWE: uporządkowane zamiany w zestawie
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
  useEffect(() => {
    const iv = setInterval(() => {
      const left = new Date(targetTime).getTime() - Date.now();
      setMs(Math.max(0, left));
      if (left <= 0) onComplete?.();
    }, 1000);
    return () => clearInterval(iv);
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
  const supabase = createClientComponentClient();
  const searchParams = useSearchParams();
  const urlSlug = (searchParams.get("restaurant") || "").toLowerCase() || null;

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
        setPushError(
          "Brak klucza VAPID (NEXT_PUBLIC_VAPID_PUBLIC_KEY). Skonfiguruj go w env."
        );
        return;
      }

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushStatus("not-allowed");
        return;
      }

      // jeśli SW jeszcze nie ma, zarejestruj (w praktyce robi to ClientWrapper)
      const reg =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js"));

      // jeśli już jest subskrypcja – nie dubluj
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        setPushStatus("subscribed");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });

      setPushStatus("subscribed");
    } catch (e) {
      console.error(e);
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

 /* AUDIO – dźwięk nowego zamówienia */
const newOrderAudio = useRef<HTMLAudioElement | null>(null);

useEffect(() => {
  if (typeof window === "undefined") return;

  const src = "/new-order.mp3"; // upewnij się, że plik jest w public/
  const a = new Audio(src);
  a.preload = "auto";
  a.volume = 1;
  newOrderAudio.current = a;

  // „odblokowanie” audio po pierwszym kliknięciu
  const unlock = async () => {
    try {
      a.currentTime = 0;
      await a.play();
      a.pause();
      console.log("[audio] odblokowane");
    } catch (err) {
      console.warn("[audio] nie udało się odblokować", err);
    }
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  console.log("[audio] zainicjalizowano", src);

  return () => window.removeEventListener("pointerdown", unlock);
}, []);

const playDing = useCallback(async () => {
  try {
    if (!newOrderAudio.current) {
      console.warn("[audio] brak instancji Audio");
      return;
    }
    newOrderAudio.current.currentTime = 0;
    await newOrderAudio.current.play();
    console.log("[audio] ding");
  } catch (err) {
    console.warn("[audio] błąd odtwarzania", err);
  }
}, []);

  const prevIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!booted) return;
    try {
      setErrorMsg(null);
      if (!editingOrderId) setLoading(true);

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
        setOrders([]);
        setTotal(0);
        setErrorMsg(json?.error || "Błąd pobierania zamówień");
        return;
      }

      /* ważne: bierzemy restaurant_id z odpowiedzi API, bo httpOnly cookie nie jest dostępne w JS */
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

  // jeśli to „Na wynos” i w kolumnie address siedzi tekst,
  // traktujemy go jako notatkę klienta (kompatybilność wsteczna)
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
   clientDelivery:
      (o.scheduled_delivery_at as string | undefined) ??
      (o.client_delivery_time as string | undefined) ??
      (o.clientDelivery as string | undefined),

    // czas ustawiony przez lokal (ETA)
    deliveryTime: (o.deliveryTime as string | undefined) ?? (o.delivery_time as string | undefined) ?? null,

    // adres – normalnie tylko dla dostawy
    address:
      o.selected_option === "delivery"
        ? `${o.street || ""}${
            o.flat_number ? `, nr ${o.flat_number}` : ""
          }${o.city ? `, ${o.city}` : ""}`
        : o.address || "",

    street: o.street,
    flat_number: o.flat_number,
    city: o.city,
    phone: o.phone,
    items: o.items ?? o.order_items ?? [],
    selected_option: o.selected_option,
    payment_method: fromDBPaymentMethod(o.payment_method),
    payment_status: fromDBPaymentStatus(o.payment_status),

    // NOWE: notatki
    note: o.note ?? noteFromAddress ?? null,
    kitchen_note: o.kitchen_note ?? null,

    // rabaty / lojalność
    promo_code: o.promo_code ?? null,
    discount_amount:
      o.discount_amount != null ? Number(o.discount_amount) || 0 : 0,
    loyalty_stickers_before:
      typeof o.loyalty_stickers_before === "number"
        ? o.loyalty_stickers_before
        : null,
    loyalty_stickers_after:
      typeof o.loyalty_stickers_after === "number"
        ? o.loyalty_stickers_after
        : null,
    loyalty_applied: !!o.loyalty_applied,
    loyalty_reward_type: o.loyalty_reward_type ?? null,
    loyalty_reward_value:
      o.loyalty_reward_value != null
        ? Number(o.loyalty_reward_value)
        : null,
    loyalty_min_order:
      o.loyalty_min_order != null
        ? Number(o.loyalty_min_order)
        : null,

    // rezerwacja
    reservation_id: o.reservation_id ?? null,
    reservation_date: o.reservation_date ?? null,
    reservation_time: o.reservation_time ?? null,

    // pałeczki
    chopsticks: chopsticksRaw ?? 0,
  };
});

      setTotal(totalCount);

      mapped.sort((a, b) => {
        const ta = +new Date(a.created_at);
        const tb = +new Date(b.created_at);
        return sortOrder === "desc" ? tb - ta : ta - tb;
      });

      // wykrywanie nowych zamówień (do pojedynczego dźwięku)
      const prev = prevIdsRef.current;
      const newOnes = mapped.filter(
        (o) =>
          (o.status === "new" ||
            o.status === "pending" ||
            o.status === "placed") &&
          !prev.has(o.id)
      );
      if (initializedRef.current && newOnes.length > 0) void playDing();
      prevIdsRef.current = new Set(mapped.map((o) => o.id));
      initializedRef.current = true;

      setOrders(mapped);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setErrorMsg("Błąd sieci");
        setOrders([]);
        setTotal(0);
      }
    } finally {
      if (!editingOrderId) setLoading(false);
    }
  }, [
    booted,
    page,
    perPage,
    sortOrder,
    editingOrderId,
    playDing,
    restaurantSlug,
    urlSlug,
  ]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // <-- NOWE: fallback polling zamówień co 8 sekund
  useEffect(() => {
    if (!booted) return;           // dopóki nie wiemy, którą restaurację ładujemy
    if (editingOrderId) return;    // nie odświeżaj w trakcie edycji zamówienia

    const iv = setInterval(() => {
      fetchOrders();               // pobierz aktualną listę
    }, 8000);                      // 8 000 ms = 8 sekund

    return () => clearInterval(iv);
  }, [booted, editingOrderId, fetchOrders]);

  /* realtime tylko dla tej restauracji */
  useEffect(() => {
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
          if (restaurantId) {
            const ridNew = payload.new?.restaurant_id;
            const ridOld = payload.old?.restaurant_id;
            if (ridNew !== restaurantId && ridOld !== restaurantId) return;
          }
          fetchOrders();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, fetchOrders, restaurantId, booted]);

  /* polling płatności */
  useEffect(() => {
    const hasPending = orders.some(
      (o) => o.payment_method === "Online" && o.payment_status === "pending"
    );
    if (!hasPending || editingOrderId) return;
    const iv = setInterval(() => fetchOrders(), 3000);
    return () => clearInterval(iv);
  }, [orders, editingOrderId, fetchOrders]);

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
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    if (res.ok) updateLocal(id, { status: "completed" });
  };

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
      clientDelivery:
        (j.client_delivery_time as string | undefined) ??
        order.clientDelivery,
    });
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
      fetchOrders();
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
      fetchOrders();
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

  // Program lojalnościowy – badge w nagłówku karty zamówienia
  const loyaltyBadge = (o: Order) => {
    const before =
      typeof o.loyalty_stickers_before === "number"
        ? o.loyalty_stickers_before
        : null;
    const after =
      typeof o.loyalty_stickers_after === "number"
        ? o.loyalty_stickers_after
        : null;
    const hasStickersInfo = before !== null && after !== null;
    const hasReward = !!o.loyalty_applied;
    const discount =
      typeof o.discount_amount === "number" ? o.discount_amount : 0;
    const minOrder =
      typeof o.loyalty_min_order === "number" ? o.loyalty_min_order : null;

    if (!hasReward && !hasStickersInfo) return null;

    let line2: string;
    if (hasReward) {
      if (
        o.loyalty_reward_type === "percent" &&
        typeof o.loyalty_reward_value === "number"
      ) {
        line2 = `Nagroda: −${o.loyalty_reward_value}%${
          discount > 0 ? ` (−${discount.toFixed(2)} zł)` : ""
        }`;
      } else {
        line2 = "Nagroda: darmowa pozycja / rolka";
      }
    } else {
      line2 = "To zamówienie dolicza 1 naklejkę w programie.";
    }

    return (
      <div className="inline-flex flex-col rounded-xl bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-800">
        <span className="font-semibold">Program lojalnościowy</span>
        <span>{line2}</span>
        {hasStickersInfo && (
          <span className="mt-0.5">
            Naklejki: {before} → {after}
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

  const ProductItem: React.FC<{
  raw: any;
  onDetails?: (p: any) => void;
}> = ({ raw, onDetails }) => {
  const p = normalizeProduct(raw);
  const isSet = !!p.isSet && !!p.setMeta;

  // NOWE: uporządkowane zamiany w zestawie,
  // które bierzemy z normalizeProduct (pole setSwaps)
  const setSwaps =
    ((p as any).setSwaps as { label: string }[] | undefined) || [];
  const hasSetSwaps = isSet && setSwaps.length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm text-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{p.name}</div>

          <div className="mt-0.5 text-[12px] text-slate-700">
            Ilość: <b>{p.quantity}</b>
            {p.addons.length > 0 && (
              <>
                {" "}
                <span className="text-slate-400"> · </span> Dodatki:{" "}
                {p.addons.join(", ")}
              </>
            )}
          </div>

          {isSet && p.setMeta && (
            <div className="mt-0.5 text-[11px] text-slate-600">
              Zestaw:
              {p.setMeta.setUpgrade && " powiększony"}
              {p.setMeta.bakedWholeSet &&
                `${p.setMeta.setUpgrade ? ", " : " "}pieczony cały`}
              {!p.setMeta.bakedWholeSet &&
                p.setMeta.bakedRolls.length > 0 && (
                  <>
                    {" "}
                    · Pieczone rolki: {p.setMeta.bakedRolls.join(", ")}
                  </>
                )}
              {p.setMeta.rollExtras.length > 0 && (
                <>
                  {" "}
                  · Dodatki w rolkach: {p.setMeta.rollExtras.length}{" "}
                  {p.setMeta.rollExtras.length === 1
                    ? "pozycja"
                    : "pozycje"}
                </>
              )}
            </div>
          )}

          {/* NOWE: czytelny blok tylko z faktycznymi zamianami w zestawie */}
          {hasSetSwaps && (
            <div className="mt-1 text-[11px] text-slate-800">
              <div className="font-semibold text-slate-900">
                Zamiany w tym zestawie:
              </div>
              <ul className="mt-0.5 ml-4 list-disc space-y-0.5">
                {setSwaps.map((s, i) => (
                  <li key={i}>{s.label}</li>
                ))}
              </ul>
            </div>
          )}

          {p.ingredients.length > 0 && (
            <div className="mt-0.5 text-[12px] text-slate-700">
              Skład: {p.ingredients.join(", ")}
            </div>
          )}

          {/* Notatkę pokazujemy tylko jeśli nie mamy już ładnych zamian */}
          {p.note && (!isSet || !hasSetSwaps) && (
            <div className="mt-0.5 text-[12px] italic text-slate-800">
              Notatka: {p.note}
            </div>
          )}

          {onDetails && (
            <button
              onClick={() => onDetails(p)}
              className="mt-2 text-xs font-medium text-sky-700 underline"
            >
              Szczegóły pozycji
            </button>
          )}
        </div>

        <div className="whitespace-nowrap text-sm font-semibold text-amber-700">
          {p.price.toFixed(2)} zł
        </div>
      </div>
    </div>
  );
};

  const ProductDetailsModal: React.FC<{
    product: any;
    onClose(): void;
  }> = ({ product, onClose }) => {
    // zawsze normalizujemy na bazie oryginalnego _raw
    const p = normalizeProduct(product?._raw || product);
    const title = p.quantity > 1 ? `${p.name} x${p.quantity}` : p.name;
    const isSet = !!p.isSet && !!p.setMeta;

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
                <div className="mt-1">
                  <b>Zamiany w zestawie:</b>{" "}
                  {p.swaps && p.swaps.length > 0 ? (
                    <ul className="ml-5 mt-1 list-disc">
                      {p.swaps.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
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

                  // szczegóły zamian – używamy structured swapDetails
                  const swapDetails =
                    (p as any).swapDetails as
                      | { from?: string; to?: string; label: string }[]
                      | undefined;

                  if (swapDetails && swapDetails.length) {
                    for (const s of swapDetails) {
                      const target = (s.to || s.from || "").trim();
                      if (!target) continue;
                      const ri = ensure(target);
                      if (!ri) continue;
                      if (s.from && s.to && s.from !== s.to) {
                        ri.swappedFrom = s.from;
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

            {p.addons.length > 0 && (
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

    if (o.clientDelivery) {
      const lbl = formatTimeLabel(o.clientDelivery);
      if (lbl !== "-" && lbl !== "Jak najszybciej") {
        timeLabel = lbl;
      }
    } else if (o.reservation_time) {
      timeLabel = o.reservation_time;
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
    <b>Czas (klient):</b> {formatTimeLabel(o.clientDelivery)}
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
              {new Date(o.created_at).toLocaleString("pl-PL")}
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
                      onDetails={(np) => setSelectedProduct(np)}
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
              <AcceptButton
                order={o}
                onAccept={(m) => acceptAndSetTime(o, m)}
              />
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
              <button
                onClick={() => completeOrder(o.id)}
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
      {loading && list === newList && (
        <p className="text-center text-slate-500">Ładowanie…</p>
      )}
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
      <div className="mb-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100 p-3 text-xs sm:text-sm text-amber-900">
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
            <b>Pałeczki</b> – liczba jest pobierana z zamówienia klienta
            (nie zmieniasz jej tutaj).
          </li>
          <li>
            <b>Płatność</b> – wybierz formę. Dla opcji <b>Online</b>{" "}
            możesz użyć przycisku „Odśwież status”.
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
      <div className="sticky top-0 z-20 -mx-4 mb-5 bg-white/90 p-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:border-slate-200">
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
