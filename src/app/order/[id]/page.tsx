import type { Metadata } from "next";
import ClientOrderTrackPage from "./Client";

export const metadata: Metadata = {
  title: "Śledzenie zamówienia",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function Page() {
  return <ClientOrderTrackPage />;
}
