// src/components/Footer.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  ShoppingCart,
  Phone,
  Facebook,
  Instagram,
  Mail,
  ShieldCheck,
  FileText,
  MapPin,
} from "lucide-react";

const TERMS_VERSION = process.env.NEXT_PUBLIC_TERMS_VERSION || "2025-09-15";

type R = {
  slug: string;
  city: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  maps_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
};

export default function Footer() {
  const params = useParams<{ city?: string }>();
  const pathname = usePathname();
  const city = params?.city ?? null;
  const [r, setR] = useState<R | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const hideFooter = pathname?.startsWith("/admin");

  // Wykryj mobile - na mobile footer jest ukryty gdy korzystamy z MobileAppShell
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function load() {
      if (hideFooter) {
        setR(null);
        return;
      }

      if (!city) {
        setR(null);
        return;
      }

      const res = await fetch(`/api/restaurants/${city}`, { cache: "no-store" });
      const json = await res.json();
      if (!ignore && !json?.error) setR(json);
    }

    load();

    return () => {
      ignore = true;
    };
  }, [city, hideFooter]);


  const phone = r?.phone ?? "+48 000 000 000";
  const email = r?.email ?? "kontakt@sushitutaj.pl";
  const address = r?.address ?? "—";
  const maps = r?.maps_url ?? "#";
  const fb = r?.facebook_url ?? "#";
  const ig = r?.instagram_url ?? "#";
  const tt = r?.tiktok_url ?? "#";

  // używamy UrlObject zamiast stringów, żeby dogodzić typed routes
  const baseToHome = city ? { pathname: `/${city}` } : { pathname: "/" };
  const baseToMenu = city
    ? { pathname: `/${city}`, hash: "menu" }
    : { pathname: "/", hash: "menu" };
  const baseToContact = city
    ? { pathname: `/${city}`, hash: "kontakt" }
    : { pathname: "/", hash: "kontakt" };

  const openCookieSettings = () => {
    try {
      localStorage.removeItem("cookie_consent_v1");
    } catch {}
    if (typeof window !== "undefined") window.location.reload();
  };

  // Na mobile footer jest ukryty (MobileAppShell ma własną nawigację)
  if (hideFooter || isMobile) return null;

  return (
    <footer className="text-white py-12">
      <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8 text-center md:text-left">
        {/* 1. Nawigacja */}
        <nav className="flex flex-col items-center md:items-start">
          <h4 className="font-bold text-lg mb-4">Nawigacja</h4>
          <ul className="space-y-2">
            <li>
              <Link
                href={baseToHome}
                className="hover:text-[var(--accent-red)]"
              >
                Strona główna
              </Link>
            </li>
            <li>
              <Link
                href={baseToMenu}
                className="hover:text-[var(--accent-red)]"
              >
                Menu
              </Link>
            </li>
            <li>
              <Link
                href={baseToContact}
                className="hover:text-[var(--accent-red)]"
              >
                Kontakt
              </Link>
            </li>
            <li>
              <Link
                href="/regulamin"
                className="hover:text-[var(--accent-red)]"
              >
                Regulamin
              </Link>
            </li>
          </ul>
        </nav>

        {/* 2. Kontakt / Dane – per miasto */}
        <div className="flex flex-col items-center md:items-start">
          <h4 className="font-bold text-lg mb-4">
            Kontakt {r?.city ? `— ${r.city}` : ""}
          </h4>
          <ul className="space-y-2">
            <li className="flex items-center justify-center md:justify-start">
              <Mail className="w-5 h-5 mr-2" aria-hidden="true" />
              <a
                href={`mailto:${email}`}
                className="hover:text-[var(--accent-red)]"
              >
                {email}
              </a>
            </li>
            <li className="flex items-center justify-center md:justify-start">
              <Phone className="w-5 h-5 mr-2" aria-hidden="true" />
              <a
                href={`tel:${phone.replace(/\s+/g, "")}`}
                className="hover:text-[var(--accent-red)]"
              >
                {phone}
              </a>
            </li>
            <li className="flex items-start justify-center md:justify-start">
              <MapPin className="w-5 h-5 mr-2 mt-0.5" aria-hidden="true" />
              {maps !== "#" ? (
                <a
                  href={maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--accent-red)]"
                >
                  {address}
                </a>
              ) : (
                <span>{address}</span>
              )}
            </li>
          </ul>
        </div>

        {/* 3. Menu / Telefon + Social */}
        <div className="flex flex-col items-center md:items-start">
          <h4 className="font-bold text-lg mb-4">Szybkie akcje</h4>
          <div className="flex items-center justify-center md:justify-start gap-4 mb-6">
            <Link
              href={baseToMenu}
              aria-label="Przejdź do menu"
              className="group inline-flex items-center justify-center w-11 h-11 rounded-full
                         bg-gradient-to-r from-[var(--accent-red-dark)] via-[var(--accent-red)]
                         to-[var(--accent-red-dark-2)] hover:opacity-95 transition"
            >
              <ShoppingCart className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
            </Link>
            <a
              href={`tel:${phone.replace(/\s+/g, "")}`}
              aria-label="Zadzwoń"
              className="group inline-flex items-center justify-center w-11 h-11 rounded-full
                         bg-gradient-to-r from-[var(--accent-red-dark)] via-[var(--accent-red)]
                         to-[var(--accent-red-dark-2)] hover:opacity-95 transition"
            >
              <Phone className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
            </a>
          </div>

          <h4 className="font-bold text-lg mb-4">Znajdź nas</h4>
          <div className="flex items-center justify-center md:justify-start gap-3">
            <a
              href={fb}
              target={fb !== "#" ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="w-9 h-9 flex items-center justify-center rounded-full border border-white/20 hover:bg-white/10 transition"
              aria-label="Facebook"
            >
              <Facebook className="w-4 h-4" />
            </a>
            <a
              href={ig}
              target={ig !== "#" ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="w-9 h-9 flex items-center justify-center rounded-full border border-white/20 hover:bg-white/10 transition"
              aria-label="Instagram"
            >
              <Instagram className="w-4 h-4" />
            </a>
            {tt !== "#" && (
              <a
                href={tt}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 flex items-center justify-center rounded-full border border-white/20 hover:bg-white/10 transition"
                aria-label="TikTok"
              >
                <svg viewBox="0 0 48 48" className="w-4 h-4 fill-current">
                  <path d="M33 10.5a9 9 0 0 0 6 2v6.2a14.2 14.2 0 0 1-6-1.6V29A9.7 9.7 0 1 1 23.3 19V25.3a3.7 3.7 0 1 0 3.7 3.7V6h6v4.5z" />
                </svg>
              </a>
            )}
          </div>
        </div>

        {/* 4. Prawne / Cookies */}
        <div className="flex flex-col items-center md:items-start">
          <h4 className="font-bold text-lg mb-4">Informacje</h4>
          <ul className="space-y-2">
            <li className="flex items-center justify-center md:justify-start">
              <FileText className="w-5 h-5 mr-2" aria-hidden="true" />
              <Link
                href="/regulamin"
                className="hover:text-[var(--accent-red)]"
              >
                Regulamin (v{TERMS_VERSION})
              </Link>
            </li>
            <li className="flex items-center justify-center md:justify-start">
              <ShieldCheck className="w-5 h-5 mr-2" aria-hidden="true" />
              <Link
                href="/polityka-prywatnosci"
                className="hover:text-[var(--accent-red)]"
              >
                Polityka prywatności
              </Link>
            </li>
            <li className="flex items-center justify-center md:justify-start">
              <ShieldCheck className="w-5 h-5 mr-2" aria-hidden="true" />
              <Link
                href="/cookies"
                className="hover:text-[var(--accent-red)]"
              >
                Polityka cookies
              </Link>
            </li>
            <li className="flex items-center justify-center md:justify-start">
              <button
                type="button"
                onClick={openCookieSettings}
                className="underline hover:text-[var(--accent-red)]"
                aria-label="Ustawienia cookies"
              >
                Ustawienia cookies
              </button>
            </li>

            {/* NOWE: przycisk Panel administratora */}
            <li className="flex items-center justify-center md:justify-start pt-2">
              <Link
                href="/admin"
                className="inline-flex items-center px-3 py-1.5 rounded-full border border-white/30 text-xs uppercase tracking-wide hover:bg-white/10 transition"
                aria-label="Panel administratora"
              >
                Panel administratora
              </Link>
            </li>
          </ul>

          <p className="text-xs text-gray-400 mt-4">
            Płatność gotówką przy odbiorze lub dostawie.
          </p>
        </div>
      </div>

      <div className="mt-12 border-t border-white/10 pt-6 text-center text-sm text-white/60">
        © {new Date().getFullYear()} SUSHI Tutaj. Wszystkie prawa zastrzeżone.
      </div>
    </footer>
  );
}
