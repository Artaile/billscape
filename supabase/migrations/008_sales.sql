CREATE TABLE sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_no      TEXT NOT NULL,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  subtotal        NUMERIC(12, 2) NOT NULL,
  discount_total  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_total       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  grand_total     NUMERIC(12, 2) NOT NULL,
  payment_mode    payment_mode NOT NULL DEFAULT 'cash',
  cash_amount     NUMERIC(12, 2),
  card_amount     NUMERIC(12, 2),
  upi_amount      NUMERIC(12, 2),
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, invoice_no)
);

CREATE INDEX idx_sales_org ON sales(organization_id);
CREATE INDEX idx_sales_created_at ON sales(organization_id, created_at DESC);
CREATE INDEX idx_sales_invoice ON sales(organization_id, invoice_no);

CREATE TABLE sale_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  product_name    TEXT NOT NULL,
  hsn_code        TEXT,
  qty             INTEGER NOT NULL CHECK (qty > 0),
  unit_price      NUMERIC(12, 2) NOT NULL,
  discount_pct    NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tax_rate        SMALLINT NOT NULL DEFAULT 0,
  cgst_amount     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sgst_amount     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  igst_amount     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(12, 2) NOT NULL
);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(organization_id, product_id);

-- Auto-decrement stock when sale_items inserted
CREATE OR REPLACE FUNCTION decrement_stock_on_sale()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Decrement inventory
  UPDATE inventory
  SET stock_qty = stock_qty - NEW.qty
  WHERE product_id = NEW.product_id;

  -- Log movement
  INSERT INTO stock_movements (organization_id, product_id, qty_change, reason, reference_id, created_by)
  SELECT
    NEW.organization_id,
    NEW.product_id,
    -NEW.qty,
    'sale',
    NEW.sale_id,
    (SELECT created_by FROM sales WHERE id = NEW.sale_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_sale_item_created
  AFTER INSERT ON sale_items
  FOR EACH ROW EXECUTE FUNCTION decrement_stock_on_sale();
