import { LEGAL } from "@/config/legal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polityka cookies – Sushi Tutaj",
  description: "Informacje o plikach cookies i podobnych technologiach używanych przez Sushi Tutaj oraz sposobach zarządzania zgodami.",
  alternates: { canonical: "/cookies" },
  robots: { index: true, follow: true },
};

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-6 pt-28 pb-16">
        <article className="prose prose-invert prose-lg prose-a:text-yellow-300 hover:prose-a:text-yellow-200 prose-hr:border-neutral-700">
          <h1>Polityka cookies</h1>

          <p>
            Operatorem serwisu jest <b>{LEGAL.legalName}</b>, NIP {LEGAL.nip}. Używamy plików cookies i podobnych technologii
            w celu zapewnienia działania serwisu, poprawy jakości usług, statystyki i – za zgodą – marketingu.
          </p>

          <h2>1) Czym są cookies?</h2>
          <p>
            Cookies to niewielkie pliki zapisywane na urządzeniu użytkownika przez przeglądarkę. Mogą być odczytywane ponownie
            przez serwis przy kolejnych odwiedzinach. Technologie podobne to m.in. localStorage czy pixel tags.
          </p>

          <h2>2) Kategorie cookies</h2>
          <ul>
            <li><b>Niezbędne (strictly necessary)</b> – wymagane do prawidłowego działania serwisu (sesja, koszyk, bezpieczeństwo, preferencje zgody).</li>
            <li><b>Analityczne</b> – pomagają analizować ruch i działanie serwisu (z wykorzystaniem zanonimizowanych danych, gdy to możliwe).</li>
            <li><b>Marketingowe</b> – personalizacja treści/ofert oraz pomiar efektywności reklam (aktywowane wyłącznie po wyrażeniu zgody).</li>
          </ul>

          <h2>3) Baner zgody i zarządzanie</h2>
          <ul>
            <li>Podczas pierwszej wizyty wyświetlamy baner zarządzania zgodą. Możesz zaakceptować wszystkie kategorie, odrzucić niezbędne lub dopasować wybór.</li>
            <li>Preferencje możesz zmienić w dowolnym momencie (link „Ustawienia cookies” w stopce).</li>
            <li>Brak zgody może ograniczyć funkcjonalności niezwiązane z działaniem podstawowym.</li>
          </ul>

          <h2>4) Okresy przechowywania</h2>
          <ul>
            <li>Cookies sesyjne – do końca sesji przeglądarki.</li>
            <li>Cookies trwałe – zwykle od 1 dnia do 12 miesięcy (szczegółowy czas zależy od dostawcy narzędzia).</li>
          </ul>

          <h2>5) Dostawcy narzędzi</h2>
          <p>
            W serwisie mogą działać narzędzia zewnętrzne (np. analityczne/marketingowe) oraz komponenty techniczne
            (np. operator płatności, integracje map). Dane mogą być przekazywane dostawcom jako odrębnych administratorów
            lub podmiotów przetwarzających – w zakresie opisanym w <a href="/polityka-prywatnosci">Polityce prywatności</a>.
          </p>

          <h2>6) Jak kontrolować cookies w przeglądarce?</h2>
          <p>
            Większość przeglądarek pozwala blokować lub usuwać cookies. Instrukcje znajdują się w ustawieniach przeglądarki.
            Zablokowanie cookies niezbędnych może uniemożliwić korzystanie z części funkcji.
          </p>

          <h2>7) Zmiany w Polityce</h2>
          <p>
            Zastrzegamy prawo do aktualizacji Polityki cookies, m.in. w razie zmian technologicznych lub prawnych.
            Obowiązuje wersja opublikowana w serwisie.
          </p>

          <hr />
          <p className="text-sm opacity-70">
            Wersja: {LEGAL.docsVersion} · obowiązuje od: {LEGAL.effectiveDate}.
          </p>
        </article>
      </div>
    </main>
  );
}
