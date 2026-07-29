-- Unified purchase entry: new fields for purchases, purchase_items, and products
-- (products.mrp / products.special_price / purchases.purchase_date / purchases.purchase_type
--  / bill discount + round off / per-line GST on purchase_items)

ALTER TABLE purchases
  ADD COLUMN purchase_date       DATE DEFAULT CURRENT_DATE,
  ADD COLUMN purchase_type       TEXT NOT NULL DEFAULT 'credit' CHECK (purchase_type IN ('credit', 'cash')),
  ADD COLUMN bill_discount_type  TEXT CHECK (bill_discount_type IN ('flat', 'percent')),
  ADD COLUMN bill_discount_value NUMERIC(12, 2),
  ADD COLUMN round_off           NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE purchase_items
  ADD COLUMN tax_rate       SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN taxable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN cgst_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN sgst_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN igst_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE products
  ADD COLUMN mrp            NUMERIC(12, 2),
  ADD COLUMN special_price  NUMERIC(12, 2);

-- Fix stock double-counting: the app previously ran a manual inventory upsert on top of this
-- trigger for every product-linked purchase item, inflating stock_qty by 2x per purchase.
-- The app-side upsert is being removed; this trigger remains the single source of truth for
-- stock adjustment on purchase_items insert. Recreated here unchanged, only to document intent
-- (guard for NULL product_id already present on the live DB from a prior untracked fix).
CREATE OR REPLACE FUNCTION increment_stock_on_purchase()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.organization_id, p.created_by INTO v_org_id, v_user_id
  FROM purchases p WHERE p.id = NEW.purchase_id;

  INSERT INTO inventory (product_id, organization_id, stock_qty)
  VALUES (NEW.product_id, v_org_id, NEW.qty)
  ON CONFLICT (product_id) DO UPDATE
  SET stock_qty = inventory.stock_qty + NEW.qty;

  INSERT INTO stock_movements (organization_id, product_id, qty_change, reason, reference_id, created_by)
  VALUES (v_org_id, NEW.product_id, NEW.qty, 'purchase', NEW.purchase_id, v_user_id);

  RETURN NEW;
END;
$$;
