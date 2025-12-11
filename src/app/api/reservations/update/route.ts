export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import type { Database } from "@/types/supabase";
import { sendSms } from "@/lib/sms";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // bypass RLS
  {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

// prosty sender: Resend, a jeśli brak – SMTP URL z nodemailer
async function sendEmail(to: string, subject: string, html: string) {
  if (!to) return;

  const key = process.env.RESEND_API_KEY;
  if (key) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || "restauracja@sushitutaj.pl",
        to: [to],
        subject,
        html,
      }),
    });
    if (!r.ok) throw new Error("Resend error");
    return;
  }

  const url = process.env.SMTP_URL;
  if (url) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const nodemailerModule = await import("nodemailer");
    const nodemailer = (nodemailerModule as any).default ?? nodemailerModule;

    const transporter = (nodemailer as any).createTransport(url);
    await transporter.sendMail({
      from: process.env.MAIL_FROM || "restauracja@sushitutaj.pl",
      to,
      subject,
      html,
    });
  }
}

export async function POST(req: Request) {
  try {
    const { id, action, admin_note } = await req.json(); // action: 'accept' | 'cancel'

    if (!id || !["accept", "cancel"].includes(action)) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    // 1) Supabase auth – użytkownik musi być zalogowany
    const supabaseServer = createRouteHandlerClient<Database>({ cookies });

    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Nie jesteś zalogowany" },
        { status: 401 }
      );
    }

    // 2) restaurant_id z cookie ustawianego przez /api/restaurants/ensure-cookie
    const cookieStore = await cookies(); // tak samo jak w Twojej wcześniejszej wersji
    const cookieRestaurantId =
      cookieStore.get("restaurant_id")?.value ?? null;

    if (!cookieRestaurantId) {
      return NextResponse.json(
        {
          error:
            "Brak przypisanej restauracji (cookie restaurant_id). Otwórz panel z poziomu wybranego lokalu.",
        },
        { status: 403 }
      );
    }

    const restaurantId = cookieRestaurantId;

    // 3) pobierz rezerwację tylko z tej restauracji
    const { data: r, error: e1 } = await supabaseAdmin
      .from("reservations")
      .select(
        "id, name, email, phone, guests, note, reservation_date, reservation_time, restaurant_id, status"
      )
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    if (e1) throw e1;

    if (!r) {
      return NextResponse.json(
        {
          error:
            "Rezerwacja nie istnieje lub nie należy do restauracji przypisanej do tego konta admina",
        },
        { status: 404 }
      );
    }

    const update =
      action === "accept"
        ? {
            status: "accepted" as const,
            confirmed_at: new Date().toISOString(),
            admin_note: admin_note ?? null,
          }
        : {
            status: "cancelled" as const,
            admin_note: admin_note ?? null,
          };

    const { data: updated, error: e2 } = await supabaseAdmin
      .from("reservations")
      .update(update)
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .select("*")
      .maybeSingle();

    if (e2) throw e2;

    if (!updated) {
      return NextResponse.json(
        {
          error:
            "Nie udało się zaktualizować rezerwacji (być może została już usunięta)",
        },
        { status: 409 }
      );
    }

    // 4) e-mail do klienta
    const subject =
      action === "accept"
        ? "Potwierdzenie rezerwacji"
        : "Anulowanie rezerwacji";

    const when = `${r.reservation_date} ${String(r.reservation_time).slice(
      0,
      5
    )}`;

    const html =
      action === "accept"
        ? `<p>Dzień dobry ${r.name || ""},</p>
           <p>Potwierdzamy rezerwację na ${when} dla ${
             r.guests || 1
           } os.</p>
           <p>Do zobaczenia!</p>`
        : `<p>Dzień dobry ${r.name || ""},</p>
           <p>Rezerwacja na ${when} została anulowana.</p>
           <p>W razie pytań prosimy o kontakt telefoniczny.</p>`;

    if (r.email) {
      try {
        await sendEmail(r.email, subject, html);
      } catch {
        // nie blokujemy panelu błędem maila
      }
    }

    // 5) SMS po akceptacji
    if (action === "accept" && r.phone) {
      const smsText = `Sushi Tutaj: potwierdzamy rezerwację ${when} dla ${
        r.guests || 1
      } os. Do zobaczenia!`;
      try {
        await sendSms(r.phone, smsText);
      } catch {
        // też cicho
      }
    }

    return NextResponse.json({ ok: true, reservation: updated });
  } catch (err: any) {
    console.error("POST /api/reservations/update error:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
