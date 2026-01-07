// src/api/orders/create/_lib/blockedContact.ts
import { NextResponse } from "next/server";
import { orderLogger } from "@/lib/logger";

type Any = Record<string, any>;

type Args = {
  supabaseAdmin: any;
  restaurant_id: string;
  n: Any;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s\.,\-\/]+/g, " ")
    .trim();

export async function enforceBlockedContact({
  supabaseAdmin,
  restaurant_id,
  n,
}: Args): Promise<NextResponse | null> {
  try {
    const { data: blocks, error: blocksErr } = await supabaseAdmin
      .from("blocked_addresses")
      .select("pattern, note, active, type")
      .eq("restaurant_id", restaurant_id);

    if (blocksErr) {
      orderLogger.error("blocked_addresses error", {
        error: (blocksErr as any)?.message || blocksErr,
      });
      return null; // dokładnie jak było: nie blokujemy zamówień, tylko log
    }

    if (!blocks || blocks.length === 0) return null;

    const activeBlocks = (blocks as any[]).filter(
      (b) => b.active !== false && b.active !== "false"
    );
    if (activeBlocks.length === 0) return null;

    const addrStrRaw = [
      n.street || n.address || "",
      n.flat_number || "",
      n.city || "",
    ]
      .filter((x: any) => String(x ?? "").trim().length > 0)
      .join(" ");

    const addrNorm = norm(addrStrRaw);
    const phoneDigits = (n.phone || "").replace(/\D/g, "");
    const emailLower = (n.contact_email || "").toString().toLowerCase();

    const matched = activeBlocks.find((b) => {
      const rawPattern = String(b.pattern || "").trim();
      if (!rawPattern) return false;

      const type = (b.type as string) || "address";
      const patNorm = norm(rawPattern);
      const patDigits = rawPattern.replace(/\D/g, "");
      const patLower = rawPattern.toLowerCase();

      if (type === "phone") {
        if (!patDigits) return false;
        return !!phoneDigits && phoneDigits.includes(patDigits);
      }

      if (type === "email") {
        return !!emailLower && emailLower.includes(patLower);
      }

      // domyślnie: adres
      return !!addrNorm && addrNorm.includes(patNorm);
    });

    if (matched) {
      return NextResponse.json(
        {
          error:
            "Nie możemy przyjąć zamówienia dla podanych danych kontaktowych. Skontaktuj się proszę bezpośrednio z restauracją.",
        },
        { status: 409 }
      );
    }

    return null;
  } catch (e) {
    orderLogger.error("blocked_addresses check error", { error: e });
    return null; // jak było: błąd checka nie blokuje zamówienia
  }
}
