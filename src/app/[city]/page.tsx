import type { Metadata } from "next";
import Hero from "@/components/Hero";
import ZestawMiesiaca from "@/components/ZestawMiesiaca";
import MenuSection from "@/components/menu/MenuSection"; // tu „preview”, bez zamawiania
import OnasSection from "@/components/OnasSection";
import ContactSection from "@/components/ContactSection"; // ogólne info marki
import { listActiveRestaurants } from "@/lib/tenant";
import SeasonalSnow from "@/components/SeasonalSnow";

// lekka logika sezonowa – śnieg w grudniu i styczniu
  const now = new Date();
  const month = now.getMonth(); // 0 = styczeń, 11 = grudzień
  const showSnow = month === 11 || month === 0;

  return (
    <main className="relative min-h-[100svh] pt-28 pb-16 text-white">
      {/* śnieg (overlay, nie blokuje kliknięć) */}
      <SeasonalSnow enabled={showSnow} />

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
