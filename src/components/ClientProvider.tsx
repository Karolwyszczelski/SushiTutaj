"use client";

import { SessionProvider } from "@/contexts/SessionContext";

export default function ClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  );
}
