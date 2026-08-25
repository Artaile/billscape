-- supabase/migrations/027_variant_redesign.sql

-- ── Part A: new columns on product_variants ──────────────────────────────────
alter table product_variants
  add column if not exists variant_name text,
  add column if not exists sku text,
  add column if not exists tax_rate smallint check (tax_rate in (0, 5, 12, 18, 28)),
  add column if not exists sale_price numeric(10,2),
  add column if not exists sale_gst_mode text check (sale_gst_mode in ('include', 'exclude')) default 'include',
  add column if not exists purchase_price numeric(10,2),
  add column if not exists purchase_gst_mode text check (purchase_gst_mode in ('include', 'exclude')) default 'include',
  add column if not exists expiry_date date,
  add column if not exists qty numeric(12,3);

-- variant_name backfill for existing rows: combine size+color so old data still displays sensibly
-- under the new "Variant Name" field instead of showing blank.
update product_variants
set variant_name = trim(both ' · ' from concat_ws(' · ', size, color))
where variant_name is null and (size is not null or color is not null);

-- ── Part B: separate variant-scoped stock tracking ───────────────────────────
-- Deliberately NOT touching the existing `inventory`/`stock_movements` tables or their
-- triggers (decrement_stock_on_sale, increment_stock_on_purchase, increment_inventory) —
-- those run on every non-variant sale/purchase today and must not be put at risk. Variant
-- stock is tracked in fully separate tables with their own RPC, mirroring the existing
-- pattern exactly but scoped to product_variant_id instead of product_id.

create table if not exists variant_inventory (
  product_variant_id uuid primary key references product_variants(id) on delete cascade,
  organization_id     uuid not null references organizations(id) on delete cascade,
  stock_qty           numeric(12,3) not null default 0,
  updated_at           timestamptz not null default now()
);
create index if not exists idx_variant_inventory_org on variant_inventory(organization_id);

create table if not exists variant_stock_movements (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  product_variant_id  uuid not null references product_variants(id) on delete cascade,
  qty_change          numeric(12,3) not null,
  reason              stock_movement_reason not null,
  reference_id        uuid,
  note                text,
  created_by          uuid not null references auth.users(id),
  created_at          timestamptz not null default now()
);
create index if not exists idx_variant_stock_movements_org on variant_stock_movements(organization_id);
create index if not exists idx_variant_stock_movements_variant on variant_stock_movements(product_variant_id);

alter table variant_inventory enable row level security;
alter table variant_stock_movements enable row level security;

create policy "variant_inventory_select" on variant_inventory for select
  using (organization_id in (select organization_id from my_org_ids()));
create policy "variant_inventory_manage" on variant_inventory for all
  using (organization_id in (select organization_id from my_org_ids()))
  with check (organization_id in (select organization_id from my_org_ids()));

create policy "variant_stock_movements_select" on variant_stock_movements for select
  using (organization_id in (select organization_id from my_org_ids()));
create policy "variant_stock_movements_insert" on variant_stock_movements for insert
  with check (organization_id in (select organization_id from my_org_ids()));

-- One-time seed: give every existing variant a variant_inventory row matching its current
-- qty/stock_qty column, so the two systems start in sync rather than every variant reading
-- as 0 stock the first time this ships.
insert into variant_inventory (product_variant_id, organization_id, stock_qty)
select id, organization_id, coalesce(qty, stock_qty, 0) from product_variants
on conflict (product_variant_id) do nothing;

-- Mirrors the existing increment_inventory(p_org_id, p_product_id, p_qty) RPC exactly,
-- scoped to variant_inventory instead of inventory.
create or replace function increment_variant_inventory(p_org_id uuid, p_variant_id uuid, p_qty numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  update variant_inventory set stock_qty = stock_qty + p_qty, updated_at = now()
  where organization_id = p_org_id and product_variant_id = p_variant_id;
end;
$$;
