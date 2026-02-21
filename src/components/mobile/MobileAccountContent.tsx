// src/components/mobile/MobileAccountContent.tsx
"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  LogIn,
  UserPlus,
  BadgePercent,
  Package,
  Settings,
  RefreshCcw,
  LogOut,
  ChevronRight,
  User,
  ArrowLeft,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useSession } from "@/contexts/SessionContext";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { usePathname, useRouter } from "next/navigation";
import useCartStore from "@/store/cartStore";

/** Akcenty */
const gradBtn =
  "bg-gradient-to-r from-[var(--accent-red-dark,#7a0d0d)] via-[var(--accent-red,#a61b1b)] to-[var(--accent-red-dark-2,#b11212)] text-white";

/** Status zamówienia → czytelna etykieta */
function getStatusLabel(status?: string | null): string {
  switch ((status || "").toLowerCase()) {
    case "new":
    case "placed":
      return "Złożone";
    case "accepted":
      return "Przyjęte";
    case "preparing":
      return "W przygotowaniu";
    case "ready":
      return "Gotowe";
    case "out_for_delivery":
      return "W dostawie";
    case "completed":
      return "Zrealizowane";
    case "cancelled":
      return "Anulowane";
    default:
      return status || "Przyjęte";
  }
}

/** Status zamówienia → kolor badge'a */
function getStatusColor(status?: string | null): string {
  switch ((status || "").toLowerCase()) {
    case "new":
    case "placed":
      return "bg-blue-500/20 text-blue-400";
    case "accepted":
      return "bg-yellow-500/20 text-yellow-400";
    case "preparing":
      return "bg-orange-500/20 text-orange-400";
    case "ready":
      return "bg-green-500/20 text-green-400";
    case "out_for_delivery":
      return "bg-purple-500/20 text-purple-400";
    case "completed":
      return "bg-green-500/20 text-green-400";
    case "cancelled":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-white/10 text-white/70";
  }
}

const inputCls =
  "w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white text-sm " +
  "placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent-red,#a61b1b)] focus:border-transparent";

type AuthMode = "login" | "register";
type UserTab = "orders" | "loyalty" | "profile";
type ViewState = "initial" | "auth-form" | "logged-in";

type OrderItemRow = {
  product_id?: string | number | null;
  name: string;
  unit_price: number;
  quantity: number;
  options?: any;
};

type OrderRow = {
  id: string | number;
  created_at?: string;
  total_price?: number;
  status?: string;
  selected_option?: string;
  items?: OrderItemRow[];
};

interface MobileAccountContentProps {
  onClose: () => void;
}

export default function MobileAccountContent({ onClose }: MobileAccountContentProps) {
  const supabase = getSupabaseBrowser();
  const session = useSession();
  const user = session?.user || null;
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  // View state - initial (wybór), auth-form (formularz), logged-in (panel)
  const [viewState, setViewState] = useState<ViewState>(user ? "logged-in" : "initial");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [userTab, setUserTab] = useState<UserTab>("orders");

  // Auth form state
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Profile state
  const meta = (user?.user_metadata as any) || {};
  const [profileName, setProfileName] = useState(meta.full_name || "");
  const [profilePhone, setProfilePhone] = useState(meta.phone || "");
  const [street, setStreet] = useState(meta.street || "");
  const [postalCode, setPostalCode] = useState(meta.postal_code || "");
  const [city, setCity] = useState(meta.city || "");
  const [flatNumber, setFlatNumber] = useState(meta.flat_number || "");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");

  // Orders state
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Loyalty state
  const [loyaltyStickers, setLoyaltyStickers] = useState<number | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [rollRewardClaimed, setRollRewardClaimed] = useState<boolean | null>(null);

  // Cart store
  const addItem = useCartStore((s) => (s as any).addItem);
  const openCheckoutModal = useCartStore((s) => (s as any).openCheckoutModal);
  const cartItems = useCartStore(
    (s) => (s as any).items ?? (s as any).cartItems ?? (s as any).cart ?? []
  );
  const cartCount = useMemo(() => {
    if (!Array.isArray(cartItems)) return 0;
    return cartItems.reduce((acc: number, it: any) => {
      const q = Number(it?.quantity ?? 1);
      return acc + (Number.isFinite(q) && q > 0 ? q : 1);
    }, 0);
  }, [cartItems]);

  const menuHref = useMemo(() => {
    const seg0 = pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
    const allowed = ["ciechanow", "przasnysz", "szczytno"];
    return allowed.includes(seg0) ? `/${seg0}#menu` : "/#menu";
  }, [pathname]);

  // Sync view state with user
  useEffect(() => {
    if (user) {
      setViewState("logged-in");
      const m = (user.user_metadata as any) || {};
      setProfileName(m.full_name || "");
      setProfilePhone(m.phone || "");
      setStreet(m.street || "");
      setPostalCode(m.postal_code || "");
      setCity(m.city || "");
      setFlatNumber(m.flat_number || "");
    } else {
      setViewState("initial");
    }
    setErr(null);
    setMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Fetch orders
  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) return;
      setOrdersLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, created_at, total_price, status, selected_option,
          order_items (product_id, name, unit_price, quantity, options)
        `)
        .eq("user", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!error && data) {
        const mapped = (data as any[]).map((o) => ({
          ...o,
          items: o.order_items || [],
        }));
        setOrders(mapped);
      }
      setOrdersLoading(false);
    };
    if (userTab === "orders" && user) fetchOrders();
  }, [userTab, user, supabase]);

  // Fetch loyalty
  useEffect(() => {
    if (userTab !== "loyalty" || !user?.id) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        setLoyaltyLoading(true);
        const { data, error } = await supabase
          .from("loyalty_accounts")
          .select("stickers, roll_reward_claimed")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        setLoyaltyStickers(Math.max(0, Number(data?.stickers ?? 0)));
        setRollRewardClaimed(!!(data as any)?.roll_reward_claimed);
      } catch (e) {
        if (!cancelled) {
          setLoyaltyStickers(0);
          setRollRewardClaimed(false);
        }
      } finally {
        if (!cancelled) setLoyaltyLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [userTab, user?.id, supabase]);

  // Auth handlers
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) setErr(error.message);
    else setMsg("Zalogowano pomyślnie!");
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (pass !== pass2) {
      setErr("Hasła muszą być identyczne.");
      return;
    }
    setBusy(true);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        data: { full_name: name || "", phone: phone || "" },
        emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
      },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setMsg("Konto utworzone! Sprawdź e-mail i potwierdź rejestrację.");
      setAuthMode("login");
    }
  };

  const handleSendReset = async () => {
    setErr(null);
    setMsg(null);
    if (!email) {
      setErr("Podaj e-mail, aby wysłać link resetu hasła.");
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const allowed = ["ciechanow", "przasnysz", "szczytno"];
    const seg0 = pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
    const cityParam = allowed.includes(seg0) ? seg0 : "";
    const resetPath = `/auth/callback${cityParam ? `?city=${encodeURIComponent(cityParam)}` : ""}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: origin ? `${origin}${resetPath}` : undefined,
    });
    if (error) setErr(error.message);
    else setMsg("Wysłaliśmy link resetu hasła na podany e-mail.");
  };

  const handleLogout = async () => {
    setErr(null);
    setMsg(null);
    try {
      await supabase.auth.signOut({ scope: "local" });
      setMsg("Wylogowano z konta.");
      setViewState("initial");
    } catch (e: any) {
      setErr(e?.message || "Nie udało się wylogować.");
    }
  };

  // Profile handlers
  const saveProfile = async () => {
    setErr(null);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: profileName,
        phone: profilePhone,
        street,
        postal_code: postalCode,
        city,
        flat_number: flatNumber,
      },
    });
    if (error) setErr(error.message);
    else setMsg("Profil zapisany!");
  };

  const changePassword = async () => {
    setErr(null);
    setMsg(null);
    if (!newPass || newPass !== newPass2) {
      setErr("Nowe hasła muszą być identyczne.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) setErr(error.message);
    else {
      setMsg("Hasło zmienione!");
      setNewPass("");
      setNewPass2("");
    }
  };

  // Reorder
  const reorder = async (orderId: string | number) => {
    setErr(null);
    setMsg(null);
    const { data, error } = await supabase
      .from("order_items")
      .select("product_id,name,unit_price,quantity,options")
      .eq("order_id", String(orderId));
    if (error) {
      setErr("Nie udało się pobrać pozycji zamówienia.");
      return;
    }
    (data as OrderItemRow[]).forEach((it) => {
      const price = Number(it.unit_price || 0);
      (addItem as any)({
        id: String(it.product_id ?? `${it.name}-${price}`),
        name: it.name,
        price,
        quantity: it.quantity || 1,
        ...(it.options ? { options: it.options } : {}),
      });
    });
    if (typeof openCheckoutModal === "function") openCheckoutModal();
    setMsg("Dodano do koszyka!");
  };

  const goToCartOrMenu = () => {
    onClose();
    if (cartCount > 0 && typeof openCheckoutModal === "function") {
      setTimeout(() => openCheckoutModal(), 0);
      return;
    }
    setTimeout(() => router.push(menuHref as any), 0);
  };

  // RENDER: Initial view (wybór logowania/rejestracji)
  if (viewState === "initial") {
    return (
      <div className="flex flex-col h-full text-white">
        {/* Header */}
        <div 
          className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <h2 className="text-lg font-semibold">Twoje konto</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div 
          className="flex-1 overflow-y-auto overscroll-contain px-6 py-6"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)" }}
        >
          {/* Hero section */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center">
              <User className="w-8 h-8 text-white/70" />
            </div>
            <p className="text-sm text-white/60">
              Zaloguj się, aby śledzić zamówienia i korzystać z programu lojalnościowego
            </p>
          </div>

          {/* Buttons */}
          <button
            type="button"
            onClick={() => {
              setAuthMode("login");
              setViewState("auth-form");
            }}
            className={clsx(
              "w-full rounded-2xl px-6 py-4 font-semibold text-base flex items-center justify-between mb-3",
              gradBtn
            )}
          >
            <span className="flex items-center gap-3">
              <LogIn className="w-5 h-5" />
              Zaloguj się
            </span>
            <ChevronRight className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setAuthMode("register");
              setViewState("auth-form");
            }}
            className="w-full rounded-2xl px-6 py-4 font-semibold text-base flex items-center justify-between bg-white/10 hover:bg-white/15 transition-colors"
          >
            <span className="flex items-center gap-3">
              <UserPlus className="w-5 h-5" />
              Załóż konto
            </span>
            <ChevronRight className="w-5 h-5" />
          </button>

          <p className="text-xs text-white/40 text-center mt-6">
            Konto służy tylko do obsługi zamówień.<br />
            Nie wysyłamy spamu.
          </p>
        </div>
      </div>
    );
  }

  // RENDER: Auth form view
  if (viewState === "auth-form") {
    return (
      <div className="flex flex-col h-full text-white">
        {/* Header with back button and close button */}
        <div 
          className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewState("initial")}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold">
              {authMode === "login" ? "Logowanie" : "Rejestracja"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form content */}
        <div 
          className="flex-1 overflow-y-auto overscroll-contain px-6 py-6"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)" }}
        >
          {/* Messages */}
          {(err || msg) && (
            <div
              className={clsx(
                "mb-4 rounded-xl px-4 py-3 text-sm",
                err
                  ? "bg-red-500/20 text-red-300 border border-red-500/30"
                  : "bg-green-500/20 text-green-300 border border-green-500/30"
              )}
            >
              {err || msg}
            </div>
          )}

          {/* Auth mode toggle */}
          <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-xl">
            <button
              type="button"
              onClick={() => setAuthMode("login")}
              className={clsx(
                "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                authMode === "login"
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:text-white"
              )}
            >
              Logowanie
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("register")}
              className={clsx(
                "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                authMode === "register"
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:text-white"
              )}
            >
              Rejestracja
            </button>
          </div>

          {authMode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs text-white/60 mb-1.5 block">E-mail</label>
                <input
                  className={inputCls}
                  type="email"
                  placeholder="jan.kowalski@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="text-xs text-white/60 mb-1.5 block">Hasło</label>
                <input
                  className={inputCls}
                  type="password"
                  placeholder="••••••••"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              <button
                type="button"
                onClick={handleSendReset}
                className="text-xs text-white/50 hover:text-white underline"
              >
                Nie pamiętam hasła
              </button>

              <button
                type="submit"
                disabled={busy}
                className={clsx(
                  "w-full rounded-xl px-6 py-3.5 font-semibold text-base disabled:opacity-60 mt-2",
                  gradBtn
                )}
              >
                {busy ? "Logowanie..." : "Zaloguj się"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="text-xs text-white/60 mb-1.5 block">Imię i nazwisko (opcjonalnie)</label>
                <input
                  className={inputCls}
                  type="text"
                  placeholder="Jan Kowalski"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-white/60 mb-1.5 block">Telefon (opcjonalnie)</label>
                <input
                  className={inputCls}
                  type="tel"
                  placeholder="500 600 700"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-white/60 mb-1.5 block">E-mail</label>
                <input
                  className={inputCls}
                  type="email"
                  placeholder="jan.kowalski@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="text-xs text-white/60 mb-1.5 block">Hasło</label>
                <input
                  className={inputCls}
                  type="password"
                  placeholder="Min. 6 znaków"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="text-xs text-white/60 mb-1.5 block">Powtórz hasło</label>
                <input
                  className={inputCls}
                  type="password"
                  placeholder="••••••••"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className={clsx(
                  "w-full rounded-xl px-6 py-3.5 font-semibold text-base disabled:opacity-60 mt-2",
                  gradBtn
                )}
              >
                {busy ? "Rejestracja..." : "Załóż konto"}
              </button>

              <p className="text-xs text-white/40 text-center mt-2">
                Hasło jest szyfrowane. Nie udostępniamy danych.
              </p>
            </form>
          )}
        </div>
      </div>
    );
  }

  // RENDER: Logged in view (panel użytkownika)
  return (
    <div className="flex flex-col h-full text-white">
      {/* User header */}
      <div 
        className="px-4 py-3 border-b border-white/10 shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--accent-red)] flex items-center justify-center text-sm font-bold">
              {(user?.email?.[0] || "U").toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium truncate max-w-[140px]">{user?.email}</div>
              <div className="text-xs text-white/50">Zalogowano</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Wyloguj
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              aria-label="Zamknij"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        {(err || msg) && (
          <div
            className={clsx(
              "mt-3 rounded-xl px-3 py-2 text-sm",
              err
                ? "bg-red-500/20 text-red-300"
                : "bg-green-500/20 text-green-300"
            )}
          >
            {err || msg}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-4 py-2 bg-white/5 shrink-0">
        <TabButton
          active={userTab === "orders"}
          onClick={() => setUserTab("orders")}
          icon={<Package className="w-4 h-4" />}
          label="Zamówienia"
        />
        <TabButton
          active={userTab === "loyalty"}
          onClick={() => setUserTab("loyalty")}
          icon={<BadgePercent className="w-4 h-4" />}
          label="Lojalność"
        />
        <TabButton
          active={userTab === "profile"}
          onClick={() => setUserTab("profile")}
          icon={<Settings className="w-4 h-4" />}
          label="Profil"
        />
      </div>

      {/* Tab content */}
      <div 
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)" }}
      >
        {/* ORDERS TAB */}
        {userTab === "orders" && (
          <div>
            {ordersLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 mx-auto mb-3 text-white/30" />
                <p className="text-white/60">Brak zamówień</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((o) => {
                  const statusLabel = getStatusLabel(o.status);
                  const statusColor = getStatusColor(o.status);
                  const items = o.items || [];
                  const optionLabel = o.selected_option === "delivery" ? "Dostawa" : "Odbiór";

                  return (
                    <div
                      key={String(o.id)}
                      className="rounded-2xl border border-white/10 overflow-hidden bg-white/5"
                    >
                      <div className="px-4 py-3 border-b border-white/5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-white/40">#{String(o.id).slice(-6)}</span>
                            <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", statusColor)}>
                              {statusLabel}
                            </span>
                            <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-full">
                              {optionLabel}
                            </span>
                          </div>
                          <span className="text-base font-bold text-[var(--accent-red)]">
                            {(o.total_price ?? 0).toFixed(2)} zł
                          </span>
                        </div>
                        <div className="text-xs text-white/40 mt-1">
                          {o.created_at
                            ? new Date(o.created_at).toLocaleDateString("pl-PL", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </div>
                      </div>

                      {items.length > 0 && (
                        <div className="px-4 py-2">
                          <ul className="space-y-1">
                            {items.slice(0, 3).map((it, idx) => (
                              <li key={idx} className="flex items-center gap-2 text-sm text-white/70">
                                <span className="text-xs text-[var(--accent-red)]">{it.quantity}×</span>
                                <span className="truncate">{it.name}</span>
                              </li>
                            ))}
                            {items.length > 3 && (
                              <li className="text-xs text-white/40 italic">+{items.length - 3} więcej...</li>
                            )}
                          </ul>
                        </div>
                      )}

                      <div className="px-4 py-3 border-t border-white/5">
                        <button
                          onClick={() => reorder(o.id)}
                          className={clsx(
                            "w-full rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2",
                            gradBtn
                          )}
                        >
                          <RefreshCcw className="w-4 h-4" />
                          Zamów ponownie
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* LOYALTY TAB */}
        {userTab === "loyalty" && (
          <div>
            <p className="text-sm text-white/60 mb-4">
              Naklejki za zrealizowane zamówienia:
              <br />• od 50 zł → 1 naklejka
              <br />• od 200 zł → 2 naklejki
              <br />• od 300 zł → 3 naklejki
            </p>

            {loyaltyLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
              </div>
            ) : (
              <LoyaltyProgress stickers={loyaltyStickers ?? 0} rollRewardClaimed={!!rollRewardClaimed} />
            )}

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold mb-1">Jak odebrać nagrodę?</div>
              <p className="text-xs text-white/60 mb-3">
                Nagrody wybierasz <b>w koszyku</b> podczas składania zamówienia.
              </p>
              <button
                type="button"
                onClick={goToCartOrMenu}
                className={clsx("w-full rounded-xl px-4 py-2.5 font-semibold text-sm", gradBtn)}
              >
                {cartCount > 0 ? "Przejdź do koszyka" : "Przejdź do menu"}
              </button>
            </div>
          </div>
        )}

        {/* PROFILE TAB */}
        {userTab === "profile" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-white/60 mb-1.5 block">Imię i nazwisko</label>
              <input
                className={inputCls}
                placeholder="Jan Kowalski"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1.5 block">Telefon</label>
              <input
                className={inputCls}
                placeholder="500 600 700"
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1.5 block">Ulica i numer</label>
              <input
                className={inputCls}
                placeholder="ul. Przykładowa 12"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/60 mb-1.5 block">Kod pocztowy</label>
                <input
                  className={inputCls}
                  placeholder="00-000"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1.5 block">Miasto</label>
                <input
                  className={inputCls}
                  placeholder="Warszawa"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1.5 block">Nr mieszkania (opc.)</label>
              <input
                className={inputCls}
                placeholder="5A"
                value={flatNumber}
                onChange={(e) => setFlatNumber(e.target.value)}
              />
            </div>

            <button
              onClick={saveProfile}
              className={clsx("w-full rounded-xl px-4 py-3 font-semibold", gradBtn)}
            >
              Zapisz profil
            </button>

            <div className="pt-4 border-t border-white/10">
              <h4 className="text-sm font-semibold mb-3">Zmiana hasła</h4>
              <div className="space-y-3">
                <input
                  className={inputCls}
                  type="password"
                  placeholder="Nowe hasło"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                />
                <input
                  className={inputCls}
                  type="password"
                  placeholder="Powtórz hasło"
                  value={newPass2}
                  onChange={(e) => setNewPass2(e.target.value)}
                />
                <button
                  onClick={changePassword}
                  className="w-full rounded-xl px-4 py-3 font-semibold bg-white/10 hover:bg-white/15 transition-colors"
                >
                  Zmień hasło
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Tab button component
function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all flex items-center justify-center gap-1.5",
        active ? "bg-[var(--accent-red)] text-white" : "bg-transparent text-white/60 hover:text-white hover:bg-white/10"
      )}
    >
      {icon}
      <span className="hidden xs:inline">{label}</span>
    </button>
  );
}

// Loyalty progress component
function LoyaltyProgress({
  stickers,
  rollRewardClaimed,
}: {
  stickers: number;
  rollRewardClaimed: boolean;
}) {
  const usable = Math.max(0, Math.min(Number(stickers || 0), 8));
  const cells = useMemo(() => Array.from({ length: 8 }, (_, i) => i < usable), [usable]);
  const toFreeRoll = usable >= 4 ? 0 : 4 - usable;
  const toDiscount = usable >= 8 ? 0 : 8 - usable;
  const canClaimFreeRoll = usable >= 4 && !rollRewardClaimed;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="grid grid-cols-8 gap-1.5 mb-3">
        {cells.map((filled, i) => (
          <div
            key={i}
            className={clsx(
              "aspect-square rounded-lg border",
              filled
                ? "border-transparent bg-[var(--accent-red)]"
                : "border-white/20 bg-white/5"
            )}
          />
        ))}
      </div>

      <div className="text-sm text-white/80">
        {usable >= 8 ? (
          <span>Masz <b className="text-[var(--accent-red)]">{usable}</b> naklejek — możesz wybrać <b>−30%</b>!</span>
        ) : usable >= 4 ? (
          canClaimFreeRoll ? (
            <span>Masz <b className="text-[var(--accent-red)]">{usable}</b> naklejki — możesz odebrać <b>darmową rolkę</b>!</span>
          ) : (
            <span>Masz <b className="text-[var(--accent-red)]">{usable}</b> naklejki. Do <b>−30%</b> brakuje <b>{toDiscount}</b>.</span>
          )
        ) : (
          <span>Masz <b className="text-[var(--accent-red)]">{usable}</b> naklejki. Do darmowej rolki brakuje <b>{toFreeRoll}</b>.</span>
        )}
      </div>
    </div>
  );
}
