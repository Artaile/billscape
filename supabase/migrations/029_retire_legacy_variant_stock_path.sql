-- supabase/migrations/029_retire_legacy_variant_stock_path.sql
--
-- Task 9's QC pass found that a SECOND, pre-existing variant stock mechanism already lived in
-- the database before this plan started: migration 20260808182547_variant_sales.sql (2026-08-08,
-- 16 days before this plan) added sale_items.variant_id/variant_label, a variant block inside
-- decrement_stock_on_sale() that decrements product_variants.stock_qty directly, and an
-- increment_inventory_variant() RPC explicitly intended for updateSale/voidSale/restoreSale.
--
-- This plan (027_variant_redesign.sql onward) independently built a SEPARATE mechanism
-- (variant_inventory + variant_stock_movements + increment_variant_inventory) without knowing
-- the older one existed. Both cannot stay live: the moment any code path sets
-- sale_items.variant_id, a single variant sale would be decremented by BOTH mechanisms for the
-- same quantity.
--
-- Decision (confirmed with the user): keep the new variant_inventory-based system as the single
-- source of truth for per-variant stock; retire the older mechanism. It has been confirmed
-- dormant (packages/api/src/sales.ts's buildSaleItemRows never sets variant_id; 0 of 115
-- sale_items rows have one as of this migration) and has zero app-code references
-- (increment_inventory_variant is not called from anywhere in packages/ or apps/), so this is
-- safe to retire now rather than after it accumulates real data.
--
-- What this migration does:
--   1. Removes the variant block from decrement_stock_on_sale() — the function now only ever
--      touches the parent product's own `inventory` row (its pre-2026-08-08 behavior), exactly
--      matching increment_stock_on_purchase/increment_inventory, which this plan's Task 9 QC
--      pass already confirmed are untouched and variant-free.
--   2. Drops increment_inventory_variant() — its only intended callers (updateSale/voidSale/
--      restoreSale) never actually called it, and any future variant-stock reversal work must be
--      built against increment_variant_inventory()/variant_inventory instead.
--   3. Does NOT drop sale_items.variant_id/variant_label or their index — those columns are
--      harmless while unused, and dropping them is unnecessary risk for zero benefit. If a
--      future need arises to remove them entirely, that can be a separate, deliberate migration.

create or replace function public.decrement_stock_on_sale()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update inventory
  set stock_qty = stock_qty - new.qty
  where product_id = new.product_id;

  insert into stock_movements (organization_id, product_id, qty_change, reason, reference_id, created_by)
  select
    new.organization_id,
    new.product_id,
    -new.qty,
    'sale',
    new.sale_id,
    (select created_by from sales where id = new.sale_id);

  return new;
end;
$function$;

drop function if exists public.increment_inventory_variant(uuid, uuid, uuid, numeric);
