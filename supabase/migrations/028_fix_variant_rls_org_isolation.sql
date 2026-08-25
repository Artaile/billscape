-- supabase/migrations/028_fix_variant_rls_org_isolation.sql
--
-- CRITICAL FIX: the RLS policies added in 027_variant_redesign.sql for variant_inventory and
-- variant_stock_movements used `select organization_id from my_org_ids()` with no column alias
-- on the function call. The live my_org_ids() function returns a bare `SETOF uuid` (not a named
-- TABLE(organization_id uuid) as the original migration 004 file suggests — it was redefined at
-- some point after that migration ran), so the unaliased `organization_id` in the subquery
-- resolved as a correlated reference back to the OUTER table's own organization_id column
-- instead of the function's return value. The predicate degenerated to
-- `organization_id IN (organization_id)`, which is always true — every authenticated user could
-- read and write every other org's variant_inventory / variant_stock_movements rows.
--
-- Found live via Task 9's QC pass: impersonating a real user of one org returned rows from a
-- second, unrelated org (8 rows visible, 6 leaked), and a same-session UPDATE touched those 6
-- foreign rows. The correctly-working pattern on the existing `inventory`/`stock_movements`
-- tables (migration 011_rls.sql) explicitly aliases the function's output column:
-- `from my_org_ids() my_org_ids(organization_id)` — this migration applies the identical fix.

drop policy if exists "variant_inventory_select" on variant_inventory;
drop policy if exists "variant_inventory_manage" on variant_inventory;
drop policy if exists "variant_stock_movements_select" on variant_stock_movements;
drop policy if exists "variant_stock_movements_insert" on variant_stock_movements;

create policy "variant_inventory_select" on variant_inventory for select
  using (organization_id in (select organization_id from my_org_ids() my_org_ids(organization_id)));
create policy "variant_inventory_manage" on variant_inventory for all
  using (organization_id in (select organization_id from my_org_ids() my_org_ids(organization_id)))
  with check (organization_id in (select organization_id from my_org_ids() my_org_ids(organization_id)));

create policy "variant_stock_movements_select" on variant_stock_movements for select
  using (organization_id in (select organization_id from my_org_ids() my_org_ids(organization_id)));
create policy "variant_stock_movements_insert" on variant_stock_movements for insert
  with check (organization_id in (select organization_id from my_org_ids() my_org_ids(organization_id)));
