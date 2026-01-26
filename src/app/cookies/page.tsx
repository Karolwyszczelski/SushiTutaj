// src/app/polityka-cookies/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { LEGAL } from "@/config/legal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polityka cookies – Sushi Tutaj",
  description:
    "Informacje o plikach cookies i podobnych technologiach używanych przez system zamówień on-line Sushi Tutaj oraz sposobach zarządzania zgodą.",
  alternates: { canonical: "/polityka-cookies" },
  robots: { index: true, follow: true },
};

export default function CookiesPage() {
  return (
    <main className="relative min-h-screen bg-[#070707] text-white overflow-hidden">
      {/* tło */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-44 -left-44 h-[560px] w-[560px] rounded-full bg-[var(--accent,#de1d13)]/18 blur-3xl" />
        <div className="absolute top-24 -right-56 h-[680px] w-[680px] rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-64 left-1/2 h-[720px] w-[720px] -translate-x-1/2 rounded-full bg-[var(--accent,#de1d13)]/10 blur-3xl" />
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.09)_1px,transparent_0)] [background-size:26px_26px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/55 to-black" />
      </div>

      <div className="relative mx-auto max-w-4xl px-6 pt-28 pb-16">
        <div className="mb-8 text-center">
          <p className="text-xs tracking-[0.28em] text-white/60">DOKUMENTY</p>
          <p className="mt-3 text-sm md:text-base text-white/70">
            Poniżej znajdziesz informacje o plikach cookies i ustawieniach zgody.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md shadow-[0_30px_90px_rgba(0,0,0,.55)]">
          <div className="px-6 py-8 md:px-10 md:py-12">
            <article
              className="prose prose-invert prose-lg max-w-none
              prose-headings:font-semibold
              prose-h1:text-2xl prose-h1:md:text-3xl prose-h1:text-center prose-h1:tracking-tight"
            >
              <h1>Polityka cookies</h1>

              <p>
                Operatorem serwisu zamówień on-line Sushi Tutaj jest{" "}
                <b>{LEGAL.legalName}</b>, NIP {LEGAL.nip}, z siedzibą pod adresem{" "}
                {LEGAL.registeredAddress}. W niniejszym dokumencie wyjaśniamy, w
                jaki sposób wykorzystujemy pliki cookies i podobne technologie w
                Serwisie oraz jak możesz nimi zarządzać.
              </p>

              <h2>1) Czym są pliki cookies i podobne technologie?</h2>
              <p>
                Cookies (tzw. <i>ciasteczka</i>) to niewielkie pliki tekstowe
                zapisywane na Twoim urządzeniu przez przeglądarkę internetową.
                Przy kolejnych odwiedzinach Serwisu pliki te mogą być odczytywane
                ponownie, co pozwala m.in. rozpoznać Twoją przeglądarkę, zapamiętać
                wybrane ustawienia czy zawartość koszyka. Do podobnych technologii
                zaliczają się także m.in. localStorage, sessionStorage oraz
                znaczniki pikselowe (<i>pixel tags</i>).
              </p>

              <h2>2) Jakie kategorie cookies wykorzystujemy?</h2>
              <p>
                W naszym Serwisie mogą być używane następujące kategorie plików
                cookies i podobnych technologii:
              </p>
              <ul>
                <li>
                  <b>Cookies niezbędne (strictly necessary)</b> – zapewniają
                  podstawowe działanie Serwisu, np.:
                  <ul>
                    <li>utrzymanie sesji zalogowanego użytkownika (Konto),</li>
                    <li>
                      zapamiętanie zawartości koszyka i wybranego miasta / restauracji,
                    </li>
                    <li>obsługa formularzy zamówień i mechanizmów bezpieczeństwa,</li>
                    <li>
                      zapis Twoich wyborów w banerze zgody na cookies. Bez tych
                      plików korzystanie z Serwisu może być niemożliwe lub poważnie
                      utrudnione.
                    </li>
                  </ul>
                </li>
                <li>
                  <b>Cookies funkcjonalne</b> – ułatwiają korzystanie z Serwisu,
                  np. zapamiętując Twoje ustawienia, ostatnio używane dane
                  kontaktowe lub preferencje (o ile funkcja jest dostępna). Ich
                  wyłączenie może obniżyć wygodę korzystania z Serwisu, ale nie
                  powinno całkowicie zablokować jego działania.
                </li>
                <li>
                  <b>Cookies analityczne/statystyczne</b> – służą do tworzenia
                  zbiorczych statystyk korzystania z Serwisu (np. liczba odwiedzin,
                  najczęściej wybierane pozycje menu), co pomaga nam poprawiać
                  jakość działania i układ strony. Staramy się, aby dane używane
                  do analityki były maksymalnie zanonimizowane.
                </li>
                <li>
                  <b>Cookies marketingowe</b> – mogą służyć do wyświetlania
                  dopasowanych komunikatów marketingowych oraz mierzenia skuteczności
                  kampanii. Takie cookies są aktywowane wyłącznie po wyrażeniu
                  odrębnej zgody w banerze. Obecnie Serwis nie musi wykorzystywać
                  wszystkich możliwych narzędzi marketingowych; jeśli zostaną
                  wdrożone, będą jasno oznaczone w banerze zgody.
                </li>
              </ul>

              <h2>3) Baner zgody i zarządzanie preferencjami</h2>
              <ul>
                <li>
                  Przy pierwszej wizycie w Serwisie wyświetlamy baner zgody, w
                  którym możesz:
                  <ul>
                    <li>zaakceptować wszystkie kategorie cookies, lub</li>
                    <li>
                      zaakceptować wyłącznie cookies niezbędne oraz – opcjonalnie –
                      wybrane dodatkowe kategorie (np. analityczne).
                    </li>
                  </ul>
                </li>
                <li>
                  Swoje decyzje możesz w każdej chwili zmienić, korzystając z
                  linku „Ustawienia cookies” dostępnego w stopce Serwisu lub z
                  odpowiedniej funkcji banera, jeśli jest widoczna.
                </li>
                <li>
                  Odmowa zgody na cookies inne niż niezbędne może ograniczyć
                  dostępność części funkcji (np. spersonalizowanych rekomendacji),
                  ale nie powinna uniemożliwić złożenia Zamówienia.
                </li>
              </ul>

              <h2>4) Okresy przechowywania cookies</h2>
              <ul>
                <li>
                  <b>Cookies sesyjne</b> – przechowywane do czasu zamknięcia
                  przeglądarki (służą np. do utrzymania sesji logowania, obsługi
                  koszyka podczas pojedynczej wizyty).
                </li>
                <li>
                  <b>Cookies trwałe</b> – przechowywane przez określony czas
                  (np. od 1 dnia do 12 miesięcy), m.in. w celu zapamiętania Twoich
                  wyborów dotyczących zgody na cookies czy wygodnego logowania.
                  Dokładny czas przechowywania może zależeć od konkretnego
                  narzędzia lub ustawień przeglądarki.
                </li>
              </ul>

              <h2>5) Konto użytkownika, zamówienia i cookies</h2>
              <p>
                W celu obsługi Konta użytkownika oraz składanych Zamówień Serwis
                wykorzystuje przede wszystkim cookies niezbędne i funkcjonalne, w
                szczególności do:
              </p>
              <ul>
                <li>utrzymania sesji zalogowanego użytkownika po zalogowaniu,</li>
                <li>przypisania koszyka do konkretnego użytkownika/sesji,</li>
                <li>
                  zapamiętania wybranego miasta / restauracji oraz podstawowych
                  ustawień interfejsu.
                </li>
              </ul>
              <p>
                Płatności za Zamówienia realizowane są obecnie wyłącznie{" "}
                <b>gotówką przy odbiorze</b>. Serwis nie przetwarza numerów kart
                płatniczych ani innych danych kartowych w cookies ani w inny sposób.
              </p>

              <h2>6) Zewnętrzni dostawcy narzędzi</h2>
              <p>
                W ramach Serwisu możemy korzystać z usług dostawców zewnętrznych,
                np. narzędzi analitycznych, map, usług bezpieczeństwa (CAPTCHA) czy
                komponentów technicznych. Podmioty te mogą stosować własne cookies
                jako odrębni administratorzy lub podmioty przetwarzające.
              </p>
              <p>
                Szczegółowe informacje o odbiorcach danych i podstawach
                przetwarzania znajdują się w{" "}
                <a href="/polityka-prywatnosci">Polityce prywatności</a>.
              </p>

              <h2>7) Jak kontrolować cookies w przeglądarce?</h2>
              <p>
                Większość przeglądarek umożliwia samodzielne zarządzanie cookies –
                ich blokowanie, ograniczanie lub usuwanie. Dokładne instrukcje
                znajdziesz w ustawieniach swojej przeglądarki (np. w sekcji
                „Prywatność” lub „Bezpieczeństwo”).
              </p>
              <p>
                Pamiętaj, że zablokowanie cookies niezbędnych może uniemożliwić
                poprawne działanie Serwisu, w szczególności logowanie do Konta,
                utrzymanie koszyka czy składanie Zamówień.
              </p>

              <h2>8) Zmiany w Polityce cookies</h2>
              <p>
                Zastrzegamy sobie prawo do wprowadzania zmian w niniejszej
                Polityce cookies, m.in. w przypadku aktualizacji technologii
                wykorzystywanych w Serwisie lub zmian przepisów prawa. Aktualna
                wersja Polityki jest zawsze dostępna pod adresem{" "}
                <a href="/polityka-cookies">/polityka-cookies</a>.
              </p>

              <hr />
              <p className="text-sm opacity-70">
                Wersja dokumentu: {LEGAL.docsVersion} · obowiązuje od:{" "}
                {LEGAL.effectiveDate}.
              </p>
            </article>
          </div>
        </div>
      </div>
    </main>
  );
}
