// src/app/api/orders/create/_lib/notifications.ts
import "server-only";

import { orderLogger } from "@/lib/logger";

import { supabaseAdmin } from "./clients";
import { sendPushForRestaurant } from "@/lib/push";

export type NotificationType = "order" | "reservation" | "error" | "system";

export async function pushAdminNotification(
  restaurant_id: string,
  type: NotificationType,
  title: string,
  message?: string | null,
  opts?: { url?: string }
) {
  try {
    // 1) zapis do admin_notifications (tak jak było)
    await supabaseAdmin.from("admin_notifications").insert({
      restaurant_id,
      type,
      title,
      message: message ?? null,
    });

    // 2) web-push przez wspólny helper z lib/push.ts
    const url = opts?.url || "/admin/pickup-order";
    await sendPushForRestaurant(restaurant_id, {
      type,
      title,
      body: message || title,
      url,
    });
  } catch (e: any) {
    orderLogger.error("admin_notifications.insert/push error", { error: e?.message || e });
  }
}
