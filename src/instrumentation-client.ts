// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://e90990201d407b7590f2a643aca34abd@o4510669955268608.ingest.de.sentry.io/4510669956448336",

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // WYŁĄCZONE: nie wysyłamy danych osobowych (IP, user agent) do Sentry
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: false,

  // Ignoruj błędy sieciowe i nieistotne błędy przeglądarki
  ignoreErrors: [
    // Błędy sieciowe (niestabilne połączenie użytkownika)
    "TypeError: Failed to fetch",
    "TypeError: NetworkError when attempting to fetch resource",
    "TypeError: Load failed",
    "TypeError: cancelled",
    "TypeError: Anulowane",
    "AbortError",
    "Network request failed",
    "Failed to fetch",
    "Load failed",
    // Chrome extension błędy
    "chrome-extension://",
    "moz-extension://",
    // Typowe błędy przeglądarki
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    // Błędy auth/sesji (normalne po dłuższym czasie nieaktywności)
    "Auth session missing",
    "Invalid Refresh Token",
    "Refresh Token Not Found",
  ],

  // Filtruj zdarzenia przed wysłaniem
  beforeSend(event, hint) {
    const error = hint.originalException;
    if (error && typeof error === "object" && "message" in error) {
      const msg = String((error as Error).message || "");
      // Ignoruj błędy sieciowe Supabase
      if (
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("Load failed") ||
        msg.includes("AbortError")
      ) {
        return null;
      }
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
