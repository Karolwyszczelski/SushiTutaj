"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import Script from "next/script";
import { X, ShoppingBag, Truck } from "lucide-react";
import clsx from "clsx";
import QRCode from "react-qr-code";
import { useSession } from "@/contexts/SessionContext";
import { toZonedTime } from "date-fns-tz";
import useIsClient from "@/lib/useIsClient";
import useCartStore from "@/store/cartStore";
import AddressAutocomplete from "@/components/menu/AddressAutocomplete";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { useIsMobile } from "./checkoutModal/hooks";
import { ChopsticksControl } from "./checkoutModal/ChopsticksControl";
import { ProductItem } from "./checkoutModal/ProductItem";
import { PromoSection } from "./checkoutModal/PromoSection";
import {
  CITY_REVIEW_QR_URLS,
  DEFAULT_PACKAGING_COST,
  DEFAULT_REQUIRE_AUTOCOMPLETE,
  LOYALTY_PERCENT,
  LOYALTY_REWARD_PERCENT_COUNT,
  MIN_SCHEDULE_MINUTES,
  SLOT_STEP_MINUTES,
  TERMS_VERSION,
  THANKS_QR_URL,
  TURNSTILE_SITE_KEY,
  accentBtn,
  areIngredientSynonyms,
  buildClientDeliveryTime,
  buildSetSwapsNote,
  buildSetSwapsPayload,
  computeAddonsCostWithSauces,
  getRestaurantCityFromPath,
  getRestaurantPhone,
  isDateTimeBlocked,
  isOpenForSchedule,
  isVisible,
  minutesToHHMM,
  normalizeCheckoutConfig,
  resolveScheduleForSlug,
  roundUpToStep,
  safeFetch,
  supabase,
  tz,
  withCategoryPrefix,
} from "./checkoutModal/shared";
import type {
  ApplyScope,
  BlockedTime,
  CheckoutConfig,
  DbProductOptions,
  DiscountCodeRow,
  LoyaltyChoice,
  OrderOption,
  ProductDb,
  Promo,
  Zone,
} from "./checkoutModal/shared";

function normalizeHttpsUrl(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "";

  // Akceptujemy tylko http/https
  if (/^https?:\/\//i.test(s)) return s;

  // schemat-protocol (//...)
  if (s.startsWith("//")) return `https:${s}`;

  // inne schematy (np. javascript:, data:) blokujemy
  if (/^[a-z]+:/i.test(s)) return "";

  // ścieżki względne blokujemy (żeby nie routowało w Next)
  if (s.startsWith("/")) return "";

  // domyślnie dopinamy https
  return `https://${s}`;
}



export default function CheckoutModal() {
  const isClient = useIsClient();
  const session = useSession();
  const isLoggedIn = !!session?.user;
  const supabaseAuth = getSupabaseBrowser();

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

const [notes, setNotes] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

 // START: getItemKey NEW (stabilny)
const getItemKey = (it: any, idx: number) => {
  const direct =
    it?.cart_item_id ??
    it?.cartId ??
    it?.cart_id ??
    it?.uid ??
    it?.uuid ??
    it?.id;

  if (direct != null) return String(direct);

  const pid = it?.product_id ?? it?.productId ?? it?.name ?? "item";
  const vid = it?.variant_id ?? it?.variantId ?? "base";
  return `${String(pid)}__${String(vid)}__${idx}`;
};
// END: getItemKey NEW



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
  // START: ordering flags per mode
const [restaurantActive, setRestaurantActive] = useState<boolean | null>(null);
const [restaurantDeliveryActive, setRestaurantDeliveryActive] = useState<boolean | null>(null);
const [restaurantTakeawayActive, setRestaurantTakeawayActive] = useState<boolean | null>(null);
// END: ordering flags per mode

  const [deliveryInfo, setDeliveryInfo] = useState<{ cost: number; eta: string } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);


  const [legalAccepted, setLegalAccepted] = useState(false);
  const [promo, setPromo] = useState<Promo>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [tsReady, setTsReady] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const tsIdRef = useRef<any>(null);
  const tsMobileRef = useRef<HTMLDivElement | null>(null);
  const tsDesktopRef = useRef<HTMLDivElement | null>(null);
  

  const mobileSummaryRef = useRef<HTMLDivElement | null>(null);

const goNextFromStep3 = useCallback(() => {
  if (isMobile) {
    mobileSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  nextStep();
}, [isMobile, nextStep]);


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

const [errorMessage, setErrorMessage] = useState<string | null>(null);

// START: auto-unselect if mode becomes disabled while user is in modal
useEffect(() => {
  if (!selectedOption) return;

  // global off => kasujemy wybór
  if (restaurantActive === false) {
    setSelectedOption(null);
    resetDeliveryState();
    setErrorMessage("Zamówienia w tym lokalu są chwilowo wyłączone.");
    return;
  }

  if (selectedOption === "delivery" && restaurantDeliveryActive === false) {
    setSelectedOption(null);
    resetDeliveryState();
    setErrorMessage("Dostawa została wyłączona dla tego lokalu.");
  }

  if (selectedOption === "takeaway" && restaurantTakeawayActive === false) {
    setSelectedOption(null);
    setErrorMessage("Wynos został wyłączony dla tego lokalu.");
  }
}, [
  selectedOption,
  restaurantActive,
  restaurantDeliveryActive,
  restaurantTakeawayActive,
  resetDeliveryState,
]);
// END: auto-unselect if mode becomes disabled while user is in modal



  const sessionEmail = session?.user?.email || "";
  const effectiveEmail = (contactEmail || sessionEmail).trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validEmail = emailRegex.test(effectiveEmail);

  const { slug: restaurantSlug, label: restaurantCityLabel } = getRestaurantCityFromPath();
  const thanksQrUrl = CITY_REVIEW_QR_URLS[restaurantSlug] || THANKS_QR_URL;
  const googleReviewUrl = useMemo(
  () => normalizeHttpsUrl(thanksQrUrl),
  [thanksQrUrl]
);

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
const [loyaltyRollClaimed, setLoyaltyRollClaimed] = useState<boolean | null>(null);
const [loyaltyChoice, setLoyaltyChoice] = useState<LoyaltyChoice>("keep");
const [loyaltyLoading, setLoyaltyLoading] = useState(false);

// Futomaki picker states for 4-sticker reward
const [availableFutomaki, setAvailableFutomaki] = useState<string[]>([]);
const [selectedFreeRoll, setSelectedFreeRoll] = useState<string | null>(null);
const [showFutomakiPicker, setShowFutomakiPicker] = useState(false);



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
          .select(`
    id, name, subcategory, description, restaurant_id,
    product_option_groups (
        option_group:option_groups (
            id, name, type, min_select, max_select,
            options ( id, name, price_modifier, position )
        )
    )
`);

        if (!cancelled && !prodRes.error && prodRes.data) {
  // Rzutujemy na 'any', żeby TypeScript nie marudził o zagnieżdżone tabele
  setProductsDb((prodRes.data as any) || []);
}
        return;
      }

      // 1) restauracja po slugu
            let restRes = await supabase
        .from("restaurants")
        .select("id, lat, lng, active, ordering_delivery_active, ordering_takeaway_active")
        .eq("slug", restaurantSlug)
        .maybeSingle();

      // kompatybilność: jeśli kolumny jeszcze nie wdrożone, nie wysypuj modala
      const msg = String(restRes.error?.message || "");
      if (
        restRes.error &&
        (msg.includes("ordering_delivery_active") || msg.includes("ordering_takeaway_active"))
      ) {
        restRes = await supabase
          .from("restaurants")
          .select("id, lat, lng, active")
          .eq("slug", restaurantSlug)
          .maybeSingle();
      }

      if (cancelled || restRes.error || !restRes.data) return;
      const rest: any = restRes.data;

      // START: istniejący blok ustawiania restauracji
if (!cancelled) {
  if (rest.lat && rest.lng) {
    setRestLoc({ lat: rest.lat, lng: rest.lng });
  }
  setRestaurantId(rest.id as string);

  // START/END: WKLEJ TO TUTAJ (wewnątrz if (!cancelled))
  setRestaurantActive(typeof rest.active === "boolean" ? !!rest.active : true);

  setRestaurantDeliveryActive(
    typeof rest.ordering_delivery_active === "boolean"
      ? !!rest.ordering_delivery_active
      : true
  );

  setRestaurantTakeawayActive(
    typeof rest.ordering_takeaway_active === "boolean"
      ? !!rest.ordering_takeaway_active
      : true
  );
  // END: START/END
}
// END


      // 2) dane zależne od restauracji: produkty + strefy dostawy
      const [prodRes, dzRes] = await Promise.all([
        supabase
          .from("products")
          .select(`
            id, name, subcategory, description, restaurant_id,
            product_option_groups (
              option_group:option_groups (
                id, name, type, min_select, max_select,
                options ( id, name, price_modifier, position )
              )
            )
          `)
          .eq("restaurant_id", rest.id),
        supabase
          .from("delivery_zones")
          .select("*")
          .eq("restaurant_id", rest.id)
          .order("min_distance_km", { ascending: true }),
      ]);

      if (!cancelled && !prodRes.error && prodRes.data) {
        setProductsDb((prodRes.data as any) || []);
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
    setLoyaltyRollClaimed(null); // ✅ 3C reset
    setLoyaltyChoice("keep");
    return;
  }

  let cancelled = false;

  const load = async () => {
    try {
      setLoyaltyLoading(true);

      let data: any = null;
      let error: any = null;

      const res = await supabaseAuth
        .from("loyalty_accounts")
        .select("stickers, roll_reward_claimed")
        .eq("user_id", session.user.id)
        .maybeSingle();

      data = res.data;
      error = res.error;

      // kompatybilność: jeśli kolumna jeszcze nie wdrożona, nie wysypuj modala
      if (error && /roll_reward_claimed/i.test(String(error.message || ""))) {
        const res2 = await supabaseAuth
          .from("loyalty_accounts")
          .select("stickers")
          .eq("user_id", session.user.id)
          .maybeSingle();

        data = res2.data;
        error = res2.error;
      }

      if (cancelled) return;
      if (error) throw error;

      const stickers = Math.max(
        0,
        Math.min(LOYALTY_REWARD_PERCENT_COUNT, Number(data?.stickers ?? 0))
      );

      const rollClaimed =
        typeof data?.roll_reward_claimed === "boolean"
          ? !!data.roll_reward_claimed
          : null;

      setLoyaltyStickers(stickers);
      setLoyaltyRollClaimed(rollClaimed); // ✅ 3C ustawienie
      setLoyaltyChoice("keep");
    } catch (e) {
      console.error("Loyalty: błąd pobierania loyalty_accounts", e);
      if (!cancelled) {
        setLoyaltyStickers(0);
        setLoyaltyRollClaimed(null); // ✅ 3C reset przy błędzie
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

// Load available futomaki for free roll reward selection
useEffect(() => {
  if (!restaurantId) {
    setAvailableFutomaki([]);
    return;
  }

  let cancelled = false;

  const loadFutomaki = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("name")
      .eq("restaurant_id", restaurantId)
      .eq("subcategory", "Futomaki")
      .eq("active", true)
      .order("name");

    if (cancelled || error) return;

    const names = (data || []).map((p: { name: string }) => p.name);
    setAvailableFutomaki(names);
  };

  loadFutomaki();

  return () => {
    cancelled = true;
  };
}, [restaurantId]);



  const [submitting, setSubmitting] = useState(false);
  const [confirmCityOk, setConfirmCityOk] = useState(false);
  const [orderSent, setOrderSent] = useState(false);
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
  // czyść koszyk tylko po udanym zamówieniu (żeby nie kasować „na X”)
  if (orderSent) {
    try {
      clearCart();
    } catch {}
  }

  originalCloseCheckoutModal();
  setPromo(null);
  setPromoError(null);
  setOrderSent(false);
  setNotes({});
  setErrorMessage(null);
  setConfirmCityOk(false);
  setLegalAccepted(false);
  setSubmitting(false);
  setLoyaltyChoice("keep");
  setLoyaltyStickers(null);
  setLoyaltyRollClaimed(null);
  setLoyaltyLoading(false);
  setSelectedFreeRoll(null);
  setShowFutomakiPicker(false);
  goToStep(1);
  removeTurnstile();
}, [originalCloseCheckoutModal, goToStep, removeTurnstile, orderSent, clearCart]);


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

  const shouldMount =
    isCheckoutOpen &&
    !orderSent &&
    (checkoutStep === 3 || (!isMobile && checkoutStep === 4));

  if (shouldMount) {
    renderTurnstile(tsMobileRef.current);
    renderTurnstile(tsDesktopRef.current);
    return;
  }

  removeTurnstile();
}, [
  isCheckoutOpen,
  checkoutStep,
  tsReady,
  orderSent,
  isMobile,
  renderTurnstile,
  removeTurnstile,
]);


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

    // Usuń synonimy - jeśli są dwa produkty z tej samej grupy synonimów,
    // zostawiamy tylko pierwszy (alfabetycznie)
    Object.keys(out).forEach((cat) => {
      const arr = out[cat];
      const filtered: string[] = [];
      
      for (const name of arr) {
        // Sprawdź czy któryś z już dodanych produktów jest synonimem
        const hasSynonymAlready = filtered.some(existing => 
          areIngredientSynonyms(existing, name)
        );
        
        if (!hasSynonymAlready) {
          filtered.push(name);
        }
      }
      
      out[cat] = filtered;
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

const fetchDistanceKm = useCallback(
  async (custLat: number, custLng: number) => {
    if (!restLoc) return;

    try {
      const resp = await fetch(
        `/api/distance?origin=${restLoc.lat},${restLoc.lng}&destination=${custLat},${custLng}`
      );

      const payload = (await resp.json().catch(() => null)) as any;

      if (!resp.ok || !payload || payload.error) {
        setDistanceKm(null);
        setDeliveryInfo(null);
        return;
      }

      const dk = Number(payload.distance_km);
      if (!Number.isFinite(dk) || dk < 0) {
        setDistanceKm(null);
        setDeliveryInfo(null);
        return;
      }

      setDistanceKm(dk);
    } catch {
      setDistanceKm(null);
      setDeliveryInfo(null);
    }
  },
  [restLoc]
);

const onAddressSelect = (address: string, lat: number, lng: number) => {
  setStreet(address);
  if (lat && lng) {
    setCustCoords({ lat, lng });
  }
};

// Strzał do /api/distance tylko gdy zmienią się koordynaty (subtotal nie wpływa na dystans)
useEffect(() => {
  if (selectedOption !== "delivery") return;
  if (!custCoords) return;
  fetchDistanceKm(custCoords.lat, custCoords.lng);
}, [selectedOption, custCoords, fetchDistanceKm]);

// Przelicz koszt/ETA na bazie distanceKm + stref + subtotal (bez ponownego Google call)
useEffect(() => {
  if (selectedOption !== "delivery") return;

  if (!custCoords || distanceKm == null) {
    setDeliveryInfo(null);
    setOutOfRange(false);
    setDeliveryMinOk(true);
    setDeliveryMinRequired(0);
    return;
  }

  const zone = zones
    .filter((z) => z.active !== false)
    .find((z) => distanceKm >= z.min_distance_km && distanceKm <= z.max_distance_km);

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

  let cost = perKm ? zone.cost * distanceKm : zone.cost;

  if (zone.free_over != null && subtotal >= zone.free_over) cost = 0;

  const minOk = subtotal >= (zone.min_order_value || 0);
  setDeliveryMinOk(minOk);
  setDeliveryMinRequired(zone.min_order_value || 0);

  const eta = `${zone.eta_min_minutes}-${zone.eta_max_minutes} min`;
  const roundedDelivery = roundUpToStep(Math.max(0, cost), 0.5);
  setDeliveryInfo({ cost: roundedDelivery, eta });
}, [selectedOption, custCoords, distanceKm, zones, subtotal]);


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
  loyaltyStickers < 8 &&
  loyaltyRollClaimed !== true; // true blokuje, false/null przepuszcza

const canUseLoyalty8 =
  isLoggedIn &&
  typeof loyaltyStickers === "number" &&
  loyaltyStickers >= 8;

const loyalty4AlreadyClaimed =
  isLoggedIn &&
  typeof loyaltyStickers === "number" &&
  loyaltyStickers >= 4 &&
  loyaltyStickers < 8 &&
  loyaltyRollClaimed === true;
  
const hasAutoLoyaltyDiscount =
  isLoggedIn &&
  typeof loyaltyStickers === "number" &&
  loyaltyStickers >= 8;

  // Automatycznie włącz nagrodę lojalnościową:
  // - 8+ naklejek → automatycznie use_8 (-30%)
  // - 4-7 naklejek → automatycznie use_4 (darmowa rolka)
  useEffect(() => {
    if (canUseLoyalty8 && loyaltyChoice !== "use_8") {
      // 8+ naklejek - automatycznie -30%
      setLoyaltyChoice("use_8");
    } else if (loyaltyRollClaimed === true && loyaltyChoice === "use_4") {
      setLoyaltyChoice("keep");
    } else if (canUseLoyalty4 && !canUseLoyalty8 && loyaltyChoice === "keep") {
      // 4-7 naklejek - automatycznie darmowa rolka
      setLoyaltyChoice("use_4");
    }
  }, [loyaltyRollClaimed, loyaltyChoice, canUseLoyalty4, canUseLoyalty8]);

// Oblicz rabat lojalnościowy -30% (gdy use_8)
const loyaltyDiscount = useMemo(() => {
  if (loyaltyChoice !== "use_8" || !canUseLoyalty8) return 0;
  // -30% od produktów + opakowania (bez dostawy)
  const base = baseTotal + packagingCost;
  return Math.round(base * 0.30 * 100) / 100;
}, [loyaltyChoice, canUseLoyalty8, baseTotal, packagingCost]);

// Łączny rabat = promocyjny + lojalnościowy
const totalDiscount = discount + loyaltyDiscount;

const totalWithDelivery = Math.max(0, subtotal + deliveryCost - totalDiscount);
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

    // Wymagaj wyboru futomaki przy 4 naklejkach
    if (canUseLoyalty4 && !selectedFreeRoll) {
      setErrorMessage("Wybierz darmowe Futomaki z nagrody lojalnościowej (4 naklejki).");
      return;
    }

    // START: server-side-ish check via DB before submit (authoritative)
try {
  const { data: r, error } = await supabase
    .from("restaurants")
    .select("active, ordering_delivery_active, ordering_takeaway_active")
    .eq("slug", restaurantSlug)
    .maybeSingle();

  if (error) throw error;

  const active = typeof (r as any)?.active === "boolean" ? !!(r as any).active : true;
  const delOk =
    typeof (r as any)?.ordering_delivery_active === "boolean"
      ? !!(r as any).ordering_delivery_active
      : true;
  const takeOk =
    typeof (r as any)?.ordering_takeaway_active === "boolean"
      ? !!(r as any).ordering_takeaway_active
      : true;

  if (!active) {
    setErrorMessage("Zamówienia w tym lokalu są chwilowo wyłączone.");
    return;
  }
  if (selectedOption === "delivery" && !delOk) {
    setErrorMessage("Dostawa jest chwilowo wyłączona dla tego lokalu.");
    return;
  }
  if (selectedOption === "takeaway" && !takeOk) {
    setErrorMessage("Wynos jest chwilowo wyłączony dla tego lokalu.");
    return;
  }
} catch {
  // jeśli nie uda się sprawdzić – nie blokujemy w UI,
  // ale FINALNIE i tak powinieneś to zablokować w API /api/orders/create
}
// END: server-side-ish check via DB before submit


    const chk = isOpenForSchedule(scheduleDef);
    if (!chk.open) {
      setErrorMessage(
        `Zamówienia dla ${restaurantCityLabel} przyjmujemy dziś ${chk.label}.`
      );
      return;
    }

       // --- Lunche: tylko do 16:00 (czas Europe/Warsaw) ---
    const nowZoned = toZonedTime(new Date(), tz);
    let scheduledDt: Date | null = null;

    const lunchCutoffMinutes = 16 * 60; // 16:00
    const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

    const isLunchItem = (it: any) => {
      const p = resolveProduct(it);
      const sub = String((p as any)?.subcategory ?? "").toLowerCase();
      const name = String((p as any)?.name ?? it?.name ?? "").toLowerCase();
      return /lunch|lunche/.test(sub) || name.startsWith("lunch ");
    };

    const hasLunch = items.some(isLunchItem);

    // Jeśli user wybrał realizację "na godzinę" (pickup lub delivery),
    // upewniamy się, że wybrany czas nie jest z przeszłości oraz że jest >= minScheduleMinutes
    if (deliveryTimeOption === "schedule" && selectedOption) {
      if (!scheduleSlots.includes(scheduledTime)) {
        setErrorMessage(
          "Wybrana godzina jest niedostępna. Wybierz jedną z dostępnych godzin."
        );
        return;
      }

      const [h, m] = scheduledTime.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) {
        setErrorMessage("Nieprawidłowa godzina realizacji.");
        return;
      }

      const dt = new Date(nowZoned);
      dt.setHours(h, m, 0, 0);

      // jeśli wybrana godzina już minęła dziś, przesuń na jutro
      if (dt.getTime() < nowZoned.getTime() - 30_000) {
        dt.setDate(dt.getDate() + 1);
      }

      const diffMin = Math.round((dt.getTime() - nowZoned.getTime()) / 60_000);
      if (diffMin < minScheduleMinutes) {
        setErrorMessage(
          `Najwcześniej możesz wybrać godzinę za ok. ${minScheduleMinutes} min.`
        );
        return;
      }

      scheduledDt = dt;
    }

    // Walidacja lunchy:
    if (hasLunch) {
      // 1) nie przyjmujemy lunchy po 16:00 (czas złożenia)
      const nowMins = minutesOfDay(nowZoned);
      if (nowMins > lunchCutoffMinutes) {
        setErrorMessage("Lunche można zamawiać tylko do 16:00.");
        return;
      }

      // 2) jeśli “na godzinę”, to również realizacja musi być <= 16:00
      const effective =
        deliveryTimeOption === "schedule" && scheduledDt ? scheduledDt : nowZoned;

      const effMins = minutesOfDay(effective);
      if (effMins > lunchCutoffMinutes) {
        setErrorMessage(
          "Lunche realizujemy tylko do 16:00. Wybierz wcześniejszą godzinę lub usuń lunch z koszyka."
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
      if (!deliveryInfo) {
  setErrorMessage("Nie udało się policzyć kosztu dostawy. Wybierz adres ponownie lub spróbuj za chwilę.");
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
  packaging_cost: packagingCost,
  total_price: totalWithDelivery,
  discount_amount: totalDiscount || 0,
  loyalty_discount_amount: loyaltyDiscount || 0,
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
  : loyaltyChoice === "use_8" && canUseLoyalty8
  ? "use_8"
  : loyaltyChoice === "use_4" && canUseLoyalty4
  ? "use_4"
  : "keep",

loyalty_stickers_before:
  isLoggedIn && typeof loyaltyStickers === "number" ? loyaltyStickers : null,
loyalty_free_roll_name:
  canUseLoyalty4 && selectedFreeRoll ? selectedFreeRoll : null,
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
        const itemKey = getItemKey(item, index);
const userNote = notes[itemKey] || "";
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
    restaurant: slug,
  }),
});

// UWAGA: koszyk czyścimy dopiero przy zamknięciu ekranu „Dziękujemy”,
// bo clearCart() w store często zamyka modal i nie widać podziękowania.
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

 // START: per-mode availability (null => traktujemy jako włączone do czasu pobrania)
const orderingGlobalEnabledUi = restaurantActive !== false;
const deliveryEnabledUi = orderingGlobalEnabledUi && restaurantDeliveryActive !== false;
const takeawayEnabledUi = orderingGlobalEnabledUi && restaurantTakeawayActive !== false;

const disabledHint = (opt: OrderOption) => {
  if (!orderingGlobalEnabledUi) return "Zamówienia wyłączone";
  if (opt === "delivery" && !deliveryEnabledUi) return "Dostawa wyłączona";
  if (opt === "takeaway" && !takeawayEnabledUi) return "Wynos wyłączony";
  return "";
};
// END: per-mode availability


const OPTIONS: { key: OrderOption; label: string; Icon: any; disabled?: boolean; hint?: string }[] =
  [
    {
      key: "takeaway",
      label: "Na wynos",
      Icon: ShoppingBag,
      disabled: !takeawayEnabledUi,
      hint: disabledHint("takeaway"),
    },
    {
      key: "delivery",
      label: "Dostawa",
      Icon: Truck,
      disabled: !deliveryEnabledUi,
      hint: disabledHint("delivery"),
    },
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
          <span className="text-black/70">Rabat promocyjny</span>
          <span className="font-semibold text-green-700">
            -{pln(discount)}
          </span>
        </div>
      ) : null}

      {loyaltyDiscount > 0 ? (
        <div className="flex items-center justify-between">
          <span className="text-black/70">Rabat lojalnościowy −30%</span>
          <span className="font-semibold text-green-700">
            -{pln(loyaltyDiscount)}
          </span>
        </div>
      ) : null}

      <div className="h-px bg-black/10 my-2" />

      <div className="flex items-center justify-between text-base">
        <span className="font-semibold">Do zapłaty</span>
        <span className="font-bold">{pln(totalWithDelivery)}</span>
      </div>
    </div>

        <div className="pt-1">
      <ChopsticksControl value={chopsticksQty} onChange={setChopsticksQty} />
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
    "grid grid-cols-1 gap-6 px-6 pt-6 pb-6 lg:pb-6",
    !orderSent && checkoutStep !== 4 && "lg:grid-cols-[1fr_380px]"
  )}
>
     <div>
              {orderSent ? (
                <div className="min-h-[320px] flex flex-col items-center justify-center text-center space-y-5 px-4">
                  <div className="bg-white p-4 rounded-2xl shadow flex flex-col items-center gap-2">
                    <div className="bg-white p-3 rounded-xl">
                      <QRCode value={googleReviewUrl || thanksQrUrl} size={170} />
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
                    <a
  href={googleReviewUrl || thanksQrUrl}
  target="_blank"
  rel="noopener noreferrer"
  className={`inline-flex items-center justify-center px-4 py-2 rounded-xl ${accentBtn}`}
>
  Zostaw opinię w Google
</a>
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

                      {/* START: lista pozycji koszyka */}
{/* START: lista pozycji koszyka */}
<div className="space-y-3 pb-[calc(10rem+env(safe-area-inset-bottom))]">
  {items.map((item: any, idx: number) => {
    const itemKey = getItemKey(item, idx);
    return (
      <div key={itemKey} className="space-y-1">
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
          value={notes[itemKey] ?? ""}
          onChange={(e) =>
            setNotes((prev) => ({ ...prev, [itemKey]: e.target.value }))
          }
        />
      </div>
    );
  })}

  {items.length === 0 && (
    <p className="text-center text-black/60">Brak produktów w koszyku.</p>
  )}
</div>

{/* MOBILE: fixed footer – przycisk na samym dole */}
<div className="fixed inset-x-0 bottom-0 z-[70] lg:hidden">
  <div className="mx-auto max-w-5xl border-t border-black/10 bg-white/95 backdrop-blur px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
    <button
      onClick={nextStep}
      disabled={items.length === 0}
      className={`w-full py-3 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
    >
      Dalej →
    </button>
  </div>
</div>

{/* DESKTOP: przycisk Dalej (bo mobile footer ma lg:hidden) */}
<div className="hidden lg:flex justify-end pt-4">
  <button
    onClick={nextStep}
    disabled={items.length === 0}
    className={`px-6 py-3 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
  >
    Dalej →
  </button>
</div>


                    </div>
                  )}

                  {/* KROK 1 DESKTOP / KROK 2 MOBILE: sposób odbioru */}
                  {/* KROK 2: sposób odbioru */}
{checkoutStep === 2 && (
  <div className="space-y-6 pb-[calc(12rem+env(safe-area-inset-bottom))]">
                      <h3 className="text-2xl font-bold">Sposób odbioru</h3>

                      <div className="grid grid-cols-2 gap-3">
                        {OPTIONS.map(({ key, label, Icon, disabled, hint }) => (
  <button
    key={key}
    disabled={!!disabled}
    onClick={() => {
      if (disabled) {
        setErrorMessage(
          hint ||
            (key === "delivery"
              ? "Dostawa jest chwilowo wyłączona dla tego lokalu."
              : "Wynos jest chwilowo wyłączony dla tego lokalu.")
        );
        return;
      }
      setErrorMessage(null);
      handleSelectOption(key);
    }}
    className={clsx(
      "flex flex-col items-center justify-center border px-3 py-4 transition",
      selectedOption === key
        ? "bg-yellow-400 text-black border-yellow-500"
        : "bg-gray-50 text-black border-black/10 hover:bg-gray-100",
      disabled && "opacity-50 cursor-not-allowed hover:bg-gray-50"
    )}
    title={disabled ? hint : undefined}
  >
    <Icon size={22} />
    <span className="mt-1 text-sm font-medium">{label}</span>
    {disabled && hint ? (
      <span className="mt-1 text-[10px] text-black/60">{hint}</span>
    ) : null}
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

{/* DESKTOP: nawigacja kroku 2 (mobile footer ma lg:hidden) */}
<div className="hidden lg:flex items-center justify-between pt-2">
  <button
    type="button"
    onClick={() => goToStep(1)}
    className="px-4 py-2 rounded-xl border border-black/15"
  >
    ← Cofnij
  </button>

  <button
    onClick={nextStep}
    disabled={!selectedOption}
    className={`px-6 py-3 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
  >
    Dalej →
  </button>
</div>


                      {/* MOBILE: fixed footer – na sam dół (Pałeczki zostają na środku) */}
<div className="fixed inset-x-0 bottom-0 z-[70] lg:hidden">
  <div className="mx-auto max-w-5xl border-t border-black/10 bg-white/95 backdrop-blur px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => goToStep(1)}
        className="shrink-0 px-4 py-2 rounded-xl border border-black/15"
      >
        ← Cofnij
      </button>

      <div className="flex-1 flex justify-center">
        <ChopsticksControl value={chopsticksQty} onChange={setChopsticksQty} />
      </div>
    </div>

    <button
      onClick={nextStep}
      disabled={!selectedOption}
      className={`mt-3 w-full py-3 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
    >
      Dalej →
    </button>
  </div>
</div>



                    </div>
                  )}

                  {/* KROK 3: dane kontaktowe (mobile + desktop), a podsumowanie tylko mobile */}
{checkoutStep === 3 && (
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

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-black/70">
          <span>Nie możesz znaleźć swojego adresu?</span>
          {restaurantPhone && (
            <a
              href={`tel:${restaurantPhone.replace(/\s+/g, "")}`}
              className="inline-flex items-center justify-center rounded-full border border-black/15 px-3 py-1 font-semibold hover:bg-gray-100 text-black"
            >
              Zadzwoń do nas
            </a>
          )}
        </div>

        <p className="text-xs text-black/60">
          Najpierw wybierz adres z listy Google – dopiero wtedy pola poniżej odblokują się do edycji.
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
              onChange={(e) => setFlatNumber(e.target.value)}
              disabled={requireAutocomplete && !custCoords}
            />
            <input
              type="text"
              placeholder="Kod pocztowy"
              className="flex-1 px-3 py-2 border border-black/15 rounded-xl bg-white disabled:bg-gray-100 disabled:text-black/50 disabled:cursor-not-allowed"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
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
              Wpisanie adresu ręcznie jest zablokowane – wybierz pozycję z listy podpowiedzi Google.
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

    {/* DESKTOP: sticky footer z Dalej (na mobile od razu pokazujemy Zamawiam) */}
    <div className="-mx-6 sticky bottom-0 z-30 mt-4 border-t border-black/10 bg-white/95 backdrop-blur px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] hidden lg:block">
  <div className="flex items-center gap-3">
    <button
      onClick={() => goToStep(2)}
      className="px-4 py-2 rounded-xl border border-black/15"
    >
      ← Cofnij
    </button>

    <button
      onClick={goNextFromStep3}
      disabled={
        !name ||
        !phone ||
        !validEmail ||
        (selectedOption === "delivery" &&
          (!street || !postalCode || !city || (requireAutocomplete && !custCoords)))
      }
      className={`min-w-[220px] py-2 rounded-xl text-white font-semibold ${accentBtn} disabled:opacity-50`}
    >
      Dalej →
    </button>
  </div>
</div>


                      {/* MOBILE: podsumowanie + zgody + Turnstile */}
                      {isMobile && (
  <div ref={mobileSummaryRef} className="mt-3 space-y-4 scroll-mt-6 pb-[calc(6rem+env(safe-area-inset-bottom))]">
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

<div className="mt-3">
  <ChopsticksControl value={chopsticksQty} onChange={setChopsticksQty} />
</div>

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
                                        <div className="rounded-lg bg-emerald-100 border border-emerald-300 p-2 text-emerald-800 space-y-2">
                                          <div className="font-semibold text-sm flex items-center gap-2">
                                            <span>🎁</span>
                                            <span>Wybierz darmowe Futomaki!</span>
                                          </div>
                                          <p className="text-[11px] text-emerald-700">
                                            Masz 4+ naklejek – wybierz jedną rolkę gratis z programu lojalnościowego.
                                          </p>
                                          <button
                                            type="button"
                                            onClick={() => setShowFutomakiPicker(true)}
                                            className="w-full mt-1 py-2 px-3 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors"
                                          >
                                            {selectedFreeRoll ? `Wybrano: ${selectedFreeRoll}` : "Wybierz rolkę →"}
                                          </button>
                                          {!selectedFreeRoll && (
                                            <p className="text-[10px] text-red-600 font-medium">
                                              ⚠ Musisz wybrać rolkę, aby kontynuować
                                            </p>
                                          )}
                                        </div>
                                      )}

                                      {loyalty4AlreadyClaimed && (
  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs">
    Masz 4–7 naklejek, ale darmowa rolka została już wykorzystana.
    Zbieraj dalej do 8 naklejek.
  </div>
)}


                                      {!canUseLoyalty4 &&
                                        hasAutoLoyaltyDiscount && (
                                          <div className="font-semibold text-sm">
                                            Masz 8+ naklejek – rabat −30% ({pln(loyaltyDiscount)}) został automatycznie naliczony!
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

                            {totalDiscount > 0 && (
                              <div className="flex justify-between text-sm text-green-700">
                                <span>Rabat łącznie:</span>
                                <span>-{totalDiscount.toFixed(2)} zł</span>
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
                          </div>
                        </div>
                      )}

                      {/* MOBILE: fixed footer z przyciskiem Zamawiam */}
                      {isMobile && !shouldHideOrderActions && (
                        <div className="fixed inset-x-0 bottom-0 z-[70] lg:hidden">
                          <div className="mx-auto max-w-5xl border-t border-black/10 bg-white/95 backdrop-blur px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => goToStep(2)}
                                className="shrink-0 px-4 py-2 rounded-xl border border-black/15"
                              >
                                ← Cofnij
                              </button>
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
                                className={`flex-1 py-3 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
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
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* KROK 4 DESKTOP: podsumowanie + pałeczki */}
{/* KROK 4 DESKTOP: finalizacja — pełna szerokość + lepszy układ */}
{!isMobile && checkoutStep === 4 && (
  <div className="space-y-6 w-full">
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h3 className="text-2xl font-bold">Podsumowanie i finalizacja</h3>
        <p className="text-sm text-black/60 mt-1">
          {selectedOption === "delivery"
            ? "Sposób: dostawa"
            : selectedOption === "takeaway"
            ? "Sposób: odbiór osobisty"
            : "Sposób: —"}
          {" • "}
          {deliveryTimeOption === "schedule"
            ? `Na godzinę: ${scheduledTime || "—"}`
            : "Jak najszybciej"}
        </p>
      </div>

      {selectedOption === "delivery" && (
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm">
          <b>Płatność wyłącznie gotówką u kierowcy.</b>
        </div>
      )}
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* LEWA: produkty + ceny */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h4 className="text-sm font-semibold">Wybrane produkty</h4>
            <span className="text-[11px] text-black/60">
              {items?.length || 0} poz.
            </span>
          </div>

          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {items.length === 0 ? (
              <p className="text-sm text-black/60 text-center">Brak produktów.</p>
            ) : (
              items.map((it: any, i: number) => {
                const key = getItemKey(it, i);
                const label = withCategoryPrefix(it.name, productCategory(it.name));
                const qty = it.quantity || 1;

                return (
                  <div key={key} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{label}</div>
                      <div className="text-[11px] text-black/60">Ilość: {qty}</div>
                    </div>
                    <div className="shrink-0 font-semibold">{pln(getItemLineTotal(it))}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {PriceSummaryCard}
      </div>

      {/* PRAWA: dane + potwierdzenia */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-black/10 bg-white p-4 space-y-2">
          <h4 className="text-sm font-semibold">Dane do zamówienia</h4>

          <div className="text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-black/60">Imię:</span>
              <span className="font-semibold">{name || "—"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-black/60">Telefon:</span>
              <span className="font-semibold">{phone || "—"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-black/60">E-mail:</span>
              <span className="font-semibold">{effectiveEmail || "—"}</span>
            </div>

            {selectedOption === "delivery" ? (
              <>
                <div className="h-px bg-black/10 my-2" />
                <div className="text-black/60 text-[11px]">Adres dostawy</div>
                <div className="text-sm font-semibold">
                  {(street || "").trim() ? street : "—"}
                </div>
                <div className="text-sm">
                  {(postalCode || "").trim() ? postalCode : "—"}{" "}
                  {(city || "").trim() ? city : ""}
                  {(flatNumber || "").trim() ? `, m. ${flatNumber}` : ""}
                </div>
                <div className="text-[11px] text-black/60 mt-1">
                  {deliveryInfo?.eta ? `ETA: ${deliveryInfo.eta}` : "ETA: wybierz adres, aby policzyć dostawę"}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-gray-50 p-4 space-y-3">
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

            <p className="text-[11px] text-black/60">
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
          </div>
        </div>
      </div>
    </div>

    <div className="-mx-6 sticky bottom-0 z-30 mt-4 border-t border-black/10 bg-white/95 backdrop-blur px-6 pt-4 pb-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => goToStep(3)}
          className="px-4 py-2 rounded-xl border border-black/15"
        >
          ← Cofnij
        </button>
        
        {!shouldHideOrderActions && (
          <button
            onClick={handleSubmitOrder}
            disabled={
              submitting ||
              !legalAccepted ||
              !confirmCityOk ||
              (TURNSTILE_SITE_KEY ? !turnstileToken : false)
            }
            className={`min-w-[220px] py-2 rounded-xl font-semibold ${accentBtn} disabled:opacity-50`}
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
  </div>
)}


                </>
              )}
            </div>

            {/* PASEK BOCZNY PODSUMOWANIA (DESKTOP) */}
            {!orderSent && checkoutStep !== 4 && (
  <aside className="hidden lg:block flex-shrink-0 self-start sticky top-4">
                <div className="w-[340px] mx-auto border border-black/10 bg-white p-5 shadow-xl text-black space-y-4 text-left rounded-xl">
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
                              <div className="rounded-lg bg-emerald-100 border border-emerald-300 p-2 text-emerald-800 space-y-2">
                                <div className="font-semibold text-sm flex items-center justify-center gap-2">
                                  <span>🎁</span>
                                  <span>Wybierz darmowe Futomaki!</span>
                                </div>
                                <p className="text-[11px] text-emerald-700 text-center">
                                  Masz 4+ naklejek – wybierz jedną rolkę gratis z programu lojalnościowego.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setShowFutomakiPicker(true)}
                                  className="w-full mt-1 py-2 px-3 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors"
                                >
                                  {selectedFreeRoll ? `Wybrano: ${selectedFreeRoll}` : "Wybierz rolkę →"}
                                </button>
                                {!selectedFreeRoll && (
                                  <p className="text-[10px] text-red-600 font-medium text-center">
                                    ⚠ Musisz wybrać rolkę, aby kontynuować
                                  </p>
                                )}
                              </div>
                            )}

                            {loyalty4AlreadyClaimed && (
  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs">
    Masz 4–7 naklejek, ale darmowa rolka została już wykorzystana.
    Zbieraj dalej do 8 naklejek.
  </div>
)}


                            {!canUseLoyalty4 && hasAutoLoyaltyDiscount && (
                              <div className="font-semibold text-sm text-center">
                                Masz 8+ naklejek – rabat −30% ({pln(loyaltyDiscount)}) został automatycznie naliczony!
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}

                                    <div className="pt-1">
                    <ChopsticksControl value={chopsticksQty} onChange={setChopsticksQty} />
                  </div>


                  <PromoSection
                    promo={promo}
                    promoError={promoError}
                    onApply={applyPromo}
                    onClear={clearPromo}
                  />

                  {totalDiscount > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Rabat łącznie:</span>
                      <span>-{totalDiscount.toFixed(2)} zł</span>
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

    {/* FUTOMAKI PICKER MODAL */}
    {showFutomakiPicker && (
      <div 
        className="fixed inset-0 bg-black/60 flex items-center justify-center p-4"
        style={{ zIndex: 99999 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowFutomakiPicker(false);
        }}
      >
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-gray-200 bg-emerald-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-emerald-800">🎁 Wybierz darmowe Futomaki</h3>
                <p className="text-sm text-emerald-600">Nagroda za 4 naklejki lojalnościowe</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFutomakiPicker(false)}
                className="p-2 hover:bg-emerald-100 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {availableFutomaki.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Brak dostępnych Futomaki</p>
            ) : (
              <div className="space-y-2">
                {availableFutomaki.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setSelectedFreeRoll(name);
                      setShowFutomakiPicker(false);
                    }}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                      selectedFreeRoll === name
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : "border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{name}</span>
                      {selectedFreeRoll === name && (
                        <span className="text-emerald-600">✓</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedFreeRoll && (
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={() => setShowFutomakiPicker(false)}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
              >
                Potwierdź wybór: {selectedFreeRoll}
              </button>
            </div>
          )}
        </div>
      </div>
    )}
  </>
);
}