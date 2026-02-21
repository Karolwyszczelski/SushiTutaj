// src/components/Header.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { UrlObject } from "url";
import type { Route } from "next";
import { useMobileNavStore } from "@/store/mobileNavStore";

const CITIES = [
  { slug: "ciechanow", label: "Ciechanów" },
  { slug: "przasnysz", label: "Przasnysz" },
  { slug: "szczytno", label: "Szczytno" },
];

const SPECIAL = new Set(["admin", "api", "intra"]);

const ACCENT_BTN =
  "bg-gradient-to-b from-[#b31217] to-[#7a0b0b] text-white shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] ring-1 ring-black/30 hover:brightness-105 active:brightness-95";

function getCityFromPath(path: string) {
  const seg = path.split("/").filter(Boolean);
  const s0 = seg[0] || "";
  return CITIES.find((c) => c.slug === s0) ? s0 : "";
}

function replaceCity(path: string, next: string) {
  const seg = path.split("/").filter(Boolean);
  if (
    seg.length === 0 ||
    SPECIAL.has(seg[0]) ||
    !CITIES.find((c) => c.slug === seg[0])
  ) {
    return `/${next}`;
  }
  seg[0] = next;
  return "/" + seg.join("/");
}

// helper: ścieżka jako string (do porównań aktywności)
function mkPath(city: string, p?: string) {
  if (p) {
    return city ? `/${city}/${p}` : `/${p}`;
  }
  return city ? `/${city}` : "/";
}

// helper: obiekt UrlObject dla Link (żeby zadowolić typed routes)
function mkHref(city: string, p?: string): UrlObject {
  return { pathname: mkPath(city, p) };
}

// specjalny href dla linku „MENU” – sekcja #menu na stronie miasta / głównej
function mkMenuHref(city: string): UrlObject {
  return {
    pathname: mkPath(city), // "/" albo "/szczytno"
    hash: "menu", // da "#menu"
  };
}

export default function Header() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  const city = getCityFromPath(pathname);
  const cityLabel = useMemo(
    () => CITIES.find((c) => c.slug === city)?.label ?? "Wybierz miasto",
    [city]
  );

  const [open, setOpen] = useState(false);
  const [citiesOpen, setCitiesOpen] = useState(false);

  const ddRefDesktop = useRef<HTMLDivElement | null>(null);
  const ddRefMobile = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!citiesOpen) return;
      const t = e.target as Node;
      const inDesk = ddRefDesktop.current?.contains(t);
      const inMob = ddRefMobile.current?.contains(t);
      if (!inDesk && !inMob) setCitiesOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCitiesOpen(false);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [citiesOpen]);

  const links = [
    { label: "MENU", path: "menu" },
    { label: "KONTAKT", path: "kontakt" },
    { label: "REGULAMIN", path: "regulamin" },
    { label: "PRYWATNOŚĆ", path: "polityka-prywatnosci" },
  ] as const;

  const isActive = (p?: string) => {
    // MENU: aktywne na /menu oraz na /{city}
    if (p === "menu") {
      const rootCity = mkPath(city);
      const rootMenu = mkPath("", "menu");
      return pathname === rootMenu || pathname === rootCity;
    }
    const path = mkPath(city, p);
    return pathname === path || pathname.startsWith(path + "/");
  };

  return (
    <header className="fixed inset-x-0 top-4 z-50">
      <div className="mx-auto max-w-7xl px-4 md:px-20">
        {/* mobile: 3 kolumny kompakt, desktop: 3 kolumny */}
        <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[1fr_auto_1fr] items-center h-14 md:h-16">
          {/* left: logo */}
          <div className="flex items-center">
            <Link
              href={mkHref(city)}
              aria-label="Strona główna"
              className="flex items-center gap-2"
            >
              <Image
                src="/assets/logo.png"
                alt="Logo"
                width={44}
                height={44}
                className="md:hidden"
                priority
              />
              <Image
                src="/assets/logo.png"
                alt="Logo"
                width={60}
                height={60}
                className="hidden md:block"
                priority
              />
            </Link>
          </div>

          {/* center: desktop nav */}
          <nav className="hidden md:flex items-center justify-center gap-8 text-sm">
            {links.map((l) => {
              const hrefObj =
                l.path === "menu"
                  ? mkMenuHref(city)
                  : mkHref(city, l.path);
              const active = isActive(l.path);
              return (
                <Link
                  key={l.path}
                  href={hrefObj}
                  className={clsx(
                    "relative tracking-wide hover:opacity-90 text-white/80",
                    active &&
                      "after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-full after:bg-gradient-to-r after:from-[#b31217] after:to-[#7a0b0b]"
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          {/* center (MOBILE): selektor miasta */}
          <div
            className="md:hidden flex items-center justify-center"
            ref={ddRefMobile}
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => setCitiesOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={citiesOpen}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${ACCENT_BTN}`}
              >
                <span>{cityLabel}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>

              {citiesOpen && (
                <ul
                  role="listbox"
                  className="absolute left-1/2 -translate-x-1/2 mt-2 min-w-44 rounded-xl border border-black/30 bg-[#0b0b0b] shadow-[0_10px_22px_rgba(0,0,0,.40)] z-50"
                >
                  {CITIES.map((c) => (
                    <li key={c.slug}>
                      <button
                        role="option"
                        aria-selected={city === c.slug}
                        onClick={() => {
                          setCitiesOpen(false);
                          router.push(
                            replaceCity(pathname, c.slug) as Route
                          );
                        }}
                        className={clsx(
                          "w-full text-left px-4 py-2 text-sm hover:bg:white/10 text-white/80",
                          city === c.slug && "bg-white/10 text-white/80"
                        )}
                      >
                        {c.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* right: city switcher (desktop) */}
          <div className="hidden md:flex justify-end" ref={ddRefDesktop}>
            <div className="relative">
              <button
                type="button"
                onClick={() => setCitiesOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={citiesOpen}
                className={`inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold ${ACCENT_BTN}`}
              >
                <span>{cityLabel}</span>
                <ChevronDown className="h-4 w-4" />
              </button>

              {citiesOpen && (
                <ul
                  role="listbox"
                  className="absolute right-0 mt-2 min-w-48 rounded-xl border border-black/30 bg-[#0b0b0b] shadow-[0_10px_22px_rgba(0,0,0,.40) text-white"
                >
                  {CITIES.map((c) => (
                    <li key={c.slug}>
                      <button
                        role="option"
                        aria-selected={city === c.slug}
                        onClick={() => {
                          setCitiesOpen(false);
                          router.push(
                            replaceCity(pathname, c.slug) as Route
                          );
                        }}
                        className={clsx(
                          "w-full text-center px-4 py-2 text-sm text:white/80 hover:bg-white/10",
                          city === c.slug && "bg-white/10 text-white/80"
                        )}
                      >
                        {c.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* right (MOBILE): hamburger */}
          <div className="md:hidden justify-self-end">
            <button
              type="button"
              className="p-2.5 text-white"
              aria-label="Menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu className="h-7 w-7" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile FULLSCREEN modal */}
      <MobileMenu 
        open={open} 
        onClose={() => setOpen(false)} 
        city={city}
        links={links}
      />
    </header>
  );
}

/** Mobile fullscreen menu - używa globalnego store do nawigacji */
function MobileMenu({ 
  open, 
  onClose, 
  city,
  links 
}: { 
  open: boolean; 
  onClose: () => void;
  city: string;
  links: readonly { label: string; path: string }[];
}) {
  const setActiveTab = useMobileNavStore((s) => s.setActiveTab);
  const setReservationOpen = useMobileNavStore((s) => s.setReservationOpen);
  const setAccountOpen = useMobileNavStore((s) => s.setAccountOpen);
  const setCartOpen = useMobileNavStore((s) => s.setCartOpen);
  const router = useRouter();

  if (!open) return null;

  const handleNavClick = (path: string) => {
    onClose();
    
    // Mapowanie linków na zakładki mobile
    if (path === "menu") {
      setActiveTab("menu");
    } else if (path === "kontakt" || path === "regulamin" || path === "polityka-prywatnosci") {
      // Te strony otwieramy jako normalne linki (przeglądarkowa nawigacja)
      router.push(city ? `/${city}/${path}` : `/${path}`);
    }
  };

  return (
    <div
      className="md:hidden fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-[#0b0b0b] z-0" />
      <button
        type="button"
        aria-label="Zamknij menu"
        onClick={onClose}
        className="absolute top-5 right-5 h-12 w-12 rounded-full bg-gradient-to-b from-[#b31217] to-[#7a0b0b] text-white shadow-[0_10px_22px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.15)] ring-1 ring-black/30 z-20 flex items-center justify-center"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="relative z-10 h-full w-full flex flex-col items-center justify-center gap-8 px-8">
        <Image
          src="/assets/logo.png"
          alt="Logo"
          width={100}
          height={100}
          priority
        />

        <nav className="flex flex-col items-center gap-5 text-xl text-white/80">
          {/* Główne linki */}
          <button
            onClick={() => handleNavClick("menu")}
            className="tracking-wide hover:text-white transition-colors"
          >
            MENU
          </button>
          
          <button
            onClick={() => {
              onClose();
              setReservationOpen(true);
            }}
            className="tracking-wide hover:text-white transition-colors"
          >
            REZERWACJA
          </button>

          <button
            onClick={() => {
              onClose();
              setActiveTab("set");
            }}
            className="tracking-wide hover:text-white transition-colors"
          >
            ZESTAW MIESIĄCA
          </button>

          <button
            onClick={() => {
              onClose();
              setCartOpen(true);
            }}
            className="tracking-wide hover:text-white transition-colors"
          >
            KOSZYK
          </button>

          <button
            onClick={() => {
              onClose();
              setAccountOpen(true);
            }}
            className="tracking-wide hover:text-white transition-colors"
          >
            KONTO
          </button>
        </nav>

        {/* Dodatkowe linki */}
        <div className="flex flex-col items-center gap-3 text-sm text-white/50 mt-4">
          <button
            onClick={() => handleNavClick("kontakt")}
            className="hover:text-white/80 transition-colors"
          >
            Kontakt
          </button>
          <button
            onClick={() => handleNavClick("regulamin")}
            className="hover:text-white/80 transition-colors"
          >
            Regulamin
          </button>
          <button
            onClick={() => handleNavClick("polityka-prywatnosci")}
            className="hover:text-white/80 transition-colors"
          >
            Polityka prywatności
          </button>
        </div>
      </div>
    </div>
  );
}
