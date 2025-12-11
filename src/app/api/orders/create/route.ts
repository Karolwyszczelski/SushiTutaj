export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { toZonedTime } from "date-fns-tz";
import { trackingUrl } from "@/lib/orderLink";
import { sendEmail } from "@/lib/e-mail";
import { sendSms } from "@/lib/sms";
import { computeAddonPriceBackend } from "@/lib/addons";
import { buildKitchenNote } from "@/lib/kitchenNote";

type NotificationType = "order" | "error" | "system";

type LoyaltyChoice = "keep" | "use_4" | "use_8";

async function pushAdminNotification(
  restaurant_id: string,
  type: NotificationType,
  title: string,
  message?: string | null
) {
  try {
    await supabaseAdmin.from("admin_notifications").insert({
      restaurant_id,
      type,
      title,
      message: message ?? null,
    });
  } catch (e: any) {
    console.error("[admin_notifications.insert] error:", e?.message || e);
  }
}

function recomputeTotalFromItems(itemsPayload: any[]): number {
  return itemsPayload.reduce((acc, it) => {
    const qty = it.quantity || 1;
    const base =
      typeof it.unit_price === "string"
        ? parseFloat(it.unit_price)
        : it.unit_price || 0;
    const addonsCost = (it.options?.addons ?? []).reduce(
      (sum: number, addon: string) => sum + computeAddonPriceBackend(addon),
      0
    );
    return acc + (base + addonsCost) * qty;
  }, 0);
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";

const TERMS_VERSION = process.env.TERMS_VERSION || "2025-01";
const PRIVACY_VERSION = process.env.PRIVACY_VERSION || "2025-01";
const TERMS_URL =
  process.env.TERMS_URL || "https://www.sushitutaj.pl/regulamin";
const PRIVACY_URL =
  process.env.PRIVACY_URL ||
  "https://www.sushitutaj.pl/polityka-prywatnosci";

/* ===== Godziny otwarcia per miasto ===== */
type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = niedziela
type Range = [h: number, m: number, H: number, M: number];

const SCHEDULE: Record<string, Partial<Record<Day, Range>> & { default?: Range }> =
  {
    // Ciechanów: pon–niedz 12:00–20:30, pt 12:00–21:30
    ciechanow: {
      0: [12, 0, 20, 30],
      1: [12, 0, 20, 30],
      2: [12, 0, 20, 30],
      3: [12, 0, 20, 30],
      4: [12, 0, 20, 30],
      5: [12, 0, 21, 30],
      6: [12, 0, 20, 30],
    },
    // Przasnysz / Szczytno – domyślnie 12–20:30
    przasnysz: { default: [12, 0, 20, 30] },
    szczytno: { default: [12, 0, 20, 30] },
  };

const tz = "Europe/Warsaw";
const nowPL = () => toZonedTime(new Date(), tz);
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (r: Range) => `${pad(r[0])}:${pad(r[1])}–${pad(r[2])}:${pad(r[3])}`;

function isOpenFor(slug: string, d = nowPL()) {
  const sch = SCHEDULE[slug] ?? SCHEDULE["przasnysz"];
  const wd = d.getDay() as Day;
  const r = sch[wd] ?? sch.default;
  if (!r) return { open: false, label: "zamknięte" };
  const mins = d.getHours() * 60 + d.getMinutes();
  const openM = r[0] * 60 + r[1];
  const closeM = r[2] * 60 + r[3];
  return { open: mins >= openM && mins <= closeM, label: fmt(r) };
}

/* ===== Program lojalnościowy ===== */
const LOYALTY_MIN_ORDER_BASE = 50; // zł (produkty + opakowanie, bez dostawy)
const LOYALTY_PERCENT = 30; // % rabatu przy 8 naklejkach
const LOYALTY_REWARD_ROLL_COUNT = 4; // ile naklejek do darmowej rolki
const LOYALTY_REWARD_PERCENT_COUNT = 8; // ile naklejek do rabatu -30%
const LOYALTY_ELIGIBLE_STATUSES = ["accepted", "completed", "placed"];

async function computeLoyaltyStickersForUser(
  userId: string | null,
  restaurantId: string | null
): Promise<number> {
  if (!userId || !restaurantId) return 0;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "total_price, discount_amount, delivery_cost, status, loyalty_choice, created_at"
    )
    .eq("restaurant_id", restaurantId)
    .eq("user", userId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("[orders.create] loyalty compute error:", error);
    return 0;
  }

  let stickers = 0;

  for (const row of data as any[]) {
    const status = String(row.status || "").toLowerCase();
    if (!LOYALTY_ELIGIBLE_STATUSES.includes(status)) continue;

    const total = Number(row.total_price || 0);
    const discount = Number(row.discount_amount || 0);
    const delivery = Number(row.delivery_cost || 0);
    const base = total + discount - delivery;
    const qualifies = base >= LOYALTY_MIN_ORDER_BASE;

    const choice = (row.loyalty_choice as LoyaltyChoice | null) || "keep";

    if (choice === "use_4") {
      // Darmowa rolka – spal wszystkie aktualne naklejki
      stickers = 0;
      continue;
    }

    if (choice === "use_8") {
      // Rabat -30% – spal wszystkie aktualne naklejki
      stickers = 0;
      continue;
    }

    // Normalne zbieranie – +1 tylko dla zamówień ≥ progu,
    // ale nigdy powyżej 8 (cap)
    if (qualifies && stickers < LOYALTY_REWARD_PERCENT_COUNT) {
      stickers += 1;
    }
  }

  return stickers;
}

/* ===== Utils ===== */
type Any = Record<string, any>;
type NormalizedItem = {
  name: string;
  quantity: number;
  price: number;
  addons: string[];
  ingredients: string[];
  note?: string;
  description?: string;
  _src?: Any;
};

const num = (v: any, d: number | null = null): number | null => {
  if (v == null) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const optLabel = (v?: string) =>
  v === "delivery" ? "DOSTAWA" : v === "takeaway" ? "NA WYNOS" : "NA WYNOS";

const normalizePhone = (phone?: string | null) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 9) return "+48" + digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (!String(phone).startsWith("+") && digits.length > 9) return "+" + digits;
  return String(phone);
};

const extractPhone = (base: any): string | null => {
  const candidates = [
    base?.phone,
    base?.phone_number,
    base?.phoneNumber,
    base?.contact_phone,
    base?.telefon,
    base?.tel,
    base?.mobile,
    base?.msisdn,
    base?.customer?.phone,
    base?.user?.phone,
  ];
  for (const v of candidates) {
    const n = normalizePhone(v);
    if (n) return n;
  }
  return null;
};

const extractUserId = (base: any): string | null => {
  const cands = [
    base?.user_id,
    base?.userId,
    base?.user?.id,
    typeof base?.user === "string" ? base.user : null,
  ].filter(Boolean);
  return (cands[0] as string) ?? null;
};

const toArray = (val: any): any[] =>
  Array.isArray(val) ? val : val == null ? [] : [val];

const clientIp = (req: Request) => {
  const xff =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "";
  return xff.split(",")[0].trim() || null;
};

const parseIngredients = (v: any): string[] => {
  if (!v) return [];
  if (Array.isArray(v))
    return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "object") {
    if (Array.isArray((v as any).items))
      return parseIngredients((v as any).items);
    return Object.values(v)
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof v === "string") {
    const s = v.trim();
    try {
      return parseIngredients(JSON.parse(s));
    } catch {}
    if (s.startsWith("{") && s.endsWith("}")) {
      return s
        .slice(1, -1)
        .split(",")
        .map((x) => x.replace(/^"+|"+$/g, "").trim())
        .filter(Boolean);
    }
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
};

const PRODUCT_TABLES = ["products", "menu_items", "menu", "dishes"] as const;
type ProductRow = {
  id: string | number;
  name?: string | null;
  title?: string | null;
  label?: string | null;
  description?: string | null;
  description_pl?: string | null;
  ingredients?: any;
  composition?: any;
  sklad?: any;
};

async function fetchProductsByIds(idsMixed: (string | number)[]) {
  // poprawka: filtr na tablicy, nie na Set
  const ids = Array.from(
    new Set(idsMixed.map((x) => String(x)))
  ).filter((v) => Boolean(v)) as string[];

  if (!ids.length) return new Map<string, ProductRow>();
  for (const table of PRODUCT_TABLES) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(
        "id,name,title,label,description,description_pl,ingredients,composition,sklad"
      )
      .in("id", ids);
    if (!error && data && data.length) {
      const map = new Map<string, ProductRow>();
      (data as any[]).forEach((r) => map.set(String(r.id), r as ProductRow));
      return map;
    }
  }
  return new Map<string, ProductRow>();
}

const nameFromProductRow = (row?: ProductRow): string | undefined =>
  row ? row.name || row.title || row.label || undefined : undefined;

const descFromProductRow = (row?: ProductRow): string | undefined =>
  row ? row.description_pl ?? row.description ?? undefined : undefined;

const ingredientsFromProductRow = (row?: ProductRow): string[] =>
  row
    ? parseIngredients(row.ingredients) ||
      parseIngredients(row.composition) ||
      parseIngredients(row.sklad) ||
      []
    : [];

// OCZYSZCZONA wersja (bez mięsa z poprzedniego systemu)
function buildItemFromDbAndOptions(
  dbRow: ProductRow | undefined,
  raw: Any
): NormalizedItem {
  const baseName =
    nameFromProductRow(dbRow) ||
    raw.name ||
    raw.product_name ||
    raw.productName ||
    raw.title ||
    raw.label ||
    "(bez nazwy)";

  const quantity = (num(raw.quantity ?? raw.qty ?? 1, 1) ?? 1) as number;
  const price = (num(
    raw.price ?? raw.unit_price ?? raw.total_price ?? 0,
    0
  ) ?? 0) as number;

  const opt = raw.options ?? {};
  const addons: string[] = [
    ...toArray(raw.addons),
    ...toArray(opt.addons),
    ...toArray(raw.extras),
    ...toArray(raw.toppings),
    ...toArray(raw.selected_addons),
  ]
    .flat()
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);

  const baseIngredients = ingredientsFromProductRow(dbRow);
  const clientIng =
    parseIngredients(raw.ingredients) ||
    parseIngredients(raw.sklad) ||
    parseIngredients(raw.composition);
  const ingredients = [...baseIngredients, ...clientIng];

  const note =
    (typeof raw.note === "string" && raw.note) ||
    (typeof opt.note === "string" && opt.note) ||
    undefined;

  const description =
    (typeof raw.description === "string" && raw.description) ||
    descFromProductRow(dbRow);

  return {
    name: String(baseName),
    quantity,
    price,
    addons,
    ingredients,
    note,
    description,
    _src: raw,
  };
}

/* ===== Statusy ===== */
const ALLOWED_ORDER_STATUSES = [
  "new",
  "placed",
  "accepted",
  "cancelled",
  "completed",
] as const;
type AllowedOrderStatus = (typeof ALLOWED_ORDER_STATUSES)[number];

function sanitizeOrderStatus(raw: unknown): AllowedOrderStatus {
  const s0 = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const map: Record<string, AllowedOrderStatus> = {
    pending: "new",
    created: "new",
    confirmed: "accepted",
    processing: "accepted",
    inprogress: "accepted",
    done: "completed",
    delivered: "completed",
    canceled: "cancelled",
  };
  const s = map[s0] ?? s0;
  return (ALLOWED_ORDER_STATUSES as readonly string[]).includes(s)
    ? (s as AllowedOrderStatus)
    : "new";
}

/* ===== Haversine ===== */
const haversineKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1));
};

// dystans z Google (przez /api/distance), fallback na Haversine
async function getDistanceKmFromGoogle(
  req: Request,
  restLat: number,
  restLng: number,
  custLat: number,
  custLng: number
): Promise<number> {
  let distance_km = haversineKm(
    { lat: restLat, lng: restLng },
    { lat: custLat, lng: custLng }
  );

  try {
    const originBase = process.env.APP_BASE_URL || new URL(req.url).origin;
    const resp = await fetch(
      `${originBase}/api/distance?origin=${restLat},${restLng}&destination=${custLat},${custLng}`
    );
    if (!resp.ok) return distance_km;

    const json = await resp.json();
    if (typeof json.distance_km === "number") {
      distance_km = json.distance_km;
    }
  } catch (e) {
    console.error("[orders.create] /api/distance error:", e);
  }

  return distance_km;
}

/* ===== Normalizacja BODY ===== */
function normalizeBody(raw: any, req: Request): any {
  const base = raw?.orderPayload ? raw.orderPayload : raw;

  const rawItems =
    raw?.items ??
    base?.items ??
    raw?.order_items ??
    raw?.cart ??
    raw?.products ??
    raw?.itemsPayload ??
    [];
  const itemsArray: Any[] =
    typeof rawItems === "string"
      ? (() => {
          try {
            return JSON.parse(rawItems);
          } catch {
            return [];
          }
        })()
      : Array.isArray(rawItems)
      ? rawItems
      : [];

  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ua = req.headers.get("user-agent") || null;
  const accepted_at = new Date().toISOString();

  const legal_accept =
    base?.legal_accept && typeof base.legal_accept === "object"
      ? {
          terms_version: base.legal_accept.terms_version || TERMS_VERSION,
          privacy_version:
            base.legal_accept.privacy_version || PRIVACY_VERSION,
          marketing_opt_in: !!base.legal_accept.marketing_opt_in,
          accepted_at: base.legal_accept.accepted_at || accepted_at,
          ip: base.legal_accept.ip || ip,
          ua: base.legal_accept.ua || ua,
        }
      : {
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
          marketing_opt_in: !!base?.marketing_opt_in,
          accepted_at,
          ip,
          ua,
        };

  // ilość pałeczek – różne nazwy
  const sticksRaw =
    base?.chopsticks_qty ??
    base?.chopsticks ??
    base?.sticks_qty ??
    base?.sticks ??
    base?.paleczki ??
    base?.ilosc_paleczek ??
    0;
  const chopsticks_qty = Math.max(
    0,
    Math.min(
      10,
      Number.isFinite(Number(sticksRaw)) ? Number(sticksRaw) : 0
    )
  );

  // sposób realizacji z payloadu
  const selected_option: "delivery" | "takeaway" =
    (base?.selected_option as any) === "delivery" ? "delivery" : "takeaway";

  // surowy address i note z payloadu
  const rawAddress = base?.address ?? null;
  const rawNote =
    base?.note ??
    base?.order_note ??
    base?.orderNote ??
    base?.comments ??
    base?.comment ??
    null;

  // Dla dostawy: address = adres, note = notatka z osobnego pola
  // Dla "na wynos": address = null, note = osobne pole LUB (fallback) to,
  // co stary frontend wysyłał w address
  const address =
    selected_option === "delivery" ? rawAddress : null;

  const note =
    rawNote ??
    (selected_option === "takeaway" ? rawAddress : null);

  return {
    name: base?.name ?? base?.customer_name ?? null,
    phone: extractPhone(base),
    contact_email: base?.contact_email ?? base?.email ?? null,
    address,
    street: base?.street ?? null,
    postal_code: base?.postal_code ?? null,
    city: base?.city ?? null,
    flat_number: base?.flat_number ?? null,
    selected_option,
    payment_method: "Gotówka", // wymuszamy gotówkę
    payment_status: "unpaid",
    total_price: num(base?.total_price, 0),
    promo_code: base?.promo_code ?? null,
    discount_amount: num(base?.discount_amount, 0) ?? 0,
    delivery_cost: num(base?.delivery_cost, null),
    delivery_lat: num(base?.delivery_lat ?? base?.lat, null),
    delivery_lng: num(base?.delivery_lng ?? base?.lng, null),
    status: sanitizeOrderStatus(base?.status),
    client_delivery_time:
      base?.client_delivery_time ?? base?.delivery_time ?? null,
    deliveryTime: null,
    eta: base?.eta ?? null,
    user_id: extractUserId(base),
    legal_accept,
    itemsArray,
    chopsticks_qty,
    reservation_id: base?.reservation_id ?? base?.reservationId ?? null,
    loyalty_choice:
      (base?.loyalty_choice as LoyaltyChoice | null) ??
      (base?.loyaltyChoice as LoyaltyChoice | null) ??
      null,
    note,
  };
}



/* ===================== Handler ===================== */


export async function POST(req: Request) {
  try {
    // 1) Body + Turnstile
    let raw: any;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (TURNSTILE_SECRET_KEY) {
      const headerToken =
        req.headers.get("cf-turnstile-response") ||
        req.headers.get("CF-Turnstile-Response") ||
        req.headers.get("x-turnstile-token");
      const token =
        raw?.turnstileToken ||
        raw?.token ||
        raw?.cf_turnstile_token ||
        headerToken;

      if (!token) {
        return NextResponse.json(
          { error: "Brak weryfikacji antybot." },
          { status: 400 }
        );
      }
      try {
        const ver = await fetch(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              secret: TURNSTILE_SECRET_KEY,
              response: String(token),
              remoteip: clientIp(req) || "",
            }).toString(),
          }
        );
        const jr = await ver.json();
        if (!jr?.success) {
          console.error("[turnstile.verify] fail", jr?.["error-codes"] || jr);
          return NextResponse.json(
            { error: "Nieudana weryfikacja formularza." },
            { status: 400 }
          );
        }
      } catch (e) {
        console.error("[turnstile.verify] error", e);
        return NextResponse.json(
          { error: "Błąd weryfikacji formularza." },
          { status: 400 }
        );
      }
    }

    // 1.1) Ustal slug restauracji
    const url = new URL(req.url);
    const restaurantSlug = String(
      raw?.restaurant ||
        raw?.restaurant_slug ||
        url.searchParams.get("restaurant") ||
        req.headers.get("x-restaurant-slug") ||
        ""
    )
      .trim()
      .toLowerCase();

    if (!restaurantSlug) {
      return NextResponse.json(
        { error: "Brak restauracji w żądaniu." },
        { status: 400 }
      );
    }

    // 1.2) Aktualny czas PL
    const now = nowPL();

    // 1.3) Godziny per miasto (stały grafik)
    {
      const { open, label } = isOpenFor(restaurantSlug, now);
      if (!open) {
        return NextResponse.json(
          {
            error: `Zamówienia dla ${restaurantSlug} przyjmujemy ${label}.`,
          },
          { status: 400 }
        );
      }
    }

    // 2) Normalizacja
    const n: any = normalizeBody(raw, req);

    if (!n.phone) {
      return NextResponse.json(
        { error: "Wymagany jest numer telefonu." },
        { status: 400 }
      );
    }
    if (!n.contact_email) {
      return NextResponse.json(
        { error: "Wymagany jest adres e-mail do potwierdzenia." },
        { status: 400 }
      );
    }
    if (!Array.isArray(n.itemsArray) || n.itemsArray.length === 0) {
      return NextResponse.json(
        { error: "Koszyk jest pusty." },
        { status: 400 }
      );
    }

    // 2.1) Metoda realizacji
    const fulfill_method =
      n.selected_option === "delivery" ? "delivery" : "takeaway";

    // 2.2) Opłata za opakowanie – backend (dopasowane do frontu)
    const packagingFee = n.selected_option ? 3 : 0;

    // 2.3) Suma pozycji (produkty + addony)
    const itemsTotal = recomputeTotalFromItems(n.itemsArray);
    // Baza do progów min/free_over i programu lojalnościowego – produkty + opakowanie, bez dostawy
    const baseWithoutDelivery = itemsTotal + packagingFee;

    // 2.4) restaurant_id z DB po slugu (+ aktywność lokalu)
    const { data: restRow, error: restErr } = await supabaseAdmin
      .from("restaurants")
      .select("id, slug, lat, lng, active")
      .eq("slug", restaurantSlug)
      .maybeSingle();

    if (restErr) {
      console.error("[orders.create] restaurants error:", restErr.message);
      return NextResponse.json(
        { error: "Błąd konfiguracji restauracji." },
        { status: 500 }
      );
    }
    if (!restRow?.id) {
      return NextResponse.json(
        { error: "Nieznana restauracja." },
        { status: 400 }
      );
    }

    const restaurant_id = restRow.id;

    // 2.5) Globalne wyłączenie zamówień w lokalu (przycisk w panelu)
    if (restRow.active === false) {
      return NextResponse.json(
        {
          error:
            "Ten lokal chwilowo nie przyjmuje zamówień online. Spróbuj ponownie później lub skontaktuj się z restauracją.",
        },
        { status: 400 }
      );
    }

    // 2.6) Przerwy dzienne z restaurant_closures (per restauracja, dzisiaj)
    try {
      const todayStr = `${now.getFullYear()}-${pad(
        now.getMonth() + 1
      )}-${pad(now.getDate())}`;
      const { data: cls, error: clsErr } = await supabaseAdmin
        .from("restaurant_closures")
        .select("start_time,end_time,reason")
        .eq("restaurant_id", restaurant_id)
        .eq("date", todayStr)
        .order("start_time", { ascending: true });

      if (clsErr) {
        console.error(
          "[orders.create] restaurant_closures error:",
          (clsErr as any)?.message || clsErr
        );
      } else if (cls && cls.length > 0) {
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        const activeClosure = (cls as any[]).find((c) => {
          if (!c.start_time || !c.end_time) return false;
          const [sh, sm = "0"] = String(c.start_time).split(":");
          const [eh, em = "0"] = String(c.end_time).split(":");
          const startM = Number(sh) * 60 + Number(sm);
          const endM = Number(eh) * 60 + Number(em);
          if (!Number.isFinite(startM) || !Number.isFinite(endM)) return false;
          return nowMinutes >= startM && nowMinutes <= endM;
        });

        if (activeClosure) {
          const label = `${String(activeClosure.start_time).slice(
            0,
            5
          )}–${String(activeClosure.end_time).slice(0, 5)}`;
          return NextResponse.json(
            {
              error: `Aktualnie trwa przerwa w przyjmowaniu zamówień (${label}). Spróbuj ponownie później.`,
            },
            { status: 400 }
          );
        }
      }
    } catch (e) {
      console.error("[orders.create] restaurant_closures check error:", e);
    }

    // 2.7) Blokady adres / telefon / e-mail per restauracja
    try {
      const { data: blocks, error: blocksErr } = await supabaseAdmin
        .from("blocked_addresses") // <- TU: poprawiona nazwa tabeli
        .select("pattern, note, active") // tylko istniejące kolumny
        .eq("restaurant_id", restaurant_id)
        .eq("active", true); // <- TU: aktywność po kolumnie `active`

      if (blocksErr) {
        console.error(
          "[orders.create] blocked_addresses error:",
          (blocksErr as any)?.message || blocksErr
        );
      } else if (blocks && blocks.length > 0) {
        const addrStr = [
          n.street || n.address || "",
          n.flat_number || "",
          n.city || "",
        ]
          .filter((x: any) => String(x).trim().length > 0)
          .join(" ")
          .toLowerCase();

        const phoneDigits = (n.phone || "").replace(/\D/g, "");
        const emailLower = (n.contact_email || "").toString().toLowerCase();

        const matched = (blocks as any[]).find((b) => {
          const rawPattern = String(b.pattern || "");
          if (!rawPattern.trim()) return false;

          // w obecnym schemacie nie ma kolumny `type`, więc wszystko traktujemy jako adres
          const type = (b.type as string) || "address";

          if (type === "phone") {
            const patDigits = rawPattern.replace(/\D/g, "");
            if (!patDigits) return false;
            return phoneDigits && phoneDigits.includes(patDigits);
          }

          if (type === "email") {
            return (
              !!emailLower &&
              emailLower.includes(rawPattern.toLowerCase())
            );
          }

          // domyślnie: blokada po adresie
          return !!addrStr && addrStr.includes(rawPattern.toLowerCase());
        });

        if (matched) {
          return NextResponse.json(
            {
              error:
                "Nie możemy przyjąć zamówienia dla podanych danych kontaktowych. Skontaktuj się proszę bezpośrednio z restauracją.",
            },
            { status: 409 }
          );
        }
      }
    } catch (e) {
      console.error("[orders.create] blocked_addresses check error:", e);
    }

    // 2.8) Strefa dostawy – per restauracja
    if (n.selected_option === "delivery") {
      if (n.delivery_lat == null || n.delivery_lng == null) {
        return NextResponse.json(
          { error: "Brak współrzędnych adresu dostawy." },
          { status: 400 }
        );
      }

      const { data: zones, error: zErr } = await supabaseAdmin
        .from("delivery_zones")
        .select("*")
        .eq("restaurant_id", restaurant_id)
        .eq("active", true)
        .order("min_distance_km");

      if (zErr || !zones || zones.length === 0) {
        console.error("[orders.create] delivery_zones error:", zErr);

        await pushAdminNotification(
          restaurant_id,
          "error",
          "Błąd stref dostawy",
          zErr?.message || "Brak konfiguracji stref dostawy."
        );

        return NextResponse.json(
          { error: "Brak konfiguracji stref dostawy." },
          { status: 500 }
        );
      }

      const restLat = num(restRow.lat, null);
      const restLng = num(restRow.lng, null);

      if (restLat == null || restLng == null) {
        await pushAdminNotification(
          restaurant_id,
          "error",
          "Brak współrzędnych restauracji",
          "Uzupełnij współrzędne lokalu, aby działała dostawa."
        );

        return NextResponse.json(
          { error: "Nie skonfigurowano współrzędnych restauracji." },
          { status: 500 }
        );
      }

      const distance_km = await getDistanceKmFromGoogle(
        req,
        Number(restLat),
        Number(restLng),
        Number(n.delivery_lat),
        Number(n.delivery_lng)
      );

      const zone = (zones as any[]).find(
        (z) =>
          distance_km >= Number(z.min_distance_km) &&
          distance_km <= Number(z.max_distance_km)
      );

      if (!zone) {
        return NextResponse.json(
          { error: "Adres poza zasięgiem dostawy." },
          { status: 400 }
        );
      }

      // Minimalna wartość zamówienia – produkty + opakowanie (bez dostawy)
      if (baseWithoutDelivery < Number(zone.min_order_value || 0)) {
        return NextResponse.json(
          {
            error: `Minimalna wartość zamówienia to ${Number(
              zone.min_order_value || 0
            ).toFixed(2)} zł.`,
          },
          { status: 400 }
        );
      }

      const pricingType: string =
        (zone.pricing_type as string) ??
        (Number(zone.min_distance_km) === 0 ? "flat" : "per_km");

      const flatCostRaw =
        zone.cost_fixed != null
          ? Number(zone.cost_fixed)
          : Number(zone.cost ?? 0);
      const perKmRateRaw =
        zone.cost_per_km != null
          ? Number(zone.cost_per_km)
          : Number(zone.cost ?? 0);

      let serverCost =
        pricingType === "per_km" ? perKmRateRaw * distance_km : flatCostRaw;

      // Darmowa dostawa powyżej progu – próg liczony od produktów + opakowanie
      if (
        zone.free_over != null &&
        baseWithoutDelivery >= Number(zone.free_over)
      ) {
        serverCost = 0;
      }

      const rounded = Math.max(0, Math.round(serverCost * 100) / 100);
      n.delivery_cost = rounded;
    }

       // 2.9) Program lojalnościowy + finalne przeliczenie total_price
    const deliveryCostFinal =
      n.selected_option === "delivery" ? Number(n.delivery_cost || 0) : 0;

    // Baza rabatów (kody + lojalność) – tylko produkty + opakowanie
    const discountBase = baseWithoutDelivery;

    // Czy to zamówienie samo w sobie daje nową naklejkę
    const qualifiesForStickerCurrent =
      discountBase >= LOYALTY_MIN_ORDER_BASE && !!n.user_id;

    let loyalty_stickers_before = 0;
    let loyalty_stickers_after = 0;
    let loyalty_applied = false;
    let loyalty_reward_type: string | null = null;
    let loyalty_reward_value: number | null = null;
    let loyalty_discount_amount = 0;

    // domyślny wybór – brak nagrody
    let effectiveLoyaltyChoice: LoyaltyChoice = "keep";

    if (n.user_id && restaurant_id) {
      try {
        const stickersAvailable = await computeLoyaltyStickersForUser(
          n.user_id,
          restaurant_id
        );

        loyalty_stickers_before = stickersAvailable;

        const rawChoice =
          (n.loyalty_choice as LoyaltyChoice | null) || "keep";

        // Walidacja tego, co przysłał frontend:
        // - darmowa rolka tylko jeśli klient ma ≥ 4 naklejek
        // - rabat -30% tylko jeśli klient ma ≥ 8 naklejek
        if (
          rawChoice === "use_4" &&
          stickersAvailable >= LOYALTY_REWARD_ROLL_COUNT
        ) {
          effectiveLoyaltyChoice = "use_4";
        } else if (
          rawChoice === "use_8" &&
          stickersAvailable >= LOYALTY_REWARD_PERCENT_COUNT
        ) {
          effectiveLoyaltyChoice = "use_8";
        } else {
          effectiveLoyaltyChoice = "keep";
        }

        // Obliczamy stan po tym zamówieniu
        if (effectiveLoyaltyChoice === "use_4") {
          // DARMOWA ROLKA:
          // - zużywamy wszystkie naklejki → reset do 0
          // - brak automatycznego rabatu pieniężnego (rolka ogarniana ręcznie)
          loyalty_stickers_after = 0;
          loyalty_applied = true;
          loyalty_reward_type = "roll_free";
          loyalty_reward_value = LOYALTY_REWARD_ROLL_COUNT;
        } else if (effectiveLoyaltyChoice === "use_8") {
          // RABAT -30%:
          // - zużywamy wszystkie naklejki → reset do 0
          loyalty_stickers_after = 0;
          loyalty_applied = true;
          loyalty_reward_type = "percent";
          loyalty_reward_value = LOYALTY_PERCENT;

          const baseForLoyalty = discountBase;
          loyalty_discount_amount =
            Math.max(
              0,
              Math.round(
                baseForLoyalty * (LOYALTY_PERCENT / 100) * 100
              ) / 100
            );
        } else {
          // ZBIERANIE NAKLEJEK:
          // - dokładamy +1 tylko jeśli zamówienie spełnia próg
          // - nie przekraczamy 8 (cap), więc jak klient powie „nie” przy 8,
          //   to dalej będzie 8, ale nie rośnie więcej
          if (qualifiesForStickerCurrent) {
            loyalty_stickers_after = Math.min(
              LOYALTY_REWARD_PERCENT_COUNT,
              loyalty_stickers_before + 1
            );
          } else {
            loyalty_stickers_after = loyalty_stickers_before;
          }
        }
      } catch (e) {
        console.error(
          "[orders.create] loyalty compute/2.9 error:",
          e
        );
      }
    }

    // zapisujemy finalny wybór (po walidacji)
    n.loyalty_choice = effectiveLoyaltyChoice;

    const manualDiscountRaw = Number(n.discount_amount || 0);
    const totalDiscountRaw =
      Math.max(0, manualDiscountRaw) + Math.max(0, loyalty_discount_amount);

    // rabat może zmniejszyć tylko część produktową (bez dostawy)
    const discountClamped = Math.max(
      0,
      Math.min(totalDiscountRaw, discountBase)
    );

    const serverTotal =
      Math.max(
        0,
        Math.round(
          ((discountBase - discountClamped) + deliveryCostFinal) * 100
        )
      ) / 100;

    n.discount_amount = discountClamped;
    n.total_price = serverTotal;

    if (n.user_id) {
      n.loyalty_stickers_before = loyalty_stickers_before;
      n.loyalty_stickers_after = loyalty_stickers_after;
      n.loyalty_applied = loyalty_applied;
      n.loyalty_reward_type = loyalty_reward_type;
      n.loyalty_reward_value = loyalty_reward_value;
      n.loyalty_min_order = LOYALTY_MIN_ORDER_BASE;

      n.legal_accept = {
        ...n.legal_accept,
        loyalty: {
          stickers_before: loyalty_stickers_before,
          stickers_after: loyalty_stickers_after,
          applied: loyalty_applied,
          reward_type: loyalty_reward_type,
          reward_value: loyalty_reward_value,
          min_order: LOYALTY_MIN_ORDER_BASE,
          discount_amount: loyalty_discount_amount,
          choice: n.loyalty_choice, // info: klient chciał / nie chciał użyć 4 naklejek
        },
      };
    }

    // 3) Produkty
    const productIds = n.itemsArray
      .map((it: any) => it.product_id ?? it.productId ?? it.id ?? null)
      .filter(Boolean)
      .map((x: any) => String(x));
    const productsMap = await fetchProductsByIds(productIds);

    // 4) Normalizacja pozycji
    const normalizedItems: NormalizedItem[] = n.itemsArray.map((it: any) => {
      const key = String(it.product_id ?? it.productId ?? it.id ?? "");
      const db = productsMap.get(key);
      return buildItemFromDbAndOptions(db, it);
    });

    // 5) Przygotowanie client_delivery_time (varchar(10))
// + sprawdzenie blokad czasowych restaurant_blocked_times
let clientDeliveryForDb: any = n.client_delivery_time;
let requestedDateStr: string | null = null;
let requestedMinutes: number | null = null;

if (typeof clientDeliveryForDb === "string" && clientDeliveryForDb) {
  if (clientDeliveryForDb !== "asap") {
    let d = new Date(clientDeliveryForDb);

    // fallback, gdy frontend przekaże tylko "HH:MM"
    if (isNaN(d.getTime()) && /^\d{1,2}:\d{2}/.test(clientDeliveryForDb)) {
      const [hhRaw, mmRaw] = clientDeliveryForDb.split(":");
      const hhNum = Number(hhRaw) || 0;
      const mmNum = Number(mmRaw) || 0;
      d = new Date(now);
      d.setHours(hhNum, mmNum, 0, 0);
    }

    if (!isNaN(d.getTime())) {
      requestedDateStr = `${d.getFullYear()}-${pad(
        d.getMonth() + 1
      )}-${pad(d.getDate())}`;
      requestedMinutes = d.getHours() * 60 + d.getMinutes();

      const hh = pad(d.getHours());
      const mm = pad(d.getMinutes());
      clientDeliveryForDb = `${hh}:${mm}`;
    }
  }
}

// jeśli klient wybrał ASAP lub nie dało się sparsować daty – bierzemy „teraz”
if (!requestedDateStr || requestedMinutes == null) {
  const d = now;
  requestedDateStr = `${d.getFullYear()}-${pad(
    d.getMonth() + 1
  )}-${pad(d.getDate())}`;
  requestedMinutes = d.getHours() * 60 + d.getMinutes();
}

if (typeof clientDeliveryForDb === "string" && clientDeliveryForDb.length > 10) {
  clientDeliveryForDb = clientDeliveryForDb.slice(0, 10);
}

// 5.0) Sprawdzenie blokad czasowych (restaurant_blocked_times)
try {
  if (requestedDateStr && requestedMinutes != null) {
    const { data: blockedSlots, error: blockedErr } = await supabaseAdmin
      .from("restaurant_blocked_times")
      .select("full_day, from_time, to_time, kind")
      .eq("restaurant_id", restaurant_id)
      .eq("block_date", requestedDateStr);

    if (blockedErr) {
      console.error(
        "[orders.create] restaurant_blocked_times error:",
        (blockedErr as any)?.message || blockedErr
      );
    } else if (blockedSlots && blockedSlots.length > 0) {
      const isBlocked = (blockedSlots as any[]).some((slot) => {
        const type = (slot.kind as string) || "both";

        // blokujemy tylko zamówienia (order/both)
        if (type === "reservation") return false;

        // blokada całego dnia
        if (slot.full_day) return true;

        // blokada zakresu godzin
        if (!slot.from_time || !slot.to_time) return false;

        const [fh, fm = "0"] = String(slot.from_time).split(":");
        const [th, tm = "0"] = String(slot.to_time).split(":");
        const fromM = Number(fh) * 60 + Number(fm);
        const toM = Number(th) * 60 + Number(tm);

        if (!Number.isFinite(fromM) || !Number.isFinite(toM)) return false;

        return (
          requestedMinutes! >= fromM && requestedMinutes! <= toM
        );
      });

      if (isBlocked) {
        return NextResponse.json(
          { error: "Wybrany czas jest niedostępny." },
          { status: 400 }
        );
      }
    }
  }
} catch (e) {
  console.error("[orders.create] restaurant_blocked_times check error:", e);
}

// 5.1) Notatka dla kuchni
const kitchen_note = buildKitchenNote(normalizedItems as any);

    // 6) Insert orders
    const itemsForOrdersColumn = JSON.stringify(normalizedItems);
    const { data: orderRow, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        restaurant_id,
        restaurant_slug: restaurantSlug,
        name: n.name,
        phone: n.phone,
        contact_email: n.contact_email,
        address: n.address,
        note: n.note ?? null,
        street: n.street,
        postal_code: n.postal_code
          ? String(n.postal_code).slice(0, 10)
          : null,
        city: n.city,
        flat_number: n.flat_number,
        selected_option: n.selected_option,
        fulfill_method,
        payment_method: "cash",
        payment_status: "unpaid",
        items: itemsForOrdersColumn,
        total_price: n.total_price,
        delivery_cost: n.delivery_cost,
        status: n.status,
        client_delivery_time: clientDeliveryForDb,
        deliveryTime: n.deliveryTime,
        eta: n.eta,
        user: n.user_id ?? null,
        reservation_id: n.reservation_id ?? null,
        promo_code: n.promo_code ? String(n.promo_code).slice(0, 32) : null,
        discount_amount: n.discount_amount,
        legal_accept: n.legal_accept,
        chopsticks_qty: n.chopsticks_qty,
        kitchen_note,
        loyalty_choice: n.loyalty_choice ?? "keep",
        loyalty_stickers_before: n.loyalty_stickers_before ?? null,
        loyalty_stickers_after: n.loyalty_stickers_after ?? null,
        loyalty_applied: n.loyalty_applied ?? false,
        loyalty_reward_type: n.loyalty_reward_type ?? null,
        loyalty_reward_value: n.loyalty_reward_value ?? null,
        loyalty_min_order: n.loyalty_min_order ?? LOYALTY_MIN_ORDER_BASE,
      })
      .select("id, selected_option, total_price, name")
      .single();

    if (orderErr || !orderRow) {
      console.error(
        "[orders.create] insert orders error:",
        orderErr?.message || orderErr
      );
      return NextResponse.json(
        { error: "Nie udało się zapisać zamówienia." },
        { status: 500 }
      );
    }

    const newOrderId = orderRow.id;

    // NOWE: powiadomienie o nowym zamówieniu
    await pushAdminNotification(
      restaurant_id,
      "order",
      `Nowe zamówienie #${newOrderId}`,
      `Kwota: ${n.total_price.toFixed(2)} zł, opcja: ${optLabel(
        n.selected_option
      )}`
    );

    // 7) order_items
    if (Array.isArray(n.itemsArray) && n.itemsArray.length > 0) {
      try {
        const shaped = n.itemsArray.map((rawIt: Any, i: number) => {
          const key = String(
            rawIt.product_id ?? rawIt.productId ?? rawIt.id ?? ""
          );
          const db = productsMap.get(key);
          const ni = buildItemFromDbAndOptions(db, rawIt);
          return {
            order_id: newOrderId,
            product_id: key || null,
            name: ni.name,
            quantity: ni.quantity,
            unit_price: ni.price,
            line_no: i + 1,
          };
        });
        const { error: oiErr } = await supabaseAdmin
          .from("order_items")
          .insert(shaped);
        if (oiErr)
          console.warn(
            "[orders.create] order_items insert skipped:",
            oiErr.message
          );
      } catch (e: any) {
        console.warn(
          "[orders.create] order_items insert not executed:",
          e?.message
        );
      }
    }

    // 8) Mail do klienta
try {
  if (n.contact_email) {
    const urlTrack = trackingUrl(String(newOrderId));
    const total =
      typeof orderRow.total_price === "number"
        ? orderRow.total_price.toFixed(2).replace(".", ",")
        : String(orderRow.total_price ?? "0");

        const html = `
          <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111">
            <h2 style="margin:0 0 8px">Potwierdzenie zamówienia #${newOrderId}</h2>
            <p style="margin:0 0 16px">Dziękujemy za zamówienie.</p>
            <p style="margin:16px 0">
              <a href="${urlTrack}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;border-radius:8px;text-decoration:none">
                Sprawdź status i czas dostawy
              </a>
            </p>
            <p style="margin:8px 0">Kwota: <strong>${total} zł</strong></p>
            <p style="margin:8px 0">Opcja: <strong>${optLabel(
              orderRow.selected_option
            )}</strong></p>
            <hr style="margin:20px 0;border:none;border-top:1px solid #eee" />
            <p style="font-size:12px;color:#555;margin:0">
              Akceptacja: Regulamin v${TERMS_VERSION} (<a href="${TERMS_URL}">link</a>),
              Polityka prywatności v${PRIVACY_VERSION} (<a href="${PRIVACY_URL}">link</a>)
            </p>
          </div>
        `;

        await sendEmail({
          to: n.contact_email,
          subject: `Potwierdzenie zamówienia #${newOrderId}`,
          html,
        });
      }
    } catch (mailErr) {
      console.error(
        "[orders.create] email to client error:",
        (mailErr as any)?.message || mailErr
      );
    }

    // 9) SMS do klienta
    try {
  const urlTrackShort = trackingUrl(String(newOrderId));
  const totalLabel =
    typeof orderRow.total_price === "number"
      ? orderRow.total_price.toFixed(2).replace(".", ",")
      : String(orderRow.total_price ?? "0");

  const msg =
    `Przyjęliśmy Twoje zamówienie #${newOrderId}. Kwota: ${totalLabel} zł. ` +
    `Status/śledzenie: ${urlTrackShort}`;
  await sendSms(n.phone, msg);
} catch (smsErr) {
    }

    return NextResponse.json({ orderId: newOrderId }, { status: 201 });
  } catch (e: any) {
    console.error("[orders.create] unexpected:", e?.message ?? e);
    return NextResponse.json(
      { error: "Wystąpił nieoczekiwany błąd." },
      { status: 500 }
    );
  }
}
