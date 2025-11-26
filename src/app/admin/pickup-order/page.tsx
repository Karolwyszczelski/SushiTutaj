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

  // NEW: liczba pałeczek
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

const normalizeProduct = (raw: Any) => {
  const shallow = [
    raw.name,
    raw.product_name,
    raw.productName,
    raw.title,
    raw.label,
    raw.menu_item_name,
    raw.item_name,
    raw.nazwa,
    raw.nazwa_pl,
    typeof raw.product === "string" ? raw.product : undefined,
    raw.product?.name,
    raw.item?.name,
    raw.product?.title,
  ].filter((x) => typeof x === "string" && x.trim()) as string[];
  const deep = deepFindName(raw);
  const name = (shallow[0] || deep || "(bez nazwy)") as string;

  const price = toNumber(
    raw.price ??
      raw.unit_price ??
      raw.total_price ??
      raw.amount_price ??
      raw.item?.price ??
      0
  );
  const quantity = toNumber(raw.quantity ?? raw.qty ?? raw.amount ?? 1, 1) || 1;

  const addons = [
    ...collectStrings(raw.addons),
    ...collectStrings(raw.extras),
    ...collectStrings(raw.options),
    ...collectStrings(raw.selected_addons),
    ...collectStrings(raw.toppings),
  ].filter((s) => s && s !== "0");

  const ingredients = collectStrings(raw.ingredients).length
    ? collectStrings(raw.ingredients)
    : collectStrings(
        raw.components ??
          raw.composition ??
          raw.sklad ??
          raw.skladniki ??
          raw.ingredients_list ??
          raw.product?.ingredients
      );

  const description =
    (typeof raw.description === "string" && raw.description) ||
    (typeof raw.opis === "string" && raw.opis) ||
    (typeof raw.product?.description === "string" &&
      raw.product.description) ||
    undefined;

  const note =
    (typeof raw.note === "string" && raw.note) ||
    (typeof raw.comment === "string" && raw.comment) ||
    undefined;

  return {
    name,
    price,
    quantity,
    addons,
    ingredients,
    description,
    note,
    _raw: raw,
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

const AcceptButton: React.FC<{
  order: Order;
  onAccept: (minutes: number) => Promise<void> | void;
}> = ({ order, onAccept }) => {
  const [open, setOpen] = useState(false);

  // tylko delivery / takeaway
  const options: number[] = useMemo(
    () =>
      order.selected_option === "delivery"
        ? [30, 60, 90, 120]
        : [15, 20, 30, 45, 60],
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
        Akceptuj{" "}
        {minutes >= 60 ? `(${minutes / 60} h)` : `(${minutes} min)`}
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
              <span>{m >= 60 ? `${m / 60} h` : `${m} min`}</span>
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

/* --------- NEW: pałeczki – ekstrakcja i zapis --------- */

const asInt = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
};

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
  const top = readNestedInt(o, [
    "chopsticks_count",
    "chopsticks",
    "paleczki",
    "paleczki_count",
    "sticks",
    "ilosc_paleczek",
    "ilosc_pałeczek",
  ]);
  if (top !== null) return top;

  // poszukaj w meta / options / data
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
    const n = readNestedInt(d, [
      "chopsticks_count",
      "chopsticks",
      "paleczki",
      "paleczki_count",
      "sticks",
      "ilosc_paleczek",
      "ilosc_pałeczek",
    ]);
    if (n !== null) return n;
  }

  // ostatnia próba: w items JSON – niektóre systemy pakują tu ustawienia
  try {
    const items = typeof o?.items === "string" ? JSON.parse(o.items) : o?.items;
    if (items && typeof items === "object") {
      const n =
        readNestedInt(items, ["chopsticks_count", "chopsticks", "paleczki"]) ??
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

  /* AUDIO – pojedynczy dźwięk + pętla alarmowa */
  const newOrderAudio = useRef<HTMLAudioElement | null>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const a = new Audio("/new-order.mp3");
    a.preload = "auto";
    a.volume = 1;
    newOrderAudio.current = a;

    const unlock = async () => {
      try {
        a.currentTime = 0;
        await a.play();
        a.pause();
      } catch {}
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const playDing = useCallback(async () => {
    try {
      if (newOrderAudio.current) {
        newOrderAudio.current.currentTime = 0;
        await newOrderAudio.current.play();
      }
    } catch {}
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

      if (json?.restaurant_id && typeof json.restaurant_id === "string") {
        setRestaurantId(json.restaurant_id);
      }
      if (slug && !restaurantSlug) setRestaurantSlug(slug);

      const raw = Array.isArray(json.orders) ? json.orders : [];
      const totalCount = Number(json.totalCount || 0);

      const mapped: Order[] = raw.map((o: any) => ({
        id: String(o.id),
        name: o.name ?? o.customer_name ?? o.client_name ?? undefined,
        total_price: toNumber(o.total_price),
        delivery_cost: o.delivery_cost ?? null,
        created_at: o.created_at,
        status: o.status,
        clientDelivery:
          o.client_delivery_time ??
          o.delivery_time ??
          o.clientDelivery,
        deliveryTime: o.deliveryTime ?? o.delivery_time ?? null,
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

        // NEW: odczyt pałeczek
        chopsticks: extractChopsticksFromOrderRaw(o),
      }));

      setTotal(totalCount);

      mapped.sort((a, b) => {
        const ta = +new Date(a.created_at);
        const tb = +new Date(b.created_at);
        return sortOrder === "desc" ? tb - ta : ta - tb;
      });

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

  // 🔧 Akceptacja przez PATCH /api/orders/[id] → status + czas + powiadomienia
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
          deliveryTime: eta,
          delivery_time: eta,
          client_delivery_time: eta,
        }),
      });

      const j = (await res.json().catch(() => ({}))) as any;

      if (!res.ok) {
        setErrorMsg(
          j?.error || "Nie udało się zaakceptować zamówienia."
        );
        return;
      }

      updateLocal(order.id, {
        status: (j.status as Order["status"]) || "accepted",
        deliveryTime:
          (j.deliveryTime as string) ||
          (j.delivery_time as string) ||
          eta,
        clientDelivery:
          (j.client_delivery_time as string) ||
          order.clientDelivery ||
          eta,
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

  /* --- NEW: zapis liczby pałeczek --- */
  const setChopsticks = async (o: Order, value: number) => {
    const safe = Math.max(0, Math.floor(value));
    try {
      setEditingOrderId(o.id);
      const payload = {
        chopsticks_count: safe,
        chopsticks: safe,
        paleczki: safe,
        paleczki_count: safe,
        sticks: safe,
      };
      const res = await fetch(`/api/orders/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      updateLocal(o.id, { chopsticks: safe });
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

  /* --- PĘTLA DŹWIĘKU: gra dopóki są niezaakceptowane zamówienia --- */
  useEffect(() => {
    const hasOpenNew = newList.length > 0;

    if (hasOpenNew) {
      if (!ringIntervalRef.current) {
        ringIntervalRef.current = setInterval(() => {
          void playDing();
        }, 10000); // co 10 sekund, dopóki są nowe/pending/placed
      }
    } else {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
    }

    return () => {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
    };
  }, [newList.length, playDing]);

  const ProductItem: React.FC<{
    raw: any;
    onDetails?: (p: any) => void;
  }> = ({ raw, onDetails }) => {
    const p = normalizeProduct(raw);
    return (
      <div className="rounded-md border bg-white p-3 shadow-sm text-slate-900">
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
            {p.ingredients.length > 0 && (
              <div className="mt-0.5 text-[12px] text-slate-700">
                Skład: {p.ingredients.join(", ")}
              </div>
            )}
            {p.note && (
              <div className="mt-0.5 text-[12px] italic text-slate-800">
                Notatka: {p.note}
              </div>
            )}
            {onDetails && (
              <button
                onClick={() => onDetails(p)}
                className="mt-2 text-xs font-medium text-blue-700 underline"
              >
                Szczegóły
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
    const p = normalizeProduct(product);
    const title = p.quantity > 1 ? `${p.name} x${p.quantity}` : p.name;
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
        <div className="w-full max-w-lg rounded-md border bg-white p-5 text-slate-900 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-md border px-3 py-1 text-sm hover:bg-slate-50"
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
            {p.addons.length > 0 && (
              <div>
                <b>Dodatki:</b> {p.addons.join(", ")}
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
    const sticks = o.chopsticks ?? 0;

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
              {paymentBadge(o)}
            </div>
            <div className="text-sm text-slate-700">
              <b>Klient:</b> {o.name || "—"}
              <span className="ml-3">
                <b>Czas (klient):</b>{" "}
                {o.clientDelivery === "asap"
                  ? "Jak najszybciej"
                  : o.clientDelivery
                  ? new Date(o.clientDelivery).toLocaleTimeString(
                      "pl-PL",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )
                  : "-"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {o.status === "accepted" &&
              o.deliveryTime && (
                <InlineCountdown
                  targetTime={o.deliveryTime}
                  onComplete={() => completeOrder(o.id)}
                />
              )}
            <span className="text-slate-600">
              {new Date(o.created_at).toLocaleString("pl-PL")}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2 text-sm text-slate-800">
            <div>
              <b>Kwota:</b> {o.total_price.toFixed(2)} zł
            </div>
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

            <div className="mt-1">
              <b>Płatność:</b>{" "}
              <span className="inline-flex items-center gap-2">
                <select
                  value={o.payment_method || "Gotówka"}
                  onChange={(e) =>
                    setPaymentMethod(
                      o,
                      e.target.value as PaymentMethod
                    )
                  }
                  className="h-8 rounded border bg-white px-2 text-xs text-slate-900"
                  disabled={editingOrderId === o.id}
                >
                  <option>Gotówka</option>
                  <option>Terminal</option>
                  <option>Online</option>
                </select>

                {o.payment_method === "Online" ? (
                  <>
                    <span className="ml-1">
                      {paymentBadge(o)}
                    </span>
                    {o.payment_status === "pending" && (
                      <button
                        onClick={() =>
                          refreshPaymentStatus(o.id)
                        }
                        className="h-8 rounded bg-sky-600 px-2 text-xs font-semibold text-white hover:bg-sky-500"
                        disabled={editingOrderId === o.id}
                      >
                        Odśwież status
                      </button>
                    )}
                  </>
                ) : (
                  <span className="ml-1">
                    {paymentBadge(o)}
                  </span>
                )}
              </span>
            </div>

            {/* NEW: Pałeczki */}
            <div className="mt-3">
              <label className="mb-1 block text-sm font-semibold text-slate-800">
                Pałeczki
              </label>
              <div className="inline-flex items-center gap-2">
                <button
                  onClick={() =>
                    setChopsticks(
                      o,
                      Math.max(0, (o.chopsticks ?? 0) - 1)
                    )
                  }
                  className="h-8 w-8 rounded-md border bg-white text-slate-900 hover:bg-slate-50"
                  disabled={editingOrderId === o.id}
                  aria-label="Mniej pałeczek"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  value={sticks}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    const n = asInt(v) ?? 0;
                    updateLocal(o.id, { chopsticks: n });
                  }}
                  onBlur={(e) => {
                    const n = asInt(e.currentTarget.value) ?? 0;
                    void setChopsticks(o, n);
                  }}
                  className="h-8 w-16 rounded-md border bg-white px-2 text-center text-sm"
                  disabled={editingOrderId === o.id}
                />
                <button
                  onClick={() =>
                    setChopsticks(o, (o.chopsticks ?? 0) + 1)
                  }
                  className="h-8 w-8 rounded-md border bg-white text-slate-900 hover:bg-slate-50"
                  disabled={editingOrderId === o.id}
                  aria-label="Więcej pałeczek"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="mb-1 text-sm font-semibold text-slate-800">
              Produkty
            </div>
            {prods.length === 0 ? (
              <div className="rounded-md border bg-white p-3 text-sm text-slate-500">
                brak
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

        <footer className="mt-4 flex flex-wrap items-center gap-2">
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
              {[15, 30, 45, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => extendTime(o, m)}
                  className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  +{m >= 60 ? `${m / 60} h` : `${m} min`}
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
                className="h-10 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500"
              >
                Zrealizowany
              </button>
            </>
          )}

          {o.status === "cancelled" && (
            <button
              onClick={() => restoreOrder(o.id)}
              className="h-10 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500"
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
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      {loading && list === newList && (
        <p className="text-center text-slate-500">Ładowanie…</p>
      )}
      {list.length === 0 ? (
        <p className="text-center text-slate-600">Brak pozycji.</p>
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

      {/* Instrukcja dla obsługi */}
      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs sm:text-sm text-amber-900">
        <p className="mb-1 font-semibold">
          Jak obsługiwać zamówienia w tym widoku:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <b>Nowe zamówienia</b> pojawiają się na górze. Ustal czas i kliknij{" "}
            <b>Akceptuj</b>, żeby rozpocząć realizację.
          </li>
          <li>
            Po akceptacji zamówienie trafia do sekcji{" "}
            <b>„Zamówienia w realizacji”</b>, a klient dostaje godzinę odbioru.
          </li>
          <li>
            <b>Pałeczki</b> – ustaw liczbę sztuk dla zamówienia (minus / plus
            lub wpisz ręcznie). Liczba zapisuje się po zmianie.
          </li>
          <li>
            <b>Płatność</b> – wybierz formę. Dla opcji <b>Online</b> możesz
            użyć przycisku „Odśwież status”.
          </li>
          <li>
            Po wydaniu zamówienia kliknij przycisk <b>„Zrealizowany”</b>, żeby
            zamknąć je w systemie.
          </li>
        </ul>
      </div>

      {/* Pasek filtrów */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 bg-white p-4 text-slate-900 sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-10 rounded-md border bg-white px-3 text-sm text-slate-900"
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
            className="h-10 rounded-md border bg-white px-3 text-sm text-slate-900"
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
            className="h-10 rounded-md border bg-white px-3 text-sm text-slate-900"
            onClick={() =>
              setSortOrder((o) => (o === "desc" ? "asc" : "desc"))
            }
          >
            {sortOrder === "desc" ? "Najnowsze" : "Najstarsze"}
          </button>
          <button
            className="ml-auto h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500"
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
          className="h-10 rounded-md border px-4 text-sm disabled:opacity-50"
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
          className="h-10 rounded-md border px-4 text-sm disabled:opacity-50"
        >
          Następna
        </button>
      </div>
    </div>
  );
}
