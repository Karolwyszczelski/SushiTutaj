export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Regulamin konkursu walentynkowego – Sushi Tutaj",
  description:
    "Regulamin konkursu „Walentynkowe Emoji Love” – zasady udziału, nagrody, dane osobowe i reklamacje.",
  alternates: { canonical: "/regulamin/konkursu-walentynkowy" },
  robots: { index: true, follow: true },
};

export default function ValentinesContestTermsPage() {
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
            Regulamin konkursu Facebook „Walentynkowe Emoji Love”.
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
              <h1>REGULAMIN KONKURSU „WALENTYNKOWE EMOJI LOVE”</h1>

              <h2>§ 1. Postanowienia ogólne i definicje</h2>
              <ol>
                <li>
                  Niniejszy regulamin (dalej: „Regulamin”) określa warunki,
                  zasady oraz tryb przeprowadzania konkursu pod nazwą
                  „Walentynkowe Emoji Love” (dalej: „Konkurs”).
                </li>
                <li>
                  Organizatorem Konkursu i fundatorem nagród jest **** z siedzibą
                  w [Miejscowość], przy ul. [Ulica i numer], kod pocztowy
                  [XX-XXX], wpisana do Rejestru Przedsiębiorców KRS pod numerem:
                  / CEIDG, posiadająca NIP:, REGON: (dalej: „Organizator”).
                </li>
                <li>
                  Konkurs prowadzony jest na terytorium Rzeczypospolitej Polskiej
                  za pośrednictwem serwisu społecznościowego Facebook, na
                  oficjalnym fanpage’u Organizatora dostępnym pod adresem: ****
                  (dalej: „Fanpage”).
                </li>
                <li>
                  Konkurs rozpoczyna się w dniu **** z chwilą publikacji posta
                  konkursowego i trwa do dnia **** do godziny 23:59 (dalej:
                  „Czas Trwania Konkursu”).
                </li>
                <li>
                  Konkurs nie jest grą losową, loterią fantową, zakładem
                  wzajemnym, loterią promocyjną, grą, której wynik zależy od
                  przypadku, ani żadną inną formą przewidzianą w Ustawie z dnia
                  19 listopada 2009 r. o grach hazardowych. Wynik Konkursu
                  zależy wyłącznie od oceny merytorycznej Zadania Konkursowego
                  przez Komisję Konkursową.
                </li>
                <li>
                  Zwolnienie z odpowiedzialności platformy Meta: Konkurs nie jest
                  w żaden sposób sponsorowany, popierany, administrowany ani
                  powiązany z serwisem Facebook (Meta Platforms, Inc.). Wszelkie
                  informacje przekazywane przez Uczestnika w ramach Konkursu są
                  powierzane Organizatorowi, a nie serwisowi Facebook. Serwis
                  Facebook jest w pełni zwolniony z odpowiedzialności za
                  przeprowadzenie Konkursu wobec każdego Uczestnika.
                </li>
              </ol>

              <h2>§ 2. Uczestnicy Konkursu</h2>
              <ol>
                <li>
                  Uczestnikiem Konkursu (dalej: „Uczestnik”) może być każda osoba
                  fizyczna, która łącznie spełnia następujące warunki: a)
                  ukończyła 18 lat i posiada pełną zdolność do czynności
                  prawnych; b) zamieszkuje na terytorium Rzeczypospolitej
                  Polskiej; c) posiada aktywne i prawdziwe konto w serwisie
                  Facebook (założone zgodnie z regulaminem Facebooka, zawierające
                  prawdziwe dane); d) zapoznała się z niniejszym Regulaminem i
                  akceptuje jego postanowienia.
                </li>
                <li>
                  W Konkursie nie mogą brać udziału pracownicy i współpracownicy
                  Organizatora oraz członkowie ich najbliższych rodzin (wstępni,
                  zstępni, rodzeństwo, małżonkowie, osoby pozostające w stosunku
                  przysposobienia).
                </li>
                <li>
                  Udział w Konkursie jest dobrowolny i całkowicie nieodpłatny.
                  Uczestnictwo nie wymaga zakupu żadnych towarów ani usług.
                </li>
              </ol>

              <h2>§ 3. Zasady i zadanie konkursowe</h2>
              <ol>
                <li>
                  Warunkiem wzięcia udziału w Konkursie jest wykonanie w Czasie
                  Trwania Konkursu zadania konkursowego (dalej: „Zadanie
                  Konkursowe”), które polega na: „Opublikowaniu pod postem
                  konkursowym na Fanpage’u komentarza, w którym Uczestnik opisuje
                  swoje plany na Walentynki (rzeczywiste lub wymarzone),
                  wykorzystując do tego wyłącznie ciąg emotikon (emoji).”
                </li>
                <li>Zadanie Konkursowe musi być wynikiem własnej twórczości Uczestnika.</li>
                <li>
                  Każdy Uczestnik może zgłosić tylko jedno Zadanie Konkursowe
                  (jeden komentarz). W przypadku dodania wielu komentarzy przez
                  tego samego Uczestnika, ocenie Komisji podlegać będzie jedynie
                  pierwszy opublikowany komentarz.
                </li>
                <li>
                  Niedopuszczalne jest zamieszczanie treści, które: a) naruszają
                  prawo powszechnie obowiązujące, dobra osobiste lub prawa
                  autorskie osób trzecich; b) zawierają wulgaryzmy, treści
                  obraźliwe, dyskryminujące, nawołujące do nienawiści lub
                  przemocy; c) są sprzeczne z dobrymi obyczajami lub zasadami
                  współżycia społecznego; d) stanowią reklamę innych podmiotów.
                </li>
                <li>
                  Organizator zastrzega sobie prawo do usuwania komentarzy
                  naruszających pkt 4 oraz do wykluczania ich autorów z udziału
                  w Konkursie.
                </li>
              </ol>

              <h2>§ 4. Komisja konkursowa i kryteria oceny</h2>
              <ol>
                <li>
                  Celem zapewnienia prawidłowego przebiegu Konkursu oraz
                  wyłonienia Zwycięzców, Organizator powołuje 3-osobową Komisję
                  Konkursową (dalej: „Komisja”).
                </li>
                <li>
                  Komisja dokona oceny zgłoszonych Prac Konkursowych po
                  zakończeniu Czasu Trwania Konkursu.
                </li>
                <li>
                  Wybór Zwycięzców nastąpi w oparciu o subiektywną ocenę Komisji,
                  według następujących kryteriów merytorycznych: a) Kreatywność
                  (pomysłowość w doborze i zestawieniu emotikon); b) Oryginalność
                  planu walentynkowego przedstawionego graficznie; c) Humor i
                  walory estetyczne przekazu.
                </li>
                <li>W Konkursie zostanie wyłonionych 3 (trzech) Zwycięzców.</li>
                <li>
                  Wybór zwycięzców nie jest dokonywany drogą losowania ani przy
                  użyciu żadnych mechanizmów losowych.
                </li>
                <li>
                  Z posiedzenia Komisji zostanie sporządzony protokół zawierający
                  listę Zwycięzców oraz uzasadnienie wyboru.
                </li>
              </ol>

              <h2>§ 5. Nagrody i podatki</h2>
              <ol>
                <li>
                  Nagrodami w Konkursie są: 3 x Zestaw Walentynkowy nr 1 (zestaw
                  produktów wybranych przez Organizatora) o wartości jednostkowej
                  **** zł brutto każdy.
                </li>
                <li>
                  Zwycięzcy nie przysługuje prawo do wymiany Nagrody na
                  ekwiwalent pieniężny ani na inną nagrodę rzeczową. Prawo do
                  Nagrody jest niezbywalne i nie może być przeniesione na osoby
                  trzecie.
                </li>
                <li>
                  Podatki (Klauzula zgodna z przepisami 2026 r.): W przypadku,
                  gdy wartość Nagrody przekracza kwotę zwolnioną z podatku,
                  Organizator przyznaje każdemu Zwycięzcy dodatkową nagrodę
                  pieniężną w wysokości 11,11% wartości Nagrody rzeczowej. Kwota
                  ta nie zostanie wypłacona Zwycięzcy, lecz zostanie potrącona
                  przez Organizatora jako płatnika na poczet zryczałtowanego
                  podatku dochodowego od osób fizycznych (10%), o którym mowa w
                  art. 30 ust. 1 pkt 2 Ustawy o podatku dochodowym od osób
                  fizycznych, i odprowadzona do właściwego Urzędu Skarbowego.
                  Dzięki temu Zwycięzca otrzymuje Nagrodę bez konieczności
                  ponoszenia dodatkowych kosztów podatkowych.
                </li>
                <li>
                  W przypadku nagród o niskiej wartości, które na podstawie
                  odrębnych przepisów korzystają ze zwolnienia podatkowego,
                  dodatkowa nagroda pieniężna nie jest przyznawana.
                </li>
              </ol>

              <h2>§ 6. Ogłoszenie wyników i wydanie nagród</h2>
              <ol>
                <li>
                  Wyniki Konkursu zostaną ogłoszone w dniu **** poprzez
                  opublikowanie posta wynikowego na Fanpage’u Organizatora lub
                  komentarza pod postem konkursowym, zawierającego oznaczenie
                  profili Zwycięzców.
                </li>
                <li>
                  Zwycięzcy zobowiązani są do skontaktowania się z Organizatorem
                  w wiadomości prywatnej (Messenger) na Fanpage’u w terminie 3
                  dni roboczych od dnia ogłoszenia wyników, w celu podania danych
                  niezbędnych do wysyłki Nagrody: a) Imię i Nazwisko; b) Dokładny
                  adres do wysyłki na terenie Polski; c) Numer telefonu (dla
                  kuriera).
                </li>
                <li>
                  Niedotrzymanie terminu kontaktu lub odmowa podania danych
                  skutkuje utratą prawa do Nagrody. W takim przypadku Nagroda
                  pozostaje własnością Organizatora.
                </li>
                <li>
                  Nagrody zostaną wysłane na koszt Organizatora przesyłką
                  kurierską lub pocztową w terminie 14 dni od daty otrzymania
                  kompletnych danych od Zwycięzcy.
                </li>
                <li>
                  Organizator nie ponosi odpowiedzialności za niemożność
                  dostarczenia Nagrody z przyczyn leżących po stronie Zwycięzcy
                  (np. podanie błędnego adresu).
                </li>
              </ol>

              <h2>§ 7. Prawa autorskie</h2>
              <ol>
                <li>
                  Z chwilą zamieszczenia Zadania Konkursowego (komentarza)
                  Uczestnik oświadcza, że jest jego wyłącznym autorem i posiada
                  do niego pełne prawa autorskie (jeśli dotyczy), a treść nie
                  narusza praw osób trzecich.
                </li>
                <li>
                  Uczestnik udziela Organizatorowi nieodpłatnej, niewyłącznej,
                  nieograniczonej terytorialnie i czasowo licencji na wykorzystanie
                  treści Zadania Konkursowego w celach związanych z realizacją i
                  promocją Konkursu. Licencja obejmuje prawo do: utrwalania,
                  zwielokrotniania, publicznego udostępniania w sieci Internet
                  (w tym na Fanpage’u i stronie www Organizatora), w szczególności
                  w celu ogłoszenia wyników Konkursu.
                </li>
              </ol>

              <h2>§ 8. Ochrona danych osobowych (RODO)</h2>
              <p>
                Na podstawie art. 13 RODO (Rozporządzenie Parlamentu Europejskiego
                i Rady (UE) 2016/679) informujemy, że:
              </p>
              <ol>
                <li>
                  Administrator: Administratorem danych osobowych Uczestników jest
                  Organizator (dane w § 1 ust. 2 Regulaminu).
                </li>
                <li>
                  Cel i podstawa: Dane przetwarzane będą w celu: a) Przeprowadzenia
                  Konkursu i wyłonienia Zwycięzców (art. 6 ust. 1 lit. f RODO –
                  prawnie uzasadniony interes Administratora w postaci marketingu
                  i budowania społeczności); b) Wydania nagród i realizacji
                  obowiązków podatkowych (art. 6 ust. 1 lit. c RODO – obowiązek
                  prawny); c) Rozpatrywania reklamacji i obrony przed roszczeniami
                  (art. 6 ust. 1 lit. f RODO).
                </li>
                <li>
                  Odbiorcy: Dane Zwycięzców mogą być przekazane firmie kurierskiej
                  w celu dostarczenia nagrody. Dane publikowane na Facebooku są
                  przetwarzane również przez Meta Platforms Ireland Ltd. na
                  zasadach określonych w regulaminie serwisu Facebook.
                </li>
                <li>
                  Okres przechowywania: Dane będą przechowywane przez okres
                  trwania Konkursu i czas niezbędny do rozpatrzenia reklamacji.
                  Dane Zwycięzców (dokumentacja podatkowa/potwierdzenie odbioru)
                  będą przechowywane przez 5 lat, licząc od końca roku
                  kalendarzowego, w którym upłynął termin płatności podatku.
                </li>
                <li>
                  Prawa: Uczestnik posiada prawo dostępu do treści swoich danych,
                  ich sprostowania, usunięcia, ograniczenia przetwarzania oraz
                  wniesienia sprzeciwu. Uczestnik ma prawo wniesienia skargi do
                  Prezesa Urzędu Ochrony Danych Osobowych.
                </li>
                <li>
                  Dobrowolność: Podanie danych jest dobrowolne, ale niezbędne do
                  wzięcia udziału w Konkursie (nazwa profilu) i odbioru Nagrody
                  (dane adresowe).
                </li>
              </ol>

              <h2>§ 9. Reklamacje</h2>
              <ol>
                <li>
                  Wszelkie reklamacje dotyczące Konkursu można zgłaszać pisemnie
                  na adres siedziby Organizatora lub mailowo na adres: **** w
                  terminie 14 dni od daty zakończenia Konkursu.
                </li>
                <li>
                  Reklamacja powinna zawierać imię, nazwisko, nazwę profilu
                  Uczestnika oraz dokładny opis i powód reklamacji.
                </li>
                <li>
                  Reklamacje rozpatrywane będą w terminie 14 dni od ich
                  otrzymania. O decyzji Organizatora Uczestnik zostanie
                  powiadomiony w formie, w jakiej zgłosił reklamację.
                </li>
              </ol>

              <h2>§ 10. Postanowienia końcowe</h2>
              <ol>
                <li>
                  Niniejszy Regulamin jest jedynym dokumentem określającym zasady
                  Konkursu. Wszelkie materiały promocyjno-reklamowe mają jedynie
                  charakter informacyjny.
                </li>
                <li>
                  W sprawach nieuregulowanych niniejszym Regulaminem zastosowanie
                  mają odpowiednie przepisy prawa polskiego, w szczególności
                  Kodeksu Cywilnego.
                </li>
                <li>Regulamin wchodzi w życie z dniem publikacji posta konkursowego.</li>
              </ol>
            </article>
          </div>
        </div>
      </div>
    </main>
  );
}
