import { LEGAL } from "@/config/legal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Regulamin – Sushi Tutaj",
  description: "Regulamin korzystania z serwisu i składania zamówień w Sushi Tutaj",
  alternates: { canonical: "/regulamin" },
  robots: { index: true, follow: true },
};

export default function RegulaminPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-6 pt-28 pb-16">
        <article className="prose prose-invert prose-lg prose-a:text-yellow-300 hover:prose-a:text-yellow-200 prose-hr:border-neutral-700">
          <h1>Regulamin świadczenia usług drogą elektroniczną i sprzedaży</h1>

          <p>
            Regulamin określa zasady korzystania z serwisu zamówień online {LEGAL.shortBrand} oraz warunki zawierania i realizacji umów
            sprzedaży na odległość. Operatorem Serwisu i Sprzedawcą jest <b>{LEGAL.legalName}</b>, NIP {LEGAL.nip}, REGON {LEGAL.regon}
            {LEGAL.krs ? <> , KRS {LEGAL.krs}</> : null}, z adresem rejestrowym: {LEGAL.registeredAddress}, lokal gastronomiczny: {LEGAL.restaurantAddress}.
            Kontakt: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
          </p>

          <h2>1) Definicje</h2>
          <ul>
            <li><b>Serwis</b> – strona/aplikacja internetowa umożliwiająca składanie zamówień.</li>
            <li><b>Sprzedawca/Operator</b> – {LEGAL.legalName}.</li>
            <li><b>Klient</b> – konsument lub przedsiębiorca składający zamówienie.</li>
            <li><b>Zamówienie</b> – oświadczenie woli Klienta, zmierzające do zawarcia umowy sprzedaży.</li>
            <li><b>Umowa</b> – umowa sprzedaży posiłków/napojów zawierana na odległość za pośrednictwem Serwisu.</li>
            <li><b>Płatność online</b> – obsługiwana przez zewnętrznego operatora płatności (np. Przelewy24/PayPro S.A.).</li>
          </ul>

          <h2>2) Postanowienia ogólne</h2>
          <ul>
            <li>Serwis działa zgodnie z prawem polskim i UE (m.in. UŚUDE, ustawa o prawach konsumenta, RODO).</li>
            <li>Minimalne wymagania techniczne: przeglądarka z włączonym JavaScriptem i cookies, aktywne połączenie internetowe.</li>
            <li>Zakazuje się dostarczania treści bezprawnych oraz podejmowania działań naruszających bezpieczeństwo Serwisu.</li>
          </ul>

          <h2>3) Konto i usługi elektroniczne</h2>
          <ul>
            <li>Konto w Serwisie jest opcjonalne. Zamówienie można złożyć także bez logowania.</li>
            <li>Usługi elektroniczne: formularz zamówienia, rejestracja/logowanie, newsletter (za zgodą).</li>
            <li>Umowa o świadczenie usług elektronicznych jest zawierana z chwilą skorzystania z funkcji Serwisu i rozwiązywana z chwilą ich opuszczenia lub usunięcia Konta.</li>
            <li>Użytkownik może w każdym czasie rozwiązać umowę o świadczenie usług elektronicznych (np. przez usunięcie Konta lub kontakt na {LEGAL.email}).</li>
          </ul>

          <h2>4) Składanie zamówień i zawarcie umowy</h2>
          <ol>
            <li>Klient wybiera produkty, opcję odbioru (NA WYNOS/na wynos/dostawa), podaje dane kontaktowe i wybiera metodę płatności.</li>
            <li>Po złożeniu zamówienia Klient otrzymuje potwierdzenie (e-mail) oraz – po akceptacji przez obsługę – informację o czasie realizacji.</li>
            <li>Umowa zostaje zawarta z chwilą akceptacji zamówienia przez obsługę (status „accepted”).</li>
            <li>W przypadku płatności online realizacja rozpoczyna się po potwierdzeniu przez operatora płatności.</li>
          </ol>

          <h2>5) Ceny, płatności i paragony/faktury</h2>
          <ul>
            <li>Ceny wyświetlane przy produktach są cenami brutto (zawierają podatki). Mogą zawierać opłaty dodatkowe (np. opakowanie, dostawa) – wskazywane w podsumowaniu.</li>
            <li>Dostępne metody płatności: gotówka, terminal, płatność online (operator płatności – według informacji w koszyku).</li>
            <li>Po sprzedaży wydawany jest paragon fiskalny w lokalu lub doręczany z zamówieniem; na życzenie wystawiana jest faktura (dane należy podać przed finalizacją).</li>
          </ul>

          <h2>6) Dostawa / odbiór</h2>
          <ul>
            <li>Dostawy realizowane są w wyznaczonym obszarze. Koszt i szacowany czas dostawy prezentowane są w Serwisie.</li>
            <li>Klient zobowiązany jest podać prawidłowy adres oraz numer telefonu. Brak kontaktu lub błędny adres mogą skutkować anulowaniem.</li>
            <li>W przypadku znacznego obłożenia czas realizacji może się wydłużyć; informujemy o tym niezwłocznie.</li>
          </ul>

          <h2>7) Zasady jakości i alergeny</h2>
          <ul>
            <li>Potrawy przygotowywane są na bieżąco. Informujemy, że w kuchni mogą być obecne alergeny (np. gluten, orzechy, mleko, jaja).</li>
            <li>W razie wątpliwości co do składników prosimy o kontakt przed złożeniem zamówienia.</li>
          </ul>

          <h2>8) Prawo odstąpienia (żywność)</h2>
          <p>
            Zgodnie z art. 38 pkt 4 ustawy o prawach konsumenta prawo odstąpienia od umowy zawartej na odległość
            nie przysługuje w odniesieniu do rzeczy ulegających szybkiemu zepsuciu lub mających krótki termin
            przydatności do użycia, a także towarów dostarczanych w zapieczętowanych opakowaniach po ich otwarciu.
            Zamówienia gastronomiczne co do zasady nie podlegają odstąpieniu po przygotowaniu.
          </p>

          <h2>9) Reklamacje</h2>
          <ul>
            <li>Reklamacje dotyczące zamówień należy składać niezwłocznie – najlepiej w dniu dostawy/odbioru – na adres {LEGAL.email}.</li>
            <li>W zgłoszeniu podaj numer zamówienia, opis zastrzeżeń i – jeśli to możliwe – dokumentację (np. zdjęcia).</li>
            <li>Odpowiadamy w terminie do 14 dni kalendarzowych. W razie uznania reklamacji – naprawa/wymiana, ponowna realizacja, obniżenie ceny lub zwrot środków (w przypadku płatności online – tą samą drogą).</li>
          </ul>

          <h2>10) Kody rabatowe i promocje</h2>
          <ul>
            <li>Kody rabatowe mają określony czas ważności, minimalną wartość zamówienia lub wyłączenia asortymentowe – zgodnie z komunikatem przy wydaniu kodu.</li>
            <li>Nie łączą się, o ile regulamin promocji nie stanowi inaczej.</li>
          </ul>

          <h2>11) Odpowiedzialność i zakaz nadużyć</h2>
          <ul>
            <li>Zakazane jest nadużywanie Serwisu, w tym składanie fikcyjnych zamówień, używanie cudzych danych, naruszanie praw osób trzecich.</li>
            <li>Operator zastrzega prawo do wstrzymania lub anulowania zamówienia w razie uzasadnionych wątpliwości co do prawidłowości danych lub płatności.</li>
          </ul>

          <h2>12) Dane osobowe</h2>
          <p>
            Administratorem danych jest {LEGAL.legalName}. Zasady przetwarzania opisuje{" "}
            <a href="/polityka-prywatnosci">Polityka prywatności</a>. Pliki cookies – zgodnie z{" "}
            <a href="/polityka-cookies">Polityką cookies</a>.
          </p>

          <h2>13) Pozasądowe rozwiązywanie sporów</h2>
          <p>
            Konsument może skorzystać z platformy ODR:{" "}
            <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
              ec.europa.eu/consumers/odr
            </a>{" "}
            oraz z pomocy lokalnego rzecznika konsumentów/UOKiK. Właściwe jest prawo polskie i sądy powszechne.
          </p>

          <h2>14) Postanowienia końcowe</h2>
          <ul>
            <li>Regulamin jest dostępny nieodpłatnie w Serwisie i może być pobrany/utrwalony przez Użytkownika.</li>
            <li>Zmiany Regulaminu wchodzą w życie z dniem publikacji i obowiązują na przyszłość; do zamówień złożonych wcześniej stosuje się wersję obowiązującą w dacie złożenia.</li>
          </ul>

          <hr />
          <p className="text-sm opacity-70">
            Wersja regulaminu: {LEGAL.docsVersion} · obowiązuje od: {LEGAL.effectiveDate}. Administrator: {LEGAL.legalName}, NIP {LEGAL.nip}.
          </p>
        </article>
      </div>
    </main>
  );
}
