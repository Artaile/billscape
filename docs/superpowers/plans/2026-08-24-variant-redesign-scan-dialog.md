# Variant Redesign + Shared Scan Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing Size/Color/Batches variant model with a free-text-named variant that carries its own Sale Price, Purchase Price (each with independent GST mode + live Base/GST breakdown), Tax Rate, Qty, and optional Expiry — applied consistently across Product form, Purchase entry, and (read-only) POS — plus a shared "Scan Barcode" dialog supporting both USB hardware scanners and device cameras, usable from all three surfaces.

**Architecture:** Additive DB migration (new nullable columns on `product_variants`, old `size`/`color` columns left in place but unused by new UI). One new shared `VariantEditor` component (used by both Product form and Purchase entry) replaces the two divergent inline variant blocks. One new shared `ScanBarcodeDialog` component (built on the already-installed-but-unused `@zxing/browser` for camera capture, plus the existing `useBarcodeScanner` hook for USB capture) replaces every bare barcode `Input` + regenerate-button pair across the app. POS gets a new read-only variant picker wired into its existing product-lookup flow — no new POS write paths.

**Tech Stack:** React + TypeScript + Vite, Supabase (Postgres + RLS), React Hook Form, Tailwind + shadcn/ui, `@zxing/browser` (camera decode, already a dependency, currently unused), JsBarcode (existing barcode rendering).

**Spec:** Design was worked out interactively via the visual brainstorming companion (mockup iterations recorded in `.superpowers/brainstorm/39896-1787547719/content/variants-v9.html`, the final approved variant card layout) plus direct chat clarification. No separate written spec file — this plan is the spec, informed by the mockup and the two AskUserQuestion decisions below.

## Per-variant stock tracking (design decision)

Confirmed with the user: full per-variant stock tracking is in scope for this plan, via a **separate `variant_inventory` table** (not restructuring the existing `inventory` table's primary key) — chosen specifically because it means **zero risk to the existing `decrement_stock_on_sale`/`increment_stock_on_purchase`/`increment_inventory` triggers**, which run on every sale and purchase in the system today, variant or not. Those three functions are NOT touched by this plan. A new, independent set of triggers/RPCs handles variant stock exclusively, mirroring the existing ones' logic but scoped to `product_variant_id`.

## Global Constraints

- Cashiers must NEVER see cost price, profit, or owner-only reports (CLAUDE.md rule 5). POS's variant picker is **read-only, select-only** — it must show Sale Price only, never Purchase Price, Tax Rate editing, or any cost figure. This was an explicit user decision, not an assumption.
- Business logic (GST math) lives ONLY in `packages/core` — reuse `splitInclusiveGST` (already built in a prior session) for the live "Base + GST" line under each variant's Sale/Purchase Price Amount field. Do not re-implement the split inline.
- Every tenant table has `organization_id`; all queries filter on it. `product_variants` already has this — preserve it in every new query.
- USB hardware scanners are keyboard-wedge devices — inter-keystroke timing (75ms threshold), per the existing `useBarcodeScanner` hook. Do not build a second implementation of this detection.
- Migration approach: **additive only** — add new nullable columns to `product_variants`, do NOT drop or rename `size`/`color`/`price_delta`/`stock_qty` (per user decision: "New migration, add missing columns"). Only 6 existing variant rows in the live DB today, none with a barcode set — low risk, but old rows must not break.
- Branch `feature/purchases-ippobill-parity` — continue on this branch (already the active local-only branch for this body of Purchases/Products UX work). Do NOT push or merge without explicit instruction.
- Dev server: `pnpm dev` from repo root. **Known gotcha from this session**: `apps/web`'s `@billscape/api` dependency uses `file:../../packages/api` (not `workspace:*`), which pnpm materializes as a stale hardlink snapshot — after any `packages/api` change, copy the changed file(s) into `node_modules/.pnpm/@billscape+api@file+packages+api/node_modules/@billscape/api/src/` OR run a fresh `pnpm install` (destructive prompt, avoid if possible). Additionally, Vite's dev-time pre-bundle cache (`apps/web/node_modules/.vite`) goes stale on any `packages/*` export change — `rm -rf apps/web/node_modules/.vite` before restarting `pnpm dev` after such a change, every time.

---

### Task 1: `product_variants` migration — new columns + `variant_inventory` table

**Files:**
- Create: `supabase/migrations/027_variant_redesign.sql`

**Interfaces:**
- Produces: new nullable columns on `product_variants`: `variant_name TEXT`, `sku TEXT`, `tax_rate SMALLINT`, `sale_price NUMERIC(10,2)`, `sale_gst_mode TEXT`, `purchase_price NUMERIC(10,2)`, `purchase_gst_mode TEXT`, `expiry_date DATE`, `qty NUMERIC(12,3)`. New table `variant_inventory(product_variant_id PK, organization_id, stock_qty, updated_at)`. New table `variant_stock_movements(id, organization_id, product_variant_id, qty_change, reason, reference_id, note, created_by, created_at)` — a variant-scoped mirror of the existing `stock_movements` table, kept fully separate so existing product-level stock history queries never need to filter out variant rows. New RPC `increment_variant_inventory(p_org_id uuid, p_variant_id uuid, p_qty numeric)`.
- Consumes: nothing from other tasks (foundation task).

- [ ] **Step 1: Write and apply the migration**

```sql
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
```

Apply via `mcp__claude_ai_Supabase__apply_migration` with `project_id: "bzvbkscspzdschskbqtd"`, `name: "variant_redesign"`. Additive-only, no destructive statements, no changes to any existing table's trigger or column — matches the established pattern from the prior `purchase_payments` migration in this same session, and uses the same `my_org_ids()` RLS helper the final review of that migration confirmed as the project's correct convention (not the inlined `memberships` subquery).

- [ ] **Step 2: Verify**

Run via `mcp__claude_ai_Supabase__execute_sql`:
```sql
select column_name, data_type from information_schema.columns where table_name = 'product_variants' order by ordinal_position;
select id, size, color, variant_name from product_variants;
select count(*) from variant_inventory;
select count(*) from pg_policies where tablename in ('variant_inventory', 'variant_stock_movements');
```
Expected: all 9 new `product_variants` columns present; the 6 existing rows each have a non-null `variant_name` combining their old size/color (e.g. "M · Red"); `variant_inventory` has 6 seeded rows (one per existing variant); 4 total RLS policies across the two new tables (2 on `variant_inventory`, 2 on `variant_stock_movements`).

Also explicitly confirm the existing product-level stock triggers are untouched: `select proname from pg_proc where proname in ('decrement_stock_on_sale', 'increment_stock_on_purchase', 'increment_inventory');` should return the same 3 functions with no new overloads — this migration must not have created a 4th function or altered these three.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/027_variant_redesign.sql
git commit -m "feat: add variant pricing/expiry columns and separate variant_inventory stock tracking"
```

---

### Task 2: Shared `VariantEditor` component

**Files:**
- Create: `apps/web/src/components/products/VariantEditor.tsx`
- Test: manual (no automated test harness in this repo for `apps/web` components)

**Interfaces:**
- Produces: `export interface VariantFormRow { variant_name: string; barcode_value: string; sku: string; tax_rate: GSTRate; sale_price: string; sale_gst_mode: 'include' | 'exclude'; purchase_price: string; purchase_gst_mode: 'include' | 'exclude'; qty: string; expiry_date: string }`, `export function emptyVariantRow(defaultTaxRate: GSTRate): VariantFormRow`, `export function VariantEditor(props: { variants: VariantFormRow[]; onChange: (variants: VariantFormRow[]) => void; defaultTaxRate: GSTRate })`.
- Consumes: `splitInclusiveGST`, `type GSTRate` from `@billscape/core`; a `ScanBarcodeDialog` component from Task 3 (this task can stub the barcode field with just a Generate button initially and Task 4 wires in Scan — see Step 4 note).

This is the single component that replaces BOTH `ProductFormPage.tsx`'s inline variant block and `PurchaseFormPage.tsx`'s inline variant block. Building it once, as its own file, is why this is its own task ahead of wiring it into either page.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/products/VariantEditor.tsx
import { useRef, useEffect } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { splitInclusiveGST, type GSTRate } from '@billscape/core'
import { generateBarcode } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const GST_RATES: GSTRate[] = [0, 5, 12, 18, 28]

export interface VariantFormRow {
  variant_name: string
  barcode_value: string
  sku: string
  tax_rate: GSTRate
  sale_price: string
  sale_gst_mode: 'include' | 'exclude'
  purchase_price: string
  purchase_gst_mode: 'include' | 'exclude'
  qty: string
  expiry_date: string
}

export function emptyVariantRow(defaultTaxRate: GSTRate): VariantFormRow {
  return {
    variant_name: '', barcode_value: '', sku: '', tax_rate: defaultTaxRate,
    sale_price: '', sale_gst_mode: 'include', purchase_price: '', purchase_gst_mode: 'include',
    qty: '', expiry_date: '',
  }
}

function parseNum(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function VariantBarcodeField({ value, onChange, onGenerate }: { value: string; onChange: (v: string) => void; onGenerate: () => void }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (value && ref.current) {
      try {
        JsBarcode(ref.current, value, { format: 'CODE128', width: 1.2, height: 26, displayValue: true, fontSize: 8, background: 'transparent', lineColor: '#e4e4e7', fontOptions: 'bold' })
      } catch { /* invalid value, leave blank */ }
    }
  }, [value])
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <Input placeholder="Barcode" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs font-mono" />
        <button type="button" title="Generate" onClick={onGenerate} className="shrink-0 p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      {value && <svg ref={ref} className="max-w-[130px]" />}
    </div>
  )
}

function PriceGroup({
  label, amount, gstMode, taxRate, onAmountChange, onModeChange,
}: {
  label: string
  amount: string
  gstMode: 'include' | 'exclude'
  taxRate: GSTRate
  onAmountChange: (v: string) => void
  onModeChange: (v: 'include' | 'exclude') => void
}) {
  const amt = parseNum(amount)
  const { base, tax } = splitInclusiveGST(amt, taxRate)
  return (
    <div className="grid grid-cols-[1.3fr_1fr] gap-1.5">
      <div>
        <label className="text-[9px] uppercase text-zinc-500">Amount *</label>
        <Input type="text" inputMode="decimal" value={amount} onFocus={(e) => e.target.select()}
          onChange={(e) => onAmountChange(e.target.value.replace(/[^0-9.]/g, ''))} className="h-8 text-xs" />
        {gstMode === 'include' && amt > 0 && taxRate > 0 && (
          <p className="text-[9px] text-zinc-500 mt-0.5">Base: ₹{base.toFixed(2)} + GST: ₹{tax.toFixed(2)}</p>
        )}
      </div>
      <div>
        <label className="text-[9px] uppercase text-zinc-500">GST Mode</label>
        <select value={gstMode} onChange={(e) => onModeChange(e.target.value as 'include' | 'exclude')}
          className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100">
          <option value="include">Include GST</option>
          <option value="exclude">Exclude GST</option>
        </select>
      </div>
    </div>
  )
}

export function VariantEditor({ variants, onChange, defaultTaxRate }: {
  variants: VariantFormRow[]
  onChange: (variants: VariantFormRow[]) => void
  defaultTaxRate: GSTRate
}) {
  function updateRow(i: number, patch: Partial<VariantFormRow>) {
    onChange(variants.map((v, j) => (j === i ? { ...v, ...patch } : v)))
  }
  function removeRow(i: number) {
    onChange(variants.filter((_, j) => j !== i))
  }
  return (
    <div className="space-y-2">
      {variants.map((v, i) => (
        <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500">VARIANT {i + 1}</span>
            <button type="button" onClick={() => removeRow(i)} className="text-red-400 hover:text-red-300">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Row 1: Name, Barcode, SKU, Tax % */}
          <div className="grid grid-cols-[1.6fr_1.6fr_1fr_0.7fr] gap-1.5">
            <div>
              <label className="text-[9px] uppercase text-zinc-500">Variant Name *</label>
              <Input placeholder="e.g. 256GB · Blue" value={v.variant_name} onChange={(e) => updateRow(i, { variant_name: e.target.value })} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[9px] uppercase text-zinc-500">Barcode</label>
              <VariantBarcodeField value={v.barcode_value} onChange={(val) => updateRow(i, { barcode_value: val })} onGenerate={() => updateRow(i, { barcode_value: generateBarcode() })} />
            </div>
            <div>
              <label className="text-[9px] uppercase text-zinc-500">SKU <span className="normal-case">(optional)</span></label>
              <Input placeholder="Auto or type" value={v.sku} onChange={(e) => updateRow(i, { sku: e.target.value })} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[9px] uppercase text-zinc-500">Tax %</label>
              <select value={v.tax_rate} onChange={(e) => updateRow(i, { tax_rate: Number(e.target.value) as GSTRate })}
                className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100">
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Sale Price | Purchase Price | Qty | Expiry — one grid so everything aligns */}
          <div className="grid grid-cols-[1.3fr_1fr_1.3fr_1fr_0.7fr_0.9fr] gap-1.5">
            <div className="col-span-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Sale Price</span>
            </div>
            <div className="col-span-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Purchase Price</span>
            </div>
            <div><span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Qty *</span></div>
            <div><span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Expiry <span className="font-normal normal-case">(optional)</span></span></div>

            <div className="col-span-2">
              <PriceGroup label="Sale" amount={v.sale_price} gstMode={v.sale_gst_mode} taxRate={v.tax_rate}
                onAmountChange={(val) => updateRow(i, { sale_price: val })} onModeChange={(mode) => updateRow(i, { sale_gst_mode: mode })} />
            </div>
            <div className="col-span-2">
              <PriceGroup label="Purchase" amount={v.purchase_price} gstMode={v.purchase_gst_mode} taxRate={v.tax_rate}
                onAmountChange={(val) => updateRow(i, { purchase_price: val })} onModeChange={(mode) => updateRow(i, { purchase_gst_mode: mode })} />
            </div>
            <div>
              <Input type="text" inputMode="decimal" value={v.qty} onFocus={(e) => e.target.select()}
                onChange={(e) => updateRow(i, { qty: e.target.value.replace(/[^0-9.]/g, '') })} className="h-8 text-xs" />
            </div>
            <div>
              <Input type="date" value={v.expiry_date} onChange={(e) => updateRow(i, { expiry_date: e.target.value })} className="h-8 text-xs" />
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="text-xs"
        onClick={() => onChange([...variants, emptyVariantRow(defaultTaxRate)])}>
        <Plus className="h-3.5 w-3.5" /> Add another variant
      </Button>
    </div>
  )
}
```

Note: this step uses only Generate (no Scan button yet) for the barcode field — Task 4 will add Scan support to this exact component once `ScanBarcodeDialog` exists, via a small follow-up edit. Building it this way avoids a circular task dependency (VariantEditor needing ScanBarcodeDialog which itself doesn't need VariantEditor) while still letting this task be independently testable.

- [ ] **Step 2: Verify component compiles standalone**

Run: `pnpm --filter @billscape/web build`. Expected: no TypeScript errors (the component isn't imported anywhere yet, so this only checks the file's own syntax/types — full integration verification happens in Tasks 5-6).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/products/VariantEditor.tsx
git commit -m "feat: add shared VariantEditor component with per-variant pricing and GST breakdown"
```

---

### Task 2b: `packages/api` variant inventory helpers

**Files:**
- Create: `packages/api/src/variantInventory.ts`
- Modify: `packages/api/src/index.ts` (export new module)

**Interfaces:**
- Produces: `recordVariantSale(client, { organizationId, variantId, qty, referenceId, createdBy }): Promise<{ error }>`, `recordVariantPurchase(client, { organizationId, variantId, qty, referenceId, createdBy }): Promise<{ error }>`, `getVariantStock(client, orgId, variantId): Promise<{ data: number, error }>`, `getVariantStockMap(client, orgId, variantIds: string[]): Promise<{ data: Map<string, number>, error }>`.
- Consumes: `increment_variant_inventory` RPC and `variant_stock_movements` table from Task 1.

This mirrors the existing `packages/api/src/purchases.ts`/`sales.ts` pattern of calling `increment_inventory` + inserting a `stock_movements` row together as one logical operation — done here as explicit helper functions (rather than a DB trigger, matching the user's chosen lower-risk design) so both the Purchase-entry save path (Task 6) and the POS sale path (Task 8) call the exact same, single implementation instead of two independent ad-hoc inserts that could drift.

- [ ] **Step 1: Write the helpers**

```typescript
// packages/api/src/variantInventory.ts
import type { TypedSupabaseClient } from './client'

async function adjustVariantStock(
  client: TypedSupabaseClient,
  args: { organizationId: string; variantId: string; qty: number; reason: 'sale' | 'purchase'; referenceId?: string; createdBy: string },
) {
  const signedQty = args.reason === 'sale' ? -Math.abs(args.qty) : Math.abs(args.qty)

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
    reason: args.reason,
    reference_id: args.referenceId ?? null,
    created_by: args.createdBy,
  })
  return { error: logError }
}

export function recordVariantSale(
  client: TypedSupabaseClient,
  args: { organizationId: string; variantId: string; qty: number; referenceId?: string; createdBy: string },
) {
  return adjustVariantStock(client, { ...args, reason: 'sale' })
}

export function recordVariantPurchase(
  client: TypedSupabaseClient,
  args: { organizationId: string; variantId: string; qty: number; referenceId?: string; createdBy: string },
) {
  return adjustVariantStock(client, { ...args, reason: 'purchase' })
}

export async function getVariantStock(client: TypedSupabaseClient, orgId: string, variantId: string) {
  const { data, error } = await client
    .from('variant_inventory')
    .select('stock_qty')
    .eq('organization_id', orgId)
    .eq('product_variant_id', variantId)
    .maybeSingle()
  if (error) return { data: 0, error }
  return { data: data?.stock_qty ?? 0, error: null }
}

export async function getVariantStockMap(client: TypedSupabaseClient, orgId: string, variantIds: string[]) {
  if (variantIds.length === 0) return { data: new Map<string, number>(), error: null }
  const { data, error } = await client
    .from('variant_inventory')
    .select('product_variant_id, stock_qty')
    .eq('organization_id', orgId)
    .in('product_variant_id', variantIds)
  if (error) return { data: new Map<string, number>(), error }
  const map = new Map<string, number>()
  for (const row of data ?? []) map.set(row.product_variant_id, row.stock_qty)
  return { data: map, error: null }
}
```

- [ ] **Step 2: Export and verify**

Add `export * from './variantInventory'` to `packages/api/src/index.ts` (after the existing `export * from './purchasePayments'` line). Run `pnpm --filter @billscape/web build` — expected clean. Per this session's known gotcha, if this fails with a stale "no exported member" error, copy `packages/api/src/index.ts` and the new file into `node_modules/.pnpm/@billscape+api@file+packages+api/node_modules/@billscape/api/src/` before re-running the build.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/variantInventory.ts packages/api/src/index.ts
git commit -m "feat: add variant-scoped stock adjustment helpers mirroring the existing product-level pattern"
```

---

### Task 3: `ScanBarcodeDialog` — shared camera + USB scan dialog

**Files:**
- Create: `apps/web/src/components/ui/ScanBarcodeDialog.tsx`

**Interfaces:**
- Produces: `export function ScanBarcodeDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; onScan: (code: string) => void })`.
- Consumes: `useBarcodeScanner` from `@/hooks/useBarcodeScanner` (existing, unchanged); `BrowserMultiFormatReader` from `@zxing/browser` (already an installed dependency, currently unused anywhere in the codebase — confirmed via `grep -rn "@zxing" apps/web/src` returning zero hits before this task).

- [ ] **Step 1: Write the dialog**

```tsx
// apps/web/src/components/ui/ScanBarcodeDialog.tsx
import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { Camera, Usb } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { cn } from '@/lib/utils'

export function ScanBarcodeDialog({
  open, onOpenChange, onScan,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (code: string) => void
}) {
  const [mode, setMode] = useState<'usb' | 'camera'>('usb')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)

  const handleScan = (code: string) => {
    onScan(code)
    onOpenChange(false)
  }

  // USB scanner: passively listens on a hidden input the moment the dialog opens in "usb" mode —
  // matches the existing app-wide pattern (POSTab, PromotionTargetPicker) of keystroke-timing detection.
  const { inputRef: usbInputRef, handleKeyDown: usbKeyDown, focusInput: focusUsbInput } = useBarcodeScanner(handleScan)

  useEffect(() => {
    if (open && mode === 'usb') focusUsbInput()
  }, [open, mode, focusUsbInput])

  // Camera scanner: starts a live decode loop against the first available camera when switched to
  // "camera" mode, stops it on dialog close or mode switch — must not leave the camera stream running
  // in the background after the user leaves this dialog.
  useEffect(() => {
    if (!open || mode !== 'camera') return
    setCameraError(null)
    const reader = new BrowserMultiFormatReader()
    let cancelled = false
    reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, err) => {
      if (cancelled) return
      if (result) handleScan(result.getText())
      // NotFoundException fires continuously while no barcode is in frame — expected, not an error.
    }).then((controls) => {
      if (cancelled) controls.stop()
      else controlsRef.current = controls
    }).catch(() => {
      if (!cancelled) setCameraError('Could not access camera — check browser permissions, or use a USB scanner instead.')
    })
    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [open, mode])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md outline-none ring-0 focus:ring-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Scan Barcode</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setMode('usb')}
            className={cn('flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm',
              mode === 'usb' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-zinc-700 text-zinc-400')}>
            <Usb className="h-4 w-4" /> USB Scanner
          </button>
          <button type="button" onClick={() => setMode('camera')}
            className={cn('flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm',
              mode === 'camera' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-zinc-700 text-zinc-400')}>
            <Camera className="h-4 w-4" /> Use Camera
          </button>
        </div>

        {mode === 'usb' ? (
          <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-8 text-center space-y-2">
            <Usb className="h-8 w-8 mx-auto text-zinc-500" />
            <p className="text-sm text-zinc-400">Scan now with your USB barcode scanner.</p>
            <input
              ref={usbInputRef}
              onKeyDown={usbKeyDown}
              className="opacity-0 absolute pointer-events-none"
              aria-hidden="true"
              autoFocus
            />
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden bg-black aspect-video relative">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
                <p className="text-sm text-red-400 text-center">{cameraError}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @billscape/web build`. Expected: no TypeScript errors — confirms `@zxing/browser`'s `BrowserMultiFormatReader`/`IScannerControls` types resolve correctly (this is the first usage of this dependency anywhere in the repo).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/ScanBarcodeDialog.tsx
git commit -m "feat: add shared ScanBarcodeDialog supporting USB scanner and device camera"
```

---

### Task 4: Wire Scan into `VariantEditor` and all existing barcode fields

**Files:**
- Modify: `apps/web/src/components/products/VariantEditor.tsx`
- Modify: `apps/web/src/pages/products/ProductFormPage.tsx` (main product barcode field)
- Modify: `apps/web/src/pages/purchases/PurchaseFormPage.tsx` (main entry-row barcode field)

**Interfaces:**
- Consumes: `ScanBarcodeDialog` from Task 3.
- Produces: nothing new consumed by later tasks — this task's job is purely to add Scan buttons everywhere Generate already exists.

- [ ] **Step 1: Add Scan support to `VariantEditor`'s barcode field**

In `VariantEditor.tsx`, modify `VariantBarcodeField` to accept and render a Scan button alongside Generate, opening a `ScanBarcodeDialog` scoped to that one row:

```tsx
function VariantBarcodeField({ value, onChange, onGenerate }: { value: string; onChange: (v: string) => void; onGenerate: () => void }) {
  const ref = useRef<SVGSVGElement>(null)
  const [scanOpen, setScanOpen] = useState(false)
  useEffect(() => {
    if (value && ref.current) {
      try {
        JsBarcode(ref.current, value, { format: 'CODE128', width: 1.2, height: 26, displayValue: true, fontSize: 8, background: 'transparent', lineColor: '#e4e4e7', fontOptions: 'bold' })
      } catch { /* invalid value, leave blank */ }
    }
  }, [value])
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <Input placeholder="Scan or enter barcode" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs font-mono" />
        <button type="button" title="Scan" onClick={() => setScanOpen(true)} className="shrink-0 p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white">
          <Camera className="h-3 w-3" />
        </button>
        <button type="button" title="Generate" onClick={onGenerate} className="shrink-0 p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      {value && <svg ref={ref} className="max-w-[130px]" />}
      <ScanBarcodeDialog open={scanOpen} onOpenChange={setScanOpen} onScan={onChange} />
    </div>
  )
}
```

Add `import { Camera } from 'lucide-react'` and `import { ScanBarcodeDialog } from '@/components/ui/ScanBarcodeDialog'` to `VariantEditor.tsx`'s existing import block. Note: one `ScanBarcodeDialog` instance is mounted per variant row (each closed by default) — acceptable since only one is ever open at a time and the dialog does no work while closed.

- [ ] **Step 2: Add Scan to `ProductFormPage.tsx`'s main product barcode field**

Locate the "Barcode" card (search for `handleAutoGenerateBarcode` and the surrounding JSX with the `RefreshCw` regenerate button). Add a Scan button next to it following the same pattern as Step 1, wiring `onScan` to `setValue('barcode_value', code, { shouldValidate: true })` (the existing RHF setter already used by `handleAutoGenerateBarcode`). Add local state `const [scanOpen, setScanOpen] = useState(false)` near the component's other local state, and mount one `<ScanBarcodeDialog open={scanOpen} onOpenChange={setScanOpen} onScan={(code) => setValue('barcode_value', code, { shouldValidate: true })} />` near the existing barcode preview block.

- [ ] **Step 3: Add Scan to `PurchaseFormPage.tsx`'s entry-row barcode field**

Locate the entry row's Barcode input (search for `entry.barcode_value` and its adjacent `generateBarcode()` regenerate button, in the "Row 2: Code, Barcode, GST%, Rate, Qty" section). Add a Scan button following the same pattern, wiring `onScan` to `(code) => setEntry((p) => ({ ...p, barcode_value: code, barcodeManuallyEdited: true }))` (matching the existing manual-edit pattern already used by that field's `onChange` handler). Add local state and one dialog instance near the entry state.

- [ ] **Step 4: Build and manual verification**

Run: `pnpm --filter @billscape/web build`. Then manually in the browser (`pnpm dev`, log in): open `/products/new`, click the main Barcode field's new Scan button — dialog should open defaulting to "USB Scanner" mode with a listening hidden input; switch to "Use Camera" — browser should prompt for camera permission, and on grant, show a live video feed. Typing a value into a physical USB scanner (or simulating fast keystrokes) while in USB mode should close the dialog and fill the field. Repeat the same check on a Product Variant's barcode field and on `/purchases/new`'s entry-row barcode field.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/products/VariantEditor.tsx apps/web/src/pages/products/ProductFormPage.tsx apps/web/src/pages/purchases/PurchaseFormPage.tsx
git commit -m "feat: wire Scan (camera + USB) button into every barcode field alongside Generate"
```

---

### Task 5: Replace `ProductFormPage.tsx`'s inline variant block with `VariantEditor`

**Files:**
- Modify: `apps/web/src/pages/products/ProductFormPage.tsx`
- Modify: `packages/api/src/products.ts` (or wherever the product save mutation's variant insert lives — confirm exact location via `grep -n "product_variants" packages/api/src/products.ts apps/web/src/pages/products/ProductFormPage.tsx`)

**Interfaces:**
- Consumes: `VariantEditor`, `VariantFormRow`, `emptyVariantRow` from `@/components/products/VariantEditor` (Task 2/4).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Replace state shape**

Replace the existing `variants` state (`useState<{ size, color, price_delta, stock_qty, barcode_value }[]>`) with `useState<VariantFormRow[]>([])`. Update the "Enable" toggle's seed logic to call `emptyVariantRow(watchedTaxRate)` instead of the old empty-object literal.

- [ ] **Step 2: Replace the rendered block**

Delete the entire inline `grid-cols-6` variant rendering block (Size/Color/Price/Stock/Barcode/delete columns) and replace with:

```tsx
{hasVariants && (
  <VariantEditor variants={variants} onChange={setVariants} defaultTaxRate={watchedTaxRate} />
)}
```

- [ ] **Step 3: Update the load-existing-variants effect**

The `useEffect` that maps `existingVariants` into local state (searches for `existingProduct.has_variants`/query key `['product_variants', id]`) must map the new DB columns into `VariantFormRow` shape:

```tsx
useEffect(() => {
  if (existingVariants && existingVariants.length > 0) {
    setVariants(existingVariants.map((v: any) => ({
      variant_name: v.variant_name ?? [v.size, v.color].filter(Boolean).join(' · '),
      barcode_value: v.barcode_value ?? '',
      sku: v.sku ?? '',
      tax_rate: (v.tax_rate ?? watchedTaxRate) as GSTRate,
      sale_price: v.sale_price != null ? String(v.sale_price) : '',
      sale_gst_mode: v.sale_gst_mode ?? 'include',
      purchase_price: v.purchase_price != null ? String(v.purchase_price) : '',
      purchase_gst_mode: v.purchase_gst_mode ?? 'include',
      qty: v.qty != null ? String(v.qty) : (v.stock_qty != null ? String(v.stock_qty) : ''),
      expiry_date: v.expiry_date ?? '',
    })))
  }
}, [existingVariants])
```

The `v.variant_name ?? [size,color].join(...)` fallback covers rows saved before this migration's backfill ran, or any row where variant_name is somehow still null.

- [ ] **Step 4: Update the save mutation's variant insert**

Find the save mutation's variant delete+reinsert block (searches for `.from('product_variants').delete()` then `.insert(...)` inside `saveMutation`). Update the insert payload to write the new columns, keeping `size`/`color` as `null` going forward (new rows never populate them — only historical rows have them):

```tsx
await supabase.from('product_variants').insert(
  validVariants.map((v) => ({
    product_id: productId!,
    organization_id: orgId!,
    variant_name: v.variant_name,
    barcode_value: v.barcode_value || null,
    sku: v.sku || null,
    tax_rate: v.tax_rate,
    sale_price: v.sale_price ? Number(v.sale_price) : null,
    sale_gst_mode: v.sale_gst_mode,
    purchase_price: v.purchase_price ? Number(v.purchase_price) : null,
    purchase_gst_mode: v.purchase_gst_mode,
    qty: v.qty ? Number(v.qty) : 0,
    stock_qty: v.qty ? Number(v.qty) : 0, // keep legacy stock_qty in sync — still read by any older code path
    expiry_date: v.expiry_date || null,
  }))
)
```

Update the `validVariants` filter (currently `variants.filter((v) => v.size || v.color)`) to `variants.filter((v) => v.variant_name.trim())`.

- [ ] **Step 5: Update the pre-submit validation**

Find the `onSubmit` handler's incomplete-variant check (currently checks `!v.size.trim() && !v.color.trim()`). Update to: `if (hasVariants) { if (variants.some((v) => !v.variant_name.trim())) { toast.error('Incomplete variant', 'Each variant needs a name before saving.'); return } }`.

- [ ] **Step 6: Build and manual verification**

Run: `pnpm --filter @billscape/web build`. Then in browser: `/products/new`, enable variants, add one with a name/prices/scan-a-barcode, save, reload in edit mode, confirm all fields (including Base+GST breakdown) reload correctly.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/products/ProductFormPage.tsx
git commit -m "feat: replace ProductFormPage's inline variant block with shared VariantEditor"
```

---

### Task 6: Replace `PurchaseFormPage.tsx`'s inline variant block with `VariantEditor`

**Files:**
- Modify: `apps/web/src/pages/purchases/PurchaseFormPage.tsx`
- Modify: `packages/api/src/purchases.ts` (`createProductForLine`'s variant insert)

**Interfaces:**
- Consumes: `VariantEditor`, `VariantFormRow`, `emptyVariantRow` from `@/components/products/VariantEditor`.
- Produces: `PurchaseLineInput.variants` in `packages/api/src/purchases.ts` changes shape from `{ size, color, price_delta, stock_qty }[]` to `VariantFormRow[]` (or an equivalent subset) — this is a call-site-only change within this task; no other task depends on the old shape.

- [ ] **Step 1: Replace `entry.variants` state shape**

The `PurchaseRow` interface's `variants: VariantRow[]` field (where `VariantRow { size, color, price_delta, stock_qty }`) becomes `variants: VariantFormRow[]`. Update `emptyRow()`'s `variants: []` (unchanged, empty array) and the "Track Variants" toggle's seed logic to call `emptyVariantRow(entry.tax_rate)` instead of the old literal.

- [ ] **Step 2: Replace the rendered block**

Delete the inline `grid-cols-5` variants block inside the "More details" section (Size/Color/Price/Stock/delete columns — the one WITHOUT a barcode column, per this session's earlier audit) and replace with:

```tsx
{entry.has_variants && (
  <VariantEditor
    variants={entry.variants}
    onChange={(variants) => setEntry((p) => ({ ...p, variants }))}
    defaultTaxRate={entry.tax_rate}
  />
)}
```

- [ ] **Step 3: Remove the now-redundant standalone Batches section for new products with variants**

Per the design worked out in this session's brainstorming, per-product Batches (the separate "Track Batches" toggle) stays for products WITHOUT variants (a single-SKU item that expires), but each variant now carries its own `expiry_date` directly — so a new product that has variants should not ALSO show the generic Batches toggle (it would be a second, disconnected expiry mechanism for the same product). Wrap the existing Batches toggle block's render condition: change `{/* Batches */}<div className="space-y-2">` to be conditional on `!entry.has_variants`:

```tsx
{!entry.has_variants && (
  <div className="space-y-2">
    {/* existing Batches toggle + rows, unchanged */}
  </div>
)}
```

If `entry.has_variants` is turned on while `entry.has_batches` was already on, also reset `has_batches: false, batches: []` in the same toggle handler that turns variants on, to avoid a hidden-but-still-active batches state:

```tsx
onClick={() => setEntry((p) => ({
  ...p, has_variants: !p.has_variants,
  variants: !p.has_variants && p.variants.length === 0 ? [emptyVariantRow(p.tax_rate)] : p.variants,
  has_batches: !p.has_variants ? false : p.has_batches,
  batches: !p.has_variants ? [] : p.batches,
}))}
```

- [ ] **Step 4: Update `packages/api/src/purchases.ts`'s `PurchaseLineInput` and `createProductForLine`**

Change the `variants` field type on `PurchaseLineInput` (currently `{ size: string; color: string; price_delta: number; stock_qty: number }[]`) to match the new shape:

```ts
variants?: {
  variant_name: string
  barcode_value?: string
  sku?: string
  tax_rate: GSTRate
  sale_price?: number
  sale_gst_mode?: 'include' | 'exclude'
  purchase_price?: number
  purchase_gst_mode?: 'include' | 'exclude'
  qty?: number
  expiry_date?: string
}[]
```

Update `createProductForLine`'s variant insert block (currently filters `v.size || v.color` and inserts `size, color, price_delta, stock_qty`) to filter on `v.variant_name.trim()` and insert the new columns, mirroring Task 5 Step 4's payload shape exactly (same field names on both insert call sites, for consistency). After the `product_variants` insert succeeds, seed each inserted variant's initial stock: for each returned variant row, call `recordVariantPurchase(client, { organizationId: orgId, variantId: insertedVariant.id, qty: line.qty ?? 0, referenceId: purchaseId, createdBy })` (import `recordVariantPurchase` from `./variantInventory` — same-package import, no new package dependency). This is the ONLY place a new variant's stock is seeded on creation; a variant added later via `ProductFormPage.tsx`'s edit flow (Task 5) starts at 0 stock and is topped up via a future purchase, matching how base products already behave (a product's `inventory` row is seeded at creation with `initialStock`, then only purchases add to it — Task 5 does not need its own stock-seeding step since editing an existing product's variants is not this plan's stock-adjustment path).

- [ ] **Step 5: Build and manual verification**

Run: `pnpm --filter @billscape/web build`. Then in browser: `/purchases/new`, type a new product name, enable "More details" → Track Variants, confirm the Batches toggle disappears while variants are on, add a variant with full details including expiry and a Qty of 5, save the purchase. Via `mcp__claude_ai_Supabase__execute_sql`, confirm `variant_inventory.stock_qty = 5` for the newly created variant and one `variant_stock_movements` row with `reason='purchase', qty_change=5`. Then check `/products` that the new product's variant carries through correctly with all fields.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/purchases/PurchaseFormPage.tsx packages/api/src/purchases.ts
git commit -m "feat: replace PurchaseFormPage's inline variant block with shared VariantEditor, seed variant stock on purchase, hide Batches toggle when variants are on"
```

---

### Task 7: Full-width purchase entry layout + bottom summary bar

**Files:**
- Modify: `apps/web/src/pages/purchases/PurchaseFormPage.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new consumed by other tasks — this is a pure layout change, applied last among the page-structure tasks so it doesn't conflict with Task 6's edits to the same file (they touch different regions: Task 6 is inside the "More details" collapsible, Task 7 is the outer page grid).

Per the approved mockup (`variants-v9.html` region above the variant card — the "Option B, evolved: full-width" layout), drop the fixed two-column `grid-cols-[1fr_400px]` (item entry + sticky sidebar) shell in favor of a single full-width column, with the Bill Summary rendered as a horizontal strip at the bottom instead of a sidebar.

- [ ] **Step 1: Locate and replace the outer grid**

Find the "Two-column body: item entry + table on the left, bill summary sticky on the right" comment and its `grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5` container. Replace with a single-column `space-y-5` container holding, in order: the entry card, the items table card (both currently already siblings inside the left column — keep their JSX as-is, just un-nest them from the grid), then the Bill Summary card moved to render AFTER the items table instead of in a separate right-hand column.

- [ ] **Step 2: Restyle Bill Summary as a horizontal strip**

Change the Bill Summary card's internal layout from its current vertical stack (label/value pairs stacked) to a horizontal flex row: `<div className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4">` containing each stat (`Taxable Amount`, `CGST`/`SGST` or `IGST`, `Tax Total`, `Bill Discount` input, `Round Off` checkbox, `Total Bill Amount`) as inline flex children separated by `<div className="w-px h-8 bg-zinc-800" />` dividers, ending with the existing Cancel/Save Purchase buttons.

- [ ] **Step 3: Make the summary bar sticky to the viewport bottom**

Wrap the restyled summary bar in a sticky positioning class: `<div className="sticky bottom-0 -mx-4 lg:-mx-6 px-4 lg:px-6 py-3 bg-zinc-950/95 backdrop-blur border-t border-zinc-800">` (matching the page's existing `p-4 lg:p-6` outer padding so the negative margin correctly extends it edge-to-edge) so it stays visible while scrolling through a long item list, per the mockup's explicit design intent.

- [ ] **Step 4: Build and manual verification**

Run: `pnpm --filter @billscape/web build`. Then in browser: `/purchases/new`, add several items so the items table grows tall, scroll down — confirm the summary bar stays pinned to the bottom of the viewport and all totals/buttons remain visible and clickable throughout.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/purchases/PurchaseFormPage.tsx
git commit -m "feat: full-width purchase entry layout with sticky bottom summary bar, replacing fixed sidebar"
```

---

### Task 8: POS read-only variant picker

**Files:**
- Modify: `apps/web/src/components/billing/POSTab.tsx`
- Modify: `packages/core/src/types/index.ts` (extend `CartItem`)
- Modify: `packages/api/src/sales.ts` (`createSale` — variant stock bookkeeping)

**Interfaces:**
- Consumes: `getVariantStockMap`, `recordVariantSale` from `packages/api/src/variantInventory.ts` (Task 2b).
- Produces: `CartItem.variant_id?: string` and `CartItem.variant_name?: string` — new optional fields other call sites constructing a `CartItem` literal (HistoryTab's bill-detail rebuild, PurchaseFormPage's unrelated `emptyTotals()`, per the existing pattern documented for `loyalty_redeem_amount` in CLAUDE.md) do NOT need to set these since they're optional, but must not be broken by their addition — verify this in Step 5.

Per the user's explicit decision: POS shows variant selection (name + Sale Price only) but no editing, no Purchase Price, no Tax Rate control. Per the user's follow-up decision, stock is tracked per-variant via the separate `variant_inventory` table from Task 1 — POS must show and enforce REAL per-variant stock, not a shared parent-product total.

- [ ] **Step 1: Extend `CartItem` with variant fields**

In `packages/core/src/types/index.ts`, add two optional fields to the existing `CartItem` interface (near `barcode_value?: string`):

```ts
  // Set only when this line is a specific product variant, not the base product — carries the
  // variant's own id (for variant-stock bookkeeping in createSale) and display name (for
  // receipts/cart rows). product_id above always stays the PARENT product's real id.
  variant_id?: string
  variant_name?: string
```

- [ ] **Step 2: Add a variants-by-product query and a stock map**

Near POSTab's existing product-lookup query (the one selecting `id, name, price, tax_rate, hsn_code, barcode_value, ...`), add a lazy per-product variants query plus their real stock, fetched only when a product with variants is clicked (not eagerly for the whole catalog):

```tsx
const [variantPickerProduct, setVariantPickerProduct] = useState<{ id: string; name: string } | null>(null)

const { data: productVariants } = useQuery({
  queryKey: ['product_variants_pos', variantPickerProduct?.id],
  enabled: !!variantPickerProduct,
  queryFn: async () => {
    const { data, error } = await supabase
      .from('product_variants')
      .select('id, variant_name, barcode_value, sale_price, tax_rate')
      .eq('product_id', variantPickerProduct!.id)
      .eq('organization_id', orgId!)
    if (error) throw error
    return data ?? []
  },
})

const { data: variantStockMap } = useQuery({
  queryKey: ['variant_stock_pos', variantPickerProduct?.id, productVariants?.map((v) => v.id).join(',')],
  enabled: !!orgId && !!productVariants && productVariants.length > 0,
  queryFn: async () => {
    const { data } = await getVariantStockMap(supabase, orgId!, productVariants!.map((v) => v.id))
    return data
  },
})
```

Import `getVariantStockMap` from `@billscape/api` in this file's existing core/api import block.

- [ ] **Step 3: Detect "has variants" on product click and branch**

Products already carry `has_variants` in their base query result (per this session's audit — confirm the current product query selects it; add `has_variants` to the select list if it doesn't already). In the existing product-click handler (the one calling `addToCart(product)` directly), branch: if `product.has_variants`, call `setVariantPickerProduct({ id: product.id, name: product.name })` to open a picker instead of adding directly.

- [ ] **Step 4: Render a variant picker dialog with real per-variant stock**

Add a minimal dialog (reuse existing `Dialog`/`DialogContent` primitives already imported in this file) listing `productVariants` as clickable rows showing `variant_name`, `formatINR(sale_price ?? 0)`, and stock from `variantStockMap.get(variant.id) ?? 0` — explicitly NO purchase_price, NO tax_rate editing UI, NO cost figures anywhere in this dialog, per the Global Constraints cashier-visibility rule. A variant row with 0 stock (and `allowNegativeStock` not enabled, mirroring `addToCart`'s existing out-of-stock check) should be disabled/greyed with a "Out of stock" label instead of clickable, matching the existing product-grid pattern for out-of-stock base products.

Confirmed exact integration point: `addToCart` (this file, ~line 345) takes a flat object shaped `{ id, name, price, tax_rate, hsn_code?, barcode_value?, inventory?, track_stock, unit?, secondary_unit?, conversion_factor? }`.

**Critical constraint, confirmed by reading `packages/api/src/sales.ts`**: `CartItem.product_id` is written directly into `sale_items.product_id` (a real FK to `products`) and drives the existing `decrement_stock_on_sale` trigger against the PARENT product's `inventory` row. Since variant stock is now tracked separately in `variant_inventory` (Task 1) and must NOT also double-decrement the parent product's own stock, this task must extend `addToCart` itself (a small, additive signature change) to accept the two new optional fields and pass them straight into the created `CartItem`:

```tsx
const addToCart = useCallback((product: {
  id: string
  name: string
  price: number
  tax_rate: number
  hsn_code?: string | null
  barcode_value?: string | null
  inventory?: unknown
  track_stock: boolean
  unit?: unknown
  secondary_unit?: unknown
  conversion_factor?: number | null
  variant_id?: string
  variant_name?: string
}) => {
  // ...existing body unchanged until the `newItem` construction, then:
  const newItem: CartItem = {
    product_id: product.id,
    product_name: product.name,
    hsn_code: product.hsn_code ?? undefined,
    tax_rate: product.tax_rate as CartItem['tax_rate'],
    unit_price: product.price,
    qty: 1,
    discount_pct: 0,
    discount_type: 'percent',
    discount_amount: 0,
    barcode_value: product.barcode_value ?? undefined,
    unit,
    secondary_unit: secondaryUnit,
    conversion_factor: product.conversion_factor ?? undefined,
    variant_id: product.variant_id,
    variant_name: product.variant_name,
  }
  // ...rest unchanged
```

Note the existing stock-check block (`if (!allowNegativeStock && product.track_stock && stock <= 0)`) reads `getStock(product.inventory)` — for a variant call, this reads the PARENT's `inventory`, which is now the wrong number to gate on. Since Step 4's dialog already gates variant selection on `variantStockMap` before `addToCart` is ever called for a variant row, this task does not need to change `addToCart`'s own stock-check logic — it only fires for non-variant clicks (the picker dialog is the sole entry point for variant clicks, and it does its own stock gate first). Confirm this reasoning holds during Step 6's manual test rather than assuming it silently.

Clicking a variant row calls `addToCart` with `id: variantPickerProduct.id` (parent product's real id — required so `sale_items.product_id` stays a valid FK and the existing product-level trigger doesn't error), `name: `${variantPickerProduct.name} — ${variant.variant_name}``, `price: variant.sale_price ?? 0`, `tax_rate: variant.tax_rate`, the parent product's `hsn_code`/`inventory`/`track_stock`/`unit`/`secondary_unit`/`conversion_factor` (unchanged), plus `variant_id: variant.id, variant_name: variant.variant_name`.

- [ ] **Step 5: Wire variant stock decrement into `createSale`**

In `packages/api/src/sales.ts`'s `createSale`, after the existing `sale_items` insert succeeds (the same point where the file's existing loyalty bookkeeping runs, per its documented non-blocking try/catch pattern), add a best-effort loop over `input.items` calling `recordVariantSale` for any item carrying a `variant_id`:

```ts
// Variant stock is tracked separately from the product-level inventory trigger (see
// variant_inventory / Task 1 of the variant-redesign plan) — best-effort, mirrors the existing
// loyalty bookkeeping's non-blocking pattern in this same function: a variant-stock failure must
// never roll back or fail the sale itself.
try {
  for (const item of input.items) {
    if (item.variant_id) {
      await recordVariantSale(client, {
        organizationId: input.organization_id,
        variantId: item.variant_id,
        qty: item.qty,
        referenceId: sale.id,
        createdBy: input.created_by,
      })
    }
  }
} catch {
  // Best-effort — sale already committed successfully above.
}
```

Import `recordVariantSale` from `./variantInventory` at the top of `sales.ts`. Confirm `CreateSaleInput.items`' element type already carries `variant_id` transitively via `CartItem` (Step 1) — if `CreateSaleInput` declares its own narrower item type instead of reusing `CartItem` directly, add `variant_id?: string` to that type too.

- [ ] **Step 6: Design decision on the parent product's own `inventory` row (confirmed with user)**

Selling a variant still writes `sale_items.product_id = <parent id>` (required for FK safety, per Step 4), so the existing `decrement_stock_on_sale` trigger WILL continue to decrement the parent product's own `inventory.stock_qty` in addition to `variant_inventory` being correctly decremented by this task's new code. **This is intentional and accepted, not a bug to fix**: the parent's `inventory` row becomes a stale/unused number for any product with `has_variants = true` — the user confirmed the correct response is to never display or rely on that number anywhere for a variant-carrying product, not to try to keep it accurate (e.g. as a synced sum of variant stocks, which was considered and explicitly rejected as unnecessary extra complexity). Concretely: anywhere in the app that shows a product's stock (Products list, Inventory page, low-stock dashboard alerts, POS's own out-of-stock check on the base product click path), if `product.has_variants` is true, that display must either be suppressed or replaced with a sum/indicator derived from `variant_inventory` instead of the parent `inventory` row — auditing and fixing every such display is OUT OF SCOPE for this task (POS's picker already does this correctly via Step 4's `variantStockMap`) but must be captured as a known follow-up in Task 9's QC report rather than silently left inconsistent.

- [ ] **Step 7: Build and manual verification**

Run: `pnpm --filter @billscape/web build`. Then in browser: go to `/billing`, click a product known to have variants (the phone product configured in earlier testing works), confirm the picker shows name + sale price + real stock per variant (not a shared total), confirm a 0-stock variant is disabled. Select an in-stock variant, confirm it adds to cart at the variant's price with the combined name. Complete the sale. Via `mcp__claude_ai_Supabase__execute_sql`, confirm `variant_inventory.stock_qty` decremented by the sold qty for that variant, and a `variant_stock_movements` row with `reason='sale'` was logged. Separately confirm (informational, not a failure condition per Step 6's decision) that the parent's `inventory.stock_qty` also changed — this is expected, not a bug, and must not be "fixed" here.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/billing/POSTab.tsx packages/core/src/types/index.ts packages/api/src/sales.ts
git commit -m "feat: add read-only variant picker to POS with real per-variant stock tracking via variant_inventory"
```

---

### Task 9: QC pass — strict review of Tasks 1-8 together

**Files:** none (verification only)

**Interfaces:** none

Per the user's explicit instruction ("QC agent vachu nee Strick ta QC panu" — do a strict QC pass), this task is a full, skeptical, end-to-end verification — not a rubber stamp.

- [ ] **Step 1: Backend verification**

Via `mcp__claude_ai_Supabase__execute_sql` against project `bzvbkscspzdschskbqtd`:
- Confirm all 9 new `product_variants` columns exist with correct types/constraints; confirm the `tax_rate`/`sale_gst_mode`/`purchase_gst_mode` CHECK constraints actually reject invalid values (attempt an insert with `tax_rate = 7` and confirm it errors, then clean up); confirm the 6 pre-existing variant rows have non-null `variant_name` from the backfill.
- Confirm `variant_inventory` and `variant_stock_movements` exist with the expected columns, RLS enabled, and 4 total policies across both tables (per Task 1 Step 2).
- Confirm the 3 pre-existing product-level stock functions (`decrement_stock_on_sale`, `increment_stock_on_purchase`, `increment_inventory`) are byte-identical to their state before this plan — this is the single most important backend check, since a regression here would silently corrupt stock for every non-variant product in the system: `select prosrc from pg_proc where proname in ('decrement_stock_on_sale', 'increment_stock_on_purchase', 'increment_inventory')` and confirm none reference `variant` anywhere in their body.

- [ ] **Step 2: Start dev server correctly**

`rm -rf apps/web/node_modules/.vite` (required after this plan's `packages/api`/`packages/core` touches), then `pnpm dev`. Confirm no console errors on initial load of `/products`, `/products/new`, `/purchases`, `/purchases/new`, `/billing`.

- [ ] **Step 3: Product form — full variant lifecycle**

Log in with `mdsuhail.designer@gmail.com` / `Test@4321`. Create a new product with 2 variants, each with a different Sale Price/Purchase Price/Tax Rate/Expiry, one with a scanned-in (or Generate-fallback, if no physical scanner available) barcode. Save. Reload the page in edit mode — confirm every field round-trips exactly, including the live Base+GST breakdown recomputing correctly for the loaded values.

- [ ] **Step 4: Purchase entry — full variant + layout + stock-seeding lifecycle**

Create a new purchase with one new product that has variants (confirm Batches toggle is absent while variants are on) and one new product that has NO variants but DOES use Batches (confirm Batches toggle IS present and works, unaffected by this plan's changes). Scroll a long item list and confirm the summary bar stays pinned to the bottom throughout. Save the purchase, confirm it completes without error, check `/products` that both new products (and the variant's data) landed correctly, and confirm via SQL that `variant_inventory` was seeded with the correct qty for each new variant (Task 6 Step 4).

- [ ] **Step 5: POS — read-only variant selection, real per-variant stock, strict cashier-visibility check**

Open browser DevTools Network tab, go to `/billing`, click a variant-carrying product, and inspect the actual network response for the variants query — confirm `purchase_price`, `purchase_gst_mode` are either not selected in the query at all (preferred) or, if present in the raw response for some reason, are never rendered anywhere in the picker UI. This is a strict check per the user's cashier-visibility non-negotiable rule (CLAUDE.md rule 5) — do not accept "it's not displayed" without confirming what's actually sent over the wire.

Also verify: each variant row shows its OWN stock number (not the parent product's shared total), a 0-stock variant is disabled/unselectable, and completing a sale of one variant correctly leaves a SIBLING variant's stock unchanged (buy the "M · Red" variant, confirm "L · Red"'s stock in `variant_inventory` did not move).

- [ ] **Step 6: Confirm the accepted parent-inventory side effect, and audit for the documented follow-up gap**

Per Task 8 Step 6's design decision: selling a variant is EXPECTED to also decrement the parent product's own `inventory.stock_qty` (via the untouched existing trigger) — confirm this happens (not a failure) via SQL. Then specifically check whether the **Products list page, Inventory page, or Dashboard's low-stock widget** currently display that now-meaningless parent stock number for a variant-carrying product — if any of them do, this is NOT something to silently fix in this QC task (out of scope per Task 8's Step 6), but it MUST be called out explicitly in this task's Step 8 report as a known, user-visible follow-up gap, not omitted.

- [ ] **Step 7: Scan dialog — both modes**

On any of the three barcode fields with the new Scan button: open the dialog, confirm it defaults to USB mode with no camera permission prompt fired yet (camera must be lazy, only requested when the user explicitly switches to Camera mode — verify by checking the browser's permission indicator does not activate in USB mode). Switch to Camera mode, confirm a permission prompt appears (or, if this environment/browser blocks camera access outright, confirm the dialog shows the `cameraError` message rather than crashing). Close the dialog while camera mode is active and confirm the browser's camera-in-use indicator turns off immediately (no lingering stream).

- [ ] **Step 8: Regression check — existing sale-flow and non-variant stock untouched**

Complete one full POS sale for a NON-variant product end to end, confirm invoice prints/generates correctly and its `inventory` stock decrements exactly once (not double-counted) — this plan touches shared files (`PurchaseFormPage.tsx`, `POSTab.tsx`, `sales.ts`) extensively enough, including a change to `addToCart`'s signature and a new code path inside `createSale`, that a regression in the unrelated non-variant path is a real risk worth spending a full pass on.

- [ ] **Step 9: Report findings**

Summarize pass/fail for each of Steps 1-8 with specific evidence (exact values/rows seen, not a bare "looks good"). Any failure found here re-opens the relevant task above rather than being silently noted and left. The Step 6 parent-inventory follow-up gap must appear in this report explicitly, even though it is not itself a failure of this plan's stated scope.
