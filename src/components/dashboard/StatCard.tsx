"use client";

import React from "react";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("./admin/dashboard/Chart"), { ssr: false });

interface StatCardProps {
  title: string;              // np. "Zamówienia dziennie"
  subtitle?: string;          // np. "Ostatni tydzień"
  total?: number | string;    // duży wyróżniony licznik
  chartType: "line" | "bar" | "pie";
  chartData: any[];           // dane do wykresu
  dataKey?: string;           // klucz dla wartości (np. "value")
  nameKey?: string;           // klucz dla etykiety (np. "date")
  footer?: string;            // np. "Więcej szczegółów w statystykach"
  onClickMore?: () => void;   // funkcja wywoływana przy kliknięciu "Zobacz więcej" (opcjonalnie)
}

export default function StatCard({
  title,
  subtitle,
  total,
  chartType,
  chartData,
  dataKey = "value",
  nameKey = "name",
  footer,
  onClickMore,
}: StatCardProps) {
  return (
    <div className="bg-gray-900 text-white rounded-lg shadow-md border border-gray-800 p-4 hover:shadow-xl transition relative flex flex-col">
      {/* Tytuł */}
      <div>
        <h3 className="text-xl font-semibold mb-1">{title}</h3>
        {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
      </div>

      {/* Duży wyróżniony licznik */}
      {total !== undefined && (
        <div className="my-2 text-3xl font-bold text-green-400">
          {total}
        </div>
      )}

      {/* Wykres */}
      <div className="flex-1 mt-2">
        <Chart
          type={chartType}
          data={chartData}
          dataKey={dataKey}
          nameKey={nameKey}
        />
      </div>

      {/* Stopka (np. link "Zobacz więcej") */}
      {footer && (
        <div className="mt-3 border-t border-gray-700 pt-2 text-sm flex justify-between items-center text-gray-300">
          <span>{footer}</span>
          {onClickMore && (
            <button
              onClick={onClickMore}
              className="text-blue-400 hover:underline ml-2"
            >
              Zobacz więcej
            </button>
          )}
        </div>
      )}
    </div>
  );
}
