# Per-Variant Purchase Line Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make purchase bill totals and GST reporting correctly derive from a variant-carrying purchase line's own per-variant qty/price/tax_rate instead of the currently-used, disconnected parent-level Purchase Rate/Qty fields — then hide those now-truly-redundant parent fields once safe.

**Architecture:** Add a nullable `purchase_items.product_variant_id` column. When a purchase line has variants, `buildItemRows` (shared by `createPurchase`/`updatePurchase`) emits one `purchase_items` row per variant instead of one row for the whole line, each with its own correct GST math via the existing `computeLineTax`. The pre-existing `increment_stock_on_purchase` trigger gets one added guard so it never touches the parent product's own `inventory` for a variant-linked row (avoiding a double/multiplied stock count). `updatePurchase`'s stock-reversal loop gets a matching variant-aware branch. Once bill totals no longer depend on the parent-level fields, they're hidden from the entry form when Track Variants is on. Two adjacent QC findings (stale parent price shown in POS/Products list for variant products; Product-form-created variants seeding 0 stock instead of their typed Qty) are fixed in the same plan since they're the same root confusion.

**Tech Stack:** Supabase (Postgres, RLS, triggers), React + TypeScript + Vite, `@billscape/core`'s `computeLineTax`/`computeGST`.

**Spec:** `docs/superpowers/specs/2026-08-25-per-variant-purchase-line-items-design.md`

## Global Constraints

- Business logic (GST/tax math) lives ONLY in `packages/core` — this plan reuses the existing `computeLineTax`/`computeGST`, never reimplements tax math inline.
- Every tenant table has `organization_id`; all queries filter on it — the new `purchase_items.product_variant_id` column and its index follow this repo's existing RLS pattern (no new RLS policy needed — `purchase_items` RLS is scoped by `organization_id`, already present, unaffected by adding a nullable column).
- USB/keyboard-wedge scanner and cashier cost-visibility rules are unaffected by this plan — no POS/scanning code is touched except the Products/POS price-display gating in Task 6.
- Branch `feature/purchases-ippobill-parity` — continue on this branch. Do NOT push or merge without explicit instruction.
- Known dev-environment gotcha: `apps/web`'s `@billscape/api` dependency resolves via `file:../../packages/api`, materialized by pnpm as a stale snapshot at `node_modules/.pnpm/@billscape+api@file+packages+api/node_modules/@billscape/api/src/` (at the REPO ROOT's `node_modules`, not `apps/web/node_modules`). After any `packages/api` change, copy the changed file(s) into that path, or the dev server / build will silently use stale code. Also clear `apps/web/node_modules/.vite` and restart `pnpm dev` after any `packages/api`/`packages/core` export shape change.
- Out of scope, do not attempt: restocking an existing variant-carrying product via Purchases (no UI path exists for this today — the variant editor only renders for new-product lines; see spec's Scope section).
- Live dev Supabase project: `bzvbkscspzdschskbqtd`. Apply migrations via `mcp__claude_ai_Supabase__apply_migration`.

---

### Task 1: Migration — `purchase_items.product_variant_id` + trigger guard

**Files:**
- Create: `supabase/migrations/031_purchase_items_variant.sql`

**Interfaces:**
- Produces: `purchase_items.product_variant_id` (nullable uuid, FK to `product_variants(id) ON DELETE SET NULL`), a partial index on it, and a redefined `increment_stock_on_purchase()` trigger function that early-returns for variant-linked rows.
- Consumes: nothing from other tasks (foundation task).

- [ ] **Step 1: Write and apply the migration**

```sql
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
```

Apply via `mcp__claude_ai_Supabase__apply_migration` with name `031_purchase_items_variant` and this exact SQL as the query. Also save the file at the path above so the migration is tracked in git.

- [ ] **Step 2: Verify the guard live**

Via `mcp__claude_ai_Supabase__execute_sql` against project `bzvbkscspzdschskbqtd`:

```sql
select prosrc from pg_proc where proname = 'increment_stock_on_purchase';
```

Confirm the returned body contains `IF NEW.product_variant_id IS NOT NULL THEN` before `SELECT p.organization_id`. Also confirm the column and index exist:

```sql
select column_name, data_type, is_nullable from information_schema.columns where table_name = 'purchase_items' and column_name = 'product_variant_id';
select indexname from pg_indexes where tablename = 'purchase_items' and indexname = 'idx_purchase_items_variant';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/031_purchase_items_variant.sql
git commit -m "feat: add purchase_items.product_variant_id, guard stock trigger against variant-linked rows"
```

---

### Task 2: `reverseVariantPurchase` helper

**Files:**
- Modify: `packages/api/src/variantInventory.ts`

**Interfaces:**
- Consumes: nothing new (uses the existing `TypedSupabaseClient` type and the existing `increment_variant_inventory` RPC, `variant_stock_movements` table — both already used by `recordVariantPurchase`/`recordVariantSale` in this same file).
- Produces: `reverseVariantPurchase(client, args: { organizationId: string; variantId: string; qty: number; referenceId?: string; createdBy: string }): Promise<{ error: PostgrestError | null }>` — consumed by Task 4.

The existing `adjustVariantStock` internal helper always forces a `'purchase'`-reason call to a positive quantity (`args.reason === 'sale' ? -Math.abs(qty) : Math.abs(qty)`), so it cannot express a reversal without changing behavior for its two existing callers, `recordVariantSale`/`recordVariantPurchase`, which must keep working exactly as they do today. `reverseVariantPurchase` is therefore a new, standalone function — not a new caller into `adjustVariantStock` — that duplicates its two-step body (RPC call, then movement-log insert) with an explicit negative qty and `reason: 'adjustment'` (already a valid `stock_movement_reason` enum value; matches the existing parent-product reversal's own `reason: 'adjustment'` convention in `packages/api/src/purchases.ts`'s `updatePurchase`).

- [ ] **Step 1: Add the function**

Add this function to `packages/api/src/variantInventory.ts`, placed after the existing `recordVariantPurchase` function:

```ts
// Reverses a previously-recorded variant purchase (used when editing a purchase — the
// original quantities must be un-applied before the new ones are inserted). Deliberately NOT
// implemented via adjustVariantStock, whose sign-forcing logic (`reason === 'sale' ? negative :
// positive`) cannot express a reversal without changing behavior for recordVariantSale/
// recordVariantPurchase, which must stay exactly as they are. reason: 'adjustment' matches the
// existing parent-product reversal's own convention in purchases.ts's updatePurchase.
export async function reverseVariantPurchase(
  client: TypedSupabaseClient,
  args: { organizationId: string; variantId: string; qty: number; referenceId?: string; createdBy: string },
) {
  const signedQty = -Math.abs(args.qty)
  const { error: rpcError } = await client.rpc('increment_variant_inventory', {
    p_org_id: args.organizationId,
    p_variant_id: args.variantId,
    p_qty: signedQty,
  })
  if (rpcError) return { error: rpcError }

  const { error: logError } = await client.from('variant_stock_movements').insert({
    organization_id: args.organizationId,
    product_variant_id: args.variantId,
    qty_change: signedQty,
    reason: 'adjustment',
    reference_id: args.referenceId ?? null,
    created_by: args.createdBy,
  })
  return { error: logError }
}
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @billscape/api build` if this package has its own build step; otherwise run `pnpm --filter @billscape/web build` (which type-checks against `packages/api`'s source via the workspace link) and confirm no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/variantInventory.ts
git commit -m "feat: add reverseVariantPurchase helper for purchase-edit stock reversal"
```

---

### Task 3: `resolveItems`/`createProductForLine` carry per-variant purchase-line data

**Files:**
- Modify: `packages/api/src/purchases.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: a new exported type `VariantLineSeed` and an updated `resolveItems` return shape — both consumed by Task 4 (`buildItemRows`/`createPurchase`/`updatePurchase`).

`createProductForLine`'s existing `variantSeeds: { variantId: string; qty: number }[]` return value already has everything needed to also build correct `purchase_items` rows per variant — it just needs three more fields carried through from data it already has in scope (`validVariants[i].purchase_price`, `.tax_rate`, `.variant_name`).

- [ ] **Step 1: Add the `VariantLineSeed` type**

In `packages/api/src/purchases.ts`, add this exported type near the top of the file, right after the existing `PurchaseLineInput` interface:

```ts
export interface VariantLineSeed {
  variantId: string
  qty: number
  purchasePrice: number
  taxRate: GSTRate
  variantName: string
}
```

- [ ] **Step 2: Update `createProductForLine`'s return type and variant-seed collection**

Find `createProductForLine`'s function signature (currently returns
`Promise<| { id: string; variantSeeds: { variantId: string; qty: number }[] } | ...>`).
Change the success branch's type to use `VariantLineSeed[]`:

```ts
async function createProductForLine(
  client: TypedSupabaseClient,
  orgId: string,
  createdBy: string,
  line: PurchaseLineInput,
  attempt = 0,
): Promise<
  | { id: string; variantSeeds: VariantLineSeed[] }
  | { error: { code?: string; message: string }; collidingField: 'sku' | 'barcode_value' | null }
> {
```

Find the existing variant-seed collection loop (searches for
`insertedVariants.forEach((iv: { id: string }, i: number) => {`). Replace it with:

```ts
        insertedVariants.forEach((iv: { id: string }, i: number) => {
          const qty = validVariants[i]?.qty ? Number(validVariants[i].qty) : 0
          if (qty > 0) {
            variantSeeds.push({
              variantId: iv.id,
              qty,
              purchasePrice: validVariants[i].purchase_price ? Number(validVariants[i].purchase_price) : 0,
              taxRate: validVariants[i].tax_rate,
              variantName: validVariants[i].variant_name,
            })
          }
        })
```

And update the `variantSeeds` local variable's own type declaration (searches for
`const variantSeeds: { variantId: string; qty: number }[] = []`) to
`const variantSeeds: VariantLineSeed[] = []`.

- [ ] **Step 3: Update `resolveItems` to attach per-line variant seeds onto each resolved item**

Find `resolveItems`'s function signature and body. Its return type currently is:

```ts
Promise<
  | { items: (PurchaseLineInput & { product_id: string })[]; variantSeeds: { variantId: string; qty: number }[]; error: null }
  | { items: null; variantSeeds: null; error: { message: string; line: PurchaseLineInput; collidingField: 'sku' | 'barcode_value' | null } }
>
```

Change `{ variantId: string; qty: number }[]` (both occurrences — the success branch's `variantSeeds` field) to `VariantLineSeed[]`. Then change the per-line item type to also carry `variantLineSeeds`:

```ts
Promise<
  | { items: (PurchaseLineInput & { product_id: string; variantLineSeeds: VariantLineSeed[] })[]; variantSeeds: VariantLineSeed[]; error: null }
  | { items: null; variantSeeds: null; error: { message: string; line: PurchaseLineInput; collidingField: 'sku' | 'barcode_value' | null } }
>
```

Find the two places `resolvedItems.push(...)` is called inside `resolveItems`'s loop. The first (existing-product path, inside `if (!line.is_new_product && line.product_id) { ... resolvedItems.push({ ...line, product_id: line.product_id }); continue }`) becomes:

```ts
      resolvedItems.push({ ...line, product_id: line.product_id, variantLineSeeds: [] })
      continue
```

The second (new-product path, after `const result = await createProductForLine(...)`) becomes:

```ts
    resolvedItems.push({ ...line, product_id: result.id, variantLineSeeds: result.variantSeeds })
    variantSeeds.push(...result.variantSeeds)
```

Also update the local `const resolvedItems: (PurchaseLineInput & { product_id: string })[] = []` and `const variantSeeds: { variantId: string; qty: number }[] = []` declarations at the top of `resolveItems`'s body to the new types (`variantLineSeeds: VariantLineSeed[]` added to the first; `VariantLineSeed[]` for the second).

- [ ] **Step 4: Build**

Run: `pnpm --filter @billscape/web build`. Expect TypeScript errors in `buildItemRows`, `createPurchase`, and `updatePurchase` (their existing code references the old `resolvedItems`/`variantSeeds` shapes) — these are fixed in Task 4. Confirm the errors are ONLY in those three locations (no unexpected breakage elsewhere), then stop — do not fix them in this task.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/purchases.ts
git commit -m "feat: carry per-variant purchase-line data (price/tax/name) through resolveItems"
```

(This commit will not build cleanly on its own — that's expected and resolved by Task 4, which must follow immediately. Note this in your task report.)

---

### Task 4: `buildItemRows` emits one row per variant; `createPurchase`/`updatePurchase` totals and reversal updated

**Files:**
- Modify: `packages/api/src/purchases.ts`

**Interfaces:**
- Consumes: `VariantLineSeed` type and `resolveItems`'s updated return shape (Task 3); `reverseVariantPurchase` (Task 2, import from `./variantInventory`).
- Produces: nothing new consumed by later tasks — this closes out the backend half of the fix.

This is the core fix. `buildItemRows` changes from "always one row per resolved item" to "one row per resolved item, OR one row per variant seed if the item has any" — a line with zero variant seeds (no variants, or variants with qty 0, which are already excluded from `variantSeeds`) falls through to exactly today's existing behavior.

- [ ] **Step 1: Rewrite `buildItemRows`**

Replace the entire `buildItemRows` function with:

```ts
function buildItemRows(
  purchaseId: string,
  orgId: string,
  resolvedItems: (PurchaseLineInput & { product_id: string; variantLineSeeds: VariantLineSeed[] })[],
  interstate: boolean,
) {
  const rows: {
    purchase_id: string
    organization_id: string
    product_id: string
    product_variant_id: string | null
    product_name: string
    tax_rate: GSTRate
    qty: number
    unit_cost: number
    taxable_amount: number
    cgst_amount: number
    sgst_amount: number
    igst_amount: number
    line_total: number
  }[] = []

  for (const it of resolvedItems) {
    if (it.variantLineSeeds.length > 0) {
      for (const seed of it.variantLineSeeds) {
        const lineTax = computeLineTax(seed.purchasePrice, seed.qty, 0, seed.taxRate, interstate)
        rows.push({
          purchase_id: purchaseId,
          organization_id: orgId,
          product_id: it.product_id,
          product_variant_id: seed.variantId,
          product_name: `${it.product_name} — ${seed.variantName}`,
          tax_rate: seed.taxRate,
          qty: seed.qty,
          unit_cost: seed.purchasePrice,
          taxable_amount: lineTax.taxableAmount,
          cgst_amount: lineTax.cgst,
          sgst_amount: lineTax.sgst,
          igst_amount: lineTax.igst,
          line_total: lineTax.lineTotal,
        })
      }
      continue
    }
    const lineTax = computeLineTax(it.unit_cost, it.qty, 0, it.tax_rate, interstate)
    rows.push({
      purchase_id: purchaseId,
      organization_id: orgId,
      product_id: it.product_id,
      product_variant_id: null,
      product_name: it.product_name,
      tax_rate: it.tax_rate,
      qty: it.qty,
      unit_cost: it.unit_cost,
      taxable_amount: lineTax.taxableAmount,
      cgst_amount: lineTax.cgst,
      sgst_amount: lineTax.sgst,
      igst_amount: lineTax.igst,
      line_total: lineTax.lineTotal,
    })
  }
  return rows
}
```

- [ ] **Step 2: Update `createPurchase`'s totals computation to use the built rows, not `resolvedItems`**

Find `createPurchase`. It currently calls `buildItemRows` AFTER computing `totals` via `computeGST(input.gst_context, resolvedItems.map(...))`. Reorder so `itemRows` is built first, then `totals` is computed FROM `itemRows` (so the bill total the customer sees always matches the sum of the rows just built — no risk of the two computations drifting):

Replace this block (search for `const totals = computeGST(` — the FIRST occurrence, inside `createPurchase`):

```ts
  const totals = computeGST(
    input.gst_context,
    resolvedItems.map((it, i) => ({
      product_id: String(i),
      product_name: it.product_name,
      tax_rate: it.tax_rate,
      unit_price: it.unit_cost,
      qty: it.qty,
      discount_pct: 0,
    })),
  )
```

with (note this now needs `itemRows`, which must be computed before this point — see the reordering below):

```ts
  const itemRows = buildItemRows(crypto.randomUUID(), input.organization_id, resolvedItems, interstate)
  const totals = computeGST(
    input.gst_context,
    itemRows.map((row, i) => ({
      product_id: String(i),
      product_name: row.product_name,
      tax_rate: row.tax_rate,
      unit_price: row.unit_cost,
      qty: row.qty,
      discount_pct: 0,
    })),
  )
```

This introduces a real problem: `buildItemRows`'s first argument is `purchaseId`, but the real `purchases.id` doesn't exist yet at this point (the `purchases` row is inserted AFTER totals are computed, since `total_amount` is part of that insert). `purchase_id` isn't actually used by any of `computeLineTax`'s math — it's only stamped onto the row object for the later `.insert()`. Use `crypto.randomUUID()` as shown above as a throwaway placeholder for this call, then rebuild `itemRows` a second time with the REAL `purchase.id` once the `purchases` row exists (this is a second `buildItemRows` call, immediately after the `purchases` insert succeeds — search for `const itemRows = buildItemRows(purchase.id, ...)`, which already exists further down and now becomes the authoritative real one; delete the placeholder computation's row objects, only its totals matter). Concretely:

- The FIRST `buildItemRows(...)` call (placeholder `purchaseId`) exists solely to feed `computeGST` — its row objects are discarded, never inserted.
- The EXISTING, later `buildItemRows(purchase.id, ...)` call (already in the function, right before `client.from('purchase_items').insert(itemRows)`) remains — this is the one whose rows are actually inserted, now correctly reusing the real `purchase.id`.

This does mean `computeLineTax` runs twice per variant line (once for the placeholder totals pass, once for the real insert pass) — this is acceptable; it's a pure function with no side effects, and the alternative (restructuring the whole insert-then-update-total flow) is a much larger change for no behavioral difference.

- [ ] **Step 3: Apply the identical change to `updatePurchase`**

Find `updatePurchase`'s own `const totals = computeGST(` block (the SECOND occurrence in the file, structurally identical to `createPurchase`'s). Apply the same two-pass pattern: a placeholder `buildItemRows` call (using `purchaseId` — which DOES already exist as a real value in `updatePurchase`'s case, since it's a parameter, not something inserted mid-function) feeds `computeGST`, and the existing later `buildItemRows(purchaseId, ...)` call (already present, right before `client.from('purchase_items').insert(itemRows)`) remains the authoritative one. Since `purchaseId` is already real and available for both calls in `updatePurchase` (unlike `createPurchase`), you may simply compute `itemRows` ONCE in `updatePurchase` and reuse it for both `computeGST`'s input and the final insert — do this simplification here specifically, since it removes the redundant double-computation that `createPurchase` cannot avoid:

```ts
  const itemRows = buildItemRows(purchaseId, input.organization_id, resolvedItems, interstate)
  const totals = computeGST(
    input.gst_context,
    itemRows.map((row, i) => ({
      product_id: String(i),
      product_name: row.product_name,
      tax_rate: row.tax_rate,
      unit_price: row.unit_cost,
      qty: row.qty,
      discount_pct: 0,
    })),
  )
```

Then find the LATER, now-duplicate `const itemRows = buildItemRows(purchaseId, ...)` call further down in `updatePurchase` (right before `client.from('purchase_items').insert(itemRows)`) and DELETE it — the `itemRows` computed above is reused directly for the insert.

- [ ] **Step 4: Update `updatePurchase`'s reversal loop to handle variant-linked old rows**

Find the reversal loop at the top of `updatePurchase` (searches for
`.select('product_id, qty')`). Replace:

```ts
  const { data: oldItems, error: oldItemsError } = await client
    .from('purchase_items')
    .select('product_id, qty')
    .eq('purchase_id', purchaseId)
  if (oldItemsError) return { data: null, error: oldItemsError }

  for (const item of oldItems ?? []) {
    if (!item.product_id) continue
    await client.rpc('increment_inventory', {
      p_org_id: input.organization_id,
      p_product_id: item.product_id,
      p_qty: -item.qty,
    })
    await client.from('stock_movements').insert({
      organization_id: input.organization_id,
      product_id: item.product_id,
      qty_change: -item.qty,
      reason: 'adjustment',
      reference_id: purchaseId,
      note: 'Purchase edited — original quantity reversed',
      created_by: input.created_by,
    })
  }
```

with:

```ts
  const { data: oldItems, error: oldItemsError } = await client
    .from('purchase_items')
    .select('product_id, product_variant_id, qty')
    .eq('purchase_id', purchaseId)
  if (oldItemsError) return { data: null, error: oldItemsError }

  for (const item of oldItems ?? []) {
    if (item.product_variant_id) {
      await reverseVariantPurchase(client, {
        organizationId: input.organization_id,
        variantId: item.product_variant_id,
        qty: item.qty,
        referenceId: purchaseId,
        createdBy: input.created_by,
      })
      continue
    }
    if (!item.product_id) continue
    await client.rpc('increment_inventory', {
      p_org_id: input.organization_id,
      p_product_id: item.product_id,
      p_qty: -item.qty,
    })
    await client.from('stock_movements').insert({
      organization_id: input.organization_id,
      product_id: item.product_id,
      qty_change: -item.qty,
      reason: 'adjustment',
      reference_id: purchaseId,
      note: 'Purchase edited — original quantity reversed',
      created_by: input.created_by,
    })
  }
```

- [ ] **Step 5: Add the import**

At the top of `packages/api/src/purchases.ts`, find `import { recordVariantPurchase } from './variantInventory'` and change it to:

```ts
import { recordVariantPurchase, reverseVariantPurchase } from './variantInventory'
```

- [ ] **Step 6: Build**

Run: `pnpm --filter @billscape/web build`. Expect a clean build with no TypeScript errors — this closes out the TypeScript errors deliberately left open at the end of Task 3.

- [ ] **Step 7: Sync the stale pnpm snapshot**

Per this plan's Global Constraints, copy the updated file into the stale snapshot path:

```bash
cp packages/api/src/purchases.ts node_modules/.pnpm/@billscape+api@file+packages+api/node_modules/@billscape/api/src/purchases.ts
cp packages/api/src/variantInventory.ts node_modules/.pnpm/@billscape+api@file+packages+api/node_modules/@billscape/api/src/variantInventory.ts
rm -rf apps/web/node_modules/.vite
```

- [ ] **Step 8: Manual verification — new variant purchase produces correct rows and total**

Restart the dev server (`pnpm dev`, after confirming no other process holds port 5173 — check with `lsof -i :5173 -sTCP:LISTEN` first and kill it if present, then start fresh so the Vite cache-clear from Step 7 actually takes effect). In the browser: go to `/purchases/new`, create a new product with 2 variants (e.g. "Verify Product", variant "A" qty 5 purchase-price 100 tax 18%, variant "B" qty 3 purchase-price 200 tax 18%), leave the parent-level Purchase Rate/Qty/MRP/Retail/SP at whatever they default to (do NOT fill them in — this is the point of the fix), save.

Via `mcp__claude_ai_Supabase__execute_sql` against `bzvbkscspzdschskbqtd`, confirm:

```sql
select product_variant_id, product_name, qty, unit_cost, tax_rate, taxable_amount, cgst_amount, sgst_amount, line_total
from purchase_items
where purchase_id = (select id from purchases order by created_at desc limit 1)
order by product_name;
```

Expect exactly 2 rows (not 1), each with the correct `qty`/`unit_cost`/`tax_rate` matching what was typed per variant (5×100 and 3×200), non-null `product_variant_id` values that resolve to the two real `product_variants` rows just created, and `purchases.total_amount` (query it separately) equal to the sum of both rows' `line_total` (plus round-off if any) — NOT the parent-level Purchase Rate × Qty (confirm this explicitly by checking what the parent fields were left at, and confirming the total does NOT match `parent_rate × parent_qty`).

Also confirm via SQL that `inventory.stock_qty` for the new parent product did NOT increase by either variant's qty (the trigger guard from Task 1 — query `select stock_qty from inventory where product_id = '<the new product id>'`, expect it to be whatever the base product's own stock ended up as, unrelated to 5 or 3), and that `variant_inventory.stock_qty` for each variant correctly shows 5 and 3 respectively.

- [ ] **Step 9: Manual verification — editing that purchase reverses correctly**

In the browser, edit the purchase just created (`/purchases/:id/edit`) — change variant A's qty to 10 (still same variant), save. Re-run the Step 8 query. Expect variant A's `variant_inventory.stock_qty` to now be 10 (not 15 — confirming the reversal correctly subtracted the original 5 before the trigger/`recordVariantPurchase` path added the new 10), and confirm via `select * from variant_stock_movements where product_variant_id = '<variant A id>' order by created_at` that there are movement rows showing the reversal (`reason: 'adjustment'`, `qty_change: -5`) followed by the new purchase record (`reason: 'purchase'`, `qty_change: 10`).

- [ ] **Step 10: Commit**

```bash
git add packages/api/src/purchases.ts
git commit -m "feat: buildItemRows emits one purchase_items row per variant, fixes wrong bill totals for variant purchases"
```

---

### Task 5: Purchase entry UI — Items table shows per-variant rows, parent fields hidden when Track Variants is on

**Files:**
- Modify: `apps/web/src/pages/purchases/PurchaseFormPage.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks (this is a pure UI change; the backend fix from Tasks 1-4 makes it safe).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Hide the parent-level Purchase Rate, Qty, MRP, Retail Price, SP fields when the entry has variants**

Find the "Row 2: Code, Barcode, GST%, Rate, Qty" grid (search for the comment `{/* Row 2: Code, Barcode, GST%, Rate, Qty */}`). The grid currently is `grid-cols-2 sm:grid-cols-5` containing 5 fields: Product Code, Barcode, GST %, Purchase Rate, Qty. Wrap ONLY the Purchase Rate and Qty field blocks (not Product Code/Barcode/GST%, which remain visible for a variant-carrying new product) in a variant check, and adjust the grid column count so the remaining 3 fields don't leave empty gaps:

```tsx
<div className={cn('grid grid-cols-2 gap-2', entry.has_variants ? 'sm:grid-cols-3' : 'sm:grid-cols-5')}>
  {/* Product Code field — unchanged, still always shown */}
  {/* Barcode field — unchanged, still always shown */}
  {/* GST % field — unchanged, still always shown */}

  {!entry.has_variants && (
    <div className="space-y-1">
      <Label className="text-xs">Purchase Rate</Label>
      <Input type="text" inputMode="decimal" value={entry.unit_cost} onFocus={(e) => e.target.select()}
        onChange={(e) => setEntry((p) => ({ ...p, unit_cost: e.target.value.replace(/[^0-9.]/g, '') || '0' }))} className="h-9 text-sm" />
      {taxInclusive && parseNum(entry.unit_cost) > 0 && entry.tax_rate > 0 && (() => {
        const { base, tax } = splitInclusiveGST(parseNum(entry.unit_cost), entry.tax_rate)
        return <p className="text-[10px] text-zinc-500">Base: {formatINR(base)} + GST: {formatINR(tax)}</p>
      })()}
    </div>
  )}

  {!entry.has_variants && (
    <div className="space-y-1">
      <Label className="text-xs">Qty *</Label>
      <Input type="text" inputMode="decimal" value={entry.qty} onFocus={(e) => e.target.select()}
        disabled={entry.has_batches}
        onChange={(e) => setEntry((p) => ({ ...p, qty: e.target.value.replace(/[^0-9.]/g, '') || '0' }))}
        className={cn('h-9 text-sm text-center', entry.has_batches && 'opacity-60 cursor-not-allowed')} />
      {entry.has_batches && (
        <p className="text-[10px] text-zinc-500">Allocated from batches below</p>
      )}
    </div>
  )}
</div>
```

(Keep the Product Code/Barcode/GST% field blocks exactly as they are today — only the Purchase Rate and Qty blocks gain the `{!entry.has_variants && (...)}` wrapper, and the grid's own className switches column count based on `entry.has_variants`.)

Find the "Row 3: MRP, Retail, SP, Add button" grid (search for the comment `{/* Row 3: MRP, Retail, SP, Add button */}`). Currently `grid-cols-2 sm:grid-cols-4` containing MRP, Retail Price, SP, and the Add/Update button. Wrap the three price fields (not the button) the same way:

```tsx
<div className={cn('grid grid-cols-2 gap-2 items-end', entry.has_variants ? 'sm:grid-cols-1' : 'sm:grid-cols-4')}>
  {!entry.has_variants && (
    <div className="space-y-1">
      <Label className="text-xs">MRP</Label>
      <Input type="text" inputMode="decimal" value={entry.mrp} onFocus={(e) => e.target.select()}
        onChange={(e) => setEntry((p) => ({ ...p, mrp: e.target.value.replace(/[^0-9.]/g, '') }))} className="h-9 text-sm" />
    </div>
  )}
  {!entry.has_variants && (
    <div className="space-y-1">
      <Label className="text-xs">Retail Price</Label>
      <Input type="text" inputMode="decimal" value={entry.price} onFocus={(e) => e.target.select()}
        onChange={(e) => setEntry((p) => ({ ...p, price: e.target.value.replace(/[^0-9.]/g, '') || '0' }))} className="h-9 text-sm" />
    </div>
  )}
  {!entry.has_variants && (
    <div className="space-y-1">
      <Label className="text-xs">SP (Special)</Label>
      <Input type="text" inputMode="decimal" value={entry.special_price} onFocus={(e) => e.target.select()}
        onChange={(e) => setEntry((p) => ({ ...p, special_price: e.target.value.replace(/[^0-9.]/g, '') }))} className="h-9 text-sm" />
    </div>
  )}
  <Button type="button" size="sm" className="h-9 w-full" onClick={addEntryToGrid}
    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntryToGrid() } }}>
    {editingIndex !== null ? (
      <><Pencil className="h-3.5 w-3.5 mr-1" />Update Item</>
    ) : (
      <><Plus className="h-3.5 w-3.5 mr-1" />Add to List</>
    )}
  </Button>
</div>
```

- [ ] **Step 2: Update `canAddEntry`'s Qty validation to accept variant-sourced qty**

`canAddEntry`'s first line currently is `if (!entry.product_name.trim() || parseNum(entry.qty) <= 0) return false` — this unconditionally requires the (now-hidden, for variant rows) parent Qty field to be positive, which would incorrectly block every variant row from ever being addable. Replace with:

```ts
  function canAddEntry(): boolean {
    if (!entry.product_name.trim()) return false
    if (!entry.has_variants && parseNum(entry.qty) <= 0) return false
    if (entry.has_variants && !entry.variants.some((v) => v.variant_name.trim() && parseNum(v.qty) > 0)) return false
    if (entry.is_new_product && (!entry.sku.trim() || !entry.barcode_value.trim())) return false
    if (entry.is_new_product && !entry.unit_id) return false
    if (entry.has_variants && entry.variants.some((v) => !v.variant_name.trim())) return false
    if (entry.has_batches && entry.batches.some((b) => !b.batch_no.trim() || !b.expiry_date)) return false
    if (entry.is_new_product && entry.codeError) return false
    return true
  }
```

(The new second line requires at least one variant with both a name AND a positive qty when `has_variants` is true — a variant-carrying row with zero variants having any real qty entered should not be addable, matching the spirit of the original "qty must be positive" check.)

Update `addEntryToGrid`'s error-message branch to cover this new case — find the `if (!canAddEntry()) { let msg = ... }` block and add a branch:

```ts
      let msg = entry.is_new_product ? 'Product code and barcode are required for a new product' : 'Enter product name and qty'
      if (entry.is_new_product && !entry.unit_id) {
        msg = 'Select a unit for the new product'
      } else if (entry.has_variants && !entry.variants.some((v) => v.variant_name.trim() && parseNum(v.qty) > 0)) {
        msg = 'At least one variant needs a name and a quantity greater than 0'
      } else if (entry.has_variants && entry.variants.some((v) => !v.variant_name.trim())) {
        msg = 'Each variant needs a name before it can be added — remove empty rows or fill them in'
      } else if (entry.has_batches && entry.batches.some((b) => !b.batch_no.trim() || !b.expiry_date)) {
        msg = 'Each batch row needs both a Batch No and an Expiry Date — remove empty rows or fill them in'
      } else if (entry.is_new_product && entry.codeError) {
        msg = entry.codeError
      }
```

(Insert the new `else if` branch for the variant-qty case BEFORE the existing "Each variant needs a name" branch, since a row failing both checks should show the more specific "needs a name and a quantity" message only when names are fine but qty is the problem — the existing name-check branch already handles the missing-name case.)

- [ ] **Step 3: Items table shows one row per variant for a variant-carrying line**

Find the Items table's row rendering (search for `) : rows.map((r, i) => (`). This currently renders exactly one `<TableRow>` per entry in `rows`. Change it to render one row per variant when `r.has_variants && r.variants.length > 0`, falling back to today's single-row rendering otherwise. Locate the full `<TableRow key={i} ...> ... </TableRow>` block that currently renders a row's Product Code/Product/Rate/GST%/Qty/Barcode/MRP/Retail/SP/Total/Actions cells, and wrap the whole `rows.map(...)` callback so it can return either one row or several:

```tsx
) : rows.flatMap((r, i) => {
  const editIcon = (
    <button type="button" onClick={() => editRow(i)} className="p-1 rounded text-zinc-600 hover:text-indigo-400 hover:bg-indigo-900/20 transition-colors">
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )
  const removeIcon = (
    <button type="button" onClick={() => removeRow(i)} className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )

  if (r.has_variants && r.variants.length > 0) {
    const validVariants = r.variants.filter((v) => v.variant_name.trim())
    return validVariants.map((v, vi) => (
      <TableRow key={`${i}-${vi}`} className={cn('hover:bg-zinc-800/40 transition-colors', editingIndex === i ? 'bg-indigo-950/30' : i % 2 === 1 && 'bg-zinc-900/30')}>
        <TableCell className="font-mono text-xs text-zinc-400 whitespace-nowrap">{r.sku}{v.sku ? ` / ${v.sku}` : ''}</TableCell>
        <TableCell className="text-sm text-zinc-200 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span>{r.product_name} — {v.variant_name}</span>
            <span className={cn('shrink-0 text-[10px] px-1.5 py-0.5 rounded-full', r.is_new_product ? 'bg-indigo-600/20 text-indigo-300' : 'bg-blue-600/20 text-blue-300')}>
              {r.is_new_product ? 'New' : 'Existing'}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-right text-sm text-zinc-300 whitespace-nowrap">{formatINR(parseNum(v.purchase_price))}</TableCell>
        <TableCell className="text-right text-sm text-zinc-400 whitespace-nowrap">{v.tax_rate}%</TableCell>
        <TableCell className="text-right text-sm text-zinc-300 whitespace-nowrap">{parseNum(v.qty)}</TableCell>
        <TableCell className="font-mono text-xs text-zinc-400 whitespace-nowrap">{v.barcode_value}</TableCell>
        <TableCell className="text-right text-sm text-zinc-400 whitespace-nowrap">{v.mrp ? formatINR(parseNum(v.mrp)) : '—'}</TableCell>
        <TableCell className="text-right text-sm text-zinc-300 whitespace-nowrap">{v.sale_price ? formatINR(parseNum(v.sale_price)) : '—'}</TableCell>
        <TableCell className="text-right text-sm text-zinc-400 whitespace-nowrap">{v.special_price ? formatINR(parseNum(v.special_price)) : '—'}</TableCell>
        <TableCell className="text-right text-sm font-medium text-white whitespace-nowrap">{formatINR(toMoney(parseNum(v.purchase_price) * parseNum(v.qty)))}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1">{editIcon}{removeIcon}</div>
        </TableCell>
      </TableRow>
    ))
  }

  return [(
    <TableRow key={i} className={cn('hover:bg-zinc-800/40 transition-colors', editingIndex === i ? 'bg-indigo-950/30' : i % 2 === 1 && 'bg-zinc-900/30')}>
      {/* ...existing single-row cell content, byte-for-byte unchanged from today... */}
    </TableRow>
  )]
})}
```

Preserve the existing single-row `<TableRow>` body (Product Code/Product/Rate/GST%/Qty/Barcode/MRP/Retail/SP/Total/Actions cells) exactly as it is today inside the fallback branch's returned array — only change `rows.map(...)` to `rows.flatMap(...)` at the call site and restructure the callback body as shown (extracting `editIcon`/`removeIcon` so both branches can reuse them, and branching on `r.has_variants && r.variants.length > 0` before the existing per-row JSX).

Note: editing (`editRow(i)`) or removing (`removeRow(i)`) still operates on the WHOLE line `i` (the entire variant-carrying row, all its variants together) regardless of which variant's displayed sub-row was clicked — this matches how "Edit Item" already reopens the full entry form (name + all variants) for editing, not a single variant in isolation. Do not attempt to make edit/remove operate per-displayed-variant-row; that is out of scope.

- [ ] **Step 4: Build**

Run: `pnpm --filter @billscape/web build`. Confirm no TypeScript errors.

- [ ] **Step 5: Manual verification**

In the browser: `/purchases/new`, create a new product, enable Track Variants, confirm Purchase Rate/Qty/MRP/Retail Price/SP fields are gone from the entry form (only Product Code/Barcode/GST% remain in that row, plus the variant editor below). Add 2 variants with different qty/price, click "Add to List", confirm the Items table shows 2 separate rows (one per variant, each showing that variant's own rate/qty/total), not 1. Confirm the Bill Summary total at the bottom matches the sum of both displayed row totals. Toggle Track Variants back OFF on a fresh entry (don't touch the just-added row) and confirm Purchase Rate/Qty/MRP/Retail/SP reappear normally for a non-variant row.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/purchases/PurchaseFormPage.tsx
git commit -m "feat: hide redundant parent-level price/qty fields on Track Variants, show one Items row per variant"
```

---

### Task 6: Product form — hide parent Pricing & Tax when variants are on; fix new-variant stock seeding; stale parent price no longer shown in POS/Products list

**Files:**
- Modify: `apps/web/src/pages/products/ProductFormPage.tsx`
- Modify: `apps/web/src/components/billing/POSTab.tsx`
- Modify: `apps/web/src/pages/products/ProductsPage.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks — independent of Tasks 1-5 (no shared code path; can be done in parallel with them, but is listed last in this plan for narrative order).
- Produces: nothing new consumed by later tasks.

Three independent QC findings addressed together since they're the same root confusion: (a) the Product form's own top-level Pricing & Tax fields are visible/editable even when variants are on, duplicating what's entered per-variant, mirroring the Purchase-entry issue; (b) creating a brand-new product with variants seeds `variant_inventory` at a hardcoded 0 regardless of the typed Qty, while the identical field on the Purchase-entry page correctly seeds real stock; (c) POS and the Products list both display the parent's own (post-fix, now genuinely unused) price for a `has_variants` product, which is misleading since each variant has its own, different price.

- [ ] **Step 1: Hide the top-level Pricing & Tax fields when variants are enabled**

In `ProductFormPage.tsx`, find the "Pricing & Tax" section (search for the heading `<h2>Pricing & Tax</h2>` or similar — confirm exact text via `grep -n "Pricing & Tax" apps/web/src/pages/products/ProductFormPage.tsx`). This section contains Retail Price, Cost Price, MRP, Special Price fields, plus the GST Rate button group. Wrap ONLY the four price fields (not the GST Rate buttons, which still apply as the product's default/fallback tax rate) in `{!hasVariants && (...)}`:

```tsx
{!hasVariants && (
  <>
    {/* Retail Price field block */}
    {/* Cost Price field block */}
    {/* MRP field block */}
    {/* Special Price field block */}
  </>
)}
{/* GST Rate button group — stays visible unconditionally */}
```

Locate `hasVariants` in this file (it should already exist as a boolean derived from the variants-enabled toggle state, consumed by the existing `{hasVariants && (<VariantEditor .../>)}` conditional — reuse the exact same variable, do not introduce a second one).

- [ ] **Step 2: Confirm form validation doesn't block save when these fields are hidden**

Search for this file's zod/RHF validation schema or manual validation (likely `ProductSchema` from `packages/core/src/validation/index.ts`, imported into this file) — confirm `price` (Retail Price) has a `.min(0)` or similar requirement that would block submission if the field is hidden and its underlying form value is left at its default. Per this codebase's documented history (CLAUDE.md's Product form section), `price`/`cost_price` fields use React Hook Form's `register`, so a hidden field still submits its last set value (typically `0` from the form's default values) — confirm this by reading the schema, and if `price` requires `> 0` (not `>= 0`), set a sensible non-zero default (e.g. via `setValue('price', 1)` in the same effect/handler that turns variants on) so a variant-only product doesn't fail validation on a field the user can no longer see or edit. Do not skip this check — silently blocking save with an invisible validation error would be a worse regression than the one being fixed.

- [ ] **Step 3: Fix new-variant stock seeding on product CREATION (not edit)**

Find the save mutation's new-variant insert block (search for `stock_qty: 0` inside the `.from('variant_inventory').insert(` call — per this session's prior work, this exists in the NOT-`isEdit` (create) code path specifically; there is a SEPARATE, already-correct edit-mode code path from an earlier task in this session that explicitly preserves existing stock and must NOT be touched by this step — confirm which block you're editing by checking it's guarded by `!isEdit` or equivalent, not the id-diffing update/insert logic used during edit).

Change the hardcoded `stock_qty: 0` to seed from each variant's own typed `qty`, and log an opening-stock movement (mirroring how the base, non-variant product's own Opening Stock is seeded once at creation):

```ts
// insertedVariants.map((iv, ...) => ({ product_variant_id: iv.id, organization_id: orgId!, stock_qty: <the corresponding new variant's typed qty, defaulting to 0> }))
```

Also insert a matching `variant_stock_movements` row per seeded variant with `reason: 'opening'` and `reference_id: null` (an opening balance has no purchase/sale to reference), using the same pattern already established in `packages/api/src/variantInventory.ts`'s `adjustVariantStock` (a plain `.insert()` on `variant_stock_movements`, not a call through `recordVariantPurchase`/`recordVariantSale`, since neither of those wrappers fit `reason: 'opening'`).

Locate the exact insert call and its surrounding variable names by running `grep -n "variant_inventory" apps/web/src/pages/products/ProductFormPage.tsx` first — the plan cannot give an exact line number here since this file has been edited several times this session and line numbers have shifted; read the surrounding ~20 lines to confirm you are editing the CREATE path's insert, matching each newly-inserted variant row to its corresponding form-entered `VariantFormRow.qty` value (the insert and the source `validVariants`/`toInsert` array should already be in a 1:1 order relationship in this code, matching the same pattern already used in `packages/api/src/purchases.ts`'s `createProductForLine`).

- [ ] **Step 4: Build and manually verify Steps 1-3**

Run: `pnpm --filter @billscape/web build`. In the browser: `/products/new`, enable Track Variants, confirm the top Pricing & Tax fields (Retail/Cost/MRP/Special) disappear, leaving only the GST Rate buttons. Add one variant with Qty 15, save. Via `mcp__claude_ai_Supabase__execute_sql`, confirm the new variant's `variant_inventory.stock_qty = 15` (not 0), and confirm a `variant_stock_movements` row exists for it with `reason = 'opening'`, `qty_change = 15`. Separately, edit an EXISTING variant-carrying product (created before this fix, or the one just created) and confirm the previously-established stock-preservation behavior (from earlier in this session) still holds — editing must NOT change `variant_inventory.stock_qty` regardless of what the Qty field displays.

- [ ] **Step 5: Suppress the parent's own price display for a has_variants product in POS**

In `apps/web/src/components/billing/POSTab.tsx`, find the product grid tile rendering (search for `formatINR(product.price)`). This currently renders unconditionally. Find the existing `hasVariants` boolean already computed in this file's product-tile-rendering scope (used by the existing stock-badge suppression — search for where `has_variants` first appears in this rendering block, e.g. `const hasVariants = !!(product as any).has_variants`). Wrap the price display:

```tsx
{!hasVariants && <p className="text-sm font-bold text-indigo-300">{formatINR(product.price)}</p>}
{hasVariants && <p className="text-sm font-bold text-indigo-300">Multiple prices</p>}
```

(Adjust the exact className to match whatever the existing price `<p>` element already uses — do not introduce new styling, just add the conditional branches around the existing element and its replacement.)

- [ ] **Step 6: Suppress the parent's own price display for a has_variants product in the Products list**

In `apps/web/src/pages/products/ProductsPage.tsx`, find the equivalent price display in the product card/list rendering (search for `formatINR(` near where the product's name/category badges are rendered — per the QC report, around line 394). Apply the identical conditional pattern as Step 5, gated on that product's own `has_variants` field (confirm the list's query already selects `has_variants` — if not, add it to the `.select(...)` call).

- [ ] **Step 7: Build and manual verification**

Run: `pnpm --filter @billscape/web build`. In the browser: `/billing`, confirm a has_variants product's tile shows "Multiple prices" (or equivalent) instead of a specific rupee amount; `/products`, confirm the same product's list entry shows the same treatment. Confirm a NON-variant product still shows its normal price in both places, unaffected.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/products/ProductFormPage.tsx apps/web/src/components/billing/POSTab.tsx apps/web/src/pages/products/ProductsPage.tsx
git commit -m "fix: hide parent Pricing fields when variants enabled, seed real stock on variant creation, stop showing stale parent price for variant products"
```

---

### Task 7: QC pass — strict review of Tasks 1-6 together

**Files:** none (verification only)

**Interfaces:** none

Per the user's explicit instruction ("dev mudichutu QC agent vachu clear ah check panu" — after development, use a QC agent to check clearly), this task is a full, skeptical, end-to-end verification — not a rubber stamp. Dispatch a QC-focused agent (or perform this yourself with equivalent rigor) covering:

- [ ] **Step 1: Re-verify the core bill-total fix with a fresh scenario**

Create a NEW variant purchase (not reusing Task 4's test data) with variants at DIFFERENT tax rates from each other (e.g. one variant at 18%, one at 12% — this specifically exercises the case a single-aggregated-row approach could never have handled correctly, per this plan's whole reason for choosing the per-row design). Confirm via SQL that both `purchase_items` rows show the correct, DIFFERENT `tax_rate`/`cgst_amount`/`sgst_amount` for each variant, and that `purchases.total_amount` correctly sums both.

- [ ] **Step 2: Regression check — non-variant purchases are completely unaffected**

Create a normal, non-variant purchase (existing product, no variants). Confirm exactly 1 `purchase_items` row is created (not accidentally split), `product_variant_id` is `null`, and the total matches exactly what it would have before this plan (Purchase Rate × Qty, unchanged math).

- [ ] **Step 3: Regression check — the parent-inventory trigger guard doesn't break the non-variant path**

Confirm a normal (non-variant) purchase still correctly increments the purchased product's own `inventory.stock_qty` via the trigger (the guard added in Task 1 must only skip rows where `product_variant_id IS NOT NULL` — confirm it does not accidentally affect `product_variant_id IS NULL` rows, which is 100% of non-variant purchases).

- [ ] **Step 4: Re-verify the purchase-edit reversal path**

Repeat Task 4 Step 9's edit scenario once more independently (different purchase/variant than what Task 4's implementer used), confirming the reversal-then-reapply sequence in `variant_stock_movements` and the final `variant_inventory.stock_qty` are correct.

- [ ] **Step 5: Verify Task 5's UI hide/show and Items-table-per-variant logic against edge cases**

Specifically check: (a) a purchase line with Track Variants on but only ONE variant filled in (not multiple) — confirm the Items table still shows it correctly (not accidentally requiring 2+ variants); (b) toggling Track Variants ON then OFF again on the SAME entry row before clicking "Add to List" — confirm the parent fields reappear with sensible values, not stuck hidden or showing stale data; (c) editing an already-added variant-carrying row (`editRow`) — confirm the "Edit Item" form correctly reopens with Track Variants already on and the parent fields still correctly hidden (not reverting to shown).

- [ ] **Step 6: Verify Task 6's three fixes independently**

(a) Confirm `ProductFormPage.tsx`'s hidden-fields-on-variants doesn't block saving a variant-only product (Step 2's validation-default concern) — actually attempt to save a variant product with the Retail Price field never touched, confirm no validation error blocks it. (b) Confirm the new-variant stock-seeding fix seeds the CORRECT per-variant qty when multiple variants have DIFFERENT quantities (not all seeded with the same value by accident). (c) Confirm the POS/Products-list price suppression doesn't accidentally also suppress the price for a product that has `has_variants = true` set but ZERO actual variant rows (an edge case — a product where the flag is on but variants were somehow all removed) — decide and document what should happen here if found (showing "Multiple prices" for a product with no real variants would be confusing; if this state is reachable, it's worth flagging as a finding even if not fixed in this plan).

- [ ] **Step 7: Report findings**

Summarize pass/fail for each of Steps 1-6 with specific evidence (exact values/rows seen, not a bare "looks good"). Any failure found here re-opens the relevant task above rather than being silently noted and left.
