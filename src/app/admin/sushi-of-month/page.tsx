"use client";

import React from "react";
import SushiOfMonthForm from "@/components/admin/settings/SushiOfMonthForm";

export default function SushiOfMonthPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-slate-900">Zestaw miesiąca</h1>
          <p className="text-sm text-slate-600">Edycja globalna – jednakowa dla wszystkich restauracji.</p>
        </div>
        <SushiOfMonthForm />
      </div>
    </div>
  );
}
