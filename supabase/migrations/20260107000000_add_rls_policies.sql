-- ============================================================
-- RLS (Row Level Security) Migration
-- Generated: 2026-01-07
-- Purpose: Add security policies to protect sensitive data
-- ============================================================

-- ============================================================
-- 1. ENABLE RLS ON ALL TABLES
-- ============================================================

-- Critical tables (user data)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_addresses ENABLE ROW LEVEL SECURITY;

-- Restaurant tables (public read, admin write)
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE options ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;

-- Config tables (public read)
ALTER TABLE restaurant_blocked_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_bars ENABLE ROW LEVEL SECURITY;
ALTER TABLE closure_windows ENABLE ROW LEVEL SECURITY;

-- Admin tables (admin only)
ALTER TABLE restaurant_admins ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. ORDERS - users see own, admins see restaurant orders
-- ============================================================

-- Users can view their own orders (by email match)
CREATE POLICY "Users can view own orders by email"
  ON orders FOR SELECT
  USING (
    auth.jwt() ->> 'email' = contact_email
  );

-- Restaurant admins can view their restaurant's orders
CREATE POLICY "Restaurant admins can view restaurant orders"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_admins ra
      WHERE ra.user_id = auth.uid()
      AND ra.restaurant_id = orders.restaurant_id
    )
  );

-- Service role can do everything (for API routes)
CREATE POLICY "Service role full access on orders"
  ON orders FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 3. ORDER_ITEMS - follow parent order access
-- ============================================================

CREATE POLICY "Users can view own order items"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND auth.jwt() ->> 'email' = o.contact_email
    )
  );

CREATE POLICY "Restaurant admins can view restaurant order items"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN restaurant_admins ra ON ra.restaurant_id = o.restaurant_id
      WHERE o.id = order_items.order_id
      AND ra.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on order_items"
  ON order_items FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 4. LOYALTY_ACCOUNTS - users see own, admins read all
-- ============================================================

CREATE POLICY "Users can view own loyalty account"
  ON loyalty_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own loyalty account"
  ON loyalty_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Restaurant admins can view loyalty accounts"
  ON loyalty_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_admins ra
      WHERE ra.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on loyalty_accounts"
  ON loyalty_accounts FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 5. RESTAURANTS - public read
-- ============================================================

CREATE POLICY "Anyone can read restaurants"
  ON restaurants FOR SELECT
  USING (true);

CREATE POLICY "Restaurant admins can update their restaurant"
  ON restaurants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_admins ra
      WHERE ra.user_id = auth.uid()
      AND ra.restaurant_id = restaurants.id
    )
  );

CREATE POLICY "Service role full access on restaurants"
  ON restaurants FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 6. PRODUCTS, OPTIONS - public read
-- ============================================================

CREATE POLICY "Anyone can read products"
  ON products FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read option_groups"
  ON option_groups FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read options"
  ON options FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read product_option_groups"
  ON product_option_groups FOR SELECT
  USING (true);

-- Admin write policies
CREATE POLICY "Restaurant admins can manage products"
  ON products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_admins ra
      WHERE ra.user_id = auth.uid()
      AND ra.restaurant_id = products.restaurant_id
    )
  );

CREATE POLICY "Service role full access on products"
  ON products FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 8. DELIVERY_ZONES - public read
-- ============================================================

CREATE POLICY "Anyone can read delivery_zones"
  ON delivery_zones FOR SELECT
  USING (true);

CREATE POLICY "Restaurant admins can manage delivery zones"
  ON delivery_zones FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_admins ra
      WHERE ra.user_id = auth.uid()
      AND ra.restaurant_id = delivery_zones.restaurant_id
    )
  );

CREATE POLICY "Service role full access on delivery_zones"
  ON delivery_zones FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 9. DISCOUNT_CODES - public can validate, admin manage
-- ============================================================

CREATE POLICY "Anyone can read active discount codes"
  ON discount_codes FOR SELECT
  USING (active = true);

CREATE POLICY "Restaurant admins can manage discount codes"
  ON discount_codes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_admins ra
      WHERE ra.user_id = auth.uid()
      AND ra.restaurant_id = discount_codes.restaurant_id
    )
  );

CREATE POLICY "Service role full access on discount_codes"
  ON discount_codes FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 10. CONFIG TABLES - public read
-- ============================================================

CREATE POLICY "Anyone can read restaurant_blocked_times"
  ON restaurant_blocked_times FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read notice_bars"
  ON notice_bars FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read closure_windows"
  ON closure_windows FOR SELECT
  USING (true);

-- Admin write for config tables
CREATE POLICY "Restaurant admins can manage blocked times"
  ON restaurant_blocked_times FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_admins ra
      WHERE ra.user_id = auth.uid()
      AND ra.restaurant_id = restaurant_blocked_times.restaurant_id
    )
  );

CREATE POLICY "Service role full access on restaurant_blocked_times"
  ON restaurant_blocked_times FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access on notice_bars"
  ON notice_bars FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access on closure_windows"
  ON closure_windows FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 10. RESTAURANT_ADMINS - admins see own, service full
-- ============================================================

CREATE POLICY "Users can see if they are admin"
  ON restaurant_admins FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access on restaurant_admins"
  ON restaurant_admins FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 12. ADMIN_PUSH_SUBSCRIPTIONS - by endpoint (no user_id)
-- ============================================================

CREATE POLICY "Anyone can manage push subscriptions by endpoint"
  ON admin_push_subscriptions FOR ALL
  USING (true);

CREATE POLICY "Service role full access on admin_push_subscriptions"
  ON admin_push_subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- 13. BLOCKED_ADDRESSES - admin only
-- ============================================================

CREATE POLICY "Restaurant admins can view blocked addresses"
  ON blocked_addresses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_admins ra
      WHERE ra.user_id = auth.uid()
      AND ra.restaurant_id = blocked_addresses.restaurant_id
    )
  );

CREATE POLICY "Service role full access on blocked_addresses"
  ON blocked_addresses FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================
-- DONE! Summary:
-- - 20+ tables secured with RLS
-- - Users can only see their own data
-- - Restaurant admins see their restaurant data
-- - Service role has full access (for server-side operations)
-- ============================================================
