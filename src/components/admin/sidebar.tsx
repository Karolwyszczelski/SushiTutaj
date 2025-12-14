// src/components/admin/Sidebar.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Home,
  ShoppingCart,
  Clock,
  List,
  Calendar,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Star,
  Utensils,
} from "lucide-react";
import clsx from "clsx";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

type Role = "admin" | "employee";
type IconLike = React.ComponentType<{ className?: string }>;

interface MenuItem {
  label: string;
  href: string;
  Icon: IconLike;
  roles: Role[];
}

const MENU: MenuItem[] = [
  {
    label: "Dashboard",
    href: "/admin/AdminPanel",
    Icon: Home,
    roles: ["admin", "employee"],
  },
  {
    label: "Odbierz zamówienie",
    href: "/admin/pickup-order",
    Icon: ShoppingCart,
    roles: ["admin", "employee"],
  },
  {
    label: "Bieżące zamówienia",
    href: "/admin/current-orders",
    Icon: Clock,
    roles: ["admin", "employee"],
  },
  {
    label: "Historia",
    href: "/admin/history",
    Icon: List,
    roles: ["admin", "employee"],
  },
  {
    label: "Rezerwacje",
    href: "/admin/reservations",
    Icon: Calendar,
    roles: ["admin", "employee"],
  },
  {
    label: "Menu",
    href: "/admin/menu",
    Icon: Utensils,
    roles: ["admin", "employee"],
  },
  {
    label: "Zestaw Miesiąca",
    href: "/admin/burger-miesiaca",
    Icon: Star,
    roles: ["admin"],
  },
  {
    label: "Ustawienia",
    href: "/admin/settings",
    Icon: Settings,
    roles: ["admin"],
  },
];

const STORAGE_KEY = "admin_sidebar_collapsed";
const MOBILE_QUERY = "(max-width: 1023px)";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.split("; ").find((r) => r.startsWith(name + "="));
  if (!m) return null;
  try {
    return decodeURIComponent(m.split("=")[1]);
  } catch {
    return m.split("=")[1];
  }
}

type RestaurantAdminRoleRow = { role?: string | null };

function SidebarInner() {
  const supabase = createClientComponentClient<Database>();
  const pathname = usePathname() || "";
  const params = useSearchParams();
  const searchKey = params?.toString();
  const router = useRouter();

  const [role, setRole] = useState<Role>("employee");
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved =
        typeof window !== "undefined"
          ? window.localStorage.getItem(STORAGE_KEY)
          : null;
      if (saved != null) return saved === "true";
      if (typeof window !== "undefined") {
        return window.matchMedia(MOBILE_QUERY).matches;
      }
    } catch {
      // ignore
    }
    return true;
  });

  // slug restauracji – inicjalnie: URL → cookie → localStorage
  const [slug, setSlug] = useState<string | null>(() => {
    const urlSlug = params?.get("restaurant")?.toLowerCase() || null;
    const cookieSlug = getCookie("restaurant_slug");
    let lsSlug: string | null = null;
    if (typeof window !== "undefined") {
      try {
        lsSlug =
          window.localStorage.getItem("restaurant_slug") ||
          window.localStorage.getItem("citySlug");
      } catch {
        // ignore
      }
    }
    return urlSlug || cookieSlug || lsSlug || null;
  });

  // rola
  useEffect(() => {
    let live = true;

    const load = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const { data } = await supabase
          .from("restaurant_admins")
          .select("role")
          .eq("user_id", session.user.id)
          .order("added_at", { ascending: false })
          .limit(1)
          .maybeSingle<RestaurantAdminRoleRow>();

        const r = String(data?.role ?? "staff").toLowerCase();
        const ui: Role =
          r === "owner" || r === "manager" ? "admin" : "employee";
        if (live) setRole(ui);
      } catch {
        // można logować
      }
    };

    const sub = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    void load();

    return () => {
      live = false;
      sub.data.subscription.unsubscribe();
    };
  }, [supabase]);

  // zapamiętanie złożenia
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
    } catch {
      // ignore
    }
  }, [collapsed]);

  // Ustal slug restauracji (jedno źródło prawdy) + zsynchronizuj URL / localStorage / cookie
  useEffect(() => {
    let cancelled = false;

    const ensure = async () => {
      try {
        const urlSlug = params?.get("restaurant")?.toLowerCase() || null;
        const cookieSlug = getCookie("restaurant_slug") || null;

        let lsSlug: string | null = null;
        if (typeof window !== "undefined") {
          try {
            lsSlug =
              window.localStorage.getItem("restaurant_slug") ||
              window.localStorage.getItem("citySlug");
          } catch {
            // ignore
          }
        }

        // kandydat do przekazania w zapytaniu
        const seedSlug = urlSlug || cookieSlug || lsSlug || slug || null;

        // spróbuj ustalić slug po stronie serwera (na bazie zalogowanego admina)
        let srvSlug: string | null = null;
        const res = await fetch(
          `/api/restaurants/ensure-cookie${
            seedSlug ? `?restaurant=${encodeURIComponent(seedSlug)}` : ""
          }`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        if (res.ok) {
          const json = (await res.json()) as {
            restaurant_slug?: string | null;
          };
          if (json.restaurant_slug) {
            srvSlug = json.restaurant_slug.toLowerCase();
          }
        }

        const finalSlug =
          (srvSlug ||
            urlSlug ||
            slug ||
            cookieSlug ||
            lsSlug ||
            null)?.toLowerCase() || null;

        if (cancelled || !finalSlug) return;

        // stan Reacta
        if (finalSlug !== slug) {
          setSlug(finalSlug);
        }

        // localStorage
        if (typeof window !== "undefined") {
          try {
            const currentLs =
              window.localStorage.getItem("restaurant_slug") || null;
            if (currentLs !== finalSlug) {
              window.localStorage.setItem("restaurant_slug", finalSlug);
              window.localStorage.setItem("citySlug", finalSlug);
            }
          } catch {
            // ignore
          }
        }

        // cookie (dla API routes)
        if (typeof document !== "undefined") {
          const currentCookie = getCookie("restaurant_slug");
          if (currentCookie !== finalSlug) {
            document.cookie = `restaurant_slug=${encodeURIComponent(
              finalSlug
            )}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
          }
        }

        // URL – dopnij / popraw ?restaurant=...
        const currentParams = new URLSearchParams(params?.toString() || "");
        if (currentParams.get("restaurant") !== finalSlug) {
          currentParams.set("restaurant", finalSlug);
          const qs = currentParams.toString();
          const href = qs ? `${pathname}?${qs}` : pathname;
          router.replace(href as any, { scroll: false });
        }
      } catch (err) {
        console.error("[admin sidebar] ensure restaurant slug failed", err);
      }
    };

    void ensure();

    return () => {
      cancelled = true;
    };
  }, [pathname, searchKey, slug, router, params]);

  // Zwracamy UrlObject zamiast stringa, żeby Link był zadowolony, a TS się nie czepiał
  const withQs = useMemo(
    () =>
      (href: string) =>
        slug
          ? ({
              pathname: href,
              query: { restaurant: slug },
            } as const)
          : ({ pathname: href } as const),
    [slug]
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  return (
    <aside
      className={clsx(
  "sticky top-0 z-30 h-[100dvh] bg-white text-black border-r border-gray-200 flex-none",
  "transition-[width] duration-200 will-change-[width]",
  collapsed ? "w-16" : "w-64"
)}
    >
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200">
        {!collapsed && (
          <div className="text-base font-semibold">Panel Admina</div>
        )}
        <button
          aria-label={collapsed ? "Rozwiń panel boczny" : "Zwiń panel boczny"}
          onClick={() => setCollapsed((c) => !c)}
className="p-1 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-500/30"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      <nav className="h-[calc(100dvh-3rem-3.25rem)] overflow-y-auto">
        <ul className="py-2">
          {MENU.filter((i) => i.roles.includes(role)).map(
            ({ label, href, Icon }) => {
              const isActive =
                pathname === href || pathname.startsWith(href + "/");
              return (
                <li key={href}>
                  <Link
                    href={withQs(href)}
                    className={clsx(
  "flex items-center gap-3 px-3 py-2 transition-colors",
  "hover:bg-gray-100",
  isActive && "bg-gray-100"
)}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                </li>
              );
            }
          )}
        </ul>
      </nav>

      <div className="sticky bottom-0 bg-black/95 border-t border-gray-800 px-2 py-3">
        <button
          onClick={handleLogout}
          className={clsx(
            "w-full flex items-center gap-3 rounded px-3 py-2 transition",
            "hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-500/30",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span>Wyloguj</span>}
        </button>
      </div>
    </aside>
  );
}

// OWIŃ WSZYSTKO W SUSPENSE – to usuwa błąd useSearchParams + CSR bailout
export default function Sidebar() {
  return (
    <Suspense
      fallback={
        <aside className="sticky top-0 z-30 h-[100dvh] w-16 bg-black border-r border-gray-900" />
      }
    >
      <SidebarInner />
    </Suspense>
  );
}
