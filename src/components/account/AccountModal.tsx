"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  X,
  LogIn,
  UserPlus,
  BadgePercent,
  Package,
  Settings,
  RefreshCcw,
  LogOut,
} from "lucide-react";
import clsx from "clsx";
import { useSession } from "@/contexts/SessionContext";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { usePathname, useRouter } from "next/navigation";
import useCartStore from "@/store/cartStore";

/** Akcenty: korzystamy z var(--accent-red*). */
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
      return "bg-blue-100 text-blue-700";
    case "accepted":
      return "bg-yellow-100 text-yellow-700";
    case "preparing":
      return "bg-orange-100 text-orange-700";
    case "ready":
      return "bg-green-100 text-green-700";
    case "out_for_delivery":
      return "bg-purple-100 text-purple-700";
    case "completed":
      return "bg-green-100 text-green-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

/** Wyciągnij dodatki z options jako string */
function extractAddons(options?: any): string | null {
  if (!options) return null;
  const parts: string[] = [];

  // addons array
  if (Array.isArray(options.addons) && options.addons.length > 0) {
    parts.push(...options.addons.filter((a: any) => typeof a === "string" && a.trim()));
  }

  // sosy
  if (Array.isArray(options.sauces) && options.sauces.length > 0) {
    parts.push(...options.sauces.filter((s: any) => typeof s === "string" && s.trim()));
  }

  // note
  if (options.note && typeof options.note === "string" && options.note.trim()) {
    parts.push(`"${options.note.trim()}"`);
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

const inputCls =
  "w-full rounded-xl bg-white border border-black/10 px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-[var(--accent-red,#a61b1b)] focus:border-transparent";

type Tab = "auth" | "orders" | "loyalty" | "profile";
type AuthMode = "login" | "register";

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

export default function AccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const supabase = getSupabaseBrowser();
  const session = useSession();
  const user = session?.user || null;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("auth");

  const pathname = usePathname() ?? "/";

  // jak Header.tsx: /{city}#menu (fallback: /#menu)
  const menuHref = useMemo(() => {
    const seg0 = pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
    const allowed = ["ciechanow", "przasnysz", "szczytno"];
    return allowed.includes(seg0) ? `/${seg0}#menu` : "/#menu";
  }, [pathname]);

  // auth mode (login/register)
  const [authMode, setAuthMode] = useState<AuthMode>("login");


  

  // auth state
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // panel: orders
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // panel: loyalty
  const [loyaltyStickers, setLoyaltyStickers] = useState<number | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
    const [rollRewardClaimed, setRollRewardClaimed] = useState<boolean | null>(null);


  // panel: profile (adres + zmiana hasła)
  const meta = (user?.user_metadata as any) || {};
  const [name, setName] = useState(meta.full_name || "");
  const [phone, setPhone] = useState(meta.phone || "");
  const [street, setStreet] = useState(meta.street || "");
  const [postalCode, setPostalCode] = useState(meta.postal_code || "");
  const [city, setCity] = useState(meta.city || "");
  const [flatNumber, setFlatNumber] = useState(meta.flat_number || "");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");

  // koszyk (zamów ponownie)
  const addItem = useCartStore((s) => (s as any).addItem);
  const openCheckoutModal = useCartStore((s) => (s as any).openCheckoutModal);

    // koszyk: wykryj czy są produkty (różne nazwy pól w store – fallbacki)
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

  const goToCartOrMenu = () => {
    // zamykamy modal konta, żeby nie robić „modal na modalu”
    onClose();

    // jeśli koszyk ma pozycje — otwórz checkout
    if (cartCount > 0 && typeof openCheckoutModal === "function") {
      // microtask, żeby zamknięcie modala zdążyło zejść z DOM
      setTimeout(() => openCheckoutModal(), 0);
      return;
    }

    // jeśli koszyk pusty — wyślij do menu
        setTimeout(() => router.push(menuHref as any), 0);

  };


  // gdy użytkownik się zaloguje — pokaż panel
  useEffect(() => {
    if (open) {
      setErr(null);
      setMsg(null);
      if (user) {
        setTab("orders");
        // odśwież profil z metadanych
        const m = (user.user_metadata as any) || {};
        setName(m.full_name || "");
        setPhone(m.phone || "");
        setStreet(m.street || "");
        setPostalCode(m.postal_code || "");
        setCity(m.city || "");
        setFlatNumber(m.flat_number || "");
      } else {
        setTab("auth");
      }
    } else {
      // reset formów
      setEmail("");
      setPass("");
      setPass2("");
      setNewPass("");
      setNewPass2("");
      setAuthMode("login");
      setErr(null);
      setMsg(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  // pobierz zamówienia po zalogowaniu (z pozycjami)
  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) return;
      setOrdersLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, 
          created_at, 
          total_price, 
          status,
          selected_option,
          order_items (
            product_id,
            name,
            unit_price,
            quantity,
            options
          )
        `)
        .eq("user", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!error && data) {
        // Mapuj order_items na items
        const mapped = (data as any[]).map((o) => ({
          ...o,
          items: o.order_items || [],
        }));
        setOrders(mapped);
      }
      setOrdersLoading(false);
    };
    if (tab === "orders" && user) fetchOrders();
  }, [tab, user, supabase]);

  /* ---------------- AUTH ---------------- */
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setMsg("Zalogowano.");
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
        data: {
          full_name: name || "",
          phone: phone || "",
        },
        emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
      },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setMsg("Konto utworzone. Sprawdź skrzynkę i potwierdź e-mail.");
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

    // ważne: dopnij miasto, żeby wrócić na /[city] po kliknięciu w maila
const allowed = ["ciechanow", "przasnysz", "szczytno"];
const seg0 = pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
const cityParam = allowed.includes(seg0) ? seg0 : "";

// Zmiana: używamy /auth/callback zamiast /auth/reset-password
// /auth/callback ma logikę signOut + exchangeCodeForSession
const resetPath = `/auth/callback${
  cityParam ? `?city=${encodeURIComponent(cityParam)}` : ""
}`;

const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: origin ? `${origin}${resetPath}` : undefined,
});


    if (error) setErr(error.message);
    else {
      setMsg(
        "Wysłaliśmy link resetu hasła na podany e-mail. Po kliknięciu w link ustawisz nowe hasło."
      );
    }
  };

  const handleLogout = async () => {
    setErr(null);
    setMsg(null);
    try {
      await supabase.auth.signOut({ scope: "local" })
      setMsg("Wylogowano z konta.");
      setTab("auth");
    } catch (e: any) {
      setErr(e?.message || "Nie udało się wylogować.");
    }
  };

  // pobierz stan programu lojalnościowego (jedno źródło prawdy: loyalty_accounts.stickers)
useEffect(() => {
  // jeśli modal zamknięty albo user niezalogowany – czyścimy stan
  if (!open || tab !== "loyalty" || !user?.id) {
    setLoyaltyStickers(null);
    setRollRewardClaimed(null);
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

      const stickers = Math.max(0, Number(data?.stickers ?? 0));
      setLoyaltyStickers(stickers);
      setRollRewardClaimed(!!(data as any)?.roll_reward_claimed);
    } catch (e) {
      console.error("Loyalty(AccountModal): błąd pobierania loyalty_accounts", e);
      if (!cancelled) {
        setLoyaltyStickers(0);
        setRollRewardClaimed(false);
      }
    } finally {
      if (!cancelled) setLoyaltyLoading(false);
    }
  };

  load();

  return () => {
    cancelled = true;
  };
}, [open, tab, user?.id, supabase]);


  /* ---------------- PANEL: PROFIL ---------------- */
  const saveProfile = async () => {
    setErr(null);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: name,
        phone,
        street,
        postal_code: postalCode,
        city,
        flat_number: flatNumber,
      },
    });
    if (error) setErr(error.message);
    else setMsg("Zapisano profil.");
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
      setMsg("Hasło zostało zmienione.");
      setNewPass("");
      setNewPass2("");
    }
  };

  /* ---------------- PANEL: ZAMÓW PONOWNIE ---------------- */
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
    setMsg("Dodano produkty z poprzedniego zamówienia do koszyka.");
  };

  /* ---------------- RENDER ---------------- */
  if (!open) return null;

  const MobileTabBtn = ({
    value,
    icon,
    label,
  }: {
    value: Exclude<Tab, "auth">;
    icon: ReactNode;
    label: string;
  }) => {
    const active = tab === value;
    return (
      <button
        type="button"
        onClick={() => setTab(value)}
        className={clsx(
          "flex-1 min-w-[110px] rounded-xl px-3 py-2 text-xs font-semibold border transition",
          active ? gradBtn : "bg-white hover:bg-black/5 border-black/10"
        )}
        aria-current={active ? "page" : undefined}
      >
        <span
          className={clsx(
            "inline-flex items-center justify-center gap-2",
            active ? "text-white" : "text-black"
          )}
        >
          {icon}
          <span className="whitespace-nowrap">{label}</span>
        </span>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 grid place-items-center px-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-3xl bg-white text-black shadow-2xl grid lg:grid-cols-2 rounded-2xl max-h-[92vh] overflow-hidden min-h-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* LEWA: desktop tabs */}
        <aside className="hidden lg:flex flex-col gap-2 p-6 border-r border-black/10 overflow-y-auto">
          <h3 className="text-xl font-semibold mb-2">Konto</h3>
          {!user ? (
            <div className="text-sm text-black/70">
              Zaloguj się lub załóż konto, by śledzić zamówienia i korzystać z
              programu lojalnościowego.
            </div>
          ) : (
            <>
              <button
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-black/5",
                  tab === "orders" && "bg-black/5 font-semibold"
                )}
                onClick={() => setTab("orders")}
              >
                <Package className="w-4 h-4" /> Zamówienia
              </button>
              <button
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-black/5",
                  tab === "loyalty" && "bg-black/5 font-semibold"
                )}
                onClick={() => setTab("loyalty")}
              >
                <BadgePercent className="w-4 h-4" /> Program lojalnościowy
              </button>
              <button
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-black/5",
                  tab === "profile" && "bg-black/5 font-semibold"
                )}
                onClick={() => setTab("profile")}
              >
                <Settings className="w-4 h-4" /> Profil i adres
              </button>

              <div className="mt-4 border-t border-black/10 pt-3">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-700 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4" />
                  Wyloguj się
                </button>
              </div>
            </>
          )}
        </aside>

        {/* PRAWA: treść */}
        <div className="p-6 overflow-y-auto max-h-[85vh]">
          {/* Zamknięcie */}
          <button
            onClick={onClose}
            aria-label="Zamknij"
            className="absolute top-3 right-3 p-2 rounded-full hover:bg-black/5"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Wiadomości */}
          {(err || msg) && (
            <div
              className={clsx(
                "mb-3 rounded-xl px-3 py-2 text-sm",
                err
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-50 text-green-700 border border-green-200"
              )}
            >
              {err || msg}
            </div>
          )}

          {/* ------ AUTH ------ */}
          {!user && tab === "auth" && (
            <div className="max-w-md">
              <h3 className="text-xl font-semibold mb-1">
                Zaloguj się lub załóż konto
              </h3>
              <p className="text-xs text-black/60 mb-4">
                Konto służy wyłącznie do obsługi zamówień w tym systemie. Hasła
                są szyfrowane, nie wysyłamy spamu ani nie udostępniamy danych
                dalej.
              </p>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setAuthMode("login")}
                  className={clsx(
                    "flex-1 rounded-xl px-3 py-2 text-sm border transition",
                    authMode === "login"
                      ? gradBtn
                      : "bg-white hover:bg-black/5 border-black/10"
                  )}
                >
                  <span
                    className={clsx(
                      "inline-flex items-center justify-center gap-1",
                      authMode === "login" ? "text-white" : "text-black"
                    )}
                  >
                    <LogIn className="w-4 h-4" />
                    Zaloguj się
                  </span>
                </button>
                <button
                  onClick={() => setAuthMode("register")}
                  className={clsx(
                    "flex-1 rounded-xl px-3 py-2 text-sm border transition",
                    authMode === "register"
                      ? gradBtn
                      : "bg-white hover:bg-black/5 border-black/10"
                  )}
                >
                  <span
                    className={clsx(
                      "inline-flex items-center justify-center gap-1",
                      authMode === "register" ? "text-white" : "text-black"
                    )}
                  >
                    <UserPlus className="w-4 h-4" />
                    Załóż konto
                  </span>
                </button>
              </div>

              {authMode === "login" ? (
                <form onSubmit={handleLogin} className="space-y-3">
                  <label className="text-xs text-black/70">
                    E-mail
                    <input
                      className={clsx(inputCls, "mt-1")}
                      type="email"
                      placeholder="np. jan.kowalski@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </label>

                  <label className="text-xs text-black/70">
                    Hasło
                    <input
                      className={clsx(inputCls, "mt-1")}
                      type="password"
                      placeholder="Twoje hasło do tego konta"
                      value={pass}
                      onChange={(e) => setPass(e.target.value)}
                      required
                    />
                  </label>

                  <div className="flex items-center justify-between text-[11px] text-black/70">
                    <button
                      type="button"
                      onClick={handleSendReset}
                      className="underline hover:text-black"
                    >
                      Zapomniałem hasła
                    </button>
                    <span>Masz już konto? Zaloguj się tutaj.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className={clsx(
                      "w-full rounded-xl px-4 py-2 mt-1 font-semibold disabled:opacity-60",
                      gradBtn
                    )}
                  >
                    {busy ? "Logowanie…" : "Zaloguj się"}
                  </button>

                  <p className="text-[11px] text-black/50 mt-2">
                    Logujesz się tylko do systemu zamówień tej restauracji. Nie
                    prosimy o żadne dane bankowe.
                  </p>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="text-xs text-black/70 md:col-span-2">
                      Imię i nazwisko (opcjonalnie)
                      <input
                        className={clsx(inputCls, "mt-1")}
                        type="text"
                        placeholder="Do przypisania zamówień"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>

                    <label className="text-xs text-black/70">
                      Telefon (opcjonalnie)
                      <input
                        className={clsx(inputCls, "mt-1")}
                        type="tel"
                        placeholder="Ułatwia kontakt z dostawcą"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </label>

                    <label className="text-xs text-black/70 md:col-span-2">
                      E-mail (do logowania i potwierdzeń)
                      <input
                        className={clsx(inputCls, "mt-1")}
                        type="email"
                        placeholder="np. jan.kowalski@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </label>

                    <label className="text-xs text-black/70">
                      Hasło
                      <input
                        className={clsx(inputCls, "mt-1")}
                        type="password"
                        placeholder="Min. 6 znaków"
                        value={pass}
                        onChange={(e) => setPass(e.target.value)}
                        required
                      />
                    </label>

                    <label className="text-xs text-black/70">
                      Powtórz hasło
                      <input
                        className={clsx(inputCls, "mt-1")}
                        type="password"
                        placeholder="Powtórz hasło"
                        value={pass2}
                        onChange={(e) => setPass2(e.target.value)}
                        required
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className={clsx(
                      "w-full rounded-xl px-4 py-2 font-semibold disabled:opacity-60 mt-1",
                      gradBtn
                    )}
                  >
                    {busy ? "Rejestracja…" : "Załóż konto"}
                  </button>

                  <div className="mt-2 space-y-1 text-[11px] text-black/55">
                    <p>• Hasło jest przechowywane w postaci zaszyfrowanej (hash).</p>
                    <p>• Konto służy tylko do tej restauracji – nie łączymy go z innymi usługami.</p>
                    <p>• Zawsze możesz poprosić o usunięcie konta i danych.</p>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ------ PANEL PO ZALOGOWANIU ------ */}
          {user && (
            <>
              {/* MOBILE: zakładki jak na desktop */}
              <div className="lg:hidden mb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-lg font-semibold">Konto</h3>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                  >
                    <LogOut className="w-3 h-3" />
                    Wyloguj
                  </button>
                </div>

                <div className="flex gap-2">
                  <MobileTabBtn
                    value="orders"
                    icon={<Package className="w-4 h-4" />}
                    label="Zamówienia"
                  />
                  <MobileTabBtn
                    value="loyalty"
                    icon={<BadgePercent className="w-4 h-4" />}
                    label="Lojalność"
                  />
                  <MobileTabBtn
                    value="profile"
                    icon={<Settings className="w-4 h-4" />}
                    label="Ustawienia"
                  />
                </div>
              </div>

              {/* DESKTOP: przycisk wyloguj jest w lewym panelu, więc tu już nie dublujemy */}
            </>
          )}

          {user && tab === "orders" && (
            <div>
              <h3 className="text-xl font-semibold mb-3">Twoje zamówienia</h3>
              {ordersLoading ? (
                <p className="text-black/70 text-sm">Ładowanie…</p>
              ) : orders.length === 0 ? (
                <p className="text-black/70 text-sm">Brak zamówień.</p>
              ) : (
                <div className="space-y-4">
                  {orders.map((o) => {
                    const statusLabel = getStatusLabel(o.status);
                    const statusColor = getStatusColor(o.status);
                    const items = o.items || [];
                    const optionLabel = o.selected_option === "delivery" ? "Dostawa" : "Odbiór";

                    return (
                      <div
                        key={String(o.id)}
                        className="rounded-2xl border border-black/10 overflow-hidden bg-white shadow-sm"
                      >
                        {/* Nagłówek zamówienia */}
                        <div className="px-4 py-3 bg-gradient-to-r from-black/[0.02] to-transparent border-b border-black/5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono text-black/50">#{String(o.id).slice(-8)}</span>
                              <span className={clsx(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                                statusColor
                              )}>
                                {statusLabel}
                              </span>
                              <span className="text-xs text-black/60 bg-black/5 px-2 py-0.5 rounded-full">
                                {optionLabel}
                              </span>
                            </div>
                            <span className="text-lg font-bold text-[var(--accent-red,#a61b1b)]">
                              {(o.total_price ?? 0).toFixed(2)} zł
                            </span>
                          </div>
                          <div className="text-xs text-black/50 mt-1">
                            {o.created_at
                              ? new Date(o.created_at).toLocaleDateString("pl-PL", {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : ""}
                          </div>
                        </div>

                        {/* Lista pozycji */}
                        {items.length > 0 && (
                          <div className="px-4 py-3">
                            <div className="text-xs font-semibold text-black/40 uppercase tracking-wide mb-2">
                              Co zamawiałeś
                            </div>
                            <ul className="space-y-2">
                              {items.slice(0, 5).map((it, idx) => {
                                const addons = extractAddons(it.options);
                                return (
                                  <li key={idx} className="flex items-start gap-3">
                                    <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--accent-red,#a61b1b)] text-white text-xs flex items-center justify-center font-semibold">
                                      {it.quantity}×
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm truncate">{it.name}</div>
                                      {addons && (
                                        <div className="text-xs text-black/50 truncate">{addons}</div>
                                      )}
                                    </div>
                                    <span className="text-sm text-black/70 shrink-0">
                                      {((it.unit_price || 0) * (it.quantity || 1)).toFixed(2)} zł
                                    </span>
                                  </li>
                                );
                              })}
                              {items.length > 5 && (
                                <li className="text-xs text-black/50 italic">
                                  +{items.length - 5} więcej pozycji…
                                </li>
                              )}
                            </ul>
                          </div>
                        )}

                        {/* Przycisk zamów ponownie */}
                        <div className="px-4 py-3 border-t border-black/5 bg-black/[0.01]">
                          <button
                            onClick={() => reorder(o.id)}
                            className={clsx(
                              "w-full rounded-xl px-4 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 transition",
                              gradBtn
                            )}
                          >
                            <RefreshCcw className="w-4 h-4" />
                            Zamów to samo
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Informacja o pełnej historii */}
              {orders.length >= 10 && (
                <div className="mt-4 p-4 rounded-xl bg-black/5 text-center">
                  <p className="text-sm text-black/70">
                    Wyświetlamy tylko 10 ostatnich zamówień.
                  </p>
                  <p className="text-sm text-black/70 mt-1">
                    Potrzebujesz pełnej historii? Napisz do nas:{" "}
                    <a 
                      href="mailto:kontakt@sushitutaj.pl" 
                      className="text-[var(--accent-red,#a61b1b)] font-medium hover:underline"
                    >
                      kontakt@sushitutaj.pl
                    </a>
                  </p>
                </div>
              )}
            </div>
          )}

          {user && tab === "loyalty" && (
            <div>
              <h3 className="text-xl font-semibold mb-3">Program lojalnościowy</h3>
              <p className="text-sm text-black/70 mb-3">
               Naklejki naliczamy za <b>zrealizowane</b> zamówienia wg kwoty wydanej:
  <br />• <b>od 50 zł</b> → 1 naklejka
  <br />• <b>od 200 zł</b> → 2 naklejki
  <br />• <b>od 300 zł</b> → 3 naklejki
  <br /><br />
                <b>4 naklejki</b> = darmowa rolka, <b>8 naklejek</b> = <b>−30%</b> na zamówienie.
              </p>

                                          {loyaltyLoading ? (
                <p className="text-sm text-black/70">Ładujemy stan programu…</p>
              ) : (
                <LoyaltyProgress
                  stickers={loyaltyStickers ?? 0}
                  rollRewardClaimed={!!rollRewardClaimed}
                />
              )}

              {/* UX: żeby user nie utknął — nagrody wybiera się w koszyku */}
              <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] p-3">
                <div className="text-sm font-semibold mb-1">
                  Jak odebrać nagrodę?
                </div>
                <p className="text-xs text-black/70 leading-relaxed">
                  Nagrody wybierasz <b>w koszyku</b> podczas składania zamówienia.
                  Jeśli masz ≥4 naklejki — zobaczysz opcję darmowej rolki (1× na cykl).
                  Jeśli masz 8 — zobaczysz opcję <b>−30%</b> (spala 8 naklejek).
                </p>

                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={goToCartOrMenu}
                    className={clsx(
                      "rounded-xl px-4 py-2 font-semibold disabled:opacity-60",
                      gradBtn
                    )}
                  >
                    {cartCount > 0 ? "Przejdź do koszyka" : "Przejdź do menu"}
                  </button>

                  {cartCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        setTimeout(() => router.push(menuHref as any), 0);

                      }}
                      className="rounded-xl px-4 py-2 font-semibold border border-black/10 hover:bg-black/5"
                    >
                      Dodaj coś jeszcze
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-black/50 mt-2">
                Promocje naliczamy przy składaniu zamówienia, po weryfikacji statusu poprzednich.
              </p>
            </div>
          )}

          {user && tab === "profile" && (
            <div className="max-w-xl">
              <h3 className="text-xl font-semibold mb-3">Profil i adres</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  className={inputCls}
                  placeholder="Imię i nazwisko"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder="Telefon"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <input
                  className={clsx(inputCls, "md:col-span-2")}
                  placeholder="Ulica i numer"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder="Kod pocztowy"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder="Miasto"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder="Nr mieszkania (opc.)"
                  value={flatNumber}
                  onChange={(e) => setFlatNumber(e.target.value)}
                />
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={saveProfile}
                  className={clsx("rounded-xl px-4 py-2 font-semibold", gradBtn)}
                >
                  Zapisz profil
                </button>
              </div>

              <h4 className="mt-6 mb-2 font-semibold">Zmiana hasła</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              </div>
              <div className="mt-3">
                <button
                  onClick={changePassword}
                  className={clsx("rounded-xl px-4 py-2 font-semibold", gradBtn)}
                >
                  Zmień hasło
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- MINI KOMPONENT: LOYALTY ---------------- */
function LoyaltyProgress({
  stickers,
  rollRewardClaimed,
}: {
  stickers: number;
  rollRewardClaimed: boolean;
}) {
  // UI: trzymamy 0–8 (jeśli w DB będzie inaczej, nie rozjedzie kratki)
  const usable = Math.max(0, Math.min(Number(stickers || 0), 8));

  const cells = useMemo(() => Array.from({ length: 8 }, (_, i) => i < usable), [
    usable,
  ]);

  const toFreeRoll = usable >= 4 ? 0 : 4 - usable;
  const toDiscount = usable >= 8 ? 0 : 8 - usable;

  const canClaimFreeRoll = usable >= 4 && !rollRewardClaimed;

  return (
    <div>
      <div className="grid grid-cols-8 gap-1">
        {cells.map((filled, i) => (
          <div
            key={i}
            className={clsx(
              "h-8 rounded-md border",
              filled
                ? "border-transparent bg-[var(--accent-red,#a61b1b)]"
                : "border-black/15 bg-black/5"
            )}
          />
        ))}
      </div>

      <div className="mt-2 text-sm">
        {usable >= 8 ? (
          <span className="font-semibold">
            Masz {usable} naklejek — w koszyku możesz wybrać <b>−30%</b> (spalimy 8 naklejek).
          </span>
        ) : usable >= 4 ? (
          canClaimFreeRoll ? (
            <span>
              Masz <b>{usable}</b> naklejki. W koszyku możesz odebrać <b>darmową rolkę</b> (nagroda za 4)
              albo zbierać dalej. Do <b>−30%</b> brakuje <b>{toDiscount}</b>.
            </span>
          ) : (
            <span>
              Masz <b>{usable}</b> naklejki. <b>Darmowa rolka (za 4)</b> została już odebrana w tym cyklu.
              Do <b>−30%</b> brakuje <b>{toDiscount}</b>.
            </span>
          )
        ) : (
          <span>
            Masz <b>{usable}</b> naklejki. Do darmowej rolki brakuje <b>{toFreeRoll}</b>.
          </span>
        )}
      </div>
    </div>
  );
}

