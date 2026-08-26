-- A non-variant product's purchase entry row gets two fields it never had before:
-- expiry_date (a simple product-level expiry, distinct from the existing per-batch
-- expiry_date on inventory_batches, for the common case of a single-batch/non-batch-tracked
-- product that still has a shelf life), and gst_mode (whether the typed prices are
-- tax-inclusive or exclusive, mirroring product_variants.sale_gst_mode/purchase_gst_mode).
alter table products
  add column if not exists expiry_date date,
  add column if not exists gst_mode text not null default 'include' check (gst_mode in ('include', 'exclude'));
