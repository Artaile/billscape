-- Migration 036: Strict Branch-Level Row Level Security (RLS) Policies
-- Prevents API bypass / direct hacker access to unauthorized branch records

-- 1. Helper function to fetch assigned branch for current user in organization
CREATE OR REPLACE FUNCTION public.my_assigned_branch_in_org(org_id UUID)
RETURNS UUID
SECURITY DEFINER SET search_path = public
LANGUAGE SQL STABLE AS $$
  SELECT assigned_branch_id FROM memberships
  WHERE user_id = auth.uid() AND organization_id = org_id
  LIMIT 1
$$;

-- 2. Helper function to validate if current user can access a specific branch record
CREATE OR REPLACE FUNCTION public.can_access_branch_data(org_id UUID, target_branch_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER SET search_path = public
LANGUAGE SQL STABLE AS $$
  SELECT CASE
    -- Super admins can access everything
    WHEN is_super_admin() THEN TRUE
    -- Owners & Managers have central multi-branch access
    WHEN my_role_in_org(org_id) IN ('owner'::user_role, 'manager'::user_role) THEN TRUE
    -- If user has no specific assigned branch, they can access Head Office / unassigned records
    WHEN my_assigned_branch_in_org(org_id) IS NULL THEN TRUE
    -- Branch matches assigned branch OR row is unassigned
    WHEN target_branch_id IS NULL OR target_branch_id = my_assigned_branch_in_org(org_id) THEN TRUE
    ELSE FALSE
  END
$$;

-- 3. Replace SELECT policies with Strict Branch Access Control

-- PRODUCTS
DROP POLICY IF EXISTS "Members can view products" ON products;
CREATE POLICY "Members can view products" ON products FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM my_org_ids())
    AND can_access_branch_data(organization_id, branch_id)
  );

-- CATEGORIES
DROP POLICY IF EXISTS "Members can view categories" ON categories;
CREATE POLICY "Members can view categories" ON categories FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM my_org_ids())
    AND can_access_branch_data(organization_id, branch_id)
  );

-- SUPPLIERS
DROP POLICY IF EXISTS "Members can view suppliers" ON suppliers;
CREATE POLICY "Members can view suppliers" ON suppliers FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM my_org_ids())
    AND can_access_branch_data(organization_id, branch_id)
  );

-- CUSTOMERS
DROP POLICY IF EXISTS "Members can view customers" ON customers;
CREATE POLICY "Members can view customers" ON customers FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM my_org_ids())
    AND can_access_branch_data(organization_id, branch_id)
  );

-- EXPENSES
DROP POLICY IF EXISTS "Members can view expenses" ON expenses;
CREATE POLICY "Members can view expenses" ON expenses FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM my_org_ids())
    AND can_access_branch_data(organization_id, branch_id)
  );

-- PROMOTIONS
DROP POLICY IF EXISTS "Members can view promotions" ON promotions;
CREATE POLICY "Members can view promotions" ON promotions FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM my_org_ids())
    AND can_access_branch_data(organization_id, branch_id)
  );
