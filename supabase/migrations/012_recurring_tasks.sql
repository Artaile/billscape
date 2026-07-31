-- ═══════════════════════════════════════════════════════
-- Migration: Recurring Tasks and Salary Payout Schema
-- ═══════════════════════════════════════════════════════

-- 1. Ensure employees table exists
CREATE TABLE IF NOT EXISTS employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  role            TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'cashier')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  joined_date     DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Alter employees to add base_salary and salary_advance_balance if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='base_salary') THEN
    ALTER TABLE employees ADD COLUMN base_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='salary_advance_balance') THEN
    ALTER TABLE employees ADD COLUMN salary_advance_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
  END IF;
END $$;

-- 3. Create employee_advances table
CREATE TABLE IF NOT EXISTS employee_advances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  advance_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deducted', 'cancelled')),
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create salary_payments table
CREATE TABLE IF NOT EXISTS salary_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payment_month     TEXT NOT NULL, -- Format: YYYY-MM
  base_salary       NUMERIC(12, 2) NOT NULL,
  allowances_bonus  NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  advance_deducted  NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  other_deductions  NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  net_paid          NUMERIC(12, 2) NOT NULL CHECK (net_paid >= 0),
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_mode      payment_mode NOT NULL DEFAULT 'cash',
  expense_id        UUID REFERENCES expenses(id) ON DELETE SET NULL,
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, employee_id, payment_month)
);

-- 5. Create recurring_templates table
CREATE TABLE IF NOT EXISTS recurring_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category          TEXT NOT NULL, -- e.g. "Rent", "Utilities", "Salary", etc.
  name              TEXT NOT NULL,
  default_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  due_day           INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  last_billed_month TEXT, -- Format: YYYY-MM
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- Row Level Security (RLS) Enablement & Policies
-- ═══════════════════════════════════════════════════════

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_templates ENABLE ROW LEVEL SECURITY;

-- ─── EMPLOYEES ───
DO $$ BEGIN
  CREATE POLICY "Members can view employees" ON employees FOR SELECT
    USING (organization_id IN (SELECT organization_id FROM my_org_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Managers can manage employees" ON employees FOR ALL
    USING (my_role_in_org(organization_id) IN ('owner', 'manager'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── EMPLOYEE ADVANCES ───
DO $$ BEGIN
  CREATE POLICY "Members can view employee advances" ON employee_advances FOR SELECT
    USING (organization_id IN (SELECT organization_id FROM my_org_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Managers can manage employee advances" ON employee_advances FOR ALL
    USING (my_role_in_org(organization_id) IN ('owner', 'manager'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── SALARY PAYMENTS ───
DO $$ BEGIN
  CREATE POLICY "Members can view salary payments" ON salary_payments FOR SELECT
    USING (organization_id IN (SELECT organization_id FROM my_org_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Managers can manage salary payments" ON salary_payments FOR ALL
    USING (my_role_in_org(organization_id) IN ('owner', 'manager'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── RECURRING TEMPLATES ───
DO $$ BEGIN
  CREATE POLICY "Members can view recurring templates" ON recurring_templates FOR SELECT
    USING (organization_id IN (SELECT organization_id FROM my_org_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Owners can manage recurring templates" ON recurring_templates FOR ALL
    USING (my_role_in_org(organization_id) = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
