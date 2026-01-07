// src/app/api/orders/create/_lib/loyalty.ts
import { orderLogger } from "@/lib/logger";

export type LoyaltyChoice = "keep" | "use_4" | "use_8";

/* ===== Program lojalnościowy =====
   Baza: produkty + opakowanie (bez dostawy)
*/
export const LOYALTY_MIN_ORDER_BASE = 50; // zł
export const LOYALTY_PERCENT = 30; // % rabatu przy 8 naklejkach
export const LOYALTY_REWARD_ROLL_COUNT = 4; // ile naklejek do darmowej rolki
export const LOYALTY_REWARD_PERCENT_COUNT = 8; // ile naklejek do rabatu -30%

type SupabaseLike = {
  from: (table: string) => any;
  rpc: (
    fn: string,
    args: Record<string, any>
  ) => Promise<{ data: any; error: any }>;
};

// ile naklejek przyznajemy po zakończeniu zamówienia (kwotowo)
export function computeEarnedStickersFromBase(
  baseWithoutDelivery: number
): number {
  const base = Number(baseWithoutDelivery || 0);

  // < 50 zł = 0
  if (base < LOYALTY_MIN_ORDER_BASE) return 0;

  // 50–200 = 1, >200–300 = 2, >300 = 3
  if (base <= 200) return 1;
  if (base <= 300) return 2;
  return 3;
}

// aktualne saldo z konta lojalnościowego
export async function getLoyaltyBalance(
  supabaseAdmin: SupabaseLike,
  userId: string
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("loyalty_accounts")
    .select("stickers")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    orderLogger.error("loyalty_accounts read error", { error: error.message });
    return 0;
  }
  return Number((data as any)?.stickers ?? 0) || 0;
}

// próba spalenia (rezerwacji) naklejek – przez RPC
export async function trySpendLoyalty(
  supabaseAdmin: SupabaseLike,
  userId: string,
  count: number
): Promise<{ ok: boolean; before: number; after: number }> {
  const { data, error } = await supabaseAdmin.rpc("loyalty_spend", {
    p_user_id: userId,
    p_count: count,
  });

  if (error) {
    orderLogger.warn("loyalty_spend rpc error", { error: error.message });
    const b = await getLoyaltyBalance(supabaseAdmin, userId);
    return { ok: false, before: b, after: b };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const before = Number((row as any)?.before ?? 0);
  const after = Number((row as any)?.after ?? before);
  return { ok: true, before, after };
}

export async function tryClaimRollReward(
  supabaseAdmin: SupabaseLike,
  userId: string
): Promise<{
  ok: boolean;
  before: number;
  after: number; // bez zmiany, bo nie “spalamy” naklejek
  alreadyClaimed: boolean;
}> {
  // Atomowo: jeden UPDATE, który przejdzie tylko raz (roll_reward_claimed=false)
  // i tylko jeśli user ma >= 4 naklejki.
  const { data: upd, error: updErr } = await supabaseAdmin
    .from("loyalty_accounts")
    .update({ roll_reward_claimed: true })
    .eq("user_id", userId)
    .eq("roll_reward_claimed", false)
    .gte("stickers", LOYALTY_REWARD_ROLL_COUNT)
    .select("stickers, roll_reward_claimed")
    .maybeSingle();

  // kompatybilność: jeśli kolumna nie istnieje (migracja nie wdrożona),
  // traktujemy jak brak możliwości claimu -> "keep"
  if (updErr && /roll_reward_claimed/i.test(String(updErr.message || ""))) {
    const { data: legacy } = await supabaseAdmin
      .from("loyalty_accounts")
      .select("stickers")
      .eq("user_id", userId)
      .maybeSingle();

    const before = Math.max(0, Number((legacy as any)?.stickers ?? 0));
    return { ok: false, before, after: before, alreadyClaimed: false };
  }

  // Jeśli update zwrócił rekord -> claim poszedł (TYLKO w jednym requestcie)
  if (upd) {
    const before = Math.max(0, Number((upd as any)?.stickers ?? 0));
    return { ok: true, before, after: before, alreadyClaimed: false };
  }

  // Jeśli nie zaktualizowało nic (0 wierszy), to albo:
  // - już było claimed, albo
  // - za mało naklejek, albo
  // - brak konta
  const { data, error } = await supabaseAdmin
    .from("loyalty_accounts")
    .select("stickers, roll_reward_claimed")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, before: 0, after: 0, alreadyClaimed: false };
  }

  const before = Math.max(0, Number((data as any)?.stickers ?? 0));
  const alreadyClaimed = !!(data as any)?.roll_reward_claimed;

  if (before < LOYALTY_REWARD_ROLL_COUNT) {
    return { ok: false, before, after: before, alreadyClaimed };
  }

  return { ok: false, before, after: before, alreadyClaimed: true };
}

export async function resetRollRewardClaimed(
  supabaseAdmin: SupabaseLike,
  userId: string
): Promise<void> {
  try {
    await supabaseAdmin
      .from("loyalty_accounts")
      .update({ roll_reward_claimed: false })
      .eq("user_id", userId);
  } catch (e: any) {
    orderLogger.warn("reset roll_reward_claimed failed", {
      error: e?.message || e,
    });
  }
}
