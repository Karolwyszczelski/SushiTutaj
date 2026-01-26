// src/app/regulamin/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { LEGAL } from "@/config/legal";

export const metadata: Metadata = {
  title: "Regulamin – Sushi Tutaj",
  description:
    "Regulamin składania zamówień on-line w Sushi Tutaj – zasady działania serwisu, kont użytkowników, realizacji zamówień, płatności i reklamacji.",
  alternates: { canonical: "/regulamin" },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <main className="relative min-h-screen bg-[#070707] text-white overflow-hidden">
      {/* tło (delikatne, żeby nie „zlewało” tekstu) */}
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
            Poniżej znajdziesz regulamin korzystania z serwisu zamówień on-line.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md shadow-[0_30px_90px_rgba(0,0,0,.55)]">
          <div className="px-6 py-8 md:px-10 md:py-12">
            <article
  className="prose prose-invert prose-lg max-w-none
  prose-headings:font-semibold
  prose-h1:text-2xl prose-h1:md:text-3xl prose-h1:text-center prose-h1:tracking-tight prose-h1:mb-6
  prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-white/10 prose-h2:scroll-mt-28
  prose-h3:mt-8 prose-h3:mb-3
  prose-p:my-4 md:prose-p:my-5 prose-p:leading-relaxed prose-p:text-white/80
  prose-ul:my-4 prose-ol:my-4 prose-ul:pl-6 prose-ol:pl-6
  prose-li:my-1 prose-li:leading-relaxed
  prose-hr:my-10 prose-hr:border-white/10
  prose-a:text-[var(--accent,#de1d13)] prose-a:underline prose-a:decoration-white/20 hover:prose-a:text-[#ff3b30] hover:prose-a:decoration-[var(--accent,#de1d13)]
  prose-strong:text-white
  prose-li:marker:text-white/40"
>
              <h1>Regulamin serwisu zamówień on-line Sushi Tutaj</h1>

              <p>
                Niniejszy regulamin określa zasady korzystania z systemu zamówień
                on-line Sushi Tutaj, dostępnego w szczególności pod adresem
                internetowym <strong>{LEGAL.domain ?? "sushitutaj.pl"}</strong>{" "}
                (dalej: <strong>„Serwis”</strong>).
              </p>

              <p>
                Administratorem Serwisu i podmiotem zarządzającym systemem
                informatycznym jest <strong>{LEGAL.legalName}</strong>, NIP{" "}
                {LEGAL.nip}, REGON {LEGAL.regon}, z siedzibą pod adresem{" "}
                {LEGAL.registeredAddress}, adres e-mail:{" "}
                <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> (dalej:
                <strong>„Administrator”</strong>).
              </p>

              <p>
                Zawarcie umowy o świadczenie usług gastronomicznych na podstawie
                Zamówienia złożonego przez Serwis następuje pomiędzy Klientem a
                wybraną Restauracją działającą pod marką „Sushi Tutaj” (dalej:{" "}
                <strong>„Restauracja”</strong>). Dane konkretnej Restauracji
                wyświetlane są każdorazowo w podsumowaniu Zamówienia oraz w
                wiadomości e-mail z potwierdzeniem przyjęcia Zamówienia.
              </p>

              <h2>1. Definicje</h2>

              <ul>
                <li>
                  <strong>Klient</strong> – osoba fizyczna posiadająca pełną
                  zdolność do czynności prawnych, a w przypadkach przewidzianych
                  przepisami także ograniczoną zdolność do czynności prawnych,
                  składająca Zamówienie za pośrednictwem Serwisu; w razie
                  wątpliwości domniemywa się, że Klient jest Konsumentem.
                </li>
                <li>
                  <strong>Konsument</strong> – Klient będący konsumentem w
                  rozumieniu obowiązujących przepisów prawa.
                </li>
                <li>
                  <strong>Serwis</strong> – serwis internetowy oraz aplikacja
                  webowa obsługująca składanie Zamówień na produkty gastronomiczne
                  oferowane przez Restauracje Sushi Tutaj.
                </li>
                <li>
                  <strong>Konto użytkownika</strong> lub <strong>Konto</strong>{" "}
                  – zbiór zasobów i ustawień w systemie Serwisu, przypisany do
                  określonego adresu e-mail i ewentualnie numeru telefonu, w
                  ramach którego gromadzona jest m.in. historia Zamówień,
                  informacje o Programie lojalnościowym oraz dane kontaktowe
                  użytkownika.
                </li>
                <li>
                  <strong>Zamówienie</strong> – oświadczenie woli Klienta złożone
                  za pośrednictwem Serwisu, zmierzające bezpośrednio do zawarcia
                  Umowy z wybraną Restauracją, obejmujące w szczególności wybór
                  produktów, opcji realizacji (Dostawa / odbiór osobisty), danych
                  kontaktowych oraz adresu dostawy.
                </li>
                <li>
                  <strong>Umowa</strong> – umowa o świadczenie usług
                  gastronomicznych (przygotowanie i wydanie posiłków), zawierana
                  pomiędzy Klientem a Restauracją na odległość, w oparciu o
                  Zamówienie złożone za pośrednictwem Serwisu.
                </li>
                <li>
                  <strong>Dostawa</strong> – dostarczenie produktów objętych
                  Zamówieniem na adres wskazany przez Klienta, przez Restaurację
                  lub podmiot współpracujący.
                </li>
                <li>
                  <strong>Odbiór osobisty</strong> – odbiór Zamówienia przez
                  Klienta w lokalu Restauracji wskazanym w Serwisie.
                </li>
                <li>
                  <strong>Program lojalnościowy</strong> – dobrowolny program
                  nagród oparty na zbieraniu naklejek za spełniające warunki
                  Zamówienia, opisany w rozdziale 9 Regulaminu.
                </li>
              </ul>

              <h2>2. Postanowienia ogólne</h2>

              <ul>
                <li>
                  Regulamin określa zasady korzystania z Serwisu, w tym w
                  szczególności zakładania i obsługi Konta, składania Zamówień,
                  zawierania Umów, sposobu realizacji Zamówień, płatności,
                  reklamacji oraz korzystania z Programu lojalnościowego.
                </li>
                <li>
                  Warunkiem korzystania z Serwisu jest zapoznanie się z
                  Regulaminem i jego akceptacja. Klient akceptuje Regulamin poprzez
                  zaznaczenie odpowiedniego pola przed złożeniem Zamówienia lub
                  założeniem Konta.
                </li>
                <li>
                  Serwis przeznaczony jest wyłącznie dla osób pełnoletnich. Osoba
                  niepełnoletnia może korzystać z Serwisu jedynie za wiedzą i
                  zgodą swojego przedstawiciela ustawowego.
                </li>
                <li>Serwis nie prowadzi sprzedaży alkoholu ani wyrobów tytoniowych.</li>
              </ul>

              <h2>3. Wymagania techniczne i zasady korzystania</h2>

              <ul>
                <li>
                  Do korzystania z Serwisu wymagane jest urządzenie z dostępem do
                  Internetu, aktualna przeglądarka internetowa oraz włączona
                  obsługa plików cookies i JavaScript.
                </li>
                <li>
                  Administrator dokłada starań, aby Serwis działał w sposób
                  ciągły, z zastrzeżeniem przerw technicznych wynikających z
                  konieczności konserwacji, aktualizacji lub przyczyn niezależnych.
                </li>
                <li>
                  Klient zobowiązany jest do podawania danych zgodnych ze
                  stanem faktycznym oraz powstrzymywania się od dostarczania treści
                  o charakterze bezprawnym, obraźliwym lub naruszającym prawa osób
                  trzecich.
                </li>
                <li>
                  Administrator i Restauracje mogą blokować możliwość
                  składania Zamówień z określonych adresów, numerów telefonów lub
                  adresów e-mail w uzasadnionych przypadkach, w szczególności przy
                  wielokrotnym nieodebraniu Zamówień, podawaniu fałszywych danych
                  lub naruszeniach Regulaminu.
                </li>
              </ul>

              <h2>4. Konto użytkownika i rejestracja</h2>

              <ul>
                <li>
                  Korzystanie z Serwisu może odbywać się z wykorzystaniem Konta
                  użytkownika lub – jeśli funkcjonalność jest dostępna – jako tzw.
                  gość (bez zakładania Konta). Niektóre funkcje (np. historia
                  zamówień, Program lojalnościowy przypisany do Konta) mogą być
                  dostępne wyłącznie dla zalogowanych użytkowników.
                </li>
                <li>
                  Założenie Konta następuje poprzez wypełnienie formularza
                  rejestracyjnego w Serwisie, podanie wymaganych danych (zwykle
                  adres e-mail i hasło) oraz akceptację Regulaminu i Polityki
                  prywatności. Dodatkowo Serwis może wymagać potwierdzenia adresu
                  e-mail (link aktywacyjny).
                </li>
                <li>
                  Użytkownik jest zobowiązany do:
                  <ul>
                    <li>podawania prawdziwych i aktualnych danych w procesie rejestracji,</li>
                    <li>
                      nieudostępniania danych logowania osobom trzecim oraz należytego
                      zabezpieczenia hasła,
                    </li>
                    <li>
                      niezwłocznego poinformowania Administratora o podejrzeniu
                      nieuprawnionego dostępu do Konta.
                    </li>
                  </ul>
                </li>
                <li>
                  Administrator może zablokować lub ograniczyć dostęp do Konta
                  użytkownika, jeżeli:
                  <ul>
                    <li>Użytkownik narusza postanowienia Regulaminu lub przepisy prawa,</li>
                    <li>
                      Konto jest wykorzystywane w sposób sprzeczny z jego
                      przeznaczeniem (np. do nadużyć, spamu, wielokrotnych
                      fikcyjnych zamówień),
                    </li>
                    <li>istnieją uzasadnione podejrzenia co do bezpieczeństwa Konta.</li>
                  </ul>
                  O ile to możliwe, Użytkownik jest informowany o przyczynach
                  blokady.
                </li>
                <li>
                  Użytkownik może w każdej chwili zażądać usunięcia Konta, wysyłając
                  stosowne żądanie na adres e-mail Administratora wskazany w
                  Regulaminie lub korzystając z odpowiedniej funkcji w Serwisie,
                  jeżeli jest dostępna.
                </li>
                <li>
                  Usunięcie Konta nie wpływa na ważność zawartych wcześniej Umów
                  ani na obowiązek przechowywania danych dotyczących Zamówień i
                  rozliczeń przez okresy wymagane przepisami prawa.
                </li>
              </ul>

              <h2>5. Składanie Zamówień i zawarcie Umowy</h2>

              <ol>
                <li>
                  Klient składa Zamówienie poprzez:
                  <ol>
                    <li>wybór miasta / Restauracji w Serwisie,</li>
                    <li>wybór produktów z menu i dodanie ich do koszyka,</li>
                    <li>
                      wybór sposobu realizacji Zamówienia (Dostawa lub odbiór
                      osobisty),
                    </li>
                    <li>
                      podanie wymaganych danych kontaktowych (imię, numer telefonu,
                      adres e-mail, adres dostawy – w przypadku Dostawy),
                    </li>
                    <li>
                      ewentualne wskazanie preferowanego czasu realizacji, jeśli
                      opcja jest dostępna,
                    </li>
                    <li>
                      potwierdzenie zapoznania się z Regulaminem i Polityką
                      prywatności,
                    </li>
                    <li>
                      kliknięcie przycisku o treści „Zamawiam” lub równoważnej,
                      jednoznacznie wskazującej na złożenie Zamówienia z obowiązkiem
                      zapłaty.
                    </li>
                  </ol>
                </li>
                <li>
                  Przed wysłaniem Zamówienia Klient ma możliwość samodzielnej
                  weryfikacji i zmiany wprowadzonych danych oraz zawartości koszyka.
                </li>
                <li>
                  Złożenie Zamówienia przez Klienta stanowi ofertę zawarcia Umowy z
                  wybraną Restauracją na warunkach wskazanych w podsumowaniu
                  Zamówienia.
                </li>
                <li>
                  Po złożeniu Zamówienia Serwis wyświetla informację o rejestracji
                  Zamówienia oraz – jeżeli dane zostały podane – wysyła do Klienta
                  wiadomość e-mail z potwierdzeniem otrzymania Zamówienia.
                </li>
                <li>
                  Zawarcie Umowy następuje z chwilą potwierdzenia przyjęcia
                  Zamówienia do realizacji przez Restaurację (zmiana statusu
                  Zamówienia w Serwisie na status wskazujący na przyjęcie do
                  realizacji lub równoważna informacja przekazana Klientowi).
                </li>
                <li>
                  Restauracja może odmówić realizacji Zamówienia w szczególności,
                  gdy:
                  <ul>
                    <li>podane dane są nieprawidłowe lub niekompletne,</li>
                    <li>
                      adres dostawy znajduje się poza strefą dostaw lub nie spełnia
                      wymogów logistycznych,
                    </li>
                    <li>występują obiektywne przeszkody w realizacji (brak produktu, awaria, brak mocy przerobowych),</li>
                    <li>
                      istnieją uzasadnione wątpliwości co do rzetelności Zamówienia
                      (np. wielokrotne wcześniejsze nieodebrane Zamówienia).
                    </li>
                  </ul>
                  W takim przypadku Restauracja niezwłocznie informuje Klienta, a
                  ewentualne płatności uiszczone wcześniej są zwracane zgodnie z
                  obowiązującymi przepisami i ustaleniami z Klientem.
                </li>
              </ol>

              <h2>6. Ceny i płatności</h2>

              <ul>
                <li>
                  Wszystkie ceny widoczne w Serwisie podawane są w złotych
                  polskich (PLN) i zawierają podatek VAT.
                </li>
                <li>
                  Ceny produktów nie zawierają kosztu Dostawy, chyba że wyraźnie
                  zaznaczono inaczej. Informacja o koszcie Dostawy oraz o ewentualnej
                  opłacie za opakowanie prezentowana jest Klientowi przed
                  złożeniem Zamówienia.
                </li>
                <li>
                  Minimalna wartość Zamówienia dla Dostawy może być różna w
                  zależności od miasta, strefy dostawy lub obowiązującej promocji.
                  Informacja o wymaganej minimalnej kwocie prezentowana jest w
                  Serwisie.
                </li>
                <li>
                  Aktualna i wiążąca dla stron cena produktów oraz koszty
                  dodatkowe (Dostawa, opakowanie) są wskazane w podsumowaniu
                  Zamówienia tuż przed jego złożeniem.
                </li>
                <li>
                  Płatność za Zamówienie odbywa się wyłącznie{" "}
                  <strong>gotówką przy odbiorze</strong> – w lokalu Restauracji
                  (odbiór osobisty) lub u dostawcy (Dostawa). Serwis nie realizuje
                  obecnie płatności on-line.
                </li>
              </ul>

              <h2>7. Realizacja Zamówień, Dostawa i odbiór osobisty</h2>

              <ul>
                <li>
                  Zamówienia realizowane są w godzinach pracy danej Restauracji,
                  wskazanych w Serwisie. Możliwe jest czasowe wstrzymanie przyjmowania
                  Zamówień (np. przerwy techniczne, brak możliwości przyjęcia
                  kolejnych Zamówień).
                </li>
                <li>
                  Szacowany czas realizacji Zamówienia prezentowany jest w
                  Serwisie w formie orientacyjnej. Rzeczywisty czas może ulec
                  zmianie w zależności od obciążenia kuchni, warunków pogodowych,
                  sytuacji na drogach i innych czynników.
                </li>
                <li>
                  Klient jest zobowiązany zapewnić możliwość kontaktu telefonicznego
                  pod numerem wskazanym w Zamówieniu oraz obecność w miejscu
                  Dostawy w uzgodnionym czasie.
                </li>
                <li>
                  W przypadku odbioru osobistego Klient zobowiązany jest zgłosić
                  się po odbiór Zamówienia w podanym czasie. W razie znacznego
                  opóźnienia Restauracja może odmówić wydania Zamówienia lub uznać
                  je za anulowane.
                </li>
                <li>
                  Dostawa realizowana jest wyłącznie na obszarze stref dostawy
                  przypisanych do danej Restauracji. System może weryfikować
                  możliwość Dostawy na podstawie podanego adresu i odległości.
                </li>
              </ul>

              <h2>8. Prawo odstąpienia i anulowanie Zamówienia</h2>

              <ul>
                <li>
                  Z uwagi na charakter oferowanych produktów (posiłki przygotowywane
                  na bieżąco, szybko psujące się), po rozpoczęciu faktycznej
                  realizacji Zamówienia przez Restaurację Klient nie ma ustawowego
                  prawa odstąpienia od Umowy w 14-dniowym terminie.
                </li>
                <li>
                  Klient może anulować Zamówienie przed rozpoczęciem jego
                  przygotowywania, kontaktując się bezpośrednio z Restauracją.
                </li>
                <li>
                  W szczególnych przypadkach Restauracja może – według własnej
                  oceny – uwzględnić prośbę Klienta o anulowanie Zamówienia także po
                  rozpoczęciu jego realizacji, jednak nie jest do tego zobowiązana.
                </li>
              </ul>

              <h2>9. Program lojalnościowy – naklejki</h2>

              <ul>
                <li>
                  Serwis może umożliwiać Klientom udział w Programie
                  lojalnościowym polegającym na zbieraniu naklejek za spełniające
                  warunki Zamówienia. Aktualne zasady Programu przedstawiane są w
                  Serwisie oraz w trakcie składania Zamówienia.
                </li>
                <li>
                  Naklejki mogą być przypisywane do Konta użytkownika lub – jeżeli
                  funkcjonalność Konta nie jest używana – do określonego numeru
                  telefonu/adresu e-mail.
                </li>
                <li>
                  Co do zasady Klient otrzymuje jedną naklejkę za każde Zamówienie
                  spełniające minimalną wartość wskazaną w Serwisie. Po zebraniu
                  określonej liczby naklejek Klient może wymienić je na nagrody,
                  zgodnie z komunikatem w Serwisie (np. produkt gratis po 4
                  naklejkach, rabat przy 8 naklejkach).
                </li>
                <li>
                  Z chwilą skorzystania z nagrody odpowiednia liczba naklejek jest
                  odejmowana z salda. Klient może zrezygnować z odbioru nagrody i
                  kontynuować zbieranie – zgodnie z opcjami w Serwisie.
                </li>
                <li>
                  Nagrody nie podlegają wymianie na ekwiwalent pieniężny ani inne
                  świadczenia niż przewidziane w zasadach Programu.
                </li>
                <li>
                  Administrator zastrzega sobie prawo do zmiany zasad Programu
                  lub jego zakończenia, z poszanowaniem praw Klientów, którzy
                  spełnili warunki odbioru nagrody przed wejściem zmian w życie.
                </li>
              </ul>

              <h2>10. Reklamacje</h2>

              <ul>
                <li>
                  Klient ma prawo złożyć reklamację dotyczącą w szczególności:
                  jakości posiłków, niezgodności Zamówienia z Umową, opóźnienia
                  w Dostawie lub innych nieprawidłowości.
                </li>
                <li>
                  Reklamacje można składać bezpośrednio w Restauracji albo za
                  pośrednictwem adresu e-mail:{" "}
                  <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. W zgłoszeniu
                  należy wskazać co najmniej numer Zamówienia, datę oraz opis
                  zastrzeżeń.
                </li>
                <li>
                  Reklamacje rozpatrywane są niezwłocznie, nie później niż w
                  terminie 14 dni od dnia jej otrzymania. O wyniku reklamacji
                  Klient informowany jest telefonicznie lub e-mailowo.
                </li>
              </ul>

              <h2>11. Dane osobowe i cookies</h2>

              <ul>
                <li>
                  Administratorem danych osobowych Klientów jest{" "}
                  <strong>{LEGAL.legalName}</strong>. Zasady przetwarzania danych
                  osobowych oraz wykorzystywania plików cookies zostały opisane w
                  odrębnych dokumentach:{" "}
                  <a href="/polityka-prywatnosci">Polityce prywatności</a> oraz{" "}
                  <a href="/polityka-cookies">Polityce cookies</a>.
                </li>
                <li>
                  Korzystanie z Serwisu wymaga akceptacji niezbędnych plików
                  cookies. Klient może zarządzać zgodami na dodatkowe kategorie
                  cookies za pośrednictwem banera zgody.
                </li>
              </ul>

              <h2>12. Postanowienia końcowe</h2>

              <ul>
                <li>
                  W sprawach nieuregulowanych Regulaminem zastosowanie mają
                  przepisy prawa polskiego, w szczególności Kodeksu cywilnego oraz
                  przepisy dotyczące praw konsumenta.
                </li>
                <li>
                  Regulamin może ulegać zmianom, w szczególności z uwagi na
                  zmiany funkcjonalności Serwisu lub przepisów prawa. O istotnych
                  zmianach Klienci będą informowani poprzez Serwis.
                </li>
                <li>
                  Zmieniony Regulamin wiąże Klienta, jeżeli został prawidłowo
                  powiadomiony o zmianach, a po ich wejściu w życie nadal korzysta z
                  Serwisu lub składa Zamówienia.
                </li>
                <li>
                  Aktualna wersja Regulaminu jest dostępna w Serwisie pod adresem{" "}
                  <a href="/regulamin">/regulamin</a>.
                </li>
              </ul>

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
