// src/lib/e-mail.ts
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || "Sushi Tutaj <restauracja@sushitutaj.pl>";
const RESEND_URL = "https://api.resend.com/emails";

type SendArgs = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
};

/**
 * Wspólny mailer oparty o HTTP fetch do Resend.
 * Jeśli nie ma RESEND_API_KEY – logujemy ostrzeżenie i nic nie wysyłamy.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
  cc,
  bcc,
  replyTo,
}: SendArgs) {
  if (!RESEND_API_KEY) {
    console.warn("[email] Pomijam wysyłkę – brak RESEND_API_KEY");
    return;
  }

  const payload: any = {
    from: from || FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
  };

  if (html) payload.html = html;
  if (text) payload.text = text;
  if (cc) payload.cc = Array.isArray(cc) ? cc : [cc];
  if (bcc) payload.bcc = Array.isArray(bcc) ? bcc : [bcc];
  if (replyTo)
    payload.reply_to = Array.isArray(replyTo) ? replyTo : [replyTo];

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        "[email] Resend API error",
        res.status,
        res.statusText,
        body
      );
    }
  } catch (e) {
    console.error("[email] fetch error", e);
  }
}

/** Opcjonalny wrapper do „zamówienie przyjęte” (może być użyty w innych trasach) */
export async function sendOrderAcceptedEmail(
  to: string,
  p: { name: string; minutes: number; timeStr: string; mode: string }
) {
  if (!RESEND_API_KEY) {
    console.warn("[email] brak RESEND_API_KEY – pomijam sendOrderAcceptedEmail");
    return;
  }

  const modePL =
    p.mode === "delivery"
      ? "dostawy"
      : p.mode === "local"
      ? "na miejscu"
      : "na wynos";

  const html = `
    <p>Dzień dobry ${p.name},</p>
    <p>Twoje zamówienie zostało <b>przyjęte</b>.</p>
    <p>Szacowany czas ${modePL}: <b>${p.minutes} min</b> (ok. ${p.timeStr}).</p>
    <p>Dziękujemy za zamówienie.</p>
  `;

  await sendEmail({ to, subject: "Zamówienie przyjęte", html });
}
