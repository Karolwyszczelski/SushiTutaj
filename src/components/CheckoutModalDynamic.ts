"use client"

import dynamic from "next/dynamic";

const CheckoutModalDynamic = dynamic(() => import("@/components/menu/CheckoutModal"), {
  ssr: false, // Wyłącza SSR
});

export default CheckoutModalDynamic;
