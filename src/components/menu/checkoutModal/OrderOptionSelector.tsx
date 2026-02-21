"use client";

import React from "react";
import { ShoppingBag, Truck } from "lucide-react";
import clsx from "clsx";

export type OrderOption = "delivery" | "takeaway";

interface OrderOptionSelectorProps {
  selectedOption: OrderOption | null;
  onSelect: (option: OrderOption) => void;
  deliveryEnabled: boolean;
  takeawayEnabled: boolean;
  onDisabledClick?: (option: OrderOption, hint: string) => void;
}

const OPTIONS: {
  key: OrderOption;
  label: string;
  Icon: typeof ShoppingBag | typeof Truck;
}[] = [
  { key: "takeaway", label: "Na wynos", Icon: ShoppingBag },
  { key: "delivery", label: "Dostawa", Icon: Truck },
];

export function OrderOptionSelector({
  selectedOption,
  onSelect,
  deliveryEnabled,
  takeawayEnabled,
  onDisabledClick,
}: OrderOptionSelectorProps) {
  const isDisabled = (key: OrderOption) =>
    (key === "delivery" && !deliveryEnabled) ||
    (key === "takeaway" && !takeawayEnabled);

  const getHint = (key: OrderOption) => {
    if (key === "delivery" && !deliveryEnabled) return "Dostawa wyłączona";
    if (key === "takeaway" && !takeawayEnabled) return "Wynos wyłączony";
    return "";
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {OPTIONS.map(({ key, label, Icon }) => {
        const disabled = isDisabled(key);
        const hint = getHint(key);

        return (
          <button
            key={key}
            disabled={disabled}
            onClick={() => {
              if (disabled) {
                onDisabledClick?.(key, hint);
                return;
              }
              onSelect(key);
            }}
            className={clsx(
              "flex flex-col items-center justify-center border px-3 py-4 transition rounded-xl",
              selectedOption === key
                ? "bg-yellow-400 text-black border-yellow-500"
                : "bg-white/5 lg:bg-gray-50 text-white lg:text-black border-white/20 lg:border-black/10 hover:bg-white/10 lg:hover:bg-gray-100",
              disabled && "opacity-50 cursor-not-allowed hover:bg-white/5 lg:hover:bg-gray-50"
            )}
            title={disabled ? hint : undefined}
          >
            <Icon size={22} />
            <span className="mt-1 text-sm font-medium">{label}</span>
            {disabled && hint ? (
              <span className="mt-1 text-[10px] text-white/60 lg:text-black/60">{hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
