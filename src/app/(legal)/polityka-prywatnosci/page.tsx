import { LEGAL } from "@/config/legal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polityka prywatności – Sushi Tutaj",
  description: "Zasady przetwarzania danych osobowych w Sushi Tutaj: administrator, cele, podstawy prawne i prawa użytkownika.",
  alternates: { canonical: "/polityka-prywatnosci" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-6 pt-28 pb-16">
        <article className="prose prose-invert prose-lg prose-a:text-yellow-300 hover:prose-a:text-yellow-200 prose-hr:border-neutral-700">
          <h1>Polityka prywatności</h1>

          <p>
            Administratorem danych osobowych jest <b>{LEGAL.legalName}</b>, NIP {LEGAL.nip}, REGON {LEGAL.regon}, adres rejestrowy: {LEGAL.registeredAddress}.
            Kontakt: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.       
          </p>
    
          <h2>1) Podstawy prawne i cele przetwarzania</h2>
          <ul>
            <li><b>Realizacja zamówień</b> – art. 6 ust. 1 lit. b RODO (umowa); dane: imię, telefon, e-mail, adres dostawy, treść zamówienia.</li>
            <li><b>Rozliczenia i podatki</b> – art. 6 ust. 1 lit. c RODO (obowiązek prawny); dane na dokumentach księgowych, terminy przechowywania wynikają z przepisów.</li>
            <li><b>Kontakt, bezpieczeństwo, dochodzenie roszczeń</b> – art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes).</li>
            <li><b>Marketing bezpośredni/newsletter</b> – art. 6 ust. 1 lit. a RODO (zgoda); możliwe do odwołania w każdym czasie.</li>
          </ul>

          <h2>2) Kategorie danych</h2>
          <ul>
            <li>Dane identyfikacyjne i kontaktowe (imię, telefon, e-mail); dane adresowe (ulica, numer, kod, miejscowość).</li>
            <li>Dane transakcyjne (pozycje zamówienia, cena, status płatności). <b>Uwaga:</b> nie przetwarzamy w Serwisie pełnych danych kart płatniczych – obsługuje je operator płatności.</li>
            <li>Dane techniczne (logi serwera, identyfikatory cookies, adres IP, dane urządzenia) – dla bezpieczeństwa i statystyki.</li>
          </ul>

          <h2>3) Odbiorcy danych</h2>
          <ul>
            <li>Dostawcy hostingu/IT, poczty e-mail i SMS (w zakresie obsługi notyfikacji).</li>
            <li>Supabase – backend i uwierzytelnianie (hosting danych w UE lub przy odpowiednich zabezpieczeniach).</li>
            <li>Operator płatności (np. PayPro S.A. – Przelewy24) – w zakresie realizacji płatności.</li>
            <li>Biuro rachunkowe, doradcy prawni – w zakresie niezbędnym do rozliczeń/obsługi prawnej.</li>
            <li>Dostawcy narzędzi analitycznych i cookies – zgodnie z <a href="/polityka-cookies">Polityką cookies</a>.</li>
          </ul>

          <h2>4) Przekazywanie poza EOG</h2>
          <p>
            Jeżeli konkretny dostawca przetwarza dane poza EOG, zapewniamy podstawę legalności (np. standardowe klauzule umowne)
            oraz dodatkowe środki bezpieczeństwa (szyfrowanie, minimalizacja danych).
          </p>

          <h2>5) Okresy przechowywania</h2>
          <ul>
            <li>Dane zamówień i rozliczeń – przez okres przewidziany przepisami podatkowymi i rachunkowymi (co do zasady 5 lat podatkowych).</li>
            <li>Korespondencja i logi techniczne – do 12 miesięcy, chyba że dłuższy okres jest niezbędny do ustalenia/doch. roszczeń.</li>
            <li>Konto użytkownika – do czasu usunięcia; newsletter/marketing – do odwołania zgody.</li>
          </ul>

          <h2>6) Prawa osób, których dane dotyczą</h2>
          <ul>
            <li>dostępu do danych, ich sprostowania, usunięcia („prawo do bycia zapomnianym”), ograniczenia przetwarzania, przenoszenia danych,</li>
            <li>sprzeciwu wobec przetwarzania (w tym marketingu bezpośredniego),</li>
            <li>wniesienia skargi do Prezesa UODO (ul. Stawki 2, 00-193 Warszawa, <a href="https://uodo.gov.pl" target="_blank" rel="noopener noreferrer">uodo.gov.pl</a>).</li>
          </ul>

          <h2>7) Dobrowolność podania danych</h2>
          <p>
            Podanie danych jest dobrowolne, ale niezbędne do realizacji zamówienia. W zakresie marketingu – dobrowolne i
            zależne od zgody, którą można w każdej chwili wycofać (bez wpływu na zgodność wcześniejszego przetwarzania).
          </p>

          <h2>8) Zautomatyzowane podejmowanie decyzji</h2>
          <p>
            Nie podejmujemy wobec Ciebie decyzji wyłącznie w oparciu o zautomatyzowane przetwarzanie, w tym profilowanie,
            wywołujące skutki prawne lub w podobny sposób istotnie na Ciebie wpływające.
          </p>

          <h2>9) Cookies i podobne technologie</h2>
          <p>
            Szczegóły wykorzystania cookies (rodzaje, cele, okresy) i mechanizmu zgody opisuje{" "}
            <a href="/polityka-cookies">Polityka cookies</a>. Baner zgody pozwala zaakceptować lub odrzucić kategorie nieobowiązkowe.
          </p>

          <h2>10) Kontakt w sprawach danych</h2>
          <p>
            Wszelkie żądania i pytania dotyczące danych osobowych prosimy kierować na:{" "}
            <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
          </p>

          <hr />
          <p className="text-sm opacity-70">
            Wersja polityki: {LEGAL.docsVersion} · obowiązuje od: {LEGAL.effectiveDate}.
          </p>
        </article>
      </div>
    </main>
  );
}
