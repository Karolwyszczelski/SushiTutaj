// src/components/CancelButton.tsx
"use client";

import React, { useState } from "react";

interface CancelButtonProps {
  orderId: string;
  // teraz przyjmujemy też opcjonalne updatedData
  onOrderUpdated: (orderId: string, updatedData?: { status: string }) => void;
}

export default function CancelButton({
  orderId,
  onOrderUpdated,
}: CancelButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleCancel = async () => {
    if (!confirm("Na pewno anulować to zamówienie?")) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });

      const payload = await res.json();

      if (!res.ok) {
        console.error("Błąd anulowania zamówienia:", payload.error ?? payload);
        alert("Coś poszło nie tak przy anulowaniu: " + (payload.error ?? ""));
        return;
      }

      // powiadamiamy rodzica o zmianie statusu
      onOrderUpdated(orderId, { status: "cancelled" });
    } catch (err) {
      console.error("Błąd anulowania zamówienia:", err);
      alert("Błąd sieci podczas anulowania zamówienia.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className={`px-4 py-2 rounded-full font-semibold text-sm ${
        loading
          ? "bg-gray-300 text-gray-600"
          : "bg-red-600 hover:bg-red-500 text-white"
      }`}
    >
      {loading ? "Anulowanie..." : "Anuluj"}
    </button>
  );
}
