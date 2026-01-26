// src/api/orders/create/_lib/notifyClient.ts
import { orderLogger } from "@/lib/logger";
import { sendEmail } from "@/lib/e-mail";
import { sendSms } from "@/lib/sms";
import {
  TERMS_VERSION,
  PRIVACY_VERSION,
  TERMS_URL,
  PRIVACY_URL,
} from "./clients";

const optLabel = (v?: string | null) =>
  v === "delivery" ? "DOSTAWA" : v === "takeaway" ? "NA WYNOS" : "NA WYNOS";

function formatPricePLN(totalPrice: unknown): string {
  if (typeof totalPrice === "number" && Number.isFinite(totalPrice)) {
    return totalPrice.toFixed(2).replace(".", ",");
  }
  return String(totalPrice ?? "0");
}

export async function notifyClientAfterCreate(args: {
  email?: string | null;
  phone?: string | null;
  orderRef: string; // public_id (preferowane) albo UUID fallback
  selectedOption?: string | null;
  totalPrice: unknown; // number albo string z DB
  trackingUrl: string;
}) {
  const { email, phone, orderRef, selectedOption, totalPrice, trackingUrl } =
    args;

  // 1) Email
  try {
    if (email) {
      const total = formatPricePLN(totalPrice);

      const html = `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111">
          <h2 style="margin:0 0 8px">Potwierdzenie zamówienia #${orderRef}</h2>
          <p style="margin:0 0 16px">Dziękujemy za zamówienie.</p>
          <p style="margin:16px 0">
            <a href="${trackingUrl}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;border-radius:8px;text-decoration:none">
              Sprawdź status i czas dostawy
            </a>
          </p>
          <p style="margin:8px 0">Kwota: <strong>${total} zł</strong></p>
          <p style="margin:8px 0">Opcja: <strong>${optLabel(
            selectedOption
          )}</strong></p>
          <hr style="margin:20px 0;border:none;border-top:1px solid #eee" />
          <p style="font-size:12px;color:#555;margin:0">
            Akceptacja: Regulamin v${TERMS_VERSION} (<a href="${TERMS_URL}">link</a>),
            Polityka prywatności v${PRIVACY_VERSION} (<a href="${PRIVACY_URL}">link</a>)
          </p>
        </div>
      `;

      await sendEmail({
        to: email,
        subject: `Potwierdzenie zamówienia #${orderRef}`,
        html,
      });
    }
  } catch (mailErr: any) {
    // Bez PII w logach
    orderLogger.error("email to client error", {
      error: mailErr?.message || mailErr,
    });
  }

  // 2) SMS
  try {
    if (phone) {
      const totalLabel = formatPricePLN(totalPrice);

      const msg =
        `Przyjęliśmy Twoje zamówienie #${orderRef}. Kwota: ${totalLabel} zł. ` +
        `Status/śledzenie: ${trackingUrl}`;

      await sendSms(phone, msg);
    }
  } catch {
    // celowo bez logów (PII i spam w logach)
  }
}
