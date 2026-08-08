-- 018_units_and_conversions.sql
-- Unit-of-measure + conversion system (IPPOBILL_GAP_CHECKLIST.md CRITICAL #2)

-- 1a. New units table (mirrors categories exactly)
CREATE TABLE IF NOT EXISTS units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  allow_decimal   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_units_org ON units(organization_id);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view units" ON units;
CREATE POLICY "Members can view units" ON units FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

DROP POLICY IF EXISTS "Managers can manage units" ON units;
CREATE POLICY "Managers can manage units" ON units FOR ALL
  USING (my_role_in_org(organization_id) = ANY (ARRAY['owner'::user_role, 'manager'::user_role]));

-- 1b. Seed 10 starter units for every EXISTING organization
INSERT INTO units (organization_id, name, symbol, allow_decimal)
SELECT o.id, u.name, u.symbol, u.allow_decimal
FROM organizations o
CROSS JOIN (VALUES
  ('Piece', 'pc', false), ('Kilogram', 'kg', true), ('Gram', 'g', true),
  ('Litre', 'L', true), ('Millilitre', 'ml', true), ('Box', 'box', false),
  ('Dozen', 'dz', false), ('Pack', 'pack', false), ('Meter', 'm', true), ('Bag', 'bag', false)
) AS u(name, symbol, allow_decimal)
ON CONFLICT (organization_id, name) DO NOTHING;

-- 1c. products — new columns, backfilled to each org's "Piece" row, then locked NOT NULL
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS secondary_unit_id UUID REFERENCES units(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(10,3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'products' AND constraint_name = 'products_conversion_factor_positive_chk'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_conversion_factor_positive_chk
      CHECK (conversion_factor IS NULL OR conversion_factor > 0);
  END IF;
END $$;

UPDATE products p SET unit_id = (
  SELECT id FROM units WHERE organization_id = p.organization_id AND name = 'Piece' LIMIT 1
) WHERE unit_id IS NULL;

ALTER TABLE products ALTER COLUMN unit_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'products' AND constraint_name = 'products_secondary_unit_pair_chk'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_secondary_unit_pair_chk
      CHECK (
        (secondary_unit_id IS NULL AND conversion_factor IS NULL)
        OR (secondary_unit_id IS NOT NULL AND conversion_factor IS NOT NULL AND secondary_unit_id <> unit_id)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_unit ON products(unit_id);

-- 1d. Qty column widening — INTEGER -> NUMERIC(12,3)
ALTER TABLE inventory
  ALTER COLUMN stock_qty TYPE NUMERIC(12,3) USING stock_qty::NUMERIC(12,3),
  ALTER COLUMN reorder_level TYPE NUMERIC(12,3) USING reorder_level::NUMERIC(12,3);
ALTER TABLE inventory_batches ALTER COLUMN qty TYPE NUMERIC(12,3) USING qty::NUMERIC(12,3);
ALTER TABLE product_variants ALTER COLUMN stock_qty TYPE NUMERIC(12,3) USING stock_qty::NUMERIC(12,3);
ALTER TABLE purchase_items ALTER COLUMN qty TYPE NUMERIC(12,3) USING qty::NUMERIC(12,3);
ALTER TABLE quotation_items ALTER COLUMN qty TYPE NUMERIC(12,3) USING qty::NUMERIC(12,3);
ALTER TABLE return_items ALTER COLUMN qty TYPE NUMERIC(12,3) USING qty::NUMERIC(12,3);
ALTER TABLE sale_items ALTER COLUMN qty TYPE NUMERIC(12,3) USING qty::NUMERIC(12,3);
ALTER TABLE stock_movements ALTER COLUMN qty_change TYPE NUMERIC(12,3) USING qty_change::NUMERIC(12,3);

-- 1e. increment_inventory RPC — integer -> numeric.
-- NOTE: CREATE OR REPLACE with a changed parameter TYPE creates an overload in Postgres, it does
-- NOT replace the existing function — the old integer-typed version must be dropped explicitly,
-- otherwise both signatures resolve and callers can still hit the stale integer one.
DROP FUNCTION IF EXISTS public.increment_inventory(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION increment_inventory(p_org_id uuid, p_product_id uuid, p_qty numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE inventory SET stock_qty = stock_qty + p_qty, updated_at = now()
  WHERE organization_id = p_org_id AND product_id = p_product_id;
END;
$$;

-- 1f. Seed starter units for every NEW organization going forward
CREATE OR REPLACE FUNCTION create_organization_for_user(
  p_name TEXT,
  p_business_type TEXT,
  p_state_code TEXT,
  p_gstin TEXT DEFAULT NULL::text,
  p_primary_color TEXT DEFAULT '#6366f1'::text,
  p_feature_flags JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM memberships WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already has an organization';
  END IF;

  INSERT INTO organizations (name, business_type, state_code, gstin, country, plan, status)
  VALUES (p_name, p_business_type::business_type, p_state_code, p_gstin, 'IN', 'free', 'active')
  RETURNING id INTO v_org_id;

  INSERT INTO org_settings (organization_id, branding, feature_flags)
  VALUES (
    v_org_id,
    jsonb_build_object('primary_color', p_primary_color, 'shop_name', p_name),
    p_feature_flags
  );

  INSERT INTO memberships (user_id, organization_id, role)
  VALUES (v_user_id, v_org_id, 'owner');

  INSERT INTO units (organization_id, name, symbol, allow_decimal)
  VALUES
    (v_org_id, 'Piece', 'pc', false), (v_org_id, 'Kilogram', 'kg', true),
    (v_org_id, 'Gram', 'g', true), (v_org_id, 'Litre', 'L', true),
    (v_org_id, 'Millilitre', 'ml', true), (v_org_id, 'Box', 'box', false),
    (v_org_id, 'Dozen', 'dz', false), (v_org_id, 'Pack', 'pack', false),
    (v_org_id, 'Meter', 'm', true), (v_org_id, 'Bag', 'bag', false);

  RETURN jsonb_build_object('organization_id', v_org_id, 'success', true);
END;
$$;
