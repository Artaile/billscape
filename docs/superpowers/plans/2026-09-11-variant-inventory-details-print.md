# Variant Inventory/Details/Print Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make variant-tracked products (has_variants=true) first-class in the Inventory Stock List, Product Details page, and barcode label printing — replacing stale/broken single-value displays with real per-variant data and actions.

**Architecture:** Add a `recordVariantAdjustment` API function alongside the existing `recordVariantPurchase`/`recordVariantSale` in `packages/api/src/variantInventory.ts`. Add a new `VariantAdjustStockDialog` component cloned from the existing non-variant `AdjustStockDialog` pattern. Make Inventory Stock List rows expandable for variant products, reusing `getVariantStockMap`. Add a Variants table + fix summary card cells on the Product Details page. Extend `BarcodeLabelDialog` from a single-product prop to a list-of-items prop, migrating its two existing call sites and wiring three new ones.

**Tech Stack:** React + TypeScript + TanStack Query + Supabase (client-side queries) + Tailwind, existing shadcn/ui primitives (`Dialog`, `Button`, `Input`, `Label`, `Table`).

**Spec:** `docs/superpowers/specs/2026-09-11-variant-inventory-details-print-design.md`

## Global Constraints

- Dark theme conventions: zinc-950/900/800 backgrounds, indigo-500/600 accents, `border-zinc-700`/`border-zinc-800` — match existing files, do not introduce new tokens.
- Non-variant product behavior must not change anywhere in this plan.
- No new DB columns/migrations — `variant_stock_movements.note` already exists but is unused; `product_variants.mrp`, `.sale_price`, `.purchase_price`, `.tax_rate`, `.barcode_value`, `.variant_name` all already exist.
- Reuse `getVariantStockMap(client, orgId, variantIds)` (in `packages/api/src/variantInventory.ts`) for every per-variant stock read — do not write a new stock-fetching query.
- `tsc --noEmit -p .` (run from repo root via `pnpm --filter web exec tsc --noEmit -p .`) must be clean after every task.

---

### Task 1: `recordVariantAdjustment` API function

**Files:**
- Modify: `packages/api/src/variantInventory.ts`

**Interfaces:**
- Consumes: existing `increment_variant_inventory` RPC (already used by `recordVariantSale`/`recordVariantPurchase` in this file), `TypedSupabaseClient` type from `./client`.
- Produces: `recordVariantAdjustment(client, args: { organizationId: string; variantId: string; delta: number; note?: string; createdBy: string }): Promise<{ error: unknown }>` — `delta` is a signed number (positive = add stock, negative = remove), unlike `recordVariantSale`/`recordVariantPurchase` which take an unsigned `qty` and force the sign themselves. Later tasks (Task 2, Task 4) call this exact signature.

- [ ] **Step 1: Add `recordVariantAdjustment` to `packages/api/src/variantInventory.ts`**

Add this function after the existing `recordVariantPurchase` export (do not modify `adjustVariantStock`, `recordVariantSale`, `recordVariantPurchase`, or `reverseVariantPurchase` — this is a new, separate function since its sign handling differs from all of them):

```ts
// Manual stock adjustment for a single variant (mirrors AdjustStockDialog.tsx's non-variant
// flow) — unlike recordVariantSale/recordVariantPurchase, the caller already knows the signed
// delta (Add Stock vs Remove Stock), so this does not force a sign the way adjustVariantStock
// does. reason is always 'adjustment' to match variant_stock_movements' reason enum and the
// non-variant AdjustStockDialog's own default reason.
export async function recordVariantAdjustment(
  client: TypedSupabaseClient,
  args: { organizationId: string; variantId: string; delta: number; note?: string; createdBy: string },
) {
  const { error: rpcError } = await client.rpc('increment_variant_inventory', {
    p_org_id: args.organizationId,
    p_variant_id: args.variantId,
    p_qty: args.delta,
  })
  if (rpcError) return { error: rpcError }

  const { error: logError } = await client.from('variant_stock_movements').insert({
    organization_id: args.organizationId,
    product_variant_id: args.variantId,
    qty_change: args.delta,
    reason: 'adjustment',
    note: args.note ?? null,
    created_by: args.createdBy,
  })
  return { error: logError }
}
```

- [ ] **Step 2: Export it from the package barrel**

Run: `grep -n "variantInventory" packages/api/src/index.ts`

If `variantInventory` is re-exported with `export * from './variantInventory'`, no change needed. If it's a named re-export list, add `recordVariantAdjustment` to it so `@billscape/api` exposes it the same way `getVariantStockMap` etc. are already exposed.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/variantInventory.ts packages/api/src/index.ts
git commit -m "feat: add recordVariantAdjustment for manual per-variant stock adjustments

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `VariantAdjustStockDialog` component

**Files:**
- Create: `apps/web/src/components/products/VariantAdjustStockDialog.tsx`

**Interfaces:**
- Consumes: `recordVariantAdjustment` from `@billscape/api` (Task 1), `getVariantStockMap` from `@billscape/api` (existing), `useAuth` from `@/contexts/AuthContext`, `toast` from `@/hooks/use-toast`.
- Produces: `VariantAdjustStockDialog({ open, onOpenChange, variantId, variantName, currentStock, unitSymbol }: Props)` — a self-contained dialog, no return value consumed elsewhere. Task 3 (Inventory page) and Task 5 (Product Details variants table) both render this component directly, passing `variantId`/`variantName`/`currentStock`/`unitSymbol` as props (the caller already has this data loaded, so this dialog does NOT re-fetch the variant list the way `AdjustStockDialog` does for products — it's scoped to one already-known variant).

This is a near-verbatim adaptation of `apps/web/src/components/products/AdjustStockDialog.tsx` — read that file fully before starting (already read during planning; same Add/Remove toggle, qty input, reason select, note input, "new stock" preview, footer buttons). Differences: no product picker (the variant is already chosen by the caller), reason is fixed to `'adjustment'` (no dropdown — `variant_stock_movements.reason` is a smaller enum need than `stock_movements`, and Task 1's `recordVariantAdjustment` hardcodes `'adjustment'`), and the mutation calls `recordVariantAdjustment` instead of directly updating `inventory`+`stock_movements`.

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Minus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { recordVariantAdjustment } from '@billscape/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  variantId: string
  variantName: string
  currentStock: number
  unitSymbol?: string | null
}

export function VariantAdjustStockDialog({ open, onOpenChange, variantId, variantName, currentStock, unitSymbol }: Props) {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [type, setType] = useState<'+' | '-'>('+')
  const [qty, setQty] = useState(0)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setType('+')
      setQty(0)
      setNote('')
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !user) throw new Error('Not logged in')
      if (qty <= 0) throw new Error('Quantity must be greater than 0')

      const delta = type === '+' ? qty : -qty
      const { error } = await recordVariantAdjustment(supabase, {
        organizationId: orgId,
        variantId,
        delta,
        note: note.trim() || undefined,
        createdBy: user.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', orgId] })
      queryClient.invalidateQueries({ queryKey: ['inventory-variant-names', orgId] })
      queryClient.invalidateQueries({ queryKey: ['product-detail', orgId] })
      queryClient.invalidateQueries({ queryKey: ['product-variants-detail', orgId] })
      queryClient.invalidateQueries({ queryKey: ['products', orgId] })
      toast.success('Stock adjusted')
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error('Adjustment failed', err.message),
  })

  const newStock = Math.max(0, currentStock + (type === '+' ? qty : -qty))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Adjust Stock — {variantName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-zinc-800 px-4 py-3">
            <p className="text-xs text-zinc-500">
              Current Stock:{' '}
              <strong className="text-indigo-300">
                {currentStock}{unitSymbol ? ` ${unitSymbol}` : ''}
              </strong>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Adjustment Type</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('+')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all',
                  type === '+'
                    ? 'border-emerald-500 bg-emerald-600/10 text-emerald-300'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600',
                )}
              >
                <Plus className="h-4 w-4" />
                Add Stock
              </button>
              <button
                type="button"
                onClick={() => setType('-')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all',
                  type === '-'
                    ? 'border-red-500 bg-red-600/10 text-red-300'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600',
                )}
              >
                <Minus className="h-4 w-4" />
                Remove Stock
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="variant-adj-qty">Quantity</Label>
            <div className="flex items-center gap-2">
              <Input
                id="variant-adj-qty"
                type="number"
                step="0.001"
                min="0"
                value={qty || ''}
                onChange={(e) => setQty(Math.max(0, parseFloat(e.target.value) || 0))}
                className="flex-1"
              />
              {unitSymbol && <span className="text-sm font-medium text-indigo-400 shrink-0">{unitSymbol}</span>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="variant-adj-note">Note (optional)</Label>
            <Input
              id="variant-adj-note"
              placeholder="Enter reason for adjustment"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 px-3 py-2 text-sm">
            New stock:{' '}
            <strong className="text-indigo-300">
              {newStock}{unitSymbol ? ` ${unitSymbol}` : ''}
            </strong>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={qty <= 0 || mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Adjust Stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: no new errors. (This component isn't imported anywhere yet, so it should compile standalone.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/products/VariantAdjustStockDialog.tsx
git commit -m "feat: add VariantAdjustStockDialog for per-variant manual stock adjustment

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Inventory Stock List — expandable variant rows

**Files:**
- Modify: `apps/web/src/pages/inventory/InventoryPage.tsx`

**Interfaces:**
- Consumes: `getVariantStockMap` from `@billscape/api` (existing), `VariantAdjustStockDialog` from `@/components/products/VariantAdjustStockDialog` (Task 2), the existing `variantNamesByProduct` query already added by a prior fix in this file (queryKey `['inventory-variant-names', orgId]`, returns `Map<string, string[]>` of product_id → variant names — confirm this still exists before proceeding; if it was refactored, adapt to whatever shape currently holds per-product variant names).
- Produces: no new exports — this is a leaf page.

This task requires first reading the CURRENT state of `apps/web/src/pages/inventory/InventoryPage.tsx` in full (it has been modified twice already by prior work in this session — the `has_variants` flag and full per-variant rows are NOT yet in the `inventory` query's `.select()`, and `InventoryRow`'s `products` sub-shape does not yet include `has_variants` or `unit_id`). Steps below assume the file's structure as of the two prior fixes (backfilled `inventory` rows for variant products, and the `variantNamesByProduct` search-matching addition) — read it first, and adjust exact line-anchors if it differs from what's described.

- [ ] **Step 1: Extend the `InventoryRow` type and query to carry `has_variants` and unit id**

In `apps/web/src/pages/inventory/InventoryPage.tsx`, find the `InventoryRow` interface (currently has `products: { id, name, category_id, categories, unit }`). Add `has_variants: boolean` and change `unit` to also expose `id` so per-variant rows can look up the same unit:

```ts
interface InventoryRow {
  product_id: string
  stock_qty: number
  reorder_level: number
  products: {
    id: string
    name: string
    category_id: string | null
    has_variants: boolean
    categories: { name: string; color: string | null } | null
    unit: { id: string; symbol: string } | null
  } | null
}
```

Update the `inventory` query's `.select(...)` string to match — find:
```
.select('product_id, stock_qty, reorder_level, products(id, name, category_id, categories(name, color), unit:unit_id(symbol))')
```
Replace with:
```
.select('product_id, stock_qty, reorder_level, products(id, name, category_id, has_variants, categories(name, color), unit:unit_id(id, symbol))')
```

- [ ] **Step 2: Add a query for full per-variant rows (name, id, stock) for expansion**

The existing `variantNamesByProduct` query only fetches `product_id, variant_name` (built for search matching). Add a second query alongside it in the same file for the full detail needed when a row expands — variant id (for the Adjust dialog and query keys) plus its stock. Add this near the existing `variantNamesByProduct` query:

```ts
const { data: variantStockByProduct } = useQuery({
  queryKey: ['inventory-variant-stock', orgId],
  enabled: !!orgId,
  queryFn: async () => {
    const { data: variants } = await supabase
      .from('product_variants')
      .select('id, product_id, variant_name')
      .eq('organization_id', orgId!)
    if (!variants || variants.length === 0) return new Map<string, { id: string; variant_name: string; stock: number }[]>()

    const { getVariantStockMap } = await import('@billscape/api')
    const stockMap = await getVariantStockMap(supabase, orgId!, variants.map((v) => v.id))

    const map = new Map<string, { id: string; variant_name: string; stock: number }[]>()
    for (const v of variants) {
      const list = map.get(v.product_id) ?? []
      list.push({ id: v.id, variant_name: v.variant_name, stock: stockMap.data.get(v.id) ?? 0 })
      map.set(v.product_id, list)
    }
    return map
  },
})
```

Note: `getVariantStockMap` returns `{ data: Map<string, number>, error }` per its existing signature in `packages/api/src/variantInventory.ts` — confirm this by reading that file's `getVariantStockMap` export before writing this step's final code (already confirmed during planning: `export async function getVariantStockMap(client, orgId, variantIds)` returns `{ data: Map<string, number>, error: null }` or `{ data: new Map(), error }` on failure). Use a static top-level `import { getVariantStockMap } from '@billscape/api'` instead of the dynamic `import()` shown above if the rest of the file already imports statically from `@billscape/api` — check the file's existing import block first and match its style (dynamic import above is a placeholder only if no other `@billscape/api` import exists yet; prefer static).

- [ ] **Step 3: Add expand/collapse state and a chevron column**

Add state near the other `useState` calls in `InventoryPage`:

```ts
const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set())
```

In the Stock List table body render (`filteredInventory?.map((item) => ...)`), wrap each row's rendering in a check for `item.products?.has_variants`. For a non-variant row, render exactly as today (no behavior change). For a `has_variants` row:

- Render the existing single `<TableRow>` but:
  - Prepend a chevron button (`ChevronRight`/`ChevronDown` from `lucide-react`, already available as a dependency — check the file's existing `lucide-react` import line and add these two icons to it) to the Product cell that toggles `expandedProductIds` membership for `item.products.id`.
  - Replace the Current Stock cell's `{item.stock_qty} {item.products?.unit?.symbol}` with a muted variant count badge: `{(variantStockByProduct?.get(item.products.id) ?? []).length} variant{...length !== 1 ? 's' : ''}` styled `text-zinc-500 text-xs`.
  - Reorder Level cell shows `—` instead of `{item.reorder_level}`.
  - Status badge: compute from the variant list — `Out of Stock` only if every variant's `stock` is 0, `Low Stock` if any variant's stock is `> 0 && <= threshold` (reuse the existing `threshold` local computed earlier in `getStatusBadge`/the filter — read the current file to find its exact variable name, e.g. `threshold` from `org?.feature_flags?.low_stock_threshold ?? 10`), else `In Stock`. Reuse the existing `<Badge variant="...">...</Badge>` JSX pattern already used by `getStatusBadge`, just computed from this aggregate instead of `item.stock_qty`.
  - Action cell: render nothing (no Adjust button on the collapsed/parent row).
- Immediately after that `<TableRow>`, conditionally render (only `if (expandedProductIds.has(item.products.id))`) one additional `<TableRow>` per entry in `variantStockByProduct?.get(item.products.id) ?? []`:
  - A single `<TableCell colSpan={...}>` is NOT used — instead mirror the parent's column count exactly so the table stays aligned: Product cell shows `— {variant.variant_name}` indented (`pl-8 text-zinc-400 text-sm`), Category cell shows `—`, Current Stock cell shows `{variant.stock} {item.products?.unit?.symbol ?? ''}`, Reorder Level cell shows `—`, Status badge computed per-variant against the same `threshold` (out if `variant.stock === 0`, low if `variant.stock <= threshold`, else in stock), Action cell renders an "Adjust" button (same `<Button variant="outline" size="sm" className="h-7 text-xs">Adjust</Button>` styling already used by the existing non-variant row's Adjust button — copy its exact classes) that opens `VariantAdjustStockDialog` for that variant.
- Add local state for which variant's adjust dialog is open:

```ts
const [variantAdjustTarget, setVariantAdjustTarget] = useState<{ id: string; name: string; stock: number; unitSymbol?: string | null } | null>(null)
```

Render once near the file's other dialogs (alongside the existing non-variant Adjust dialog markup):

```tsx
{variantAdjustTarget && (
  <VariantAdjustStockDialog
    open={!!variantAdjustTarget}
    onOpenChange={(v) => { if (!v) setVariantAdjustTarget(null) }}
    variantId={variantAdjustTarget.id}
    variantName={variantAdjustTarget.name}
    currentStock={variantAdjustTarget.stock}
    unitSymbol={variantAdjustTarget.unitSymbol}
  />
)}
```

Import it: `import { VariantAdjustStockDialog } from '@/components/products/VariantAdjustStockDialog'`.

- [ ] **Step 4: Auto-expand a row when the search matched via its variant name**

Find the existing `filteredInventory` filter (already variant-name-aware from a prior fix — uses `variantNamesByProduct` to also match on variant names / the "Product — Variant" combined label). After computing `filteredInventory`, add an effect that expands any product whose match came specifically from a variant (not the bare product name), only while a search term is active:

```ts
useEffect(() => {
  if (!search.trim() || !filteredInventory) return
  const q = search.toLowerCase()
  const toExpand = new Set<string>()
  for (const item of filteredInventory) {
    const pid = item.products?.id
    if (!pid) continue
    const productNameMatches = (item.products?.name ?? '').toLowerCase().includes(q)
    if (!productNameMatches) toExpand.add(pid) // matched via variant name/combined label, not the bare product name
  }
  if (toExpand.size > 0) setExpandedProductIds((prev) => new Set([...prev, ...toExpand]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [search])
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: no new errors. Fix any type mismatches against the actual current shape of `InventoryPage.tsx` (this task's steps describe the intended change against the file's state as last known during planning — reconcile against whatever the file actually contains when this task executes).

- [ ] **Step 6: Manual QC in the browser**

Start the dev server: `pnpm --filter web dev` (background). Log in with the test credentials already used earlier in this project (owner account for org "Ailsha Arts"). Navigate to `/inventory`. Verify:
- A variant product (e.g. "QC Clothing Test Shirt") shows a chevron + "N variants" badge, not a raw stock number.
- Clicking the chevron expands indented sub-rows with each variant's real stock.
- Clicking "Adjust" on a sub-row opens `VariantAdjustStockDialog`, and submitting an Add/Remove actually changes `variant_inventory.stock_qty` (verify via the Supabase MCP `execute_sql` tool against project `bzvbkscspzdschskbqtd`, or by re-opening the dialog and seeing the new "Current Stock" reflected after a page refetch).
- Searching a variant name (e.g. "XS") auto-expands the matching product's row.

Stop the dev server after QC.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/inventory/InventoryPage.tsx
git commit -m "feat: expandable variant rows with per-variant stock and adjust in Inventory Stock List

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Extend `BarcodeLabelDialog` to a multi-item list shape

**Files:**
- Modify: `apps/web/src/components/ui/BarcodeLabelDialog.tsx`

**Interfaces:**
- Consumes: existing `jsbarcode` dependency (already imported in this file), existing `Dialog`/`Button`/`Label`/`Input` primitives.
- Produces: new prop shape —
  ```ts
  interface LabelItem {
    key: string
    name: string
    variantLabel?: string
    barcode_value?: string | null
    price: number
  }
  interface Props {
    open: boolean
    onOpenChange: (v: boolean) => void
    items: LabelItem[]
    orgName?: string
  }
  export function BarcodeLabelDialog({ open, onOpenChange, items, orgName }: Props)
  ```
  This REPLACES the current `{ product: Product }` prop — Task 5 updates both existing call sites (`ProductsPage.tsx`, and this task's own Step 5 in `ProductViewPage.tsx` if it already calls this dialog — check first) to the new shape, plus 3 new call sites in later tasks.

- [ ] **Step 1: Replace the type definitions**

In `apps/web/src/components/ui/BarcodeLabelDialog.tsx`, replace:
```ts
interface Product {
  name: string
  price: number
  barcode_value?: string | null
  hsn_code?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  product: Product
  orgName?: string
}
```
with:
```ts
export interface LabelItem {
  key: string
  name: string
  /** e.g. "XS" — omitted for a non-variant item, appended to the printed name when present. */
  variantLabel?: string
  barcode_value?: string | null
  price: number
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  items: LabelItem[]
  orgName?: string
}
```

- [ ] **Step 2: Replace component state and effects for multi-item selection**

Replace the component signature and its `useState`/`useEffect` block:

```tsx
export function BarcodeLabelDialog({ open, onOpenChange, items, orgName }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [copiesByKey, setCopiesByKey] = useState<Record<string, number>>({})
  const [showName, setShowName] = useState(true)
  const [showPrice, setShowPrice] = useState(true)

  useEffect(() => {
    if (!open) return
    setChecked(new Set(items.filter((i) => i.barcode_value).map((i) => i.key)))
    setCopiesByKey(Object.fromEntries(items.map((i) => [i.key, 1])))
  }, [open, items])

  const checkedItems = items.filter((i) => checked.has(i.key))
  const totalLabels = checkedItems.reduce((sum, i) => sum + (copiesByKey[i.key] ?? 1), 0)
  const isMulti = items.length > 1
```

- [ ] **Step 3: Replace the SVG-preview `useEffect` to render one barcode per checked item (capped)**

Remove the old single-barcode `useEffect` (which used `svgRef` and `product.barcode_value`). Replace with:

```tsx
  const svgRefs = useRef<Record<string, SVGSVGElement | null>>({})
  const PREVIEW_CAP = 6
  const previewItems = checkedItems.slice(0, PREVIEW_CAP)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      for (const item of previewItems) {
        const el = svgRefs.current[item.key]
        if (!el || !item.barcode_value) continue
        try {
          JsBarcode(el, item.barcode_value, {
            format: 'CODE128',
            width: isMulti ? 1.2 : 1.8,
            height: isMulti ? 32 : 50,
            displayValue: true,
            fontSize: isMulti ? 9 : 11,
            margin: 4,
            background: '#ffffff',
            lineColor: '#000000',
          })
        } catch {
          // invalid barcode value — leave svg blank
        }
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [open, previewItems, isMulti])
```

Add `useRef` to the file's existing `react` import line (it already imports `useEffect, useRef, useState` per the original file — confirm and reuse, don't duplicate the import).

- [ ] **Step 4: Replace the print handler and footer/preview JSX**

Replace `handlePrint`:
```tsx
  const handlePrint = () => {
    const labelHtml = buildLabelHtml(checkedItems, copiesByKey, orgName, showName, showPrice)
    const win = window.open('', '_blank', 'width=600,height=400')
    if (!win) return
    win.document.write(labelHtml)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }
```

Replace the body JSX between the "Show Price" toggle block and the `DialogFooter` (i.e. the "Preview" section, and add a variant picker section above it when `isMulti`). Full replacement of the dialog's inner content:

```tsx
        <div className="space-y-4">
          <div className="text-sm text-zinc-400">
            {isMulti ? (
              <>Product: <span className="font-semibold text-zinc-200">{items[0]?.name}</span> — {items.length} variants</>
            ) : (
              <>Product: <span className="font-semibold text-zinc-200">{items[0]?.name}</span></>
            )}
          </div>
          <div className="text-xs text-zinc-500">
            Print Mode: <span className="font-medium text-zinc-300">Thermal (58mm)</span>{' '}
            <span className="text-zinc-600">(Change in Settings → Barcode)</span>
          </div>

          {isMulti ? (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              <Label>Variants</Label>
              {items.map((item) => (
                <div key={item.key} className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={checked.has(item.key)}
                    disabled={!item.barcode_value}
                    onChange={(e) => {
                      setChecked((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(item.key); else next.delete(item.key)
                        return next
                      })
                    }}
                    className="h-4 w-4 rounded border-zinc-600 accent-indigo-500"
                  />
                  <span className="flex-1 text-sm text-zinc-200 truncate">{item.variantLabel ?? item.name}</span>
                  {item.barcode_value ? (
                    <span className="text-[10px] font-mono text-zinc-500">{item.barcode_value}</span>
                  ) : (
                    <span className="text-[10px] text-amber-400">No barcode set</span>
                  )}
                  <Input
                    type="number"
                    min={1}
                    value={copiesByKey[item.key] ?? 1}
                    onChange={(e) => setCopiesByKey((prev) => ({ ...prev, [item.key]: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="w-16 h-7 text-xs shrink-0"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Number of Labels</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={copiesByKey[items[0]?.key] ?? 1}
                onChange={(e) => setCopiesByKey({ [items[0]?.key]: Math.max(1, parseInt(e.target.value) || 1) })}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="cursor-pointer" htmlFor="bc-show-name">Show Product Name</Label>
            <button
              id="bc-show-name"
              type="button"
              role="switch"
              aria-checked={showName}
              onClick={() => setShowName((v) => !v)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${showName ? 'bg-indigo-600' : 'bg-zinc-700'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${showName ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <Label className="cursor-pointer" htmlFor="bc-show-price">Show Price</Label>
            <button
              id="bc-show-price"
              type="button"
              role="switch"
              aria-checked={showPrice}
              onClick={() => setShowPrice((v) => !v)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${showPrice ? 'bg-indigo-600' : 'bg-zinc-700'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${showPrice ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Preview */}
          <div className="space-y-1.5">
            <Label className="text-zinc-500">Preview</Label>
            {previewItems.length === 0 ? (
              <div className="rounded-lg border border-border bg-white p-4 flex flex-col items-center text-black">
                <p className="text-[10px] text-gray-400 py-4">No labels selected</p>
              </div>
            ) : (
              <div className={cn('space-y-2', isMulti && 'max-h-48 overflow-y-auto pr-1')}>
                {previewItems.map((item) => (
                  <div key={item.key} className="rounded-lg border border-border bg-white p-3 flex flex-col items-center text-black">
                    {showName && (
                      <p className="text-xs font-bold text-center leading-tight mb-1">
                        {item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name}
                      </p>
                    )}
                    {item.barcode_value ? (
                      <svg ref={(el) => { svgRefs.current[item.key] = el }} />
                    ) : (
                      <p className="text-[10px] text-gray-400 py-4">No barcode set</p>
                    )}
                    {showPrice && <p className="text-sm font-bold mt-1">₹{item.price.toFixed(2)}</p>}
                  </div>
                ))}
                {checkedItems.length > PREVIEW_CAP && (
                  <p className="text-[11px] text-zinc-500 text-center">+{checkedItems.length - PREVIEW_CAP} more</p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button onClick={handlePrint} disabled={checkedItems.length === 0}>
            <Printer className="h-4 w-4" />
            {isMulti ? `Print ${checkedItems.length} variant${checkedItems.length !== 1 ? 's' : ''} · ${totalLabels} labels` : `Print ${totalLabels > 1 ? `${totalLabels} Labels` : '1 Label'}`}
          </Button>
        </DialogFooter>
```

Import `cn` from `@/lib/utils` at the top of the file (add to imports if not already present).

- [ ] **Step 5: Replace `buildLabelHtml` to loop items × copies**

Replace the standalone `buildLabelHtml` function at the bottom of the file:

```tsx
function buildLabelHtml(
  items: LabelItem[],
  copiesByKey: Record<string, number>,
  orgName: string | undefined,
  showName: boolean,
  showPrice: boolean,
): string {
  const rows = items.flatMap((item) => {
    const copies = copiesByKey[item.key] ?? 1
    const displayName = item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name
    return Array.from({ length: copies }, () => `
      <div class="label">
        ${orgName ? `<div class="shop">${orgName}</div>` : ''}
        ${showName ? `<div class="name">${displayName}</div>` : ''}
        ${item.barcode_value ? `<svg data-barcode="${item.barcode_value}" id="bc_${Math.random().toString(36).slice(2)}"></svg>` : ''}
        ${showPrice ? `<div class="price">&#8377;${item.price.toFixed(2)}</div>` : ''}
      </div>
    `)
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Barcode Label</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; font-family: Arial, sans-serif; }
  .labels { display: flex; flex-wrap: wrap; padding: 4mm; gap: 2mm; }
  .label {
    width: 58mm;
    border: 0.5pt solid #ccc;
    padding: 2mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    page-break-inside: avoid;
  }
  .shop { font-size: 7pt; font-weight: 600; text-align: center; margin-bottom: 1mm; }
  .name { font-size: 8pt; font-weight: bold; text-align: center; margin-bottom: 1mm; word-break: break-word; }
  .price { font-size: 11pt; font-weight: bold; margin-top: 1mm; }
  svg { max-width: 100%; }
  @media print {
    @page { margin: 4mm; size: A4; }
    body { margin: 0; }
  }
</style>
</head>
<body>
<div class="labels">${rows}</div>
<script>
  document.querySelectorAll('svg[data-barcode]').forEach(function(el) {
    JsBarcode(el, el.getAttribute('data-barcode'), {
      format: 'CODE128',
      width: 1.5,
      height: 40,
      displayValue: true,
      fontSize: 9,
      margin: 2,
      background: '#ffffff',
      lineColor: '#000000'
    });
  });
<\/script>
</body>
</html>`
}
```

(Change from the original: each `<svg>` now carries its own `data-barcode` attribute since different items have different barcode values — the original script hardcoded one `product.barcode_value` for every SVG on the page, which only worked because there was ever exactly one product's barcode. This is the key fix needed for multi-item printing to render correct barcodes per row.)

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: errors ONLY in files that still use the old `product={...}` prop (i.e. `ProductsPage.tsx`) — these are expected and fixed in Task 5. If `BarcodeLabelDialog.tsx` itself has errors, fix them before proceeding.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ui/BarcodeLabelDialog.tsx
git commit -m "feat: extend BarcodeLabelDialog to print a list of items (variant support)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Migrate existing `BarcodeLabelDialog` call site + fix Print button gating in `ProductsPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/products/ProductsPage.tsx`

**Interfaces:**
- Consumes: `BarcodeLabelDialog`'s new `{ items: LabelItem[] }` prop (Task 4), `LabelItem` type exported from `@/components/ui/BarcodeLabelDialog`.

- [ ] **Step 1: Fix the Print button gate in `ProductCard` for variant products**

Read `apps/web/src/pages/products/ProductsPage.tsx`'s `ProductCard` function (around line 110-253 per earlier reading). The action row currently does:
```tsx
{product.barcode_value ? (
  <button ... title="Print label" onClick={onPrint}>...</button>
) : (
  <button ... title="Delete" onClick={onDelete}>...</button>
)}
```
Change the condition to also show Print for variant products:
```tsx
{(product.barcode_value || hasVariants) ? (
  <button ... title="Print label" onClick={onPrint}>...</button>
) : (
  <button ... title="Delete" onClick={onDelete}>...</button>
)}
```
Also find the second occurrence further down (`{product.barcode_value && (<button ... title="Delete" ...>` — the standalone full-width Delete row shown only when Print already took the 4th grid slot) and change its condition to `{(product.barcode_value || hasVariants) && (`.

- [ ] **Step 2: Fetch variants when `printTarget` is a has_variants product**

Find the `printTarget` state (`const [printTarget, setPrintTarget] = useState<ProductWithInventory | null>(null)`) and the `BarcodeLabelDialog` render block at the bottom of the file. Add a query that fetches the target's variants only when needed:

```ts
const { data: printTargetVariants } = useQuery({
  queryKey: ['print-target-variants', printTarget?.id],
  enabled: !!printTarget && !!(printTarget as any).has_variants,
  queryFn: async () => {
    const { data } = await supabase
      .from('product_variants')
      .select('id, variant_name, barcode_value, sale_price')
      .eq('product_id', printTarget!.id)
      .order('variant_name')
    return data ?? []
  },
})
```

- [ ] **Step 3: Build the `items` list and update the dialog render**

Replace the `BarcodeLabelDialog` render block:
```tsx
{printTarget && (
  <BarcodeLabelDialog
    open={!!printTarget}
    onOpenChange={(v) => { if (!v) setPrintTarget(null) }}
    product={printTarget}
    orgName={org?.name}
  />
)}
```
with:
```tsx
{printTarget && (
  <BarcodeLabelDialog
    open={!!printTarget}
    onOpenChange={(v) => { if (!v) setPrintTarget(null) }}
    items={
      (printTarget as any).has_variants
        ? (printTargetVariants ?? []).map((v) => ({
            key: v.id,
            name: printTarget.name,
            variantLabel: v.variant_name,
            barcode_value: v.barcode_value,
            price: v.sale_price ?? 0,
          }))
        : [{ key: printTarget.id, name: printTarget.name, barcode_value: printTarget.barcode_value, price: printTarget.price }]
    }
    orgName={org?.name}
  />
)}
```

Import `LabelItem` is not required here since the array literal is inferred structurally — no import needed unless TypeScript complains, in which case add `import type { LabelItem } from '@/components/ui/BarcodeLabelDialog'` and annotate the array.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: clean — no remaining errors from the old `product={...}` prop shape.

- [ ] **Step 5: Manual QC in the browser**

Start the dev server, log in, go to `/products`. Verify:
- A variant product's card now shows a "Print" button (previously hidden).
- Clicking it opens the dialog with a checkbox list of all its variants, each showing its own barcode/price, all pre-checked.
- Unchecking one and clicking Print still generates a print window (verify the window opens; a printer isn't required — checking the generated HTML via devtools if needed).
- A non-variant product's existing single-barcode print flow still works unchanged.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/products/ProductsPage.tsx
git commit -m "fix: enable barcode label printing for variant products in Products list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Product Details page — summary card fixes + Variants table + Print Label fix

**Files:**
- Modify: `apps/web/src/pages/products/ProductViewPage.tsx`

**Interfaces:**
- Consumes: `getVariantStockMap` from `@billscape/api`, `BarcodeLabelDialog`/`LabelItem` from `@/components/ui/BarcodeLabelDialog` (Task 4), `VariantAdjustStockDialog` is NOT used here (this page shows the variants table read-only with a print icon per row, per the spec — stock adjustment here is out of scope; a merchant edits stock from the Inventory page's Task 3 flow, or `/products/:id/edit`).

- [ ] **Step 1: Add a query for this product's variants + their stock**

In `apps/web/src/pages/products/ProductViewPage.tsx`, alongside the existing `batches`/`movements` queries, add:

```ts
const { data: variants } = useQuery({
  queryKey: ['product-variants-detail', orgId, id],
  enabled: !!orgId && !!id && hasVariants,
  queryFn: async () => {
    const { data: rows } = await supabase
      .from('product_variants')
      .select('id, variant_name, barcode_value, tax_rate, mrp, sale_price, purchase_price')
      .eq('product_id', id!)
      .eq('organization_id', orgId!)
      .order('variant_name')
    if (!rows || rows.length === 0) return []

    const { getVariantStockMap } = await import('@billscape/api')
    const stockMap = await getVariantStockMap(supabase, orgId!, rows.map((r) => r.id))

    return rows.map((r) => ({ ...r, stock: stockMap.data.get(r.id) ?? 0 }))
  },
})
```

Note: `hasVariants` is already computed later in the file (`const hasVariants = !!(product as any)?.has_variants`) — move that `const` declaration ABOVE this new query (it currently sits after the `deleteMutation` block, around where `stock`/`reorderLevel` are computed) so it's available here. Prefer a static `import { getVariantStockMap } from '@billscape/api'` at the top of the file over the dynamic import shown above — check the file's existing imports first and match whatever style `ProductViewPage.tsx` already uses for `@billscape/api` imports (it currently has none, so add a static top-level import: `import { getVariantStockMap } from '@billscape/api'`).

- [ ] **Step 2: Compute summary card overrides for has_variants**

Add these computed values near the existing `stock`/`reorderLevel`/`hasVariants`/`totalBatchQty` consts:

```ts
const variantPrices = (variants ?? []).map((v) => v.sale_price ?? 0)
const variantPurchasePrices = (variants ?? []).map((v) => v.purchase_price ?? 0)
const variantTaxRates = new Set((variants ?? []).map((v) => v.tax_rate))
const totalVariantStock = (variants ?? []).reduce((sum, v) => sum + v.stock, 0)
const totalVariantStockValue = (variants ?? []).reduce((sum, v) => sum + v.stock * (v.purchase_price ?? 0), 0)

function priceRangeLabel(values: number[]): string {
  if (values.length === 0) return '—'
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? formatINR(min) : `${formatINR(min)} – ${formatINR(max)}`
}
```

- [ ] **Step 3: Replace the summary card's price/stock/tax cells for the has_variants case**

Find this block in the summary card grid:
```tsx
<div>
  <span className="text-zinc-500 text-xs">Sale Price</span>
  <p className="text-indigo-300 font-semibold">{hasVariants ? 'Multiple prices' : formatINR(product.price)}</p>
</div>
<div>
  <span className="text-zinc-500 text-xs">Purchase Price</span>
  <p className="text-zinc-200">{hasVariants ? '—' : formatINR(product.cost_price ?? 0)}</p>
</div>
<div>
  <span className="text-zinc-500 text-xs">Tax Rate</span>
  <p className="text-zinc-200">{product.tax_rate}%</p>
</div>
{product.track_stock && (
  <>
    <div>
      <span className="text-zinc-500 text-xs">Current Stock</span>
      <p className="text-indigo-300 font-semibold">{stock} {product.unit?.symbol ?? ''}</p>
    </div>
    <div>
      <span className="text-zinc-500 text-xs">Stock Value</span>
      <p className="text-zinc-200">{formatINR(stock * (product.cost_price ?? 0))}</p>
    </div>
  </>
)}
```

Replace with:
```tsx
<div>
  <span className="text-zinc-500 text-xs">Sale Price</span>
  <p className="text-indigo-300 font-semibold">
    {hasVariants ? priceRangeLabel(variantPrices) : formatINR(product.price)}
    {hasVariants && variants && variants.length > 0 && (
      <span className="text-zinc-500 text-xs font-normal"> ({variants.length} variants)</span>
    )}
  </p>
</div>
<div>
  <span className="text-zinc-500 text-xs">Purchase Price</span>
  <p className="text-zinc-200">{hasVariants ? priceRangeLabel(variantPurchasePrices) : formatINR(product.cost_price ?? 0)}</p>
</div>
<div>
  <span className="text-zinc-500 text-xs">Tax Rate</span>
  <p className="text-zinc-200" title={hasVariants ? [...variantTaxRates].map((r) => `${r}%`).join(', ') : undefined}>
    {hasVariants ? (variantTaxRates.size > 1 ? 'Varies' : `${[...variantTaxRates][0] ?? product.tax_rate}%`) : `${product.tax_rate}%`}
  </p>
</div>
{product.track_stock && (
  <>
    <div>
      <span className="text-zinc-500 text-xs">{hasVariants ? 'Total Stock (all variants)' : 'Current Stock'}</span>
      <p className="text-indigo-300 font-semibold">{hasVariants ? totalVariantStock : stock} {product.unit?.symbol ?? ''}</p>
    </div>
    <div>
      <span className="text-zinc-500 text-xs">Stock Value</span>
      <p className="text-zinc-200">{formatINR(hasVariants ? totalVariantStockValue : stock * (product.cost_price ?? 0))}</p>
    </div>
  </>
)}
```

- [ ] **Step 4: Fix the header Print Label button gate**

Find:
```tsx
{product.barcode_value && (
  <Button
    variant="outline" size="sm"
    onClick={() => printBarcodeLabel(product.name, product.barcode_value!, product.price)}
  >
    <Printer className="h-4 w-4" /> Print Label
  </Button>
)}
```

Replace with a version that opens the new multi-item dialog instead of the old one-shot `printBarcodeLabel` helper (which can't represent multiple variants):

```tsx
{(product.barcode_value || hasVariants) && (
  <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
    <Printer className="h-4 w-4" /> Print Label
  </Button>
)}
```

Add state near the top of the component: `const [printOpen, setPrintOpen] = useState(false)`. Remove the now-unused `printBarcodeLabel` import if nothing else in this file uses it (check with `grep -n printBarcodeLabel apps/web/src/pages/products/ProductViewPage.tsx` after this edit — if only the import line and this one call site referenced it, delete the import line too).

Add the dialog render near the existing Delete confirmation `<Dialog>` at the bottom of the file:

```tsx
{product && (
  <BarcodeLabelDialog
    open={printOpen}
    onOpenChange={setPrintOpen}
    items={
      hasVariants
        ? (variants ?? []).map((v) => ({
            key: v.id,
            name: product.name,
            variantLabel: v.variant_name,
            barcode_value: v.barcode_value,
            price: v.sale_price ?? 0,
          }))
        : [{ key: product.id, name: product.name, barcode_value: product.barcode_value, price: product.price }]
    }
    orgName={org?.name}
  />
)}
```

Import it: `import { BarcodeLabelDialog } from '@/components/ui/BarcodeLabelDialog'`. Note `org` isn't currently destructured from `useAuth()` in this file beyond `{ org }` (check the existing `const { org } = useAuth()` line — it's already there per the file read during planning, so `org?.name` is available).

- [ ] **Step 5: Add a single-variant print action to the new Variants table (built in Step 6 below) — plan ahead for the handler**

Add this handler near `printOpen` state:
```ts
const [singleVariantPrint, setSingleVariantPrint] = useState<{ id: string; variant_name: string; barcode_value: string | null; sale_price: number | null } | null>(null)
```
And a second dialog instance (or reuse one dialog by toggling its `items` — simpler to add a second render since `BarcodeLabelDialog` is a self-contained controlled component):
```tsx
{singleVariantPrint && (
  <BarcodeLabelDialog
    open={!!singleVariantPrint}
    onOpenChange={(v) => { if (!v) setSingleVariantPrint(null) }}
    items={[{
      key: singleVariantPrint.id,
      name: product?.name ?? '',
      variantLabel: singleVariantPrint.variant_name,
      barcode_value: singleVariantPrint.barcode_value,
      price: singleVariantPrint.sale_price ?? 0,
    }]}
    orgName={org?.name}
  />
)}
```

- [ ] **Step 6: Add the Variants table section**

Insert a new section directly after the summary "Info card" `</div>` and before the "Batches" section:

```tsx
{hasVariants && (
  <div className="rounded-lg border border-border bg-card overflow-hidden">
    <div className="flex items-center justify-between px-5 py-4">
      <h3 className="text-sm font-semibold text-zinc-300">Variants ({variants?.length ?? 0})</h3>
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Variant Name</TableHead>
          <TableHead>Barcode</TableHead>
          <TableHead className="text-right">Tax %</TableHead>
          <TableHead className="text-right">MRP</TableHead>
          <TableHead className="text-right">Retail Price</TableHead>
          <TableHead className="text-right">Purchase Price</TableHead>
          <TableHead className="text-right">Stock</TableHead>
          <TableHead className="w-[5%]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {!variants || variants.length === 0 ? (
          <TableRow><TableCell colSpan={8} className="text-center text-zinc-500 py-4">No variants recorded</TableCell></TableRow>
        ) : variants.map((v) => {
          const outOfStock = v.stock <= 0
          const lowStock = !outOfStock && v.stock <= reorderLevel
          return (
            <TableRow key={v.id}>
              <TableCell className="text-zinc-200">{v.variant_name}</TableCell>
              <TableCell className="font-mono text-xs text-zinc-400">{v.barcode_value ?? '—'}</TableCell>
              <TableCell className="text-right text-zinc-400">{v.tax_rate}%</TableCell>
              <TableCell className="text-right text-zinc-400">{v.mrp != null ? formatINR(v.mrp) : '—'}</TableCell>
              <TableCell className="text-right text-zinc-300">{v.sale_price != null ? formatINR(v.sale_price) : '—'}</TableCell>
              <TableCell className="text-right text-zinc-400">{v.purchase_price != null ? formatINR(v.purchase_price) : '—'}</TableCell>
              <TableCell className="text-right">
                <span className={cn('text-sm', outOfStock ? 'text-red-400' : lowStock ? 'text-yellow-400' : 'text-zinc-300')}>
                  {v.stock} {product.unit?.symbol ?? ''}
                </span>
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  title="Print label"
                  onClick={() => setSingleVariantPrint(v)}
                  className="p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-900/20 transition-colors"
                >
                  <Printer className="h-3.5 w-3.5" />
                </button>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  </div>
)}
```

Import `cn` from `@/lib/utils` if not already imported in this file (check first).

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 8: Manual QC in the browser**

Start the dev server, log in, navigate to a variant product's Details page (e.g. `/products/e9ad68e0-f2a0-4f64-865b-54b5681f642c` for "QC Clothing Test Shirt" from earlier work, or any current variant product id). Verify:
- Sale Price / Purchase Price show a range (or single value) instead of "Multiple prices"/"—".
- Current Stock is relabeled "Total Stock (all variants)" and shows the correct sum.
- Tax Rate shows "Varies" or the single rate correctly.
- A new "Variants (N)" table appears with correct per-variant data.
- Header "Print Label" button is now visible and opens the dialog with all variants checked.
- Each variant row's print icon opens the dialog scoped to just that one variant.

Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/pages/products/ProductViewPage.tsx
git commit -m "feat: variants table + fixed summary cells + print label for variant products in Product Details

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Print icon on Inventory's expanded variant rows

**Files:**
- Modify: `apps/web/src/pages/inventory/InventoryPage.tsx`

**Interfaces:**
- Consumes: `BarcodeLabelDialog`/`LabelItem` from `@/components/ui/BarcodeLabelDialog` (Task 4). Placed as its own task (after Task 4 exists) rather than inside Task 3, since Task 3 runs before the new dialog shape exists.

- [ ] **Step 1: Add print state and a print icon to each expanded variant sub-row**

In `apps/web/src/pages/inventory/InventoryPage.tsx`, add state near `variantAdjustTarget` (from Task 3):
```ts
const [variantPrintTarget, setVariantPrintTarget] = useState<{ id: string; variant_name: string; barcode_value: string | null; sale_price: number | null; productName: string } | null>(null)
```

In the expanded variant sub-row's Action cell (from Task 3 Step 3), alongside the "Adjust" button, add a print icon button:
```tsx
<button
  type="button"
  title="Print label"
  onClick={() => setVariantPrintTarget({ id: variant.id, variant_name: variant.variant_name, barcode_value: variant.barcode_value ?? null, sale_price: variant.sale_price ?? null, productName: item.products!.name })}
  className="p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-900/20 transition-colors"
>
  <Printer className="h-3.5 w-3.5" />
</button>
```

This requires the `variantStockByProduct` map built in Task 3 Step 2 to also carry `barcode_value` and `sale_price` per variant (Task 3 Step 2's query only selected `id, product_id, variant_name`). Update that query's `.select(...)` to `'id, product_id, variant_name, barcode_value, sale_price'` and carry those two extra fields through into the map's per-variant object shape (`{ id, variant_name, stock, barcode_value, sale_price }`).

Import `Printer` from `lucide-react` in this file if not already imported (check the existing icon import line first).

- [ ] **Step 2: Render the dialog**

Near the `VariantAdjustStockDialog` render from Task 3:
```tsx
{variantPrintTarget && (
  <BarcodeLabelDialog
    open={!!variantPrintTarget}
    onOpenChange={(v) => { if (!v) setVariantPrintTarget(null) }}
    items={[{
      key: variantPrintTarget.id,
      name: variantPrintTarget.productName,
      variantLabel: variantPrintTarget.variant_name,
      barcode_value: variantPrintTarget.barcode_value,
      price: variantPrintTarget.sale_price ?? 0,
    }]}
    orgName={org?.name}
  />
)}
```
Import `BarcodeLabelDialog` from `@/components/ui/BarcodeLabelDialog`. Confirm `org` is available in this file's scope (it already is — `const { org, user } = useAuth()` per the file's existing top-level destructure).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 4: Manual QC in the browser**

Start the dev server, log in, go to `/inventory`, expand a variant product, click the print icon on one variant sub-row, verify the dialog opens scoped to just that variant with its correct barcode/price. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/inventory/InventoryPage.tsx
git commit -m "feat: add per-variant barcode print icon to Inventory Stock List expanded rows

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes (completed during planning)

- **Spec coverage**: §1 (Inventory expand/adjust) → Tasks 1-3, plus its print entry point → Task 7. §2 (Details summary + variants table + print gate) → Task 6. §3 (BarcodeLabelDialog extension + all 4 entry points) → Tasks 4, 5, 6, 7 (Products list in Task 5, Details header + table in Task 6, Inventory in Task 7).
- **Type consistency**: `LabelItem` (Task 4) is used identically in Tasks 5, 6, and 7. `recordVariantAdjustment`'s `delta` param (Task 1) is consumed identically in Task 2. `getVariantStockMap`'s `{ data: Map<string, number> }` return shape is used consistently in Task 3 and Task 6.
- **No placeholders**: every step includes complete, pasteable code.
