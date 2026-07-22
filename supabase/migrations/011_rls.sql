-- ═══════════════════════════════════════════════════════
-- Row Level Security Policies for BillScape
-- ═══════════════════════════════════════════════════════

-- Enable RLS on all tenant tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- ─── PROFILES ─────────────────────────────────────────
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- ─── MEMBERSHIPS ──────────────────────────────────────
CREATE POLICY "Users see their own memberships"
  ON memberships FOR SELECT
  USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "Owners can manage memberships in their org"
  ON memberships FOR ALL
  USING (
    is_super_admin() OR
    my_role_in_org(organization_id) IN ('owner', 'manager')
  );

-- ─── ORGANIZATIONS ────────────────────────────────────
CREATE POLICY "Members can view their org"
  ON organizations FOR SELECT
  USING (is_super_admin() OR id IN (SELECT organization_id FROM my_org_ids()));

CREATE POLICY "Owners can update their org"
  ON organizations FOR UPDATE
  USING (is_super_admin() OR my_role_in_org(id) IN ('owner', 'manager'));

CREATE POLICY "Anyone authenticated can create org (onboarding)"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ─── ORG SETTINGS ─────────────────────────────────────
CREATE POLICY "Members can read org settings"
  ON org_settings FOR SELECT
  USING (is_super_admin() OR organization_id IN (SELECT organization_id FROM my_org_ids()));

CREATE POLICY "Owners can update org settings"
  ON org_settings FOR ALL
  USING (is_super_admin() OR my_role_in_org(organization_id) IN ('owner', 'manager'));

CREATE POLICY "Anyone can insert org settings (onboarding)"
  ON org_settings FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ─── CATEGORIES ───────────────────────────────────────
CREATE POLICY "Members can view categories"
  ON categories FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

CREATE POLICY "Managers can manage categories"
  ON categories FOR ALL
  USING (my_role_in_org(organization_id) IN ('owner', 'manager'));

-- ─── PRODUCTS ─────────────────────────────────────────
CREATE POLICY "Members can view products"
  ON products FOR SELECT
  USING (is_super_admin() OR organization_id IN (SELECT organization_id FROM my_org_ids()));

CREATE POLICY "Managers can manage products"
  ON products FOR INSERT
  WITH CHECK (my_role_in_org(organization_id) IN ('owner', 'manager'));

CREATE POLICY "Managers can update products"
  ON products FOR UPDATE
  USING (my_role_in_org(organization_id) IN ('owner', 'manager'));

CREATE POLICY "Owners can delete products"
  ON products FOR DELETE
  USING (my_role_in_org(organization_id) = 'owner');

-- ─── INVENTORY ────────────────────────────────────────
CREATE POLICY "Members can view inventory"
  ON inventory FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

CREATE POLICY "System can update inventory (via triggers)"
  ON inventory FOR ALL
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

-- ─── STOCK MOVEMENTS ──────────────────────────────────
CREATE POLICY "Members can view stock movements"
  ON stock_movements FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

CREATE POLICY "Members can log stock movements"
  ON stock_movements FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM my_org_ids()));

-- ─── CUSTOMERS ────────────────────────────────────────
CREATE POLICY "Members can manage customers"
  ON customers FOR ALL
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

-- ─── SUPPLIERS ────────────────────────────────────────
CREATE POLICY "Members can manage suppliers"
  ON suppliers FOR ALL
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

-- ─── SALES ────────────────────────────────────────────
CREATE POLICY "Members can view sales"
  ON sales FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

CREATE POLICY "Members can create sales"
  ON sales FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM my_org_ids()));

-- ─── SALE ITEMS ───────────────────────────────────────
CREATE POLICY "Members can view sale items"
  ON sale_items FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

CREATE POLICY "Members can create sale items"
  ON sale_items FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM my_org_ids()));

-- ─── PURCHASES ────────────────────────────────────────
CREATE POLICY "Members can manage purchases"
  ON purchases FOR ALL
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

CREATE POLICY "Members can manage purchase items"
  ON purchase_items FOR ALL
  USING (
    purchase_id IN (
      SELECT id FROM purchases
      WHERE organization_id IN (SELECT organization_id FROM my_org_ids())
    )
  );

-- ─── EXPENSES ─────────────────────────────────────────
CREATE POLICY "Members can manage expenses"
  ON expenses FOR ALL
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

-- ─── ACTIVITY LOG ─────────────────────────────────────
CREATE POLICY "Members can view activity log"
  ON activity_log FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

CREATE POLICY "Members can insert activity log"
  ON activity_log FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM my_org_ids()));

-- ─── PRODUCT VARIANTS ─────────────────────────────────
CREATE POLICY "Members can view variants"
  ON product_variants FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

CREATE POLICY "Managers can manage variants"
  ON product_variants FOR ALL
  USING (my_role_in_org(organization_id) IN ('owner', 'manager'));
