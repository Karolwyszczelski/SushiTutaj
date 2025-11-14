// src/lib/e-mail.ts
import { Resend } from "resend";

const FROM = process.env.MAIL_FROM || "no-reply@yourdomain.tld";

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

/** Wspólny mailer. Bez klucza RESEND – ciche pominięcie. */
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
  if (!process.env.RESEND_API_KEY) return; // brak klucza -> pomiń

  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: from || FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
    bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
    reply_to: replyTo ? (Array.isArray(replyTo) ? replyTo : [replyTo]) : undefined,
  } as any);
}

/** Opcjonalny wrapper do “zamówienie przyjęte”. */
export async function sendOrderAcceptedEmail(
  to: string,
  p: { name: string; minutes: number; timeStr: string; mode: string }
) {
  if (!process.env.RESEND_API_KEY) return;

  const modePL = p.mode === "delivery" ? "dostawy" : p.mode === "local" ? "na miejscu" : "na wynos";
  const html = `
    <p>Dzień dobry ${p.name},</p>
    <p>Twoje zamówienie zostało <b>przyjęte</b>.</p>
    <p>Szacowany czas ${modePL}: <b>${p.minutes} min</b> (ok. ${p.timeStr}).</p>
    <p>Dziękujemy za zamówienie.</p>
  `;
  await sendEmail({ to, subject: "Zamówienie przyjęte", html });
}
