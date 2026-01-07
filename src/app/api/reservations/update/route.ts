// src/app/api/reservations/update/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
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

function normalizeUuid(v?: string | null) {
  if (!v) return null;
  const x = String(v).replace(/[<>\s'"]/g, "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    x
  )
    ? x
    : null;
}

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
    const body = await req.json().catch(() => null);
    const rawId = body?.id ?? null;
    const action = body?.action ?? null; // 'accept' | 'cancel'
    const admin_note = body?.admin_note ?? null;

    const reservationId = normalizeUuid(rawId);

    if (!reservationId || !["accept", "cancel"].includes(action)) {
      return NextResponse.json(
        { error: "Bad request" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 1) Auth: sesja (stabilniej niż getUser() po czasie)
    const cookieStore = await cookies();
    const supabaseServer = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
          },
        },
      }
    );
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    const userId = user?.id ?? null;
    if (!userId) {
      return NextResponse.json(
        { error: "Nie jesteś zalogowany" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2) restaurant_id z cookie (ustawiane przez ensure-cookie)
    const cookieRestaurantIdRaw = cookieStore.get("restaurant_id")?.value ?? null;
    let restaurantId = normalizeUuid(cookieRestaurantIdRaw);

    // Jeśli cookie zniknęło: fallback na pierwszy przypisany lokal admina
    const sbAny = supabaseAdmin as any; // (tymczasowo, gdy typy Database nie mają restaurant_admins)
    if (!restaurantId) {
      const { data: rows, error } = await sbAny
        .from("restaurant_admins")
        .select("restaurant_id, added_at")
        .eq("user_id", userId)
        .order("added_at", { ascending: true })
        .limit(1);

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }

      restaurantId = normalizeUuid(rows?.[0]?.restaurant_id ?? null);
    }

    if (!restaurantId) {
      return NextResponse.json(
        {
          error:
            "Brak przypisanej restauracji (cookie restaurant_id). Otwórz panel z poziomu wybranego lokalu.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 3) WALIDACJA: user musi mieć przypisanie do tej restauracji
    {
      const { data: ra, error: raErr } = await sbAny
        .from("restaurant_admins")
        .select("role")
        .eq("user_id", userId)
        .eq("restaurant_id", restaurantId)
        .limit(1);

      if (raErr) {
        return NextResponse.json(
          { error: raErr.message },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }

      if (!ra || ra.length === 0) {
        return NextResponse.json(
          { error: "Forbidden" },
          { status: 403, headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    // 4) pobierz rezerwację tylko z tej restauracji (service role, ale po walidacji)
    const { data: r, error: e1 } = await supabaseAdmin
      .from("reservations")
      .select(
        "id, name, email, phone, guests, note, reservation_date, reservation_time, restaurant_id, status"
      )
      .eq("id", reservationId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    if (e1) throw e1;

    if (!r) {
      return NextResponse.json(
        {
          error:
            "Rezerwacja nie istnieje lub nie należy do restauracji przypisanej do tego konta admina",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } }
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
      .eq("id", reservationId)
      .eq("restaurant_id", restaurantId)
      .select("*")
      .maybeSingle();

        if (e2) {
      // Walidacje z DB (np. trigger: "Nie można rezerwować przeszłych terminów.")
      if ((e2 as any)?.code === "P0001") {
        return NextResponse.json(
          { error: e2.message, code: "P0001" },
          { status: 409, headers: { "Cache-Control": "no-store" } }
        );
      }
      throw e2;
    }


    if (!updated) {
      return NextResponse.json(
        {
          error:
            "Nie udało się zaktualizować rezerwacji (być może została już usunięta)",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 5) e-mail do klienta
    const subject =
      action === "accept"
        ? "Potwierdzenie rezerwacji"
        : "Anulowanie rezerwacji";

    const when = `${r.reservation_date} ${String(r.reservation_time).slice(0, 5)}`;

    const html =
      action === "accept"
        ? `<p>Dzień dobry ${r.name || ""},</p>
           <p>Potwierdzamy rezerwację na ${when} dla ${r.guests || 1} os.</p>
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

    // 6) SMS po akceptacji
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

    // 7) jeśli fallback dobrał restaurantId, warto „samouzdrawiać” cookie (spójność panelu)
    const res = NextResponse.json(
      { ok: true, reservation: updated },
      { headers: { "Cache-Control": "no-store" } }
    );
    res.cookies.set("restaurant_id", restaurantId, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
    } catch (err: any) {
    const code = err?.code ?? err?.cause?.code ?? null;
    const message = err?.message || "Server error";

    // Nie rób 500 z błędu walidacji
    if (code === "P0001") {
      return NextResponse.json(
        { error: message, code: "P0001" },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    apiLogger.error("POST /api/reservations/update error", { code, message });
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
