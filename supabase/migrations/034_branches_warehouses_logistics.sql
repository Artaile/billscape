-- ==============================================================================
-- Migration: 034_branches_warehouses_logistics.sql
-- Purpose: Multi-Branch, Multi-Warehouse, Inter-Branch Stock Transfers & RLS
-- ==============================================================================

-- 1. Create Enums
DO $$ BEGIN
  CREATE TYPE location_type AS ENUM ('head_office', 'retail_branch', 'warehouse');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE transfer_status AS ENUM ('open_in_transit', 'closed_accepted', 'pending_discrepancy', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Create `branches` Table
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  type location_type NOT NULL DEFAULT 'retail_branch',
  address TEXT,
  city VARCHAR(100),
  pincode VARCHAR(20),
  state_code VARCHAR(10),
  phone VARCHAR(20),
  email VARCHAR(255),
  gstin VARCHAR(20),
  invoice_prefix VARCHAR(20),
  invoice_start_number INT DEFAULT 1,
  enabled_features JSONB DEFAULT '{"billing":true,"products":true,"inventory":true,"purchases":true,"expenses":true,"reports":true,"employees":true}',
  is_main BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all new columns exist on `branches` if the table was created earlier
ALTER TABLE branches ADD COLUMN IF NOT EXISTS type location_type NOT NULL DEFAULT 'retail_branch';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS state_code VARCHAR(10);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS gstin VARCHAR(20);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(20);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS invoice_start_number INT DEFAULT 1;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS enabled_features JSONB DEFAULT '{"billing":true,"products":true,"inventory":true,"purchases":true,"expenses":true,"reports":true,"employees":true}';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_main BOOLEAN DEFAULT FALSE;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;


-- 3. Create `branch_inventory` Table
CREATE TABLE IF NOT EXISTS branch_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  stock_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(12,3) DEFAULT 10,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_branch_product_variant UNIQUE NULLS NOT DISTINCT (branch_id, product_id, variant_id)
);

-- 4. Create `stock_transfers` & `stock_transfer_items`
CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transfer_no VARCHAR(50) NOT NULL,
  sender_branch_id UUID NOT NULL REFERENCES branches(id),
  receiver_branch_id UUID NOT NULL REFERENCES branches(id),
  sender_user_id UUID NOT NULL REFERENCES profiles(id),
  receiver_user_id UUID REFERENCES profiles(id),
  vehicle_number VARCHAR(50),
  driver_name VARCHAR(100),
  driver_phone VARCHAR(20),
  status transfer_status NOT NULL DEFAULT 'open_in_transit',
  notes TEXT,
  discrepancy_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  sent_qty NUMERIC(12,3) NOT NULL,
  received_qty NUMERIC(12,3),
  unit_cost NUMERIC(12,2) DEFAULT 0
);

-- 5. Add `assigned_branch_id` and `branch_id` to existing tables
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS assigned_branch_id UUID REFERENCES branches(id);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS assigned_branch_id UUID REFERENCES branches(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- 6. Backward Compatibility: Auto-create Main Branch for existing Orgs & Copy Stock
INSERT INTO branches (organization_id, name, code, type, is_main, is_active)
SELECT id, name || ' (Main Branch)', 'MAIN', 'head_office', true, true
FROM organizations orgs
WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.organization_id = orgs.id);

-- Copy existing stock into branch_inventory for Main Branch
INSERT INTO branch_inventory (organization_id, branch_id, product_id, stock_qty, reorder_level)
SELECT i.organization_id, b.id, i.product_id, i.stock_qty, i.reorder_level
FROM inventory i
JOIN branches b ON b.organization_id = i.organization_id AND b.is_main = true
ON CONFLICT DO NOTHING;

-- 7. Enable RLS on new tables
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies
-- Branches Policy
DROP POLICY IF EXISTS "Users can view org branches" ON branches;
CREATE POLICY "Users can view org branches" ON branches
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners and managers can manage branches" ON branches;
CREATE POLICY "Owners and managers can manage branches" ON branches
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM memberships 
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Branch Inventory Policy
DROP POLICY IF EXISTS "Users can access branch inventory" ON branch_inventory;
CREATE POLICY "Users can access branch inventory" ON branch_inventory
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Stock Transfers Policy
DROP POLICY IF EXISTS "Users can access stock transfers" ON stock_transfers;
CREATE POLICY "Users can access stock transfers" ON stock_transfers
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM memberships WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can access stock transfer items" ON stock_transfer_items;
CREATE POLICY "Users can access stock transfer items" ON stock_transfer_items
  FOR ALL USING (
    transfer_id IN (
      SELECT id FROM stock_transfers WHERE organization_id IN (
        SELECT organization_id FROM memberships WHERE user_id = auth.uid()
      )
    )
  );

-- 9. Trigger for Branch Limits based on Dynamic Super Admin Plan Config
CREATE OR REPLACE FUNCTION check_branch_plan_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  -- 1. Try to fetch limit from org_plans -> plans
  SELECT (p.limits->>'branches')::INT INTO v_limit
  FROM org_plans op
  JOIN plans p ON p.id = op.plan_id
  WHERE op.organization_id = NEW.organization_id AND op.status = 'active'
  LIMIT 1;

  -- 2. Fallback: join organizations.plan with plans.name (case-insensitive)
  IF v_limit IS NULL THEN
    SELECT (p.limits->>'branches')::INT INTO v_limit
    FROM organizations o
    JOIN plans p ON LOWER(p.name) = LOWER(o.plan) OR p.id::text = o.plan
    WHERE o.id = NEW.organization_id
    LIMIT 1;
  END IF;

  -- Default to -1 if enterprise/unlimited or unset, fallback 1 if null
  v_limit := COALESCE(v_limit, -1);

  IF v_limit <> -1 THEN
    SELECT COUNT(*) INTO v_count FROM branches WHERE organization_id = NEW.organization_id;
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED:BRANCHES:%', v_limit;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS trigger_check_branch_plan_limit ON branches;
CREATE TRIGGER trigger_check_branch_plan_limit
  BEFORE INSERT ON branches
  FOR EACH ROW
  EXECUTE FUNCTION check_branch_plan_limit();
