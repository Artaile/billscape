# Variant product clarity: Inventory list, Product Details, and barcode label printing

Date: 2026-09-11

## Problem

Variant-tracked products (`products.has_variants = true`, real per-SKU data on
`product_variants` + `variant_inventory`) are second-class citizens in three
places:

1. **Inventory Stock List** (`apps/web/src/pages/inventory/InventoryPage.tsx`)
   shows one row per product from the `inventory` table. For a variant
   product that row's `stock_qty` is a stale/meaningless parent-level number
   (real stock lives in `variant_inventory`, one row per variant). There is
   no way to see or adjust individual variant stock from this page.
2. **Product Details page** (`apps/web/src/pages/products/ProductViewPage.tsx`)
   shows "Multiple prices" / "—" placeholders for a variant product's
   price/stock fields, with no table anywhere showing what the variants
   actually are. The header's "Print Label" button is hidden entirely
   (gated on `product.barcode_value`, which is always null when
   `has_variants` — real barcodes live per-variant).
3. **Barcode label printing** (`apps/web/src/components/ui/BarcodeLabelDialog.tsx`)
   is built around a single `{ name, price, barcode_value }` product shape.
   Opened for a variant product it shows "No barcode set" and disables
   Print — completely broken. There is no way anywhere in the app to print
   an individual variant's label.

## Non-goals

- No change to non-variant product behavior anywhere.
- No change to the `product_variants` / `variant_inventory` schema.
- No redesign of `printBarcodeLabel.ts`'s simpler one-shot helper (used from
  the post-purchase confirmation dialog) — out of scope, that call site
  isn't variant-aware today either but isn't part of this ask.
- No per-variant `reorder_level` column — reuse the parent product's
  reorder_level as the threshold for every variant's status badge.

## Design

### 1. Inventory Stock List — expandable variant rows

Keep one row per product by default. For a `has_variants` product:

- Prepend a chevron disclosure control to the Product cell.
- **Collapsed** (default): Product name + a muted "N variants" badge in
  place of a stock number. Reorder Level column shows "—". Status badge is
  aggregated: `Out of Stock` only if every variant is at 0, `Low Stock` if
  any variant is at/under the parent's reorder_level, else `In Stock`. No
  Action button on the collapsed row (nothing single-quantity to act on).
- **Expanded** (chevron/row click): one indented sub-row per
  `product_variants` row — variant name (e.g. "— XS"), Current Stock (from
  `variant_inventory` via the existing `getVariantStockMap` batched
  helper), Status badge per-variant (using the parent's reorder_level),
  and an **Adjust** button.
- **Search**: extend the existing client-side search (already matches
  variant names / "Product — Variant" combined label per the prior fix) so
  that when the match came from a variant name, that product row is
  auto-expanded in the filtered results.
- **New Adjust flow required**: no per-variant stock adjustment UI exists
  today (`AdjustStockDialog.tsx` explicitly excludes `has_variants`
  products via `.eq('has_variants', false)`). Add a scoped variant of that
  same dialog — same UI pattern (Add/Remove toggle, qty, reason, note,
  "new stock" preview) — that takes a `product_variant_id` and writes via
  `increment_variant_inventory` RPC + a `variant_stock_movements` insert
  (mirrors `packages/api/src/variantInventory.ts`'s existing
  `recordVariantPurchase`/`recordVariantSale` pattern; add a
  `recordVariantAdjustment` alongside them rather than reusing either,
  since this qty can be positive or negative and reason is always
  `'adjustment'`).

### 2. Product Details page — summary fixes + new Variants table

**Summary card** (only these cells change, only when `has_variants`):

| Cell | New behavior |
|---|---|
| Sale Price | `₹min–₹max` across variant `sale_price`; single value (no dash) if all equal |
| Purchase Price | same range treatment across variant `purchase_price` |
| Current Stock | relabel "Total Stock (all variants)"; sum of `variant_inventory.stock_qty` |
| Stock Value | `Σ(variant.stock_qty × variant.purchase_price)` |
| Tax Rate | "Varies" (with title tooltip listing the distinct rates) if variants differ, else the common rate |

**New Variants table** — new section directly after the summary card,
before Batches/Transaction History, same card chrome as the existing
Batches table (`rounded-lg border border-border bg-card`). Header: "Variants
(N)". Columns: Variant Name, Barcode (font-mono), Tax %, MRP, Retail Price,
Purchase Price, Stock (badged per the same low/out logic as the page's
existing `stockBadge()`, against the parent's reorder_level), and a
trailing per-row print icon button (opens the barcode dialog scoped to
that one variant — see §3).

Data: one query joining `product_variants` for this product with
`getVariantStockMap` for stock — no new API needed beyond the new
`recordVariantAdjustment` from §1 (unrelated to this read path).

**Print Label button**: change the header gate from
`product.barcode_value && (...)` to `(product.barcode_value || hasVariants) && (...)`.
Clicking it when `hasVariants` opens the barcode dialog pre-populated with
every variant checked (see §3).

### 3. Barcode label printing — extend BarcodeLabelDialog to a list shape

Change `BarcodeLabelDialog`'s props from a single `Product` to a list:

```ts
interface LabelItem {
  key: string
  name: string          // parent product name, shown once as a heading
  variantLabel?: string // e.g. "XS" — omitted for non-variant items
  barcode_value?: string | null
  price: number
  copies: number         // per-item copies, defaults to 1
}
interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  items: LabelItem[]
  orgName?: string
}
```

- **Non-variant callers** (today's usage in `ProductsPage.tsx`) pass a
  single-element `items` array — trivial call-site migration, no behavior
  change for them (single-item path keeps today's big live SVG preview and
  the single global "Number of Labels" field, now just backed by
  `items[0].copies`).
- **Variant callers** pass one `LabelItem` per variant, all pre-checked via
  local dialog state (a `Set<key>` of checked items), each with its own
  "Copies" number input. A row with no `barcode_value` shows an inline
  "No barcode set" warning and is excluded from the print run without
  blocking the others. Footer summarizes `Print N variants · M labels
  total`. Preview: keep today's single big preview when exactly one item
  is checked; otherwise show a compact scrollable list of small rendered
  barcodes (checked items only, capped display if long, "+N more" beyond a
  reasonable cap to avoid mounting dozens of live `JsBarcode` SVGs at
  once).
- **Print pipeline**: `buildLabelHtml` gains an outer loop over checked
  items (currently loops `copies` for one product) — same thermal-58mm
  label markup per repetition, `variantLabel` appended to the name line
  when present (e.g. "Classic Tee — XS").

**Entry points** (all reuse this one dialog):
- `ProductsPage.tsx`'s variant `ProductCard` "Print" button → all variants,
  pre-checked.
- `ProductViewPage.tsx` header "Print Label" → all variants, pre-checked
  (non-variant products: unchanged single-item behavior).
- `ProductViewPage.tsx`'s new Variants table row print icon (§2) → single
  variant pre-checked.
- Inventory page's expanded variant sub-row (§1) → single variant
  pre-checked, same dialog.

## Testing

- TypeScript compile clean (`tsc --noEmit`) after each file's changes.
- Manual QC via chrome-devtools MCP against the live dev server, logged in
  as the real test account: verify Inventory expand/collapse + per-variant
  Adjust actually moves `variant_inventory.stock_qty`; verify Product
  Details variants table renders correct per-variant data and the Print
  Label button now appears; verify the barcode dialog's variant picker
  prints (or at least generates correct label HTML) for a multi-variant
  selection and correctly excludes a variant with no barcode.
