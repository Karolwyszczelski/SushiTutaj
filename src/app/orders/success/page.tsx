// src/app/order/[id]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type NormalizedStatus =
  | "new"
  | "pending"
  | "placed"
  | "accepted"
  | "completed"
  | "cancelled";

type FulfillOption = "takeaway" | "delivery" | null;

type OrderRow = {
  id: string;
  created_at: string;
  status: string | null;
  selected_option: FulfillOption;
  total_price: number | null;
  client_delivery_time: string | null;
  deliveryTime: string | null;
  restaurant_slug: string | null;
  payment_method: string | null;
  payment_status: string | null;
  name: string | null;
};

function normalizeStatus(raw: any): NormalizedStatus {
  const s0 = String(raw || "").toLowerCase();

  const map: Record<string, NormalizedStatus> = {
    pending: "pending",
    created: "new",
    confirmed: "accepted",
    processing: "accepted",
    inprogress: "accepted",
    done: "completed",
    delivered: "completed",
    canceled: "cancelled",
  };

  const s = map[s0] ?? (s0 as NormalizedStatus);

  if (
    s === "new" ||
    s === "pending" ||
    s === "placed" ||
    s === "accepted" ||
    s === "completed" ||
    s === "cancelled"
  ) {
    return s;
  }
  return "new";
}

function statusLabel(status: NormalizedStatus): string {
  switch (status) {
    case "new":
    case "pending":
    case "placed":
      return "Czekamy na potwierdzenie lokalu";
    case "accepted":
      return "Zamówienie jest w przygotowaniu";
    case "completed":
      return "Zamówienie zostało zrealizowane";
    case "cancelled":
      return "Zamówienie zostało anulowane";
  }
}

function statusDescription(
  status: NormalizedStatus,
  option: FulfillOption
): string {
  const where =
    option === "delivery"
      ? "kurier dostarczy je pod wskazany adres"
      : "będzie czekało na odbiór w lokalu";

  switch (status) {
    case "new":
    case "pending":
    case "placed":
      return `Zamówienie zostało wysłane do restauracji i czeka na akceptację. Po potwierdzeniu zobaczysz tutaj przewidywany czas realizacji.`;
    case "accepted":
      return `Ekipa kuchni przygotowuje Twoje zamówienie – ${where}.`;
    case "completed":
      return option === "delivery"
        ? "Zamówienie zostało oznaczone jako zrealizowane. Jeśli jeszcze do Ciebie jedzie, kurier powinien być już bardzo blisko."
        : "Zamówienie zostało oznaczone jako zrealizowane – powinno być już odebrane z lokalu.";
    case "cancelled":
      return "Zamówienie zostało anulowane. Jeśli nie wiesz dlaczego, skontaktuj się bezpośrednio z restauracją.";
  }
}

function cityLabel(slug?: string | null): string {
  const s = (slug || "").toLowerCase();
  if (s === "ciechanow") return "Ciechanów";
  if (s === "przasnysz") return "Przasnysz";
  if (s === "szczytno") return "Szczytno";
  return "SUSHI Tutaj";
}

function optionLabel(opt: FulfillOption): string {
  if (opt === "delivery") return "Dostawa";
  return "Odbiór osobisty";
}

function formatTimeLabel(v?: string | null): string {
  if (!v) return "–";
  const val = v.trim();
  if (val === "asap") return "Jak najszybciej";

  const m = val.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h < 24 && min >= 0 && min < 60) {
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }

  const dt = new Date(val);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleTimeString("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return "–";
}

function paymentMethodLabel(method: string | null): string {
  const m = (method || "").toLowerCase();
  if (m === "online") return "Płatność online";
  if (m === "terminal") return "Karta / terminal w lokalu";
  return "Gotówka przy odbiorze";
}

function paymentStatusLabel(status: string | null): string {
  const s = (status || "").toLowerCase();
  if (!s || s === "unpaid") return "do zapłaty przy odbiorze";
  if (s === "paid") return "opłacone";
  if (s === "pending") return "płatność w toku";
  if (s === "failed") return "błąd płatności";
  return s;
}

type PageProps = {
  params: { id: string };
};

export default async function OrderTrackingPage({ params }: PageProps) {
  const orderId = params.id;

  let order: OrderRow | null = null;

  try {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        `
        id,
        created_at,
        status,
        selected_option,
        total_price,
        client_delivery_time,
        deliveryTime,
        restaurant_slug,
        payment_method,
        payment_status,
        name
      `
      )
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      console.error("[order-tracking] select error:", error.message);
    } else {
      order = (data as OrderRow) ?? null;
    }
  } catch (e) {
    console.error("[order-tracking] unexpected error:", e);
  }

  if (!order) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center text-slate-100">
        <h1 className="mb-3 text-2xl font-semibold">
          Nie znaleziono zamówienia
        </h1>
        <p className="text-sm text-slate-300">
          Sprawdź, czy link z e-maila jest kompletny. Jeśli problem się
          powtarza, skontaktuj się bezpośrednio z restauracją.
        </p>
      </main>
    );
  }

  const normStatus = normalizeStatus(order.status);
  const statusMain = statusLabel(normStatus);
  const statusText = statusDescription(normStatus, order.selected_option);
  const city = cityLabel(order.restaurant_slug);
  const shortId = order.id.slice(0, 8);

  const createdLabel = new Date(order.created_at).toLocaleString("pl-PL");
  const clientTime = formatTimeLabel(order.client_delivery_time);
  const localTime = order.deliveryTime ? formatTimeLabel(order.deliveryTime) : "–";

  const total = Number(order.total_price || 0)
    .toFixed(2)
    .replace(".", ",");

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-10 text-slate-50">
      <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-xl backdrop-blur">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
          <div>
            Restauracja:{" "}
            <span className="font-semibold text-zinc-100">{city}</span>
          </div>
          <div>
            Nr zamówienia:{" "}
            <span className="font-mono text-zinc-100">#{shortId}</span>
          </div>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
          Status zamówienia
        </h1>
        <p className="mt-1 text-sm text-zinc-300">{statusMain}</p>

        <div className="mt-4 rounded-2xl bg-zinc-900/80 p-4 text-sm text-zinc-200">
          {statusText}
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm text-zinc-200 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Data złożenia
            </dt>
            <dd className="mt-1">{createdLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Kwota
            </dt>
            <dd className="mt-1 font-medium">{total} zł</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Opcja
            </dt>
            <dd className="mt-1">{optionLabel(order.selected_option)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Czas wybrany przez Ciebie
            </dt>
            <dd className="mt-1">{clientTime}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Czas podany przez lokal
            </dt>
            <dd className="mt-1">
              {localTime === "–"
                ? "Restauracja jeszcze nie podała dokładnego czasu."
                : localTime}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Płatność
            </dt>
            <dd className="mt-1">
              {paymentMethodLabel(order.payment_method)}{" "}
              <span className="block text-xs text-zinc-400">
                Status: {paymentStatusLabel(order.payment_status)}
              </span>
            </dd>
          </div>
          {order.name && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Imię podane w zamówieniu
              </dt>
              <dd className="mt-1">{order.name}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xs text-[11px] leading-snug text-zinc-500">
            Jeśli coś się nie zgadza ze statusem zamówienia, skontaktuj się
            telefonicznie z wybraną restauracją. Ten link służy tylko do
            podglądu postępu realizacji.
          </p>
          <Link
            href={`/order/${orderId}?r=${Date.now()}`}
            className="inline-flex items-center justify-center rounded-full bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-200"
          >
            Odśwież status
          </Link>
        </div>
      </div>
    </main>
  );
}
