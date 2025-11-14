import type { Metadata } from "next";
import VerifyClient from "./Client";

export const metadata: Metadata = {
  title: "Weryfikacja",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false, noimageindex: true } },
};

export default function Page() {
  return <VerifyClient />;
}
