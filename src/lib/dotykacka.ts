// src/lib/dotykacka.ts

const CLIENT_ID     = process.env.DOTYKACKA_CLIENT_ID!;
const CLIENT_SECRET = process.env.DOTYKACKA_CLIENT_SECRET!;

export async function getDotykackaToken(): Promise<string> {
  const resp = await fetch("https://api.dotykacka.pl/v1/auth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept":       "application/json",
    },
    body: JSON.stringify({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    "client_credentials",
    }),
  });
  if (!resp.ok) throw new Error(`Token fetch failed: ${resp.status}`);
  const { access_token } = await resp.json();
  return access_token;
}

// przyklad uzycia:
export async function sendOrderToDotykacka(orderData: any) {
  const token = await getDotykackaToken();
  const resp = await fetch("https://api.dotykacka.pl/v1/orders", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(orderData),
  });
  if (!resp.ok) throw new Error(`Order POST failed: ${resp.status}`);
  return resp.json();
}
