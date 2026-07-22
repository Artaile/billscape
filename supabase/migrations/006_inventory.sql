-- Current inventory levels
CREATE TABLE inventory (
  product_id      UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stock_qty       INTEGER NOT NULL DEFAULT 0,
  reorder_level   INTEGER NOT NULL DEFAULT 5,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_org ON inventory(organization_id);
CREATE INDEX idx_inventory_low_stock ON inventory(organization_id, stock_qty, reorder_level);

CREATE TRIGGER inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Stock movement log
CREATE TABLE stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty_change      INTEGER NOT NULL,
  reason          stock_movement_reason NOT NULL,
  reference_id    UUID,
  note            TEXT,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_org ON stock_movements(organization_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
