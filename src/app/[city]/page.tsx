import type { Metadata } from "next";
import Hero from "@/components/Hero";
import ZestawMiesiaca from "@/components/ZestawMiesiaca";
import MenuSection from "@/components/menu/MenuSection"; // tu „preview”, bez zamawiania
import OnasSection from "@/components/OnasSection";
import ContactSection from "@/components/ContactSection"; // ogólne info marki
import { listActiveRestaurants } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SUSHI Tutaj — Strona główna" };

export default async function Home() {
  const restaurants = await listActiveRestaurants();
  return (
    <>
      <main>
        <Hero />
        <ZestawMiesiaca />
        <MenuSection />   {/* bez koszyka */}
        <OnasSection />
        <ContactSection />               {/* ogólne, nieper-miasto */}
      </main>
    </>
  );
}
