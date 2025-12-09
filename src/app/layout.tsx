import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Manrope, Kaisei_Tokumin } from "next/font/google";
import ClientWrapper from "@/components/ClientWrapper";
import ClientProvider from "@/components/ClientProvider";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/legal/CookieBanner";
import AuthCookieSync from "@/components/AuthCookieSync";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://www.sushitutaj.pl";



export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: { default: "SUSHI Tutaj", template: "%s | SUSHI Tutaj" },
  description: "Wybierz restaurację i zamów sushi. Dostawa i odbiór osobisty.",
  alternates: { languages: { "pl-PL": "/" } },
  icons: { icon: "/favicon.ico", apple: "/sushi.png" },
  openGraph: {
    type: "website",
    url: BASE,
    siteName: "SUSHI Tutaj",
    title: "SUSHI Tutaj",
    description: "Wybierz restaurację i zamów sushi. Dostawa i odbiór osobisty.",
    images: [{ url: "/og/sushi-og.jpg", width: 1200, height: 630, alt: "SUSHI Tutaj" }],
    locale: "pl_PL",
  },
  twitter: { card: "summary_large_image", title: "SUSHI Tutaj", description: "Wybierz restaurację i zamów sushi.", images: ["/og-cover.jpg"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, notranslate: true } },
};

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Kaisei_Tokumin({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className="h-full overflow-x-hidden">
      <body
        className={`${sans.variable} ${display.variable} bg-black text-black min-h-dvh antialiased overflow-x-hidden max-w-screen`}
      >
        <ClientProvider>
          <ClientWrapper>
            <AuthCookieSync />
            {children}
          </ClientWrapper>
        </ClientProvider>
        <Footer />
        <CookieBanner />

        <noscript>
          <style>{`html{scroll-behavior:auto}`}</style>
        </noscript>
      </body>
    </html>
  );
}
