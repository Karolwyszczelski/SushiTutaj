// src/app/api/orders/create/_lib/loyaltyOrder.ts
import "server-only";

import {
  type LoyaltyChoice,
  LOYALTY_MIN_ORDER_BASE,
  LOYALTY_PERCENT,
  LOYALTY_REWARD_ROLL_COUNT,
  LOYALTY_REWARD_PERCENT_COUNT,
  computeEarnedStickersFromBase,
  getLoyaltyBalance,
  trySpendLoyalty,
  tryClaimRollReward,
  resetRollRewardClaimed,
} from "./loyalty";

type SupabaseLike = {
  from: (table: string) => any;
  rpc: (
    fn: string,
    args: Record<string, any>
  ) => Promise<{ data: any; error: any }>;
};

export async function applyLoyaltyAndFinalizePricing(params: {
  supabaseAdmin: SupabaseLike;
  n: any;
  discountBase: number; // produkty + opakowanie (bez dostawy)
  deliveryCostFinal: number; // 0 dla takeaway
}) {
  const { supabaseAdmin, n } = params;

  const discountBase = Number(params.discountBase || 0);
  const deliveryCostFinal = Number(params.deliveryCostFinal || 0);

  // ile naklejek to zamówienie da po accepted/completed (wg progów 50/200/300)
  let earnedOnComplete =
    n?.user_id ? computeEarnedStickersFromBase(discountBase) : 0;

  let loyalty_stickers_before = 0;
  let loyalty_stickers_after = 0;
  let loyalty_stickers_used = 0; // use_4/use_8
  let loyalty_applied = false;
  let loyalty_reward_type: string | null = null;
  let loyalty_reward_value: number | null = null;
  let loyalty_discount_amount = 0;
  let effectiveLoyaltyChoice: LoyaltyChoice = "keep";

  if (n?.user_id) {
    const userId = String(n.user_id);

    const balanceBefore = await getLoyaltyBalance(supabaseAdmin, userId);
    loyalty_stickers_before = balanceBefore;

    const rawChoice = (n.loyalty_choice as LoyaltyChoice | null) || "keep";
    let balanceAfterSpend = balanceBefore;

    if (rawChoice === "use_4") {
      // use_4: NIE spalaj naklejek, tylko oznacz “odebrane w cyklu”
      const r = await tryClaimRollReward(supabaseAdmin, userId);

      if (r.ok) {
        effectiveLoyaltyChoice = "use_4";
        loyalty_applied = true;
        loyalty_reward_type = "roll_free";
        loyalty_reward_value = LOYALTY_REWARD_ROLL_COUNT;

        // kluczowe: nie wydajemy naklejek przy nagrodzie 4
        loyalty_stickers_used = 0;

        // saldo bez zmian
        balanceAfterSpend = r.after;
      } else {
        effectiveLoyaltyChoice = "keep";
      }
    } else if (rawChoice === "use_8") {
      // use_8: spalaj 8 i nalicz rabat %
      const r = await trySpendLoyalty(
        supabaseAdmin,
        userId,
        LOYALTY_REWARD_PERCENT_COUNT
      );

      if (r.ok) {
        effectiveLoyaltyChoice = "use_8";
        loyalty_applied = true;
        loyalty_reward_type = "percent";
        loyalty_reward_value = LOYALTY_PERCENT;
        loyalty_stickers_used = LOYALTY_REWARD_PERCENT_COUNT;
        balanceAfterSpend = r.after;

        // reset “odebrano 4” po wejściu w nowy cykl (po nagrodzie 8)
        await resetRollRewardClaimed(supabaseAdmin, userId);

        loyalty_discount_amount =
          Math.max(
            0,
            Math.round(discountBase * (LOYALTY_PERCENT / 100) * 100)
          ) / 100;
      } else {
        effectiveLoyaltyChoice = "keep";
      }
    }

    // jeśli użyto nagrody (4/8), to nie nabijamy naklejek na tym samym zamówieniu
    if (loyalty_applied) earnedOnComplete = 0;

    // przewidywany stan po accepted/completed
    loyalty_stickers_after = Math.min(
      LOYALTY_REWARD_PERCENT_COUNT,
      balanceAfterSpend + earnedOnComplete
    );

    n.legal_accept = {
      ...n.legal_accept,
      loyalty: {
        stickers_before: balanceBefore,
        stickers_after_projected: loyalty_stickers_after,
        earned_on_complete: earnedOnComplete,
        spent_now: loyalty_stickers_used,
        applied: loyalty_applied,
        reward_type: loyalty_reward_type,
        reward_value: loyalty_reward_value,
        min_order: LOYALTY_MIN_ORDER_BASE,
        discount_amount: loyalty_discount_amount,
        choice: effectiveLoyaltyChoice,
      },
    };

    // pola do inserta
    n.loyalty_stickers_before = loyalty_stickers_before;
    n.loyalty_stickers_after = loyalty_stickers_after;
    n.loyalty_stickers_used = loyalty_stickers_used;
    n.loyalty_stickers_earned = earnedOnComplete;

    n.loyalty_applied = loyalty_applied;
    n.loyalty_reward_type = loyalty_reward_type;
    n.loyalty_reward_value = loyalty_reward_value;
    n.loyalty_min_order = LOYALTY_MIN_ORDER_BASE;
  }

  n.loyalty_choice = effectiveLoyaltyChoice;

  // Rabat końcowy: kody + lojalność
  const manualDiscountRaw = Number(n.discount_amount || 0);
  const totalDiscountRaw =
    Math.max(0, manualDiscountRaw) + Math.max(0, loyalty_discount_amount);

  const discountClamped = Math.max(0, Math.min(totalDiscountRaw, discountBase));

  const serverTotal =
    Math.max(
      0,
      Math.round(((discountBase - discountClamped) + deliveryCostFinal) * 100)
    ) / 100;

  n.discount_amount = discountClamped;
  n.total_price = serverTotal;

  return {
    discountClamped,
    serverTotal,
    loyalty_discount_amount,
    effectiveLoyaltyChoice,
  };
}
