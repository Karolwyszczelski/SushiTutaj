// src/app/admin/settings/page.tsx
"use client";

import { Tab } from "@headlessui/react";
import TableLayoutForm from "@/components/admin/settings/TableLayoutForm";
import DeliveryZonesForm from "@/components/admin/settings/DeliveryZonesForm";
import BlockedAddressesForm from "@/components/admin/settings/BlockedAddressesForm";
import DiscountCodesForm from "@/components/admin/settings/DiscountCodesForm";

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      {/* nagłówek */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Ustawienia panelu
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Konfiguracja dla aktualnie wybranego lokalu.
        </p>
      </div>

      {/* zakładki */}
      <Tab.Group>
        <Tab.List className="flex gap-2 rounded-xl bg-slate-100 p-1 text-sm">
          <Tab
            className={({ selected }) =>
              classNames(
                "flex-1 rounded-lg px-3 py-2 text-center font-medium outline-none transition",
                selected
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )
            }
          >
            Rezerwacje &amp; Stoły
          </Tab>
          <Tab
            className={({ selected }) =>
              classNames(
                "flex-1 rounded-lg px-3 py-2 text-center font-medium outline-none transition",
                selected
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )
            }
          >
            Strefy dostawy
          </Tab>
          <Tab
            className={({ selected }) =>
              classNames(
                "flex-1 rounded-lg px-3 py-2 text-center font-medium outline-none transition",
                selected
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )
            }
          >
            Blokowane adresy
          </Tab>
          <Tab
            className={({ selected }) =>
              classNames(
                "flex-1 rounded-lg px-3 py-2 text-center font-medium outline-none transition",
                selected
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )
            }
          >
            Promocje &amp; rabaty
          </Tab>
        </Tab.List>

        <Tab.Panels className="mt-4">
          <Tab.Panel className="focus:outline-none">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <TableLayoutForm />
            </div>
          </Tab.Panel>

          <Tab.Panel className="focus:outline-none">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <DeliveryZonesForm />
            </div>
          </Tab.Panel>

          <Tab.Panel className="focus:outline-none">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <BlockedAddressesForm />
            </div>
          </Tab.Panel>

          <Tab.Panel className="focus:outline-none">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <DiscountCodesForm />
            </div>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
