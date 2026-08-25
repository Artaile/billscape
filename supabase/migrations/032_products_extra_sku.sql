-- products.sku (the auto-generated PC0001-style code) is the parent product's primary code,
-- shown as "Product Code" throughout the app. This adds a second, genuinely optional identifier
-- field — mirroring product_variants' own separate barcode_value + sku columns — for a merchant's
-- own external SKU/reference code that doesn't have to follow the PC#### convention.
alter table products
  add column if not exists extra_sku text;

create index if not exists idx_products_extra_sku
  on products (organization_id, extra_sku)
  where extra_sku is not null;
