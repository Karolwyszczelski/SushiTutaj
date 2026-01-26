import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Manrope, Kaisei_Tokumin } from "next/font/google";
import ClientWrapper from "@/components/ClientWrapper";
import ClientProvider from "@/components/ClientProvider";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/legal/CookieBanner";
import AuthCookieSync from "@/components/AuthCookieSync";
import AuthToast from "@/components/AuthToast";
import ResetPasswordToast from "@/components/ResetPasswordToast";

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
  alternates: {
    canonical: "/",
    languages: { "pl-PL": "/" },
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png", // ikona iOS / PWA
  },
  openGraph: {
    type: "website",
    url: "/", // dzięki metadataBase zrobi się pełny adres
    siteName: "SUSHI Tutaj",
    title: "SUSHI Tutaj – zamów sushi online",
    description:
      "Wybierz restaurację SUSHI Tutaj w swoim mieście i zamów świeże sushi online.",
    images: [
      {
        url: "/og/sushi-og.jpg",
        width: 1200,
        height: 630,
        alt: "SUSHI Tutaj – zestaw sushi",
      },
    ],
    locale: "pl_PL",
  },
  twitter: {
    card: "summary_large_image",
    title: "SUSHI Tutaj – zamów sushi online",
    description:
      "Wybierz restaurację SUSHI Tutaj w swoim mieście i zamów świeże sushi online.",
    images: ["/og/sushi-og.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, notranslate: true },
  },
  manifest: "/manifest.webmanifest",
};

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const display = Kaisei_Tokumin({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className="h-full overflow-x-hidden">
      <body
        className={`${sans.variable} ${display.variable} bg-black text-black min-h-dvh antialiased overflow-x-hidden max-w-screen`}
      >
        <ClientProvider>
          <ClientWrapper>
            <AuthCookieSync />
            <AuthToast />
            <Suspense fallback={null}>
              <ResetPasswordToast />
            </Suspense>
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
