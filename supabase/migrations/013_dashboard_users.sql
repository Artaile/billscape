-- ═══════════════════════════════════════════════════════
-- Migration: Dashboard Users and Roles Schema Extensions
-- ═══════════════════════════════════════════════════════

-- 1. Ensure roles table exists for Custom Role and Permissions management
CREATE TABLE IF NOT EXISTS roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  permissions     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, name)
);

-- 2. Alter memberships table to add employee_id, custom_role_id, and is_active flag
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='memberships' AND column_name='employee_id') THEN
    ALTER TABLE memberships ADD COLUMN employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='memberships' AND column_name='custom_role_id') THEN
    ALTER TABLE memberships ADD COLUMN custom_role_id UUID REFERENCES roles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='memberships' AND column_name='is_active') THEN
    ALTER TABLE memberships ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- 3. Enable RLS on roles table
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- 4. Define policies for roles
DO $$ BEGIN
  CREATE POLICY "Members can view roles" ON roles FOR SELECT
    USING (organization_id IN (SELECT organization_id FROM my_org_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Owners can manage roles" ON roles FOR ALL
    USING (my_role_in_org(organization_id) = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Restrict memberships write access to Owner role only at database level
-- First drop existing policies that allow both owner and manager to write
DROP POLICY IF EXISTS "Owners can manage memberships in their org" ON memberships;

DO $$ BEGIN
  CREATE POLICY "Members can view memberships" ON memberships FOR SELECT
    USING (organization_id IN (SELECT organization_id FROM my_org_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Only Owners can manage memberships" ON memberships FOR ALL
    USING (is_super_admin() OR my_role_in_org(organization_id) = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
