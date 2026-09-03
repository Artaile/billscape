-- Per-variant HSN Code, matching the merchant UX request to enter it on each variant row in
-- the Purchase entry form's variant editor rather than only at the parent product level.
-- Mirrors products.hsn_code (nullable text, no format constraint enforced at the DB layer —
-- the 4/6/8-digit check is done client-side, same as products.hsn_code).
alter table product_variants
  add column if not exists hsn_code text;
