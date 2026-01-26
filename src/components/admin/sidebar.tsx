// src/components/admin/Sidebar.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import { createBrowserClient } from "@supabase/ssr";
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
  { label: "Dashboard", href: "/admin/AdminPanel", Icon: Home, roles: ["admin", "employee"] },
  { label: "Odbierz zamówienie", href: "/admin/pickup-order", Icon: ShoppingCart, roles: ["admin", "employee"] },
  { label: "Bieżące zamówienia", href: "/admin/current-orders", Icon: Clock, roles: ["admin", "employee"] },
  { label: "Historia", href: "/admin/history", Icon: List, roles: ["admin", "employee"] },
  { label: "Rezerwacje", href: "/admin/reservations", Icon: Calendar, roles: ["admin", "employee"] },
  { label: "Menu", href: "/admin/menu", Icon: Utensils, roles: ["admin", "employee"] },
  { label: "Zestaw Miesiąca", href: "/admin/burger-miesiaca", Icon: Star, roles: ["admin"] },
  { label: "Ustawienia", href: "/admin/settings", Icon: Settings, roles: ["admin"] },
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

type EnsureCookieResp = {
  restaurant_id?: string | null;
  restaurant_slug?: string | null;
  role?: string | null;
};

function roleToUiRole(raw: string | null | undefined): Role {
  const r = String(raw ?? "").toLowerCase();
  return r === "owner" || r === "manager" || r === "admin" ? "admin" : "employee";
}

function SidebarInner() {
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const pathname = usePathname() || "";
  const params = useSearchParams();
  const searchKey = params?.toString();
  const router = useRouter();

  const [role, setRole] = useState<Role>("employee");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (saved != null) return saved === "true";
      if (typeof window !== "undefined") return window.matchMedia(MOBILE_QUERY).matches;
    } catch {}
    return true;
  });

  // slug: URL -> cookie (bez localStorage jako seed do serwera)
  const [slug, setSlug] = useState<string | null>(() => {
    const urlSlug = params?.get("restaurant")?.toLowerCase() || null;
    const cookieSlug = getCookie("restaurant_slug");
    return urlSlug || cookieSlug || null;
  });

  // żeby nie robić pętli router.replace
  const lastUrlSlugRef = useRef<string | null>(null);

  // zapamiętanie złożenia
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
    } catch {}
  }, [collapsed]);

  // 1) Ustal restaurację po stronie serwera (źródło prawdy)
  useEffect(() => {
    let cancelled = false;

    const ensure = async () => {
      try {
        const urlSlug = params?.get("restaurant")?.toLowerCase().trim() || null;
        const qs = urlSlug ? `?restaurant=${encodeURIComponent(urlSlug)}` : "";

        const res = await fetch(`/api/restaurants/ensure-cookie${qs}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) return;

        const json = (await res.json()) as EnsureCookieResp;
        const srvSlug = json.restaurant_slug?.toLowerCase() ?? null;
        const srvRid = json.restaurant_id ?? null;
        const srvRole = json.role ?? null;

        if (cancelled) return;

        if (srvRid && srvRid !== restaurantId) setRestaurantId(srvRid);
        if (srvSlug && srvSlug !== slug) setSlug(srvSlug);
        
        // Ustaw rolę z API (omija RLS)
        if (srvRole) {
          const uiRole = roleToUiRole(srvRole);
          setRole(uiRole);
        }

        // localStorage tylko jako cache dla UI
        if (srvSlug && typeof window !== "undefined") {
          try {
            window.localStorage.setItem("restaurant_slug", srvSlug);
            window.localStorage.setItem("citySlug", srvSlug);
          } catch {}
        }

        // dopnij/poprzez URL ?restaurant=...
        if (srvSlug) {
          const current = params?.get("restaurant")?.toLowerCase() ?? null;
          const wanted = srvSlug;

          if (lastUrlSlugRef.current !== wanted && current !== wanted) {
            lastUrlSlugRef.current = wanted;
            const sp = new URLSearchParams(params?.toString() || "");
            sp.set("restaurant", wanted);
            const href = sp.toString() ? `${pathname}?${sp.toString()}` : pathname;
            router.replace(href as any, { scroll: false });
          }
        }
      } catch (err) {
        console.error("[admin sidebar] ensure-cookie failed", err);
      }
    };

    void ensure();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchKey, router]);

  // 2) Subskrypcja na zmiany auth - odśwież dane gdy zmieni się sesja
  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange(async () => {
      // Po zmianie sesji (np. refresh) wywołaj ponownie ensure-cookie
      try {
        const res = await fetch(`/api/restaurants/ensure-cookie`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) {
          const json = (await res.json()) as EnsureCookieResp;
          if (json.role) setRole(roleToUiRole(json.role));
          if (json.restaurant_id) setRestaurantId(json.restaurant_id);
          if (json.restaurant_slug) setSlug(json.restaurant_slug.toLowerCase());
        }
      } catch {}
    });

    return () => {
      sub.data.subscription.unsubscribe();
    };
  }, [supabase]);

  // query dla linków
  const withQs = useMemo(
    () => (href: string) =>
      slug
        ? ({ pathname: href, query: { restaurant: slug } } as const)
        : ({ pathname: href } as const),
    [slug]
  );

  const handleLogout = async () => {
    try {
      await fetch("/api/restaurants/clear-cookie", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch {}

    try {
      window.localStorage.removeItem("restaurant_slug");
      window.localStorage.removeItem("citySlug");
    } catch {}

    await supabase.auth.signOut({ scope: "local" })
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
        {!collapsed && <div className="text-base font-semibold text-black">Panel Admina</div>}
        <button
          aria-label={collapsed ? "Rozwiń panel boczny" : "Zwiń panel boczny"}
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#de1d13]/30 text-black"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5 text-black" />
          ) : (
            <ChevronLeft className="h-5 w-5 text-black" />
          )}
        </button>
      </div>

      <nav className="h-[calc(100dvh-3rem-4rem)] overflow-y-auto">
        <ul className="py-2">
          {MENU.filter((i) => i.roles.includes(role)).map(({ label, href, Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={withQs(href)}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2 transition-colors",
                    "hover:bg-gray-100",
                    isActive && "bg-gray-100",
                    // pasek aktywnego linku (akcent)
                    "border-l-4",
                    isActive ? "border-l-[#de1d13]" : "border-l-transparent"
                  )}
                >
                  <Icon className="h-5 w-5 flex-shrink-0 text-black" />
                  {!collapsed && <span className="truncate text-black">{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-2 py-3">
        <button
          onClick={handleLogout}
          className={clsx(
            "w-full flex items-center gap-3 rounded px-3 py-2 transition",
            "bg-[#de1d13] text-white hover:bg-[#c71812] focus:outline-none focus:ring-2 focus:ring-[#de1d13]/30",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="h-5 w-5 text-white" />
          {!collapsed && <span className="text-white">Wyloguj</span>}
        </button>
      </div>
    </aside>
  );
}

export default function Sidebar() {
  return (
    <Suspense
      fallback={
        <aside className="sticky top-0 z-30 h-[100dvh] w-16 bg-white border-r border-gray-200" />
      }
    >
      <SidebarInner />
    </Suspense>
  );
}
