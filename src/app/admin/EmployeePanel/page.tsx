// app/admin/EmployeePanel/page.tsx
"use client";
import React from "react";
import EmployeeClient from "@/components/EmployeeClient";

export default function EmployeePanel() {
  return (
    <div>
      {/* Możesz dodać nagłówek, statystyki, itd. */}
      <EmployeeClient />
    </div>
  );
}
