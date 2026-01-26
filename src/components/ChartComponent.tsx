// components/ChartComponent.tsx
"use client";

import React from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function ChartComponent() {
  const data = {
    labels: ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec"],
    datasets: [
      {
        label: "Sprzedaż",
        data: [65, 59, 80, 81, 56, 55],
        borderWidth: 2,
        // Kolory możesz ustawić według domyślnej konfiguracji lub pozostawić domyślne
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: "top" as const },
      title: { display: true, text: "Statystyki sprzedaży" },
    },
  };

  return (
    <div className="p-4 bg-white rounded shadow">
      <Line data={data} options={options} />
    </div>
  );
}
