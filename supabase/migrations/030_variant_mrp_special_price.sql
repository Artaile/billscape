-- supabase/migrations/030_variant_mrp_special_price.sql
--
-- Adds MRP and Special Price to product_variants, matching the parent product's own
-- mrp/special_price fields (products table) but per-variant — a 9W bulb and a 12W bulb
-- genuinely have different MRP/SP, same as they already have different sale_price/purchase_price.
-- Additive only, nullable, no backfill needed (no existing variant had these concepts before).

alter table product_variants
  add column if not exists mrp numeric(10,2),
  add column if not exists special_price numeric(10,2);
