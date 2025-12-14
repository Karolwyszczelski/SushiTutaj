// src/app/admin/settings/page.tsx
"use client";

import { Tab } from "@headlessui/react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import TableLayoutForm from "@/components/admin/settings/TableLayoutForm";
import DeliveryZonesForm from "@/components/admin/settings/DeliveryZonesForm";
import BlockedAddressesForm from "@/components/admin/settings/BlockedAddressesForm";
import DiscountCodesForm from "@/components/admin/settings/DiscountCodesForm";
import BlockedTimesForm from "@/components/admin/settings/BlockedTimesForm";
import NoticeBarForm from "@/components/admin/settings/NoticeBarForm";

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

const tabBase =
  "rounded-lg px-3 py-2 text-center font-medium outline-none transition";
const tabSelected = "bg-white text-slate-900 shadow-sm";
const tabUnselected = "text-slate-600 hover:text-slate-900";

type EnsureCookieResp = {
  restaurant_slug?: string | null;
  restaurant_id?: string | null;
};

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const qs = searchParams?.toString() ?? "";
  const pathname = usePathname() || "";
  const router = useRouter();

  const initialSlug = useMemo(() => {
    const v = (searchParams.get("restaurant") || "").toLowerCase().trim();
    return v || null;
  }, [qs, searchParams]);

  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(initialSlug);

  // Self-heal: jeśli ktoś wejdzie w /admin/settings bez ?restaurant=...
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
        const srvSlug = json.restaurant_slug?.toLowerCase() ?? null;

        if (!alive) return;

        if (srvSlug && srvSlug !== restaurantSlug) {
          setRestaurantSlug(srvSlug);
        }

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

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 text-slate-900">
      {/* nagłówek */}
      <div className="mb-5 sm:mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Ustawienia panelu</h1>
        <p className="mt-1 text-sm text-slate-600">
          Konfiguracja dla aktualnie wybranego lokalu.
        </p>
      </div>

      <Tab.Group>
        {/* Jedna lista Tabów (responsywna) */}
        <Tab.List className="rounded-xl bg-slate-100 p-1 text-sm">
          <div className="flex gap-2 overflow-x-auto whitespace-nowrap sm:overflow-visible sm:whitespace-normal">
            <Tab
              className={({ selected }) =>
                classNames(
                  tabBase,
                  "shrink-0 px-4 sm:flex-1 sm:px-3",
                  selected ? tabSelected : tabUnselected
                )
              }
            >
              <span className="sm:hidden">Stoły</span>
              <span className="hidden sm:inline">Rezerwacje &amp; Stoły</span>
            </Tab>

            <Tab
              className={({ selected }) =>
                classNames(
                  tabBase,
                  "shrink-0 px-4 sm:flex-1 sm:px-3",
                  selected ? tabSelected : tabUnselected
                )
              }
            >
              <span className="sm:hidden">Strefy</span>
              <span className="hidden sm:inline">Strefy dostawy</span>
            </Tab>

            <Tab
              className={({ selected }) =>
                classNames(
                  tabBase,
                  "shrink-0 px-4 sm:flex-1 sm:px-3",
                  selected ? tabSelected : tabUnselected
                )
              }
            >
              <span className="sm:hidden">Adresy</span>
              <span className="hidden sm:inline">Blokowane adresy</span>
            </Tab>

            <Tab
              className={({ selected }) =>
                classNames(
                  tabBase,
                  "shrink-0 px-4 sm:flex-1 sm:px-3",
                  selected ? tabSelected : tabUnselected
                )
              }
            >
              <span className="sm:hidden">Promki</span>
              <span className="hidden sm:inline">Promocje &amp; rabaty</span>
            </Tab>

            <Tab
              className={({ selected }) =>
                classNames(
                  tabBase,
                  "shrink-0 px-4 sm:flex-1 sm:px-3",
                  selected ? tabSelected : tabUnselected
                )
              }
            >
              <span className="sm:hidden">Godziny</span>
              <span className="hidden sm:inline">Blokady godzin</span>
            </Tab>

            <Tab
              className={({ selected }) =>
                classNames(
                  tabBase,
                  "shrink-0 px-4 sm:flex-1 sm:px-3",
                  selected ? tabSelected : tabUnselected
                )
              }
            >
              <span className="sm:hidden">Pasek</span>
              <span className="hidden sm:inline">Pasek informacji</span>
            </Tab>
          </div>
        </Tab.List>

        <Tab.Panels className="mt-4">
          <Tab.Panel className="focus:outline-none">
            <div className="rounded-2xl border bg-white p-4 sm:p-5 shadow-sm">
              <TableLayoutForm />
            </div>
          </Tab.Panel>

          <Tab.Panel className="focus:outline-none">
            <div className="rounded-2xl border bg-white p-4 sm:p-5 shadow-sm">
              <DeliveryZonesForm />
            </div>
          </Tab.Panel>

          <Tab.Panel className="focus:outline-none">
            <div className="rounded-2xl border bg-white p-4 sm:p-5 shadow-sm">
              <BlockedAddressesForm />
            </div>
          </Tab.Panel>

          <Tab.Panel className="focus:outline-none">
            <div className="rounded-2xl border bg-white p-4 sm:p-5 shadow-sm">
              <DiscountCodesForm />
            </div>
          </Tab.Panel>

          <Tab.Panel className="focus:outline-none">
            <div className="rounded-2xl border bg-white p-4 sm:p-5 shadow-sm">
              <BlockedTimesForm restaurantSlug={restaurantSlug} />
            </div>
          </Tab.Panel>

          <Tab.Panel className="focus:outline-none">
            <div className="rounded-2xl border bg-white p-4 sm:p-5 shadow-sm">
              <NoticeBarForm restaurantSlug={restaurantSlug} />
            </div>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
