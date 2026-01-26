// src/components/ShowOnlyOnHome.tsx
"use client";

import { usePathname } from "next/navigation";
import React from "react";

export default function ShowOnlyOnHome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return <>{children}</>;
}
