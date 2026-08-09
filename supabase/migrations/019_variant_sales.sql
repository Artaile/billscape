-- Variant-aware POS: a sale line can now reference a specific product_variants row
-- (e.g. "T-Shirt — Red / L") instead of only the base product. Scanning a variant's own
-- barcode at POS must ring up that exact variant's price (product.price + variant.price_delta)
-- and decrement that variant's own stock_qty, while the aggregate products.stock_qty in
-- `inventory` continues to represent total stock across all variants (existing reports/
-- low-stock alerts keep working unchanged).

ALTER TABLE sale_items ADD COLUMN variant_id UUID REFERENCES product_variants(id);
ALTER TABLE sale_items ADD COLUMN variant_label TEXT;

CREATE INDEX idx_sale_items_variant ON sale_items(variant_id) WHERE variant_id IS NOT NULL;

-- Replaces decrement_stock_on_sale (008_sales.sql): same base-inventory decrement as before,
-- plus a per-variant stock_qty decrement when the line is variant-specific.
CREATE OR REPLACE FUNCTION decrement_stock_on_sale()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE inventory
  SET stock_qty = stock_qty - NEW.qty
  WHERE product_id = NEW.product_id;

  IF NEW.variant_id IS NOT NULL THEN
    UPDATE product_variants
    SET stock_qty = GREATEST(0, stock_qty - NEW.qty)
    WHERE id = NEW.variant_id;
  END IF;

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

-- Mirrors increment_inventory (012_billing_history.sql / 018_units_and_conversions.sql) but also
-- adjusts a variant's own stock_qty when p_variant_id is supplied — used by updateSale/voidSale/
-- restoreSale in packages/api/src/sales.ts wherever the line being reversed/reapplied has a
-- variant_id, so product_variants.stock_qty never drifts from the aggregate inventory total.
CREATE OR REPLACE FUNCTION increment_inventory_variant(p_org_id uuid, p_product_id uuid, p_variant_id uuid, p_qty numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE inventory SET stock_qty = stock_qty + p_qty, updated_at = now()
  WHERE organization_id = p_org_id AND product_id = p_product_id;

  IF p_variant_id IS NOT NULL THEN
    UPDATE product_variants
    SET stock_qty = GREATEST(0, stock_qty + p_qty)
    WHERE id = p_variant_id;
  END IF;
END;
$$;
