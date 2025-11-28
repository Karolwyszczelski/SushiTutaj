// src/components/admin/Sidebar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
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
type IconLike = ComponentType<{ className?: string }>;

interface MenuItem {
  label: string;
  href: string;
  Icon: IconLike;
  roles: Role[];
}

const MENU: MenuItem[] = [
  { label: "Dashboard",            href: "/admin/AdminPanel",      Icon: Home,         roles: ["admin", "employee"] },
  { label: "Odbierz zamówienie",   href: "/admin/pickup-order",    Icon: ShoppingCart, roles: ["admin", "employee"] },
  { label: "Bieżące zamówienia",   href: "/admin/current-orders",  Icon: Clock,        roles: ["admin", "employee"] },
  { label: "Historia",             href: "/admin/history",         Icon: List,         roles: ["admin", "employee"] },
  { label: "Rezerwacje",           href: "/admin/reservations",    Icon: Calendar,     roles: ["admin", "employee"] },
  { label: "Menu",                 href: "/admin/menu",            Icon: Utensils,     roles: ["admin", "employee"] },
  { label: "Zestaw Miesiąca",      href: "/admin/burger-miesiaca", Icon: Star,         roles: ["admin"] },
  { label: "Ustawienia",           href: "/admin/settings",        Icon: Settings,     roles: ["admin"] },
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

export default function Sidebar() {
  const supabase = createClientComponentClient<Database>();
  const pathname = usePathname() || "";
  const params = useSearchParams();
  const router = useRouter();

  const [role, setRole] = useState<Role>("employee");
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved =
        typeof window !== "undefined"
          ? localStorage.getItem(STORAGE_KEY)
          : null;
      if (saved != null) return saved === "true";
      if (typeof window !== "undefined")
        return window.matchMedia(MOBILE_QUERY).matches;
    } catch {}
    return true;
  });

  // źródło prawdy dla sluga
  const [slug, setSlug] = useState<string | null>(() => {
    const urlSlug = params?.get("restaurant")?.toLowerCase() || null;
    return urlSlug || getCookie("restaurant_slug");
  });

  // rola
  useEffect(() => {
    let live = true;

    type RestaurantAdminRoleRow = { role?: string | null };

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
        // opcjonalnie log
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
      localStorage.setItem(STORAGE_KEY, collapsed ? "true" : "false");
    } catch {}
  }, [collapsed]);

  // upewnij cookie + dolep slug do bieżącego URL jeśli go brak
  useEffect(() => {
    const ensure = async () => {
      const urlSlug = params?.get("restaurant")?.toLowerCase() || null;
      const cookieSlug = getCookie("restaurant_slug");
      const finalSlug = urlSlug || slug || cookieSlug || null;

      try {
        const q = finalSlug
          ? `?restaurant=${encodeURIComponent(finalSlug)}`
          : "";
        const r = await fetch(`/api/restaurants/ensure-cookie${q}`, {
          cache: "no-store",
          credentials: "include",
        });
        const j = await r.json().catch(() => ({}));
        const s = j?.restaurant_slug || finalSlug || null;
        if (s && !urlSlug) {
          // dopnij slug do aktualnej ścieżki
          const href = `${pathname}?restaurant=${encodeURIComponent(s)}`;
          router.replace(href as any);
        }
        if (s && s !== slug) setSlug(s);
      } catch {}
    };
    void ensure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]); // wywołuj przy zmianie podstrony

  // Zwracamy UrlObject zamiast stringa, żeby Link był zadowolony
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
        "sticky top-0 z-30 h-[100dvh] bg-black text-white border-r border-gray-900 flex-none",
        "transition-[width] duration-200 will-change-[width]",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-800">
        {!collapsed && (
          <div className="text-base font-semibold">Panel Admina</div>
        )}
        <button
          aria-label={collapsed ? "Rozwiń panel boczny" : "Zwiń panel boczny"}
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 rounded hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-500/30"
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
                      "hover:bg-gray-900",
                      isActive && "bg-gray-900"
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
            "hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-500/30",
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
