"use client";
import React from "react";
import { useRouter } from "next/navigation";

export default function CalendarPopup({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white text-black p-6 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Podgląd kalendarza</h2>
        {/* Tu możesz dodać gotowy komponent kalendarza */}
        <p className="mb-4">Wkrótce podgląd szczegółowy rezerwacji z kalendarza.</p>
        <div className="flex justify-between">
          <button
            onClick={onClose}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-500"
          >
            Zamknij
          </button>
          <button
            onClick={() => router.push("/admin/reservations")}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500"
          >
            Przejdź do rezerwacji
          </button>
        </div>
      </div>
    </div>
  );
}
