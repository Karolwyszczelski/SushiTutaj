// src/lib/sms.ts
export type SmsProvider = "smsapi" | "serwersms" | "none";

const PROVIDER = (process.env.SMS_PROVIDER || "smsapi").toLowerCase() as SmsProvider;

/** MSISDN PL: 48XXXXXXXXX (11 cyfr) */
function toMsisdnPL(raw: string): string | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;
  // 9 cyfr -> dodaj 48; 0048xxxxxxxxx -> 48xxxxxxxxx; +48xxxxxxxxx -> 48xxxxxxxxx
  if (d.length === 9) return "48" + d;
  if (d.startsWith("0048") && d.length === 13) return d.slice(2);
  if (d.startsWith("48") && d.length === 11) return d;
  // inne kraje/formaty – pozwól przejść, jeśli >= 10 cyfr
  return d.length >= 10 ? d : null;
}

/**
 * sendSms: wysyła SMS do jednego numeru. Zwraca true, gdy żądanie poszło, false gdy pominęliśmy.
 * Nie rzuca wyjątków (loguje i zwraca false), żeby nie blokować procesu.
 */
export async function sendSms(
  to: string | null | undefined,
  message: string
): Promise<boolean> {
  try {
    if (!to || !message || PROVIDER === "none") return false;

    const msisdn = toMsisdnPL(to);
    if (!msisdn) return false;

    if (PROVIDER === "smsapi") {
      const token = process.env.SMSAPI_TOKEN || "";
      if (!token) return false;

      // Na koncie TEST w SMSAPI dozwolony nadawca to "Test".
      // Produkcja: ustaw SMS_SENDER_ID (np. "SushiTutaj").
      const sender =
        process.env.SMS_SENDER_ID ||
        (process.env.NODE_ENV === "production" ? "" : "Test");

      // SMSAPI (x-www-form-urlencoded). Wymaga MSISDN bez plusa.
      const body = new URLSearchParams();
      body.set("to", msisdn);
      body.set("message", message);
      body.set("encoding", "utf-8"); // poprawne polskie znaki
      if (sender) body.set("from", sender);

      const res = await fetch("https://api.smsapi.pl/sms.do", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      const t = await res.text().catch(() => "");

      // SMSAPI potrafi zwrócić 200 z treścią "ERROR:xx"
      if (!res.ok || t.startsWith("ERROR")) {
        console.error("[sms] smsapi fail", res.status, t);
        return false;
      }

      return true;
    }

    if (PROVIDER === "serwersms") {
      const login = process.env.SERVERSMS_LOGIN || "";
      const password = process.env.SERVERSMS_PASSWORD || "";
      if (!login || !password) return false;

      const sender = process.env.SMS_SENDER_ID || "";

      // SerwerSMS przyjmuje numer z plusikiem
      const payload = {
        phone: `+${msisdn}`,
        text: message,
        sender, // jeśli skonfigurowany u operatora
      };

      const res = await fetch("https://api2.serwersms.pl/messages/send_sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            Buffer.from(`${login}:${password}`).toString("base64"),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.error("[sms] serwersms fail", res.status, t);
        return false;
      }
      return true;
    }

    return false;
  } catch (e: any) {
    console.error("[sms] unexpected", e?.message || e);
    return false;
  }
}
