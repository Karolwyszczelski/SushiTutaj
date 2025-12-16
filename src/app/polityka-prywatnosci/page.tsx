// src/app/polityka-prywatnosci/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { LEGAL } from "@/config/legal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polityka prywatności – Sushi Tutaj",
  description:
    "Zasady przetwarzania danych osobowych w systemie zamówień on-line Sushi Tutaj – konto użytkownika, zamówienia, dostawa i prawa użytkownika.",
  alternates: { canonical: "/polityka-prywatnosci" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
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
            Poniżej znajdziesz politykę prywatności serwisu zamówień on-line.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md shadow-[0_30px_90px_rgba(0,0,0,.55)]">
          <div className="px-6 py-8 md:px-10 md:py-12">
            <article
              className="prose prose-invert prose-lg max-w-none
              prose-headings:font-semibold
              prose-h1:text-2xl prose-h1:md:text-3xl prose-h1:text-center prose-h1:tracking-tight"
            >
              <h1>Polityka prywatności</h1>

              <p>
                Administratorem danych osobowych jest <b>{LEGAL.legalName}</b>,
                NIP {LEGAL.nip}, REGON {LEGAL.regon}, adres rejestrowy:{" "}
                {LEGAL.registeredAddress}. Kontakt:{" "}
                <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
              </p>

              <p>
                Niniejsza polityka opisuje przetwarzanie danych w związku z
                korzystaniem z systemu zamówień on-line Sushi Tutaj, w tym
                zakładaniem i obsługą konta użytkownika, składaniem zamówień,
                dostawą oraz obsługą reklamacji.
              </p>

              <h2>1) Podstawy prawne i cele przetwarzania</h2>
              <ul>
                <li>
                  <b>Rejestracja i obsługa konta użytkownika / realizacja zamówień</b>{" "}
                  – art. 6 ust. 1 lit. b RODO (niezbędność do zawarcia i wykonania
                  umowy). Dane: adres e-mail użyty do rejestracji, identyfikator
                  konta w systemie, imię, numer telefonu, adresy dostawy, historia
                  zamówień, informacje o programie lojalnościowym (naklejki,
                  wykorzystane nagrody).
                </li>
                <li>
                  <b>Rozliczenia i podatki</b> – art. 6 ust. 1 lit. c RODO
                  (obowiązek prawny). Dane na dokumentach księgowych i w rejestrach
                  sprzedaży; okresy przechowywania wynikają z przepisów.
                </li>
                <li>
                  <b>Kontakt, bezpieczeństwo, dochodzenie roszczeń</b> – art. 6
                  ust. 1 lit. f RODO (prawnie uzasadniony interes Administratora),
                  w szczególności: zapewnienie ciągłości działania systemu,
                  zapobieganie nadużyciom (np. wielokrotnie nieodebrane zamówienia),
                  ustalanie i dochodzenie roszczeń, obrona przed roszczeniami.
                </li>
                <li>
                  <b>Marketing bezpośredni (np. newsletter, kody rabatowe)</b> – art.
                  6 ust. 1 lit. a RODO (zgoda). Zgoda jest dobrowolna i może być
                  odwołana w każdym czasie, bez wpływu na zgodność z prawem
                  przetwarzania sprzed odwołania.
                </li>
              </ul>

              <h2>2) Kategorie przetwarzanych danych</h2>
              <ul>
                <li>
                  <b>Dane identyfikacyjne i kontaktowe</b> – imię, numer telefonu,
                  adres e-mail, adres dostawy (ulica, numer, kod pocztowy,
                  miejscowość).
                </li>
                <li>
                  <b>Dane konta użytkownika</b> – adres e-mail logowania, unikalny
                  identyfikator użytkownika w systemie, informacje o aktywności na
                  koncie (np. historia złożonych zamówień, przypisane naklejki),
                  ustawienia konta. Hasło przechowywane jest w formie
                  zaszyfrowanego skrótu przez dostawcę usługi uwierzytelniania.
                </li>
                <li>
                  <b>Dane transakcyjne</b> – numery zamówień, pozycje zamówienia,
                  cena, rabaty, informacje o sposobie realizacji (dostawa / odbiór),
                  status zamówienia. Aktualnie płatność odbywa się{" "}
                  <b>wyłącznie gotówką przy odbiorze</b>; Serwis nie przetwarza
                  numerów kart płatniczych.
                </li>
                <li>
                  <b>Dane techniczne</b> – logi serwera (adres IP, znaczniki czasu,
                  informacje o przeglądarce/urządzeniu), identyfikatory plików
                  cookies, dane niezbędne do działania mechanizmów bezpieczeństwa
                  (np. CAPTCHA) i statystyk.
                </li>
              </ul>

              <h2>3) Odbiorcy danych</h2>
              <ul>
                <li>
                  Dostawcy hostingu i usług IT (w tym dostawca bazy danych i
                  backendu systemu zamówień), w zakresie niezbędnym do utrzymania
                  Serwisu.
                </li>
                <li>
                  Dostawcy usług komunikacyjnych – obsługa wysyłki e-maili i SMS
                  (potwierdzenia zamówień, powiadomienia o statusie).
                </li>
                <li>
                  Podmioty świadczące usługi uwierzytelniania i obsługi kont
                  użytkowników (np. dostawca backendu / systemu logowania).
                </li>
                <li>
                  Biuro rachunkowe i doradcy prawni – w zakresie niezbędnym do
                  prowadzenia rozliczeń i obsługi prawnej.
                </li>
                <li>
                  Dostawcy narzędzi analitycznych i cookies – zgodnie z{" "}
                  <a href="/polityka-cookies">Polityką cookies</a>.
                </li>
                <li>
                  Organy publiczne, sądy i inne uprawnione instytucje – wyłącznie
                  w zakresie wymaganym przepisami prawa.
                </li>
              </ul>

              <h2>4) Przekazywanie danych poza EOG</h2>
              <p>
                Jeżeli konkretny dostawca usług IT lub analitycznych przetwarza
                dane poza Europejskim Obszarem Gospodarczym, Administrator zapewnia
                podstawę legalności takiego przekazania (np. standardowe klauzule
                umowne Komisji Europejskiej) oraz stosuje dodatkowe środki
                bezpieczeństwa, takie jak szyfrowanie i minimalizacja danych.
              </p>

              <h2>5) Okresy przechowywania danych</h2>
              <ul>
                <li>
                  Dane dotyczące Zamówień i rozliczeń – przez okres wymagany
                  przepisami prawa podatkowego i rachunkowego (co do zasady do
                  upływu 5 lat podatkowych liczonych od końca roku, w którym
                  powstał obowiązek podatkowy).
                </li>
                <li>
                  Dane konta użytkownika – przez czas istnienia konta. Po
                  usunięciu konta część danych może być dalej przechowywana
                  w zakresie niezbędnym do rozliczeń oraz dochodzenia lub obrony
                  przed roszczeniami (do upływu właściwych terminów przedawnienia).
                </li>
                <li>
                  Korespondencja i logi techniczne – co do zasady do 12 miesięcy,
                  chyba że dłuższy okres jest niezbędny do ustalenia, dochodzenia
                  lub obrony roszczeń albo wymagany przepisami prawa.
                </li>
                <li>
                  Dane wykorzystywane w celach marketingowych na podstawie zgody –
                  do czasu wycofania zgody lub zgłoszenia skutecznego sprzeciwu.
                </li>
              </ul>

              <h2>6) Prawa osób, których dane dotyczą</h2>
              <ul>
                <li>prawo dostępu do danych, w tym uzyskania kopii danych osobowych;</li>
                <li>
                  prawo do sprostowania (poprawiania) danych, ich usunięcia, w
                  przypadkach przewidzianych prawem – tzw. „prawo do bycia
                  zapomnianym”;
                </li>
                <li>prawo do ograniczenia przetwarzania oraz przenoszenia danych;</li>
                <li>
                  prawo wniesienia sprzeciwu wobec przetwarzania opartego na
                  prawnie uzasadnionym interesie Administratora, w tym wobec
                  marketingu bezpośredniego;
                </li>
                <li>
                  prawo cofnięcia zgody w dowolnym momencie – bez wpływu na
                  zgodność z prawem przetwarzania dokonanego przed cofnięciem
                  zgody;
                </li>
                <li>
                  prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych
                  Osobowych (ul. Stawki 2, 00-193 Warszawa,{" "}
                  <a
                    href="https://uodo.gov.pl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    uodo.gov.pl
                  </a>
                  ).
                </li>
              </ul>

              <h2>7) Dobrowolność podania danych</h2>
              <p>
                Podanie danych jest dobrowolne, jednak w przypadku danych
                oznaczonych jako obowiązkowe jest niezbędne do założenia konta
                użytkownika i/lub złożenia Zamówienia. W zakresie danych
                przetwarzanych na podstawie zgody (np. marketing) ich podanie jest
                dobrowolne i zależne od decyzji użytkownika.
              </p>

              <h2>8) Zautomatyzowane podejmowanie decyzji</h2>
              <p>
                Administrator nie podejmuje względem użytkowników decyzji
                opierających się wyłącznie na zautomatyzowanym przetwarzaniu, w tym
                profilowaniu, które wywoływałyby wobec nich skutki prawne lub w
                podobny sposób istotnie na nich wpływały.
              </p>

              <h2>9) Cookies i podobne technologie</h2>
              <p>
                Serwis wykorzystuje pliki cookies i podobne technologie w
                celach niezbędnych do działania (np. zapamiętanie koszyka,
                utrzymanie sesji zalogowanego użytkownika), statystycznych oraz
                marketingowych – zgodnie z{" "}
                <a href="/polityka-cookies">Polityką cookies</a>. Baner zgody
                umożliwia akceptację lub odrzucenie kategorii nieobowiązkowych.
              </p>

              <h2>10) Kontakt w sprawach danych osobowych</h2>
              <p>
                Wszelkie żądania i pytania dotyczące danych osobowych (w tym
                realizacja praw opisanych powyżej) można kierować na adres e-mail:{" "}
                <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
              </p>

              <hr />
              <p className="text-sm opacity-70">
                Wersja polityki: {LEGAL.docsVersion} · obowiązuje od:{" "}
                {LEGAL.effectiveDate}.
              </p>
            </article>
          </div>
        </div>
      </div>
    </main>
  );
}
