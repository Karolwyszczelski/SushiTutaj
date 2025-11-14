// app/components/ConfirmationModal.tsx
"use client";
import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function ConfirmationModal() {
  const searchParams = useSearchParams();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (searchParams?.get("confirmation") === "true") {
      setShowModal(true);
    }
  }, [searchParams]);

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4 text-center">Konto potwierdzone</h2>
        <p className="text-center">
          Dziękujemy za potwierdzenie Twojego konta. Teraz możesz się zalogować.
        </p>
        <div className="mt-4 flex justify-center">
          <Link
            href="/login"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Przejdź do logowania
          </Link>
        </div>
        <div className="mt-2 flex justify-center">
          <button
            onClick={() => setShowModal(false)}
            className="text-sm text-gray-500 underline"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
