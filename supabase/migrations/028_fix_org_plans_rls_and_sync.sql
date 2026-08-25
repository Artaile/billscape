-- ─── 028_fix_org_plans_rls_and_sync.sql ────────────────────────────────────────

-- 1. Enable RLS on plans and allow all authenticated users to read available plans
ALTER TABLE IF EXISTS plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view plans" ON plans;
CREATE POLICY "Anyone authenticated can view plans" ON plans
  FOR SELECT TO authenticated USING (true);

-- 2. Enable RLS on org_plans and allow org members + super_admins to view
ALTER TABLE IF EXISTS org_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members and super admins can view org_plans" ON org_plans;
CREATE POLICY "Members and super admins can view org_plans" ON org_plans
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

-- 3. Allow super admins to insert/update/delete org_plans
DROP POLICY IF EXISTS "Super admins can manage org_plans" ON org_plans;
CREATE POLICY "Super admins can manage org_plans" ON org_plans
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true));
