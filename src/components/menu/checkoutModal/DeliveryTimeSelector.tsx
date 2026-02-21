"use client";

import React from "react";

type DeliveryTimeOption = "asap" | "schedule";

interface DeliveryTimeSelectorProps {
  selectedOption: "delivery" | "takeaway" | null;
  deliveryTimeOption: DeliveryTimeOption;
  onTimeOptionChange: (option: DeliveryTimeOption) => void;
  scheduledTime: string;
  onScheduledTimeChange: (time: string) => void;
  scheduleSlots: string[];
  canSchedule: boolean;
  restaurantCityLabel: string;
  openHoursLabel: string;
}

export function DeliveryTimeSelector({
  selectedOption,
  deliveryTimeOption,
  onTimeOptionChange,
  scheduledTime,
  onScheduledTimeChange,
  scheduleSlots,
  canSchedule,
  restaurantCityLabel,
  openHoursLabel,
}: DeliveryTimeSelectorProps) {
  if (!selectedOption) return null;

  const label = selectedOption === "delivery" ? "Czas dostawy" : "Czas odbioru";

  return (
    <div className="space-y-2">
      <h4 className="font-semibold">{label}</h4>
      <div className="flex flex-wrap gap-6 items-center">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="timeOption"
            value="asap"
            checked={deliveryTimeOption === "asap"}
            onChange={() => onTimeOptionChange("asap")}
          />
          <span>Jak najszybciej</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="timeOption"
            value="schedule"
            checked={deliveryTimeOption === "schedule"}
            disabled={!canSchedule}
            onChange={() => {
              if (canSchedule) onTimeOptionChange("schedule");
            }}
          />
          <span>
            Na godzinę{!canSchedule ? " (brak wolnych slotów)" : ""}
          </span>
        </label>

        {deliveryTimeOption === "schedule" && canSchedule && (
          <select
            className="border border-white/20 lg:border-black/15 rounded-xl px-2 py-1 bg-white/5 lg:bg-white text-white lg:text-black"
            value={scheduledTime}
            onChange={(e) => onScheduledTimeChange(e.target.value)}
          >
            {scheduleSlots.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}

        {deliveryTimeOption === "schedule" && !canSchedule && (
          <span className="text-xs text-red-600">
            Brak dostępnych godzin na dziś — wybierz &bdquo;Jak najszybciej&rdquo;.
          </span>
        )}
      </div>
      <p className="text-xs text-white/60 lg:text-black/60">
        Dzisiejsze godziny w {restaurantCityLabel}: {openHoursLabel}
      </p>
    </div>
  );
}
