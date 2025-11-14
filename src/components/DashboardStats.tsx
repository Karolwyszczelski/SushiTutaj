"use client";

import React, { useState, useEffect } from "react";
import { Line, Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";

// Rejestrujemy komponenty wykresów
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface DashboardStatsProps {
  dateRange: "lastMonth" | "all";
}

interface StatsData {
  ordersPerDay: { [date: string]: number };
  avgFulfillmentTime: { [date: string]: number }; // średni czas realizacji w minutach
  popularProducts: { [productName: string]: number };
}

export default function DashboardStats({ dateRange }: DashboardStatsProps) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`/api/orders/stats?range=${dateRange}`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        } else {
          console.error("Błąd pobierania statystyk", res.status, res.statusText);
          // Jeśli wystąpi błąd, używamy przykładowych danych:
          setStats({
            ordersPerDay: {
              "2025-03-25": 12,
              "2025-03-26": 15,
              "2025-03-27": 9,
              "2025-03-28": 18,
              "2025-03-29": 14,
              "2025-03-30": 20,
              "2025-03-31": 16,
            },
            avgFulfillmentTime: {
              "2025-03-25": 25,
              "2025-03-26": 30,
              "2025-03-27": 28,
              "2025-03-28": 32,
              "2025-03-29": 27,
              "2025-03-30": 35,
              "2025-03-31": 30,
            },
            popularProducts: {
              "Standard Burger": 35,
              "Cheeseburger": 28,
              "BBQ Cheeseburger": 22,
              "TexMex Cheeseburger": 18,
            },
          });
        }
      } catch (error) {
        console.error("Fetch error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [dateRange]);

  if (loading) {
    return <div className="p-4 text-white">Ładowanie statystyk...</div>;
  }
  if (!stats) {
    return <div className="p-4 text-white">Brak danych statystycznych.</div>;
  }

  // Przygotowanie danych dla wykresu liniowego – liczba zamówień dziennie
  const lineData = {
    labels: Object.keys(stats.ordersPerDay),
    datasets: [
      {
        label: "Liczba zamówień",
        data: Object.values(stats.ordersPerDay),
        borderColor: "rgba(75,192,192,1)",
        backgroundColor: "rgba(75,192,192,0.2)",
        tension: 0.4,
      },
    ],
  };

  // Dane dla wykresu słupkowego – średni czas realizacji
  const barData = {
    labels: Object.keys(stats.avgFulfillmentTime),
    datasets: [
      {
        label: "Średni czas realizacji (min)",
        data: Object.values(stats.avgFulfillmentTime),
        backgroundColor: "rgba(153,102,255,0.6)",
      },
    ],
  };

  // Dane dla wykresu kołowego – popularność produktów
  const pieData = {
    labels: Object.keys(stats.popularProducts),
    datasets: [
      {
        label: "Popularność produktów",
        data: Object.values(stats.popularProducts),
        backgroundColor: [
          "#FF6384",
          "#36A2EB",
          "#FFCE56",
          "#4BC0C0",
          "#9966FF",
          "#FF9F40",
        ],
      },
    ],
  };

  return (
    <div className="p-6 bg-gray-900 text-white rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Dashboard Statystyk i Raportów</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-xl font-semibold mb-2">Liczba zamówień dziennie</h3>
          <Line data={lineData} />
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">Średni czas realizacji</h3>
          <Bar data={barData} />
        </div>
        <div className="md:col-span-2">
          <h3 className="text-xl font-semibold mb-2">Najpopularniejsze produkty</h3>
          <Pie data={pieData} />
        </div>
      </div>
    </div>
  );
}
