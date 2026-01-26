"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type OrderStatusResponse = {
  payment_status?: string;
  status?: string;
  [key: string]: unknown;
};

const MISSING_PARAMS_ERROR = "Brak identyfikatora zamówienia lub tokenu.";
const UNAUTHORIZED_ERROR = "Link do statusu płatności wygasł lub jest nieprawidłowy.";
const GENERIC_FETCH_ERROR = "Nie udało się pobrać statusu płatności. Spróbuj ponownie.";
const UNKNOWN_FETCH_ERROR = "Wystąpił błąd podczas pobierania statusu.";

export default function SuccessClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const orderId = sp.get("orderId") || "";
  const token = sp.get("t") || "";

  const [statusData, setStatusData] = useState<OrderStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = statusData?.payment_status || statusData?.status || "pending";

  const load = useCallback(async () => {
    if (!orderId || !token) {
      setError(MISSING_PARAMS_ERROR);
      setStatusData(null);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/orders/status/${encodeURIComponent(orderId)}?t=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );

      if (response.status === 401) {
        setError(UNAUTHORIZED_ERROR);
        setStatusData(null);
        return;
      }

      if (!response.ok) {
        setError(GENERIC_FETCH_ERROR);
        setStatusData(null);
        return;
      }

      const json: OrderStatusResponse = await response.json();
      setStatusData(json);
      setError(null);
    } catch {
      setError(UNKNOWN_FETCH_ERROR);
      setStatusData(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    if (!orderId || !token) {
      if (error !== MISSING_PARAMS_ERROR) {
        setError(MISSING_PARAMS_ERROR);
      }
      return;
    }

    if (error === MISSING_PARAMS_ERROR) {
      setError(null);
    }

    if (error) {
      return;
    }

    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [orderId, token, load, error]);

  useEffect(() => {
    if (status === "paid") {
      const t = setTimeout(() => router.push("/"), 1500);
      return () => clearTimeout(t);
    }
  }, [status, router]);

  return (
    <div className="min-h-[60vh] grid place-items-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">Status płatności</h1>
        {error ? (
          <p className="mb-4 text-red-600">{error}</p>
        ) : (
          <div className="mb-4 space-y-2">
            <p>
              {status === "paid"
                ? "Płatność potwierdzona. Dziękujemy!"
                : status === "failed"
                  ? "Płatność nie powiodła się. Spróbuj ponownie."
                  : "Finalizujemy płatność…"}
            </p>
            {statusData?.payment_status && (
              <p className="text-sm text-gray-500">
                Status płatności u operatora: {statusData.payment_status}
              </p>
            )}
          </div>
        )}
        <button
          onClick={load}
          disabled={loading || !orderId || !token}
          className="px-4 py-2 bg-black text-white rounded disabled:opacity-50"
        >
          {loading ? "Sprawdzam…" : "Sprawdź status"}
        </button>
      </div>
    </div>
  );
}