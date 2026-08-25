# Per-Variant Purchase Line Items — Design

## Problem

A purchase entry line for a **new product with variants** creates exactly one
`purchase_items` row, using the line's parent-level Purchase Rate and Qty
fields. The variants entered below (each with their own qty and purchase
price) are used only to create `product_variants` rows and seed
`variant_inventory` — they never feed into `purchase_items`, the Bill
Summary total, or GST reporting.

This produces incorrect purchase bills whenever the parent-level fields
and the variant-level fields disagree, which is the common case (a
merchant naturally leaves the parent Purchase Rate/Qty at their defaults
and enters real numbers per variant). Confirmed live: a purchase of 10
units of "Fan 900mm Test" at ₹1,000/unit (entered entirely at the variant
level) produced a bill total of ₹1,180 — as if 1 unit was purchased at
₹1,000. A second live row has a parent Purchase Rate of ₹0, producing a
₹0 total purchase bill for real inventory that was actually received.

This also silently corrupts the GST input-tax report
(`ReportsPage.tsx`'s `purchaseGstData` query, which sums
`purchase_items.taxable_amount`/`cgst_amount`/`sgst_amount`/`igst_amount`
directly) for every variant purchase.

A related, purely cosmetic problem (parent-level Purchase Rate / Qty /
MRP / Retail Price / SP fields still visible and editable on the entry
form once Track Variants is on, duplicating what's now entered per
variant) is **downstream of this fix**, not a separate feature: those
fields cannot be hidden today because the Bill Summary total has no
other source to compute from. Hiding them is explicitly the last step
of this plan, once safe.

## Scope

**In scope:** purchase lines where `is_new_product: true` and
`has_variants: true` (i.e., a new product created via purchase entry with
variants). This is the only path that currently allows entering variants
during purchase entry — `PurchaseFormPage.tsx`'s variant editor only
renders for new-product rows.

**Explicitly out of scope, called out as a known follow-up, not
silently dropped:** restocking an **existing** variant-carrying product
via purchase entry. Today, an existing-product purchase line has no UI
to select which variant is being restocked or in what quantity — the
variant editor never renders for `is_new_product: false` rows. This is a
real, separate gap (a merchant re-ordering stock of an existing variant
product has no correct way to do it via Purchases today), but building
that UI/flow is materially more work than this plan's scope (it needs a
variant picker on the existing-product entry path, not just a data-model
change) and was not part of what was asked. This plan's schema changes
(`purchase_items.product_variant_id`) are additive and forward-compatible
with that follow-up when it's built.

## Design

### 1. Schema: `purchase_items.product_variant_id`

```sql
alter table purchase_items
  add column if not exists product_variant_id uuid references product_variants(id) on delete set null;

create index if not exists idx_purchase_items_variant on purchase_items(product_variant_id) where product_variant_id is not null;
```

Nullable, `ON DELETE SET NULL` (a line item must never vanish because a
variant was later deleted — matches how `product_id` itself has no
cascade-delete behavior here either). `product_id` on a variant-linked
row still points at the **parent** product (unchanged) — this preserves
every existing query that joins `purchase_items.product_id → products`
(item-wise reports, CSV export, `PurchaseViewPage.tsx`) without
modification; `product_variant_id` is purely additive disambiguation.

### 2. Trigger fix: `increment_stock_on_purchase` must skip variant-linked rows

Current live body (confirmed via `pg_proc`):

```sql
CREATE OR REPLACE FUNCTION increment_stock_on_purchase()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  IF NEW.product_id IS NULL THEN
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

Without a guard, once `purchase_items` gets one row per variant (all
sharing the same parent `product_id`), this trigger fires once per
variant and adds each variant's qty to the **parent's** `inventory` row —
turning the parent's already-known-stale number (per the earlier,
separate "ignore parent inventory for has_variants products" decision)
into an actively wrong, multiplied-up number instead of merely an
ignored one.

Fix: add one guard, immediately after the existing null check:

```sql
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.product_variant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
```

Variant stock continues to flow exclusively through the existing,
unchanged `recordVariantPurchase` → `increment_variant_inventory` →
`variant_inventory` path. This trigger, `increment_stock_on_purchase`,
is otherwise untouched — same body, same behavior for every
non-variant-linked row, which is 100% of rows today.

### 3. `packages/api/src/purchases.ts` changes

**`resolveItems`** already returns `variantSeeds: { variantId: string;
qty: number }[]` — collected from `createProductForLine`'s newly-inserted
variants. This is extended (not replaced) to also carry the per-variant
purchase-line data needed to build `purchase_items` rows:

```ts
type VariantLineSeed = {
  variantId: string
  qty: number
  purchasePrice: number
  taxRate: GSTRate
  variantName: string
}
```

`createProductForLine`'s return type changes from
`{ id: string; variantSeeds: { variantId: string; qty: number }[] }` to
`{ id: string; variantSeeds: VariantLineSeed[] }` — the existing
`variantSeeds.push(...)` loop (line ~140) gains the two extra fields it
already has in scope (`validVariants[i].purchase_price`,
`validVariants[i].tax_rate`, `validVariants[i].variant_name`):

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

`resolveItems`'s own return type and the two call sites in
`createPurchase`/`updatePurchase` update their `{ variantId: string; qty:
number }[]` annotations to `VariantLineSeed[]` accordingly — no other
change to `resolveItems`'s control flow.

**`buildItemRows`** changes from "one row per resolved item" to "one row
per resolved item, OR one row per variant seed belonging to that item if
it has any." A resolved item's variant seeds are looked up by matching
`variantSeeds` entries whose originating line was this same
`resolvedItems[i]` — threaded through by having `resolveItems` attach the
seeds it collected for THIS line onto the returned line object itself
(not just the flat top-level array), since `buildItemRows` operates
per-item and needs to know which seeds belong to which item:

```ts
// resolveItems: extend the per-line resolved object
resolvedItems.push({ ...line, product_id: result.id, variantLineSeeds: result.variantSeeds })
// ...for a non-new-product line (existing product path):
resolvedItems.push({ ...line, product_id: line.product_id, variantLineSeeds: [] })
```

(`(PurchaseLineInput & { product_id: string })[]` becomes
`(PurchaseLineInput & { product_id: string; variantLineSeeds: VariantLineSeed[] })[]`.)

```ts
function buildItemRows(
  purchaseId: string,
  orgId: string,
  resolvedItems: (PurchaseLineInput & { product_id: string; variantLineSeeds: VariantLineSeed[] })[],
  interstate: boolean,
) {
  const rows: /* same shape as today's return, plus optional product_variant_id */ []
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

A line with zero variant seeds (no variants, or variants entered with
qty 0 — which the existing filter already excludes from `variantSeeds`)
falls through to today's exact existing behavior, byte-for-byte. This is
the key compatibility property: **every non-variant purchase line today
is unaffected.**

**`createPurchase`'s own `computeGST` call** (for `purchases.total_amount`)
currently maps `resolvedItems` 1:1 to totals-input rows. This must
mirror `buildItemRows`'s expansion — expand variant lines into one
totals-input row per variant seed the same way, so the bill total the
customer sees (`purchases.total_amount`) matches the sum of the
`purchase_items` rows just built. Simplest correct implementation: build
the totals input from the *already-built* `itemRows` (their
`taxable_amount`/`cgst_amount`/`sgst_amount`/`igst_amount`/`line_total`
are already correct per-row) rather than recomputing from
`resolvedItems` a second time with different logic that could drift —
`computeGST` needs a `{ product_id, product_name, tax_rate, unit_price,
qty, discount_pct }`-shaped input array per its existing signature, so
map `itemRows` to that shape (`unit_price: it.unit_cost, qty: it.qty`,
same tax_rate) instead of `resolvedItems`.

**`updatePurchase`'s reversal loop** — currently:

```ts
const { data: oldItems } = await client.from('purchase_items').select('product_id, qty').eq('purchase_id', purchaseId)
for (const item of oldItems ?? []) {
  if (!item.product_id) continue
  await client.rpc('increment_inventory', { p_org_id, p_product_id: item.product_id, p_qty: -item.qty })
  await client.from('stock_movements').insert({ ...reason: 'adjustment'... })
}
```

Changes to also select `product_variant_id`, and branch:

```ts
const { data: oldItems } = await client.from('purchase_items').select('product_id, product_variant_id, qty').eq('purchase_id', purchaseId)
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
  await client.rpc('increment_inventory', { p_org_id: input.organization_id, p_product_id: item.product_id, p_qty: -item.qty })
  await client.from('stock_movements').insert({
    organization_id: input.organization_id, product_id: item.product_id, qty_change: -item.qty,
    reason: 'adjustment', reference_id: purchaseId, note: 'Purchase edited — original quantity reversed',
    created_by: input.created_by,
  })
}
```

`reverseVariantPurchase` is a new export in `packages/api/src/variantInventory.ts`.
`adjustVariantStock`'s existing internal sign-forcing logic
(`args.reason === 'sale' ? -Math.abs(qty) : Math.abs(qty)`) always makes
a `'purchase'`-reason call positive, so it cannot express a reversal
(a negative delta) without changing behavior for its two existing
callers (`recordVariantSale`, `recordVariantPurchase`), which must stay
exactly as they are. `reverseVariantPurchase` is therefore a standalone
function — not a new call into `adjustVariantStock` — that duplicates
its two-step body (RPC + movement insert) with an explicit negative qty
and `reason: 'adjustment'` (already a valid `stock_movement_reason` enum
value, already used by the parent-level product reversal path in
`updatePurchase`, so this matches that existing convention exactly):

```ts
export async function reverseVariantPurchase(
  client: TypedSupabaseClient,
  args: { organizationId: string; variantId: string; qty: number; referenceId?: string; createdBy: string },
) {
  const signedQty = -Math.abs(args.qty)
  const { error: rpcError } = await client.rpc('increment_variant_inventory', {
    p_org_id: args.organizationId, p_variant_id: args.variantId, p_qty: signedQty,
  })
  if (rpcError) return { error: rpcError }
  const { error: logError } = await client.from('variant_stock_movements').insert({
    organization_id: args.organizationId, product_variant_id: args.variantId, qty_change: signedQty,
    reason: 'adjustment', reference_id: args.referenceId ?? null, created_by: args.createdBy,
  })
  return { error: logError }
}
```

### 4. UI: `PurchaseFormPage.tsx`

**Items table**: a variant-carrying new-product row should visually
expand into one row per variant in the `rows` state's own display — but
`rows` (the in-memory pre-save array) stays exactly as it is today (one
entry per "Add to List" click, still carrying its own `.variants[]`
array) — **only the rendering of the Items table** changes to show one
`<TableRow>` per variant when `r.has_variants && r.variants.length > 0`,
falling back to today's single-row rendering otherwise. This mirrors
`buildItemRows`'s own "expand at render/save time, not at entry time"
pattern, and requires no change to `PurchaseRow`'s shape, `editRow`,
`removeRow`, or the "Edit Item" form (editing a variant-carrying row
still edits the whole line + its variants together, exactly as today —
only the *read-only list display* expands per variant).

**Parent-level field hiding** (the original ask, now safe): once the
above lands, `entry.has_variants` gates Purchase Rate (`:891`), Qty
(`:901`), MRP (`:945`), Retail Price (`:950`), SP (`:955`) — all five
wrapped in `{!entry.has_variants && (...)}`, mirroring the existing
pattern already used one line-form-toggle away for the Batches section
(`{!entry.has_variants && (<Batches toggle+block>)}`, per this session's
CLAUDE.md-documented history). The Bill Summary total no longer depends
on these fields being filled for a variant row — the fix in section 3
makes the total derive entirely from the variant seeds — so hiding them
has zero effect on save correctness.

**`ProductFormPage.tsx`'s own Pricing & Tax section** (Retail/Cost/MRP/
Special near the top of the form, separate from the variant editor) gets
the identical treatment: wrapped in `{!hasVariants && (...)}`. Unlike the
Purchase page, this has no downstream bill-total dependency — it's purely
the cosmetic half of the original ask, safe to do independently and
concurrently.

### 5. Stale parent price display (QC finding, addressed together since it's the same root confusion)

`POSTab.tsx`'s product grid tile (`:801`, `formatINR(product.price)`) and
`ProductsPage.tsx`'s list (`:394`) both render the parent's own `price`
unconditionally, even for a `has_variants` product whose real,
purchasable prices live per-variant and can differ significantly from
the parent's. Fix: both call sites gate the parent price display on
`!product.has_variants`, showing a neutral "Variants" indicator instead
(POS already does this for its stock badge, per the existing `hasVariants`
branch at `:773-774` — this extends the same branch to also suppress the
price line, rather than introducing a second condition).

### 6. Product-form variant stock seeding (separate QC finding, fixed together)

`ProductFormPage.tsx`'s new-variant insert path seeds `variant_inventory`
at a hardcoded `stock_qty: 0` regardless of the Qty the user typed
(`:467-475`), while the *identical* field on the Purchase entry page
genuinely seeds real stock from the same Qty input
(`createProductForLine`'s `variantSeeds` → `recordVariantPurchase`).
Same component (`VariantEditor.tsx`), same "Qty *" label, opposite
behavior depending on which page it's mounted on — confirmed live
("Light 9W Test", created via `/products/new`: `qty: 20` on the variant
row, `variant_inventory.stock_qty: 0`, unsellable in POS).

Fix, scoped narrowly to product **creation** only (never edit — this
must not reopen the stock-preservation fix from earlier in this
session): when `ProductFormPage.tsx`'s save mutation inserts brand-new
variants for a brand-new product (`!isEdit`), seed `variant_inventory`
from each variant's typed `qty` instead of hardcoding `0`, and log a
`variant_stock_movements` row with `reason: 'opening'` (the same enum
value the base, non-variant product's own opening-stock path already
uses for `stock_movements`) via `reference_id: null` (no purchase to
reference — an opening balance, not a transaction). This exactly mirrors
how the base product's own opening stock is seeded once, at creation,
from its own Qty field. The existing edit-mode behavior (Task 6's
stock-preservation fix: editing a product never moves stock, `qty` field
is last-known-value display only) is completely unchanged — this fix
only touches the `!isEdit` (create) branch.

## Testing

- Unit-level: none of this repo's existing test infra covers
  `packages/api` with a test runner (confirmed no `*.test.ts` files
  exist under `packages/api/src` as of this session) — verification is
  build (`tsc --noEmit`) + live manual/QC-agent verification against the
  real dev Supabase project, matching how every other task in this
  session's plans was verified.
- Manual verification path per task is specified in the implementation
  plan.

## Open questions resolved during brainstorming

- **Trigger double-count risk**: resolved via the `product_variant_id
  IS NOT NULL` guard in `increment_stock_on_purchase` (section 2) — user
  confirmed this approach explicitly.
- **Scope (per-variant lines vs. simple sum-and-fold)**: user explicitly
  chose the correct/complex approach (real per-variant `purchase_items`
  rows) over a simpler same-row-aggregate patch, specifically because it
  also correctly handles variants with differing tax rates, which a
  single aggregated row cannot represent.
- **Existing-product variant restocking**: explicitly out of scope,
  documented above, not silently dropped.
