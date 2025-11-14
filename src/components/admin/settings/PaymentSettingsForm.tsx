// src/components/PaymentsForm.tsx
"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";

interface FormValues {
  method_przelewy24: boolean;
  method_blik: boolean;
  merchant_id: string;
  pos_id: string;
  api_key: string;
  crc_key: string;
  bank_account: string;
  commission_percent: number;
  test_mode: boolean;
}

export default function PaymentsForm() {
  const { register, handleSubmit, reset, formState: { isSubmitting } } =
    useForm<FormValues>({
      defaultValues: {
        method_przelewy24: true,
        method_blik: false,
        merchant_id: "",
        pos_id: "",
        api_key: "",
        crc_key: "",
        bank_account: "",
        commission_percent: 2.5,
        test_mode: true,
      },
    });

  // 1) Załaduj obecne wartości przy mount
  useEffect(() => {
    fetch("/api/settings/payments")
      .then(res => res.json())
      .then((data: FormValues) => {
        if (data) reset(data);
      })
      .catch(console.error);
  }, [reset]);

  // 2) Zapis
  const onSubmit = async (data: FormValues) => {
    try {
      const res = await fetch("/api/settings/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json();
      console.log("Zapisano ustawienia płatności:", saved);
      alert("Ustawienia zostały zapisane.");
    } catch (err: any) {
      console.error("Błąd zapisu ustawień:", err);
      alert("Nie udało się zapisać ustawień: " + err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-xl font-semibold">Metody płatności</h2>

      <div className="flex items-center gap-4">
        <label className="inline-flex items-center">
          <input type="checkbox" {...register("method_przelewy24")} className="mr-2" />
          Przelewy24
        </label>
        <label className="inline-flex items-center">
          <input type="checkbox" {...register("method_blik")} className="mr-2" />
          BLIK
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium">ID konta Przelewy24 (merchant_id)</label>
        <input {...register("merchant_id", { required: true })} className="mt-1 w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">POS ID (pos_id)</label>
        <input {...register("pos_id", { required: true })} className="mt-1 w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Klucz API (api_key)</label>
        <input {...register("api_key", { required: true })} className="mt-1 w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Klucz CRC (crc_key)</label>
        <input {...register("crc_key", { required: true })} className="mt-1 w-full border rounded px-3 py-2" />
      </div>

      <hr />

      <div>
        <label className="block text-sm font-medium">Numer konta bankowego</label>
        <input {...register("bank_account")} className="mt-1 w-full border rounded px-3 py-2" />
      </div>

      <div className="flex items-center">
        <input type="checkbox" {...register("test_mode")} className="mr-2" />
        <span className="text-sm">Tryb testowy</span>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
      >
        Zapisz płatności
      </button>
    </form>
  );
}
