"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useSession } from "@supabase/auth-helpers-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import useCartStore from "@/store/cartStore";

/** Akcenty: korzystamy z var(--accent-red*). */
const gradBtn =
  "bg-gradient-to-r from-[var(--accent-red-dark,#7a0d0d)] via-[var(--accent-red,#a61b1b)] to-[var(--accent-red-dark-2,#b11212)] text-white";

const inputCls =
  "w-full rounded-xl bg-white border border-black/10 px-3 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-[var(--accent-red,#a61b1b)] focus:border-transparent";

type Tab = "auth" | "orders" | "loyalty" | "profile";
type AuthMode = "login" | "register";

type OrderRow = {
  id: string | number;
  created_at?: string;
  total_price?: number;
  status?: string;
};

type OrderItemRow = {
  product_id?: string | number | null;
  name: string;
  unit_price: number;
  quantity: number;
  options?: any;
};

export default function AccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const supabase = createClientComponentClient();
  const session = useSession();
  const user = session?.user || null;

  const [tab, setTab] = useState<Tab>("auth");
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
  const openCheckoutModal = useCartStore(
    (s) => (s as any).openCheckoutModal
  );

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

  // pobierz zamówienia po zalogowaniu
  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) return;
      setOrdersLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, total_price, status")
        .eq("user", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error && data) setOrders(data as any);
      setOrdersLoading(false);
    };
    if (tab === "orders" && user) fetchOrders();
  }, [tab, user, supabase]);

  /* ---------------- AUTH ---------------- */
  const handleLogin = async (e: React.FormEvent) => {
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (pass !== pass2) {
      setErr("Hasła muszą być identyczne.");
      return;
    }
    setBusy(true);

    const origin =
      typeof window !== "undefined" ? window.location.origin : "";

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

    const origin =
      typeof window !== "undefined" ? window.location.origin : "";

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: origin ? `${origin}/auth/callback` : undefined,
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
      await supabase.auth.signOut();
      setMsg("Wylogowano z konta.");
      setTab("auth");
    } catch (e: any) {
      setErr(e?.message || "Nie udało się wylogować.");
    }
  };

  // pobierz stan programu lojalnościowego
  useEffect(() => {
    const fetchLoyalty = async () => {
      if (!user) return;
      setLoyaltyLoading(true);

      const { data, error } = await supabase
        .from("loyalty_accounts")
        .select("stickers")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error && data) {
        setLoyaltyStickers((data as any).stickers ?? 0);
      } else {
        // brak rekordu = jeszcze żadnych zamówień
        setLoyaltyStickers(0);
      }
      setLoyaltyLoading(false);
    };

    if (tab === "loyalty" && user) {
      fetchLoyalty();
    }
  }, [tab, user, supabase]);

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
      .eq("order_id", orderId);

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
        className="relative w-full max-w-3xl bg-white text-black shadow-2xl grid lg:grid-cols-2"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* LEWA: nawigacja / tabs po zalogowaniu | nagł. po niezalogowaniu */}
        <aside className="hidden lg:flex flex-col gap-2 p-6 border-r border-black/10">
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
        <div className="p-6">
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
                    <p>
                      • Hasło jest przechowywane w postaci zaszyfrowanej (hash).
                    </p>
                    <p>
                      • Konto służy tylko do tej restauracji – nie łączymy go z
                      innymi usługami.
                    </p>
                    <p>
                      • Zawsze możesz poprosić o usunięcie konta i danych.
                    </p>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ------ PANEL PO ZALOGOWANIU ------ */}
          {user && (
            <div className="mb-3 flex justify-end lg:hidden">
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
              >
                <LogOut className="w-3 h-3" />
                Wyloguj się
              </button>
            </div>
          )}

          {user && tab === "orders" && (
            <div>
              <h3 className="text-xl font-semibold mb-3">
                Twoje zamówienia
              </h3>
              {ordersLoading ? (
                <p className="text-black/70 text-sm">Ładowanie…</p>
              ) : orders.length === 0 ? (
                <p className="text-black/70 text-sm">Brak zamówień.</p>
              ) : (
                <ul className="space-y-2">
                  {orders.map((o) => (
                    <li
                      key={String(o.id)}
                      className="rounded-xl border border-black/10 px-3 py-2 flex items-center justify-between"
                    >
                      <div className="text-sm">
                        <div className="font-semibold">#{o.id}</div>
                        <div className="text-black/70">
                          {o.created_at
                            ? new Date(o.created_at).toLocaleString()
                            : ""}{" "}
                          • {(o.total_price ?? 0).toFixed(2)} zł •{" "}
                          {o.status || "przyjęte"}
                        </div>
                      </div>
                      <button
                        onClick={() => reorder(o.id)}
                        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm border hover:bg-black/5"
                        title="Dodaj pozycje z tego zamówienia do koszyka"
                      >
                        <RefreshCcw className="w-4 h-4" />
                        Zamów ponownie
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {user && tab === "loyalty" && (
            <div>
              <h3 className="text-xl font-semibold mb-3">
                Program lojalnościowy
              </h3>
              <p className="text-sm text-black/70 mb-3">
                Za każde zrealizowane zamówienie dostajesz 1 naklejkę.
                <br />
                <b>4 naklejki</b> = darmowa rolka, <b>8 naklejek</b> ={" "}
                <b>−20%</b> na zamówienie.
              </p>

              {loyaltyLoading ? (
                <p className="text-sm text-black/70">
                  Ładujemy stan programu…
                </p>
              ) : (
                <LoyaltyProgress stickers={loyaltyStickers ?? 0} />
              )}

              <p className="text-xs text-black/50 mt-2">
                Promocje naliczamy przy składaniu zamówienia, po weryfikacji
                statusu poprzednich.
              </p>
            </div>
          )}

          {user && tab === "profile" && (
            <div className="max-w-xl">
              <h3 className="text-xl font-semibold mb-3">
                Profil i adres
              </h3>

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
                  className={clsx(
                    "rounded-xl px-4 py-2 font-semibold",
                    gradBtn
                  )}
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
                  className={clsx(
                    "rounded-xl px-4 py-2 font-semibold",
                    gradBtn
                  )}
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
function LoyaltyProgress({ stickers }: { stickers: number }) {
  // zakładamy, że w bazie trzymasz *aktualne* niewykorzystane naklejki (0–8)
  const usable = Math.max(0, Math.min(stickers, 8));

  const cells = useMemo(
    () => Array.from({ length: 8 }, (_, i) => i < usable),
    [usable]
  );

  const toFreeRoll = usable >= 4 ? 0 : 4 - usable;
  const toDiscount = usable >= 8 ? 0 : 8 - usable;

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
            Masz {usable} naklejek — przy następnym zamówieniu naliczymy −20%
            i licznik się wyzeruje.
          </span>
        ) : usable >= 4 ? (
          <span>
            Masz <b>{usable}</b> naklejki. Możesz wymienić <b>4</b> na darmową
            rolkę albo zbierać dalej. Do −20% brakuje <b>{toDiscount}</b>.
          </span>
        ) : (
          <span>
            Masz <b>{usable}</b> naklejki. Do darmowej rolki brakuje{" "}
            <b>{toFreeRoll}</b>.
          </span>
        )}
      </div>
    </div>
  );
}
