-- supabase/migrations/031_purchase_items_variant.sql

alter table purchase_items
  add column if not exists product_variant_id uuid references product_variants(id) on delete set null;

create index if not exists idx_purchase_items_variant on purchase_items(product_variant_id) where product_variant_id is not null;

-- A variant-linked purchase_items row must NOT also increment the parent product's own
-- `inventory` row — variant stock is tracked exclusively via variant_inventory
-- (packages/api/src/variantInventory.ts's recordVariantPurchase, called from
-- packages/api/src/purchases.ts). Without this guard, once purchase_items gets one row per
-- variant (all sharing the same parent product_id), this trigger would fire once per variant
-- and add each variant's qty to the parent's inventory — multiplying an already-intentionally-
-- stale number instead of merely ignoring it.
create or replace function increment_stock_on_purchase()
returns trigger language plpgsql security definer set search_path = public as $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.product_variant_id IS NOT NULL THEN
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
