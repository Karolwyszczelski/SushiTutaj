import Sidebar from "@/components/sidebar";
import CookieBanner from "@/components/CookieBanner";
import type { Metadata } from "next";
//…

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <CookieBanner />
      <main className="flex-1 bg-gray-50 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
