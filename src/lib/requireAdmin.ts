// src/lib/requireAdmin.ts
import "server-only";
import { getAdminContext } from "@/lib/adminContext";

export type RestaurantRole = "owner" | "admin" | "manager" | "employee";

export class AdminAuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Standard dla ADMIN API:
 * - daje: { supabase, user, restaurantId, role }
 * - wymusza role + gwarantuje, że restaurantId jest dostępny dla usera
 */
export async function requireRestaurantAccess(
  roles: RestaurantRole[] = ["admin", "owner"]
) {
  const ctx = await getAdminContext(); // { supabase, user, restaurantId }

  // Dociągamy rolę dla tego usera i tej restauracji
  const { data, error } = await ctx.supabase
    .from("restaurant_admins")
    .select("role")
    .eq("user_id", ctx.user.id)
    .eq("restaurant_id", ctx.restaurantId)
    .maybeSingle();

  if (error) {
    // kompatybilność, jeśli ktoś nie ma jeszcze kolumny "role"
    const msg = String(error.message || "");
    if (/column\s+\"role\"\s+does not exist/i.test(msg)) {
      // w takim wypadku traktujemy membership jako "admin"
      const role: RestaurantRole = "admin";
      if (!roles.includes(role)) {
        throw new AdminAuthError(403, "FORBIDDEN_ROLE", "Brak uprawnień.");
      }
      return { ...ctx, role };
    }

    throw new AdminAuthError(500, "ROLE_LOOKUP_ERROR", "Błąd autoryzacji.");
  }

  const role = (data as any)?.role as RestaurantRole | undefined;
  if (!role) {
    throw new AdminAuthError(403, "FORBIDDEN", "Brak dostępu.");
  }

  if (!roles.includes(role)) {
    throw new AdminAuthError(403, "FORBIDDEN_ROLE", "Brak uprawnień.");
  }

  return { ...ctx, role };
}
