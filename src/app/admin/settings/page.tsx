// src/app/admin/settings/page.tsx
"use client";

import { Tab } from "@headlessui/react";
import { useSearchParams } from "next/navigation";
import TableLayoutForm from "@/components/admin/settings/TableLayoutForm";
import DeliveryZonesForm from "@/components/admin/settings/DeliveryZonesForm";
import BlockedAddressesForm from "@/components/admin/settings/BlockedAddressesForm";
import DiscountCodesForm from "@/components/admin/settings/DiscountCodesForm";
import BlockedTimesForm from "@/components/admin/settings/BlockedTimesForm";
import AddonOptionsForm from "@/components/admin/settings/AddonOptionsForm";

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

const tabBase =
  "rounded-lg px-3 py-2 text-center font-medium outline-none transition";
const tabSelected = "bg-white text-slate-900 shadow-sm";
const tabUnselected = "text-slate-600 hover:text-slate-900";

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const restaurantSlug =
    (searchParams.get("restaurant") || "").toLowerCase() || null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 text-slate-900">
      {/* nagłówek */}
      <div className="mb-5 sm:mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Ustawienia panelu
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Konfiguracja dla aktualnie wybranego lokalu.
        </p>
      </div>

      <Tab.Group>
        {/* MOBILE: przewijane zakładki */}
        <Tab.List className="sm:hidden -mx-4 px-4">
          <div className="flex gap-2 rounded-xl bg-slate-100 p-1 text-sm overflow-x-auto whitespace-nowrap">
            <Tab
              className={({ selected }) =>
                classNames(
                  tabBase,
                  "shrink-0 px-4",
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
                  "shrink-0 px-4",
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
                  "shrink-0 px-4",
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
                  "shrink-0 px-4",
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
                  "shrink-0 px-4",
                  selected ? tabSelected : tabUnselected
                )
              }
            >
              <span className="sm:hidden">Godziny</span>
              <span className="hidden sm:inline">Blokady godzin</span>
            </Tab>
          </div>
        </Tab.List>

        {/* DESKTOP: równe zakładki jak było */}
        <Tab.List className="hidden sm:flex gap-2 rounded-xl bg-slate-100 p-1 text-sm">
          <Tab
            className={({ selected }) =>
              classNames(
                tabBase,
                "flex-1",
                selected ? tabSelected : tabUnselected
              )
            }
          >
            Rezerwacje &amp; Stoły
          </Tab>

          <Tab
            className={({ selected }) =>
              classNames(
                tabBase,
                "flex-1",
                selected ? tabSelected : tabUnselected
              )
            }
          >
            Strefy dostawy
          </Tab>

          <Tab
            className={({ selected }) =>
              classNames(
                tabBase,
                "flex-1",
                selected ? tabSelected : tabUnselected
              )
            }
          >
            Blokowane adresy
          </Tab>

          <Tab
            className={({ selected }) =>
              classNames(
                tabBase,
                "flex-1",
                selected ? tabSelected : tabUnselected
              )
            }
          >
            Promocje &amp; rabaty
          </Tab>

          <Tab
            className={({ selected }) =>
              classNames(
                tabBase,
                "flex-1",
                selected ? tabSelected : tabUnselected
              )
            }
          >
            Blokady godzin
          </Tab>
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
              <AddonOptionsForm restaurantSlug={restaurantSlug} />
            </div>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
