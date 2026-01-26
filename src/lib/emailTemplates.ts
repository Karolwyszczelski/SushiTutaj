const BASE =
  (process.env.NEXT_PUBLIC_BASE_URL || "https://sushitutaj.pl").replace(
    /\/+$/,
    ""
  );

export function buildClientOrderCancelledEmail(options: {
  orderId: string;
  optionLabel: string; // np. "NA WYNOS" / "DOSTAWA"
  total: number;
  trackingUrl: string;
}) {
  const { orderId, optionLabel, total, trackingUrl } = options;

  return `
<!doctype html>
<html lang="pl">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Zamówienie ${orderId} zostało anulowane</title>
  </head>
  <body style="margin:0;padding:0;background-color:#111111;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#181818;border-radius:16px;padding:32px 28px;border:1px solid rgba(255,255,255,0.08);">
            <tr>
              <td align="center" style="padding-bottom:16px;">
                <img src="${BASE}/sushi.png" alt="SUSHI Tutaj" height="40" style="display:block;" />
              </td>
            </tr>
            <tr>
              <td style="font-size:22px;font-weight:700;padding-bottom:8px;text-align:center;">
                Zamówienie zostało anulowane
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;color:rgba(255,255,255,0.7);padding-bottom:24px;text-align:center;">
                Numer: <strong>#${orderId}</strong><br />
                Opcja: <strong>${optionLabel}</strong>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;text-align:center;">
                <a href="${trackingUrl}"
                   style="display:inline-block;padding:12px 24px;border-radius:999px;background-color:#de1d13;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
                  Sprawdź status zamówienia
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;color:rgba(255,255,255,0.7);padding-bottom:8px;text-align:center;">
                Łączna kwota zamówienia: <strong>${total.toFixed(2)} zł</strong>
              </td>
            </tr>
            <tr>
              <td style="font-size:11px;color:rgba(255,255,255,0.4);padding-top:24px;border-top:1px solid rgba(255,255,255,0.08);">
                Akceptując zamówienie, zaakceptowałeś aktualny regulamin i politykę prywatności SUSHI Tutaj.<br />
                Regulamin: <a href="${BASE}/regulamin" style="color:#ffffff;">link</a> ·
                Polityka prywatności: <a href="${BASE}/prywatnosc" style="color:#ffffff;">link</a> ·
                Polityka cookies: <a href="${BASE}/cookies" style="color:#ffffff;">link</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
