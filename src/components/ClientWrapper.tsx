"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Header from "./Header";
import FloatingQuickActions from "./FloatingQuickActions";
import dynamic from "next/dynamic";

const CheckoutModal = dynamic(() => import("./menu/CheckoutModal"), {
  ssr: false,
});

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");

  // 3.3 – REJESTRACJA SERVICE WORKERA (dla całej aplikacji)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

        navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async (reg) => {
        try {
          await reg.update();
        } catch {}
        console.log("[sw] Zarejestrowano service workera:", reg.scope);
      })
      .catch((err) => {
        console.error("[sw] Błąd rejestracji:", err);
      });
  }, []);

  return (
    <>
      {!isAdminRoute && <Header />}
      {children}
      {!isAdminRoute && <FloatingQuickActions />}
      {!isAdminRoute && <CheckoutModal />}
    </>
  );
}
