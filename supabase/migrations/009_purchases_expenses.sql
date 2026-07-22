CREATE TABLE purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice_ref     TEXT,
  total_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchases_org ON purchases(organization_id);

CREATE TABLE purchase_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id),
  qty         INTEGER NOT NULL CHECK (qty > 0),
  unit_cost   NUMERIC(12, 2) NOT NULL,
  line_total  NUMERIC(12, 2) NOT NULL
);

CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);

-- Auto-increment stock when purchase items added
CREATE OR REPLACE FUNCTION increment_stock_on_purchase()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
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

CREATE TRIGGER on_purchase_item_created
  AFTER INSERT ON purchase_items
  FOR EACH ROW EXECUTE FUNCTION increment_stock_on_purchase();

-- Expenses
CREATE TABLE expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category        TEXT NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description     TEXT,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_org ON expenses(organization_id);
CREATE INDEX idx_expenses_date ON expenses(organization_id, date DESC);
