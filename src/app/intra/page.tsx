// src/app/page.tsx
import type { Metadata } from "next";

import Hero from "@/components/Hero";
import BurgerMiesiaca from "@/components/ZestawMiesiaca";
import MenuSection from "@/components/menu/MenuSection";
import OnasSection from "@/components/OnasSection";
import ContactSection from "@/components/ContactSection";
import FloatingQuickActions from "@/components/FloatingQuickActions";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <main>
        <Hero />
        <BurgerMiesiaca />
        <MenuSection />
        <OnasSection />
        <ContactSection />
      </main>

      {/* pływające guziki tylko na stronie głównej */}
      <FloatingQuickActions />
    </>
  );
}
