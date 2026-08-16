-- ============================================================================
-- Migration 023: Multi-Branch & Multi-Location Management Module
-- ============================================================================

-- 1. Branches Table
CREATE TABLE IF NOT EXISTS branches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  branch_type     TEXT NOT NULL DEFAULT 'retail' CHECK (branch_type IN ('retail', 'warehouse', 'franchise', 'kiosk')),
  is_default      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  manager_name    TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  city            TEXT,
  state_code      TEXT,
  pincode         TEXT,
  gstin           TEXT,
  bank_name       TEXT,
  bank_account    TEXT,
  bank_ifsc       TEXT,
  upi_id          TEXT,
  invoice_prefix  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branches_org ON branches(organization_id);
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(organization_id, is_active);

-- 2. Multi-Location Branch Inventory
CREATE TABLE IF NOT EXISTS branch_inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock_qty       NUMERIC(12, 3) NOT NULL DEFAULT 0,
  reorder_level   NUMERIC(12, 3) NOT NULL DEFAULT 5,
  rack_location   TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_inventory_branch ON branch_inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_product ON branch_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_org ON branch_inventory(organization_id);

-- 3. Inter-Branch Stock Transfers (IBT)
CREATE TABLE IF NOT EXISTS branch_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transfer_no     TEXT NOT NULL,
  from_branch_id  UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  to_branch_id    UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_transit', 'received', 'cancelled')),
  transfer_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  vehicle_no      TEXT,
  driver_contact  TEXT,
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  received_by     UUID REFERENCES auth.users(id),
  dispatched_at   TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, transfer_no)
);

CREATE INDEX IF NOT EXISTS idx_branch_transfers_org ON branch_transfers(organization_id);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_status ON branch_transfers(organization_id, status);

CREATE TABLE IF NOT EXISTS branch_transfer_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id     UUID NOT NULL REFERENCES branch_transfers(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty             NUMERIC(12, 3) NOT NULL CHECK (qty > 0),
  unit_cost       NUMERIC(12, 2) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_branch_transfer_items_transfer ON branch_transfer_items(transfer_id);

-- 4. Add branch_id references to existing transactional & staff tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='branch_id') THEN
    ALTER TABLE sales ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='branch_id') THEN
    ALTER TABLE purchases ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_purchases_branch ON purchases(branch_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='branch_id') THEN
    ALTER TABLE expenses ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='shifts') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shifts' AND column_name='branch_id') THEN
      ALTER TABLE shifts ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='memberships' AND column_name='assigned_branch_id') THEN
    ALTER TABLE memberships ADD COLUMN assigned_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Row-Level Security (RLS)
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_transfer_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- branches policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branches' AND policyname = 'Users can view branches of their organization') THEN
    CREATE POLICY "Users can view branches of their organization" ON branches
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id FROM memberships WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branches' AND policyname = 'Admins and managers can manage branches') THEN
    CREATE POLICY "Admins and managers can manage branches" ON branches
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id FROM memberships WHERE user_id = auth.uid()
        )
      );
  END IF;

  -- branch_inventory policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branch_inventory' AND policyname = 'Users can view branch inventory') THEN
    CREATE POLICY "Users can view branch inventory" ON branch_inventory
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id FROM memberships WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branch_inventory' AND policyname = 'Users can manage branch inventory') THEN
    CREATE POLICY "Users can manage branch inventory" ON branch_inventory
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id FROM memberships WHERE user_id = auth.uid()
        )
      );
  END IF;

  -- branch_transfers policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branch_transfers' AND policyname = 'Users can view branch transfers') THEN
    CREATE POLICY "Users can view branch transfers" ON branch_transfers
      FOR SELECT USING (
        organization_id IN (
          SELECT organization_id FROM memberships WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branch_transfers' AND policyname = 'Users can manage branch transfers') THEN
    CREATE POLICY "Users can manage branch transfers" ON branch_transfers
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id FROM memberships WHERE user_id = auth.uid()
        )
      );
  END IF;

  -- branch_transfer_items policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branch_transfer_items' AND policyname = 'Users can view branch transfer items') THEN
    CREATE POLICY "Users can view branch transfer items" ON branch_transfer_items
      FOR SELECT USING (
        transfer_id IN (
          SELECT id FROM branch_transfers WHERE organization_id IN (
            SELECT organization_id FROM memberships WHERE user_id = auth.uid()
          )
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'branch_transfer_items' AND policyname = 'Users can manage branch transfer items') THEN
    CREATE POLICY "Users can manage branch transfer items" ON branch_transfer_items
      FOR ALL USING (
        transfer_id IN (
          SELECT id FROM branch_transfers WHERE organization_id IN (
            SELECT organization_id FROM memberships WHERE user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

-- 6. Automatic Backfill for Existing Organizations & Data
-- A. Create default "Main Branch" for each existing organization if none exists
INSERT INTO branches (organization_id, name, code, branch_type, is_default, is_active, phone, email, address, state_code, gstin)
SELECT
  o.id,
  COALESCE(o.name, 'Main Branch'),
  'MAIN',
  'retail',
  true,
  true,
  o.phone,
  o.email,
  o.address,
  o.state_code,
  o.gstin
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM branches b WHERE b.organization_id = o.id AND b.is_default = true
)
ON CONFLICT (organization_id, code) DO NOTHING;

-- B. Populate branch_inventory from existing inventory table
INSERT INTO branch_inventory (organization_id, branch_id, product_id, stock_qty, reorder_level)
SELECT
  i.organization_id,
  b.id,
  i.product_id,
  i.stock_qty,
  i.reorder_level
FROM inventory i
JOIN branches b ON b.organization_id = i.organization_id AND b.is_default = true
ON CONFLICT (branch_id, product_id) DO UPDATE
SET stock_qty = EXCLUDED.stock_qty, reorder_level = EXCLUDED.reorder_level;

-- C. Backfill branch_id on sales, purchases, and expenses
UPDATE sales s
SET branch_id = b.id
FROM branches b
WHERE b.organization_id = s.organization_id AND b.is_default = true AND s.branch_id IS NULL;

UPDATE purchases p
SET branch_id = b.id
FROM branches b
WHERE b.organization_id = p.organization_id AND b.is_default = true AND p.branch_id IS NULL;

UPDATE expenses e
SET branch_id = b.id
FROM branches b
WHERE b.organization_id = e.organization_id AND b.is_default = true AND e.branch_id IS NULL;
