-- Loyalty Program POS integration: link loyalty_customers to customers table,
-- add redemption/earn tracking columns to sales, wire loyalty_transactions.sale_id.

-- ─── Link loyalty_customers to customers ───────────────────────────────────
ALTER TABLE loyalty_customers ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_loyalty_customers_org_customer
  ON loyalty_customers(organization_id, customer_id)
  WHERE customer_id IS NOT NULL;

-- Best-effort backfill: match existing standalone loyalty rows to customers by phone within same org
UPDATE loyalty_customers lc
SET customer_id = c.id
FROM customers c
WHERE lc.organization_id = c.organization_id
  AND lc.customer_id IS NULL
  AND lc.customer_phone IS NOT NULL
  AND lc.customer_phone = c.phone;

-- ─── Loyalty redemption/earn tracking on sales ─────────────────────────────
ALTER TABLE sales ADD COLUMN loyalty_customer_id uuid REFERENCES loyalty_customers(id);
ALTER TABLE sales ADD COLUMN loyalty_points_redeemed integer NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN loyalty_redeem_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN loyalty_points_earned integer NOT NULL DEFAULT 0;
