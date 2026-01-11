// src/components/CancelButton.tsx
"use client";

import React, { useState } from "react";

interface CancelButtonProps {
  orderId: string;
  // teraz przyjmujemy też opcjonalne updatedData
  onOrderUpdated: (orderId: string, updatedData?: { status: string }) => void;
}

/* ========= Retry fetch helper ========= */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(
  url: string,
  options: RequestInit & { retries?: number; retryDelay?: number; timeout?: number } = {}
): Promise<Response> {
  const { retries = 3, retryDelay = 1500, timeout = 15000, ...fetchOpts } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        ...fetchOpts,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return res;
    } catch (e: any) {
      lastError = e;

      if (attempt >= retries) {
        throw e;
      }

      const delay = retryDelay * Math.pow(1.5, attempt);
      await sleep(delay);
    }
  }

  throw lastError || new Error("Fetch failed after retries");
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
      const res = await fetchWithRetry(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
        retries: 3,
        retryDelay: 1500,
        timeout: 15000,
      });

      const payload = await res.json();

      if (!res.ok) {
        console.error("Błąd anulowania zamówienia:", payload.error ?? payload);
        alert("Coś poszło nie tak przy anulowaniu: " + (payload.error ?? ""));
        return;
      }

      // powiadamiamy rodzica o zmianie statusu
      onOrderUpdated(orderId, { status: "cancelled" });
    } catch (err: any) {
      console.error("Błąd anulowania zamówienia:", err);
      const isTimeout = err?.message?.includes("abort");
      alert(isTimeout 
        ? "Słabe połączenie - spróbuj ponownie za chwilę." 
        : "Błąd sieci podczas anulowania zamówienia. Spróbuj ponownie."
      );
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
