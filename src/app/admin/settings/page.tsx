"use client";

import { Tab } from "@headlessui/react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  MapPinned,
  ShieldBan,
  BadgePercent,
  Clock4,
  Info,
  Megaphone, // Nowa ikona dla Pop-up
} from "lucide-react";

import TableLayoutForm from "@/components/admin/settings/TableLayoutForm";
import DeliveryZonesForm from "@/components/admin/settings/DeliveryZonesForm";
import BlockedAddressesForm from "@/components/admin/settings/BlockedAddressesForm";
import DiscountCodesForm from "@/components/admin/settings/DiscountCodesForm";
import BlockedTimesForm from "@/components/admin/settings/BlockedTimesForm";
import NoticeBarForm from "@/components/admin/settings/NoticeBarForm";
import PopupSettingsForm from "@/components/admin/settings/PopupSettingsForm"; // <--- NOWY IMPORT

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

type EnsureCookieResp = {
  restaurant_slug?: string | null;
  restaurant_id?: string | null;
};

const ACCENT = "#de1d13";

const tabs = [
  {
    key: "tables",
    short: "Stoły",
    long: "Rezerwacje & Stoły",
    Icon: CalendarDays,
    render: () => <TableLayoutForm />,
  },
  {
    key: "zones",
    short: "Strefy",
    long: "Strefy dostawy",
    Icon: MapPinned,
    render: () => <DeliveryZonesForm />,
  },
  {
    key: "blocked",
    short: "Adresy",
    long: "Blokowane adresy",
    Icon: ShieldBan,
    render: () => <BlockedAddressesForm />,
  },
  {
    key: "discounts",
    short: "Promki",
    long: "Promocje & rabaty",
    Icon: BadgePercent,
    render: () => <DiscountCodesForm />,
  },
  {
    key: "times",
    short: "Godziny",
    long: "Blokady godzin",
    Icon: Clock4,
    render: (restaurantSlug: string | null, restaurantId: string | null) => (
      <BlockedTimesForm restaurantSlug={restaurantSlug} />
    ),
  },
  {
    key: "notice",
    short: "Pasek",
    long: "Pasek informacji",
    Icon: Info,
    render: (restaurantSlug: string | null, restaurantId: string | null) => (
      <NoticeBarForm restaurantSlug={restaurantSlug} />
    ),
  },
  {
    key: "popup", // <--- NOWA ZAKŁADKA
    short: "Pop-up",
    long: "Pop-up (Promocja)",
    Icon: Megaphone,
    // Tutaj potrzebujemy ID restauracji, nie tylko slug
    render: (restaurantSlug: string | null, restaurantId: string | null) =>
      restaurantId ? (
        <PopupSettingsForm restaurantId={restaurantId} />
      ) : (
        <div className="p-4 text-sm text-amber-800 bg-amber-50 rounded-xl border border-amber-200">
          Nie udało się pobrać ID restauracji. Odśwież stronę.
        </div>
      ),
  },
] as const;

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const qs = searchParams?.toString() ?? "";
  const pathname = usePathname() || "";
  const router = useRouter();

  const initialSlug = useMemo(() => {
    const v = (searchParams.get("restaurant") || "").toLowerCase().trim();
    return v || null;
  }, [searchParams]);

  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(initialSlug);
  // Dodajemy stan dla ID restauracji, bo jest potrzebny do PopupSettingsForm
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  // Self-heal: jeśli ktoś wejdzie bez ?restaurant=... lub cookie się rozjedzie
  useEffect(() => {
    let alive = true;

    const ensure = async () => {
      try {
        const seed = initialSlug || null;
        const res = await fetch(
          `/api/restaurants/ensure-cookie${
            seed ? `?restaurant=${encodeURIComponent(seed)}` : ""
          }`,
          { method: "GET", credentials: "include", cache: "no-store" }
        );

        if (!res.ok) return;

        const json = (await res.json()) as EnsureCookieResp;
        
        if (!alive) return;

        const srvSlug = json.restaurant_slug?.toLowerCase() ?? null;
        const srvId = json.restaurant_id ?? null; // Zakładam, że API zwraca też ID

        if (srvSlug && srvSlug !== restaurantSlug) setRestaurantSlug(srvSlug);
        if (srvId && srvId !== restaurantId) setRestaurantId(srvId);

        // dopnij/poprzez URL
        if (srvSlug) {
          const sp = new URLSearchParams(qs);
          if (sp.get("restaurant") !== srvSlug) {
            sp.set("restaurant", srvSlug);
            router.replace(`${pathname}?${sp.toString()}` as any, { scroll: false });
          }
        }
      } catch {
        // ignore
      }
    };

    void ensure();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs, pathname, initialSlug]);

  const tabBtnBase =
    "group w-full rounded-xl px-3 py-2.5 outline-none transition flex items-center gap-2 justify-center sm:justify-start";
  const tabBtnSelected = cn(
    "bg-white shadow-sm ring-1 ring-black/5",
    "text-slate-900"
  );
  const tabBtnUnselected = cn(
    "text-slate-600 hover:text-slate-900 hover:bg-white/60",
    "focus-visible:ring-2 focus-visible:ring-offset-2"
  );

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        {/* HEADER */}
        <div className="mb-5 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Ustawienia panelu
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Konfiguracja dla aktualnie wybranego lokalu.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 shadow-sm">
              <span className="text-slate-500">Lokal:</span>{" "}
              <span className="font-medium text-slate-900">
                {restaurantSlug ?? "—"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!restaurantSlug) return;
                try {
                  navigator.clipboard?.writeText(restaurantSlug);
                } catch {}
              }}
              className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 shadow-sm hover:bg-slate-50"
              title="Skopiuj slug lokalu"
            >
              Kopiuj
            </button>
          </div>
        </div>

        {/* SHELL */}
        <div className="rounded-2xl border border-slate-200 bg-white/70 shadow-sm backdrop-blur">
          <Tab.Group>
            {/* TAB BAR */}
            <Tab.List className="border-b border-slate-200 p-2">
              <div className="flex gap-2 overflow-x-auto whitespace-nowrap sm:overflow-visible sm:whitespace-normal no-scrollbar">
                {tabs.map(({ key, short, long, Icon }) => (
                  <Tab
                    key={key}
                    className={({ selected }) =>
                      cn(
                        tabBtnBase,
                        "shrink-0 sm:flex-1",
                        selected ? tabBtnSelected : tabBtnUnselected
                      )
                    }
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        "transition",
                        "text-slate-700 group-hover:text-slate-900"
                      )}
                    />
                    <span className="sm:hidden">{short}</span>
                    <span className="hidden sm:inline">{long}</span>
                    <span
                      className={cn(
                        "ml-auto hidden sm:block h-2 w-2 rounded-full",
                        "opacity-0 group-data-[headlessui-state=selected]:opacity-100"
                      )}
                      style={{ backgroundColor: ACCENT }}
                    />
                  </Tab>
                ))}
              </div>
            </Tab.List>

            {/* CONTENT */}
            <Tab.Panels className="p-3 sm:p-5">
              {tabs.map((t) => (
                <Tab.Panel key={t.key} className="focus:outline-none">
                  {/* panel header */}
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base sm:text-lg font-semibold">
                        {t.long}
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Ustawienia zapisują się dla wybranego lokalu.
                      </p>
                    </div>

                    <div
                      className="hidden sm:block rounded-full px-3 py-1 text-xs font-medium ring-1 ring-slate-200 bg-white"
                      style={{ color: ACCENT }}
                    >
                      Panel
                    </div>
                  </div>

                  {/* card */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                    {/* Przekazujemy slug i ID do funkcji renderującej */}
                    {t.render(restaurantSlug, restaurantId)}
                  </div>

                  {!restaurantSlug && (t.key === "times" || t.key === "notice" || t.key === "popup") && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Brak sluga lokalu w URL. Odśwież stronę lub przejdź do panelu
                      z wybranego lokalu (parametr <b>?restaurant=...</b>).
                    </div>
                  )}
                </Tab.Panel>
              ))}
            </Tab.Panels>
          </Tab.Group>
        </div>
      </div>
    </div>
  );
}