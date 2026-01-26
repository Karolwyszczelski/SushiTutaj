// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://e90990201d407b7590f2a643aca34abd@o4510669955268608.ingest.de.sentry.io/4510669956448336",

  // Produkcja: 10% traces, dev: 100%
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
  
  // Ignoruj błędy sieciowe i nieistotne błędy
  ignoreErrors: [
    // Błędy sieciowe
    "TypeError: Failed to fetch",
    "TypeError: NetworkError when attempting to fetch resource",
    "TypeError: Load failed",
    "Failed to fetch",
    "Load failed",
    "AbortError",
    // Typowe błędy
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    // Błędy auth/sesji
    "Auth session missing",
    "Invalid Refresh Token",
    "Refresh Token Not Found",
  ],

  // Tylko w produkcji wysyłaj
  enabled: process.env.NODE_ENV === "production",
});
