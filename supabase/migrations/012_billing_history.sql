-- Billing History feature: void/recycle-bin, order-level discount, line flat-discount,
-- increment_inventory RPC (referenced by Returns but was never defined), UPDATE/DELETE RLS.

-- ─── Void / soft-delete support on sales ───────────────────────────────────────
ALTER TABLE sales ADD COLUMN voided_at timestamptz;
ALTER TABLE sales ADD COLUMN voided_by uuid REFERENCES auth.users(id);
ALTER TABLE sales ADD COLUMN void_reason text;
ALTER TABLE sales ADD COLUMN purge_after timestamptz;

CREATE INDEX idx_sales_voided_at ON sales(voided_at) WHERE voided_at IS NOT NULL;

-- ─── Order-level discount (applied post-tax, on grand_total) ───────────────────
ALTER TABLE sales ADD COLUMN order_discount_type text CHECK (order_discount_type IN ('flat', 'percent'));
ALTER TABLE sales ADD COLUMN order_discount_value numeric NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN order_discount_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN net_payable numeric;

UPDATE sales SET net_payable = grand_total WHERE net_payable IS NULL;
ALTER TABLE sales ALTER COLUMN net_payable SET NOT NULL;
ALTER TABLE sales ALTER COLUMN net_payable SET DEFAULT 0;

-- ─── Line-level flat discount option (existing discount_pct kept for percent mode) ─
ALTER TABLE sale_items ADD COLUMN discount_type text NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('flat', 'percent'));
ALTER TABLE sale_items ADD COLUMN discount_amount numeric NOT NULL DEFAULT 0;

-- ─── increment_inventory RPC (used by Returns page; was missing from migrations) ──
CREATE OR REPLACE FUNCTION increment_inventory(p_org_id uuid, p_product_id uuid, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE inventory
  SET stock_qty = stock_qty + p_qty, updated_at = now()
  WHERE organization_id = p_org_id AND product_id = p_product_id;
END;
$$;

-- ─── RLS: add UPDATE/DELETE policies (previously only SELECT/INSERT existed) ──────
CREATE POLICY "Members can update sales" ON sales FOR UPDATE
  USING (organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid()));

CREATE POLICY "Members can delete sales" ON sales FOR DELETE
  USING (organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid()));

CREATE POLICY "Members can update sale items" ON sale_items FOR UPDATE
  USING (organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid()));

CREATE POLICY "Members can delete sale items" ON sale_items FOR DELETE
  USING (organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid()));
