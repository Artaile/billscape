# Purchases IppoBill-Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-value UX/correctness gaps found comparing BillScape's Purchases module against competitor IppoBill — replace a fragile notes-based payment-tracking hack with real schema, add per-variant barcode support, sync batch quantities into the purchase item row, and show a live GST base+tax breakdown — while staying simpler than IppoBill, not copying its complexity.

**Architecture:** Additive changes on top of existing, working components. No new pages except a thin Purchase Returns wrapper. The `purchase_payments` table is the only schema change; everything else is UI wiring onto fields/helpers that already exist in the codebase (`product_variants.barcode_value`, `computeLineTax`'s tax-inclusive math, existing `generateBarcode()`/`printBarcodeLabel()`).

**Tech Stack:** React + TypeScript + Vite, Supabase (Postgres + RLS), TanStack Query, React Hook Form + Zod, Tailwind + shadcn/ui, JsBarcode.

**Spec:** `/Users/admin/.claude/plans/1st-read-claude-md-modular-valley.md` (brainstormed gap analysis vs. IppoBill — this plan implements priority items 1–4 from that document: payment-tracking fix, variant barcode, batch-qty sync, GST breakdown).

## Global Constraints

- Every tenant table has `organization_id`; all queries filter on it — RLS is the backstop, not the only check (per CLAUDE.md rule 1).
- Business logic (tax, totals, rounding) lives ONLY in `packages/core` — never duplicate GST math in `apps/web` (CLAUDE.md rule 2).
- Cashiers must never see cost price, profit, or owner-only reports — Purchases is owner+manager only already; do not widen visibility (CLAUDE.md rule 5).
- Do not touch Dialog/Radix focus handling patterns already documented in CLAUDE.md ("Dialog / Radix UI focus rules") when adding new dialogs.
- Branch `feature/purchases-ippobill-parity` is already checked out off `main`. Do NOT push to remote or merge — this is local-only development per user instruction. Commit frequently on this branch.
- Dev server: `pnpm dev` from repo root (Turborepo monorepo, pnpm workspaces). Live Supabase project `bzvbkscspzdschskbqtd` is the actual backend — there is no separate local Postgres, so migrations run against the real (shared) dev database. Be careful: this is the live data source other sessions may also be using.

---

### Task 1: `purchase_payments` table + core payment API

**Files:**
- Create: `supabase/migrations/026_purchase_payments.sql`
- Create: `packages/api/src/purchasePayments.ts`
- Modify: `packages/api/src/index.ts` (export new module)
- Test: manual (no automated test harness exists for `packages/api` — verify via the Supabase SQL editor / running app, per existing project convention)

**Interfaces:**
- Produces: `recordPurchasePayment(client, input: RecordPurchasePaymentInput): Promise<{ data: PurchasePayment | null, error }>`, `getPurchasePayments(client, orgId: string, purchaseId: string): Promise<{ data: PurchasePayment[], error }>`, `getPurchasePaymentSummary(client, orgId: string, purchaseId: string): Promise<{ data: { paidAmount: number; balanceDue: number; status: 'paid' | 'partial' | 'pending' } | null, error }>`, and types `PurchasePayment`, `RecordPurchasePaymentInput`.
- Consumes: nothing from other tasks (this is the foundation task).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/026_purchase_payments.sql
create table if not exists purchase_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  purchase_id uuid not null references purchases(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  mode text not null default 'cash',
  reference text,
  notes text,
  paid_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists purchase_payments_purchase_id_idx on purchase_payments(purchase_id);
create index if not exists purchase_payments_org_id_idx on purchase_payments(organization_id);

alter table purchase_payments enable row level security;

create policy "purchase_payments_select" on purchase_payments for select
  using (organization_id in (select organization_id from memberships where user_id = auth.uid()));

create policy "purchase_payments_insert" on purchase_payments for insert
  with check (organization_id in (select organization_id from memberships where user_id = auth.uid()));

create policy "purchase_payments_delete" on purchase_payments for delete
  using (organization_id in (select organization_id from memberships where user_id = auth.uid()));

-- One-time backfill: migrate existing [PAYMENT: {...}] JSON blobs out of purchases.notes
-- into real rows, then strip the tag from notes so the text field only ever holds
-- genuine user notes going forward.
do $$
declare
  rec record;
  payment_json jsonb;
  history_item jsonb;
  extracted_tag text;
begin
  for rec in
    select id, organization_id, notes
    from purchases
    where notes like '%[PAYMENT:%'
  loop
    extracted_tag := substring(rec.notes from '\[PAYMENT:\s*(\{.*?\})\s*\]');
    if extracted_tag is not null then
      begin
        payment_json := extracted_tag::jsonb;
        for history_item in select * from jsonb_array_elements(coalesce(payment_json->'history', '[]'::jsonb))
        loop
          insert into purchase_payments (organization_id, purchase_id, amount, mode, reference, paid_at)
          values (
            rec.organization_id,
            rec.id,
            coalesce((history_item->>'amount')::numeric, 0),
            coalesce(history_item->>'mode', 'cash'),
            history_item->>'ref',
            coalesce((history_item->>'date')::timestamptz, now())
          );
        end loop;
        update purchases
        set notes = nullif(trim(regexp_replace(rec.notes, '\[PAYMENT:\s*\{.*?\}\s*\]', '', 'g')), '')
        where id = rec.id;
      exception when others then
        -- Malformed tag — leave notes untouched rather than losing data silently.
        null;
      end;
    end if;
  end loop;
end $$;
```

- [ ] **Step 2: Apply the migration**

Run via the Supabase MCP tool (`mcp__claude_ai_Supabase__apply_migration`) with project ID `bzvbkscspzdschskbqtd`, name `purchase_payments`, and the SQL above — OR if working purely from the CLI/local tooling, apply via whatever mechanism existing migrations in this repo use (check `supabase/migrations/025_expense_enhancements.sql` for the most recent precedent and follow the same apply path). Confirm success by querying `select count(*) from purchase_payments;` and `select id, notes from purchases where notes like '%[PAYMENT:%';` (should return 0 rows after backfill).

- [ ] **Step 3: Write `packages/api/src/purchasePayments.ts`**

```typescript
import type { TypedSupabaseClient } from './client'

export interface PurchasePayment {
  id: string
  organization_id: string
  purchase_id: string
  amount: number
  mode: string
  reference: string | null
  notes: string | null
  paid_at: string
  created_by: string | null
  created_at: string
}

export interface RecordPurchasePaymentInput {
  organization_id: string
  purchase_id: string
  amount: number
  mode: string
  reference?: string
  notes?: string
  created_by: string
}

export async function recordPurchasePayment(
  client: TypedSupabaseClient,
  input: RecordPurchasePaymentInput,
) {
  const { data, error } = await client
    .from('purchase_payments')
    .insert({
      organization_id: input.organization_id,
      purchase_id: input.purchase_id,
      amount: input.amount,
      mode: input.mode,
      reference: input.reference || null,
      notes: input.notes || null,
      created_by: input.created_by,
    })
    .select()
    .single()
  return { data: data as PurchasePayment | null, error }
}

export async function getPurchasePayments(
  client: TypedSupabaseClient,
  orgId: string,
  purchaseId: string,
) {
  const { data, error } = await client
    .from('purchase_payments')
    .select('*')
    .eq('organization_id', orgId)
    .eq('purchase_id', purchaseId)
    .order('paid_at', { ascending: false })
  return { data: (data ?? []) as PurchasePayment[], error }
}

export async function getPurchasePaymentSummary(
  client: TypedSupabaseClient,
  orgId: string,
  purchaseId: string,
  totalAmount: number,
) {
  const { data, error } = await getPurchasePayments(client, orgId, purchaseId)
  if (error) return { data: null, error }
  const paidAmount = data.reduce((sum, p) => sum + p.amount, 0)
  const balanceDue = Math.max(0, totalAmount - paidAmount)
  const status: 'paid' | 'partial' | 'pending' = balanceDue <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'pending'
  return { data: { paidAmount, balanceDue, status, payments: data }, error: null }
}
```

- [ ] **Step 4: Export from `packages/api/src/index.ts`**

Add `export * from './purchasePayments'` alongside the existing `export * from './purchases'` line (find it with `grep -n "export \* from './purchases'" packages/api/src/index.ts` and add the new line directly after it).

- [ ] **Step 5: Verify the package builds**

Run: `pnpm --filter @billscape/api build` (or `pnpm build` from repo root if per-package build isn't wired). Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/026_purchase_payments.sql packages/api/src/purchasePayments.ts packages/api/src/index.ts
git commit -m "feat: add purchase_payments table and API replacing notes-based payment hack"
```

---

### Task 2: Wire `PurchasesPage.tsx` to real payment API

**Files:**
- Modify: `apps/web/src/pages/purchases/PurchasesPage.tsx`

**Interfaces:**
- Consumes: `recordPurchasePayment`, `getPurchasePaymentSummary` from `packages/api/src/purchasePayments.ts` (Task 1).
- Produces: nothing new consumed elsewhere — this is a leaf UI task. The `Purchase` interface and `PaymentRecord`/`parsePurchasePayment` exports in this file are removed; if any other file imports them, that import must be updated in this same task (check with `grep -rn "parsePurchasePayment\|PaymentRecord" apps/web/src --include=*.tsx --include=*.ts`).

- [ ] **Step 1: Replace the payment summary query**

Remove the `parsePurchasePayment` function (lines 58-81) and the `PaymentRecord` interface (lines 51-56). Replace the `summary` calculation (lines 297-310) with a `useQuery` that fetches per-purchase summaries in one batched call. Add near the top of the component, after the `purchases` query:

```typescript
const { data: paymentSummaries } = useQuery({
  queryKey: ['purchase_payment_summaries', orgId, purchases?.map((p) => p.id).join(',')],
  enabled: !!orgId && !!purchases && purchases.length > 0,
  queryFn: async () => {
    const { data, error } = await supabase
      .from('purchase_payments')
      .select('purchase_id, amount')
      .eq('organization_id', orgId!)
      .in('purchase_id', purchases!.map((p) => p.id))
    if (error) throw error
    const paidByPurchase = new Map<string, number>()
    for (const row of data ?? []) {
      paidByPurchase.set(row.purchase_id, (paidByPurchase.get(row.purchase_id) ?? 0) + row.amount)
    }
    return paidByPurchase
  },
})

function paymentInfoFor(p: Purchase): { paidAmount: number; balanceDue: number; status: 'paid' | 'partial' | 'pending' } {
  const paidAmount = paymentSummaries?.get(p.id) ?? 0
  const total = p.total_amount || 0
  const balanceDue = Math.max(0, total - paidAmount)
  const status = balanceDue <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'pending'
  return { paidAmount, balanceDue, status }
}
```

Replace every call site of `parsePurchasePayment(p)` / `parsePurchasePayment(paymentTarget)` with `paymentInfoFor(p)` / `paymentInfoFor(paymentTarget)`. Note: the payment-history list in the "Record Payment" dialog (lines 714-727, `pay.payments`) needs its own fetch — add a second query scoped to `paymentTarget?.id`:

```typescript
const { data: targetPaymentHistory } = useQuery({
  queryKey: ['purchase_payments', paymentTarget?.id],
  enabled: !!paymentTarget && !!orgId,
  queryFn: async () => {
    const { getPurchasePayments } = await import('@billscape/api')
    const { data, error } = await getPurchasePayments(supabase, orgId!, paymentTarget!.id)
    if (error) throw error
    return data
  },
})
```

(Use a static top-level `import { getPurchasePayments } from '@billscape/api'` instead of the dynamic import shown above — the dynamic import is just illustrating intent; add it to the existing import block at the top of the file.)

Update the payment history render block to map over `targetPaymentHistory ?? []` using fields `amount`, `mode`, `paid_at`, `reference` instead of the old `PaymentRecord`'s `amount`/`mode`/`date`/`ref`.

- [ ] **Step 2: Replace `recordPaymentMutation`**

Replace the mutation body (lines 211-272) — delete the notes-tag JSON logic entirely and call the real API:

```typescript
const recordPaymentMutation = useMutation({
  mutationFn: async ({
    purchase,
    amount,
    mode,
    reference,
    notes,
  }: {
    purchase: Purchase
    amount: number
    mode: string
    reference?: string
    notes?: string
  }) => {
    const { recordPurchasePayment } = await import('@billscape/api')
    const { error } = await recordPurchasePayment(supabase, {
      organization_id: orgId!,
      purchase_id: purchase.id,
      amount,
      mode,
      reference,
      notes,
      created_by: user!.id,
    })
    if (error) throw error

    await logActivity({
      organizationId: orgId!,
      action: 'payment_out',
      entity: 'purchase',
      entityId: purchase.id,
      metadata: {
        purchase_no: purchase.purchase_no,
        supplier: purchase.suppliers?.name,
        amount_paid: amount,
        mode,
        reference,
      },
    })
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['purchase_payment_summaries', orgId] })
    queryClient.invalidateQueries({ queryKey: ['purchase_payments', paymentTarget?.id] })
    queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
    toast.success('Payment recorded successfully')
    setPaymentTarget(null)
    setPayAmount('')
    setPayRef('')
    setPayNotes('')
  },
  onError: (err: Error) => toast.error('Failed to record payment', err.message),
})
```

(Again, replace the dynamic `import()` calls with a static top-of-file import — same convention as the rest of the file already uses for `@billscape/core`/`@billscape/api`.)

- [ ] **Step 3: Update the `summary` reduce block**

Replace the `summary` calculation (previously lines 297-310) to use `paymentInfoFor`:

```typescript
const summary = (purchases ?? []).reduce(
  (acc, p) => {
    const pay = paymentInfoFor(p)
    acc.totalAmount += p.total_amount || 0
    acc.totalPaid += pay.paidAmount
    acc.totalDue += pay.balanceDue
    if (pay.status === 'paid') acc.paidCount++
    else if (pay.status === 'partial') acc.partialCount++
    else acc.pendingCount++
    return acc
  },
  { totalAmount: 0, totalPaid: 0, totalDue: 0, paidCount: 0, partialCount: 0, pendingCount: 0 },
)
```

This must be computed after `paymentSummaries` has loaded — guard the whole summary/table render the same way the existing `isLoading` check already does (add `|| (purchases && purchases.length > 0 && !paymentSummaries)` to the loading condition, or accept a brief 0-state flash on first paint since `paymentSummaries` resolves fast — match whatever the existing `isLoading` spinner block does today for consistency).

- [ ] **Step 4: Manual verification in the running app**

Run `pnpm dev`, log in with `mdsuhail.designer@gmail.com` / `Test@4321`, navigate to `/purchases`. Confirm: KPI cards render with real numbers (not from notes-parsing), any existing purchase with a prior `[PAYMENT: ...]` tag now shows the same paid/due amounts (proving the backfill worked), and its `notes` field (if edited/viewed) no longer contains the raw `[PAYMENT: ...]` tag. Click "Pay" on a bill with balance due, record a partial payment, confirm the list and KPI cards update immediately (query invalidation working) and the payment history list in the dialog shows the new payment plus any pre-existing backfilled ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/purchases/PurchasesPage.tsx
git commit -m "feat: replace notes-hack payment tracking with real purchase_payments queries"
```

---

### Task 3: Per-variant barcode (generate, preview, print) — Product form

**Files:**
- Modify: `apps/web/src/pages/products/ProductFormPage.tsx`

**Interfaces:**
- Consumes: `generateBarcode()` from `@/lib/utils` (already imported), `printBarcodeLabel()` from `@/lib/printBarcodeLabel` (already imported), `JsBarcode` (already imported).
- Produces: nothing consumed by other tasks — self-contained UI change. The `variants` state shape (`{ size, color, price_delta, stock_qty, barcode_value }`) is unchanged; `barcode_value` already round-trips through load/save (verified in Task 1's audit) — this task only adds the missing UI controls.

- [ ] **Step 1: Add a barcode ref per variant row**

Variant rows are rendered from a plain array via `.map`, not separate components, so a single `useRef` won't work per-row. Add a small inline sub-component above the `ProductFormPage` function (same file) so each row can own its own SVG ref and live-render its own barcode:

```typescript
function VariantBarcodePreview({
  value,
  onGenerate,
  onChange,
  onPrint,
}: {
  value: string
  onGenerate: () => void
  onChange: (v: string) => void
  onPrint: () => void
}) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (value && ref.current) {
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128',
          width: 1.3,
          height: 32,
          displayValue: true,
          fontSize: 9,
          background: 'transparent',
          lineColor: '#e4e4e7',
          fontOptions: 'bold',
        })
      } catch {
        // Invalid barcode value — leave preview blank rather than throwing.
      }
    }
  }, [value])

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        <Input
          placeholder="Barcode"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs font-mono"
        />
        <button type="button" title="Auto-generate" onClick={onGenerate}
          className="shrink-0 p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      {value && (
        <div className="flex items-center gap-2">
          <svg ref={ref} className="max-w-[140px]" />
          <button type="button" onClick={onPrint}
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 text-[11px] text-zinc-400 hover:text-white hover:border-zinc-600">
            <Printer className="h-3 w-3" />Print
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Change the variant grid from 5 columns to 6, adding the barcode column**

In the "Product Variants" section, change the header grid (line ~829) from `grid-cols-5` to `grid-cols-6` and add a "Barcode" label:

```tsx
<div className="grid grid-cols-6 gap-2 text-xs text-zinc-500 px-1">
  <span>Size</span>
  <span>Color</span>
  <span>Price +/-</span>
  <span>Stock</span>
  <span>Barcode</span>
  <span></span>
</div>
```

Update the row grid (line ~837) from `grid-cols-5` to `grid-cols-6 items-start` (items-start, not items-center, since the barcode cell is now taller than the other single-line inputs), and insert the new cell between Stock and the delete button:

```tsx
{variants.map((v, i) => (
  <div key={i} className="grid grid-cols-6 gap-2 items-start">
    <Input
      placeholder="S / M / L"
      value={v.size}
      onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? { ...x, size: e.target.value } : x))}
      className="h-8 text-xs"
    />
    <Input
      placeholder="Red / Blue"
      value={v.color}
      onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
      className="h-8 text-xs"
    />
    <Input
      type="number"
      step="0.01"
      placeholder="0.00"
      value={v.price_delta}
      onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? { ...x, price_delta: Number(e.target.value) } : x))}
      className="h-8 text-xs"
    />
    <Input
      type="number"
      min="0"
      placeholder="0"
      value={v.stock_qty}
      onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? { ...x, stock_qty: Number(e.target.value) } : x))}
      className="h-8 text-xs"
    />
    <VariantBarcodePreview
      value={v.barcode_value}
      onChange={(val) => setVariants((prev) => prev.map((x, j) => j === i ? { ...x, barcode_value: val } : x))}
      onGenerate={() => setVariants((prev) => prev.map((x, j) => j === i ? { ...x, barcode_value: generateBarcode() } : x))}
      onPrint={() => printBarcodeLabel(
        [v.size, v.color].filter(Boolean).join(' / ') || watch('name') || 'Variant',
        v.barcode_value,
        watch('price') + (v.price_delta || 0),
      )}
    />
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-red-400 hover:text-red-300"
      onClick={() => setVariants((prev) => prev.filter((_, j) => j !== i))}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </div>
))}
```

- [ ] **Step 3: Manual verification**

Run `pnpm dev`, log in, go to `/products/new`, enable "Product Variants", add a variant with Size "M". Click the barcode auto-generate icon inside the variant row — confirm a barcode value appears AND a scannable-looking barcode image renders inline immediately below it (not just a text field). Click "Print" — confirm the existing print-label popup opens with that variant's barcode and a name combining size/color. Save the product, reload the edit page, confirm the variant's barcode value persisted and re-renders.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/products/ProductFormPage.tsx
git commit -m "feat: add per-variant barcode generate/preview/print to product form"
```

---

### Task 4: Batch-driven Qty auto-allocation in Purchase entry

**Files:**
- Modify: `apps/web/src/pages/purchases/PurchaseFormPage.tsx`

**Interfaces:**
- Consumes: existing `entry` state shape (`PurchaseRow`, specifically `entry.batches: BatchRow[]` and `entry.qty: string`) — no new types.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add a derived batch-total helper**

Near the existing `rowBaseQty` function (~line 84), add:

```typescript
function batchQtyTotal(batches: BatchRow[]): number {
  return batches.reduce((sum, b) => sum + (parseNum(b.qty) || 0), 0)
}
```

- [ ] **Step 2: Sync `entry.qty` from batch totals when batches are enabled**

Add a `useEffect` near the other entry-related effects in the component (search for existing `useEffect` calls tied to `entry` to place it consistently) that keeps `entry.qty` as a read-only mirror of the batch total whenever `entry.has_batches` is true and at least one batch row has a qty:

```typescript
useEffect(() => {
  if (entry.has_batches && entry.batches.length > 0) {
    const total = batchQtyTotal(entry.batches)
    setEntry((p) => (p.has_batches ? { ...p, qty: String(total) } : p))
  }
}, [entry.has_batches, entry.batches])
```

- [ ] **Step 3: Make the Qty field read-only and show the allocation caption when batches are tracked**

Locate the Qty input in "Row 2: Code, Barcode, GST%, Rate, Qty" (~line 830-831):

```tsx
<div className="space-y-1">
  <Label className="text-xs">Qty *</Label>
  <Input type="text" inputMode="decimal" value={entry.qty} onFocus={(e) => e.target.select()}
    onChange={(e) => setEntry((p) => ({ ...p, qty: e.target.value.replace(/[^0-9.]/g, '') || '0' }))} className="h-9 text-sm text-center" />
</div>
```

Replace with:

```tsx
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
```

- [ ] **Step 4: Show a running batch-total footer in the Batches sub-section**

In the "Batches" block inside "More details" (~line 1023, the `<span className="text-xs text-zinc-400">Track Batches</span>` label area), after the batch rows `.map` and before the "+ Add Batch" button, add a running total line matching IppoBill's "Total batch qty: N units" pattern:

```tsx
{entry.batches.length > 0 && (
  <p className="text-[11px] text-zinc-500 pl-1">
    Total batch qty: {batchQtyTotal(entry.batches)} {unitOf(entry.unit_id)?.symbol ?? 'units'}
  </p>
)}
```//&nbsp;place this line directly above the existing `<Button ... Add Batch</Button>` line.

- [ ] **Step 5: Manual verification**

Run `pnpm dev`, go to `/purchases/new`, type a new product name, enable "More details" → "Track Batches", add two batch rows with qty 5 and qty 3. Confirm: the main row's Qty field becomes disabled/grayed and shows "5" then "8" as batch quantities are typed (with the "Allocated from batches below" caption), and the running "Total batch qty: 8 ..." line appears under the batch rows. Disable "Track Batches" — confirm Qty becomes editable again and keeps its last value (does not reset to a stale batch-derived number). Confirm a NON-batch-tracked row's Qty field is completely unaffected (freely editable, no caption) — this is the critical regression check per the plan's explicit design goal of not taxing the common case.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/purchases/PurchaseFormPage.tsx
git commit -m "feat: auto-allocate purchase item qty from batch quantities when batch tracking is enabled"
```

---

### Task 5: "Base + GST" live breakdown on GST-inclusive price inputs

**Files:**
- Create: `packages/core/src/tax/splitInclusiveGST.ts`
- Modify: `packages/core/src/index.ts` (export new helper)
- Modify: `apps/web/src/pages/products/ProductFormPage.tsx` (Retail Price, Cost Price)
- Modify: `apps/web/src/pages/purchases/PurchaseFormPage.tsx` (Purchase Rate)

**Interfaces:**
- Produces: `splitInclusiveGST(amount: number, taxRate: GSTRate): { base: number; tax: number }` from `packages/core`.
- Consumes: `GSTRate` type (already exported from `packages/core`).

- [ ] **Step 1: Write the shared helper**

```typescript
// packages/core/src/tax/splitInclusiveGST.ts
import type { GSTRate } from '../types'
import { toMoney } from '../money'

// Splits a GST-inclusive amount into its base (taxable) value and the tax portion —
// used purely for UI display (e.g. "Base: ₹212 + GST: ₹38" under a price input),
// not for invoice/line-item tax computation (see computeLineTax for that).
export function splitInclusiveGST(amount: number, taxRate: GSTRate): { base: number; tax: number } {
  if (!amount || taxRate <= 0) return { base: toMoney(amount || 0), tax: 0 }
  const base = toMoney(amount / (1 + taxRate / 100))
  const tax = toMoney(amount - base)
  return { base, tax }
}
```

- [ ] **Step 2: Export from `packages/core/src/index.ts`**

Find the existing tax-related export line (e.g. `export * from './tax/gst'`) and add `export * from './tax/splitInclusiveGST'` directly after it.

- [ ] **Step 3: Add the breakdown line under Retail Price and Cost Price in `ProductFormPage.tsx`**

Import `splitInclusiveGST` from `@billscape/core` (add to the existing `import { ProductSchema, type ProductInput, formatINR } from '@billscape/core'` line). In the Pricing & Tax section, under the Retail Price field (~line 599-608):

```tsx
<div className="space-y-1.5">
  <Label htmlFor="price">Retail Price (₹) *</Label>
  <Input
    id="price"
    type="number"
    step="0.01"
    min="0"
    placeholder="0.00"
    {...register('price', { valueAsNumber: true })}
  />
  {errors.price && <p className="text-xs text-red-400">{errors.price.message}</p>}
  {watchedPrice > 0 && watchedTaxRate > 0 && (() => {
    const { base, tax } = splitInclusiveGST(watchedPrice, watchedTaxRate)
    return <p className="text-[11px] text-zinc-500">Base: {formatINR(base)} + GST: {formatINR(tax)}</p>
  })()}
</div>
```

Repeat the identical pattern under Cost Price (~line 609-620), substituting `watchedCostPrice` for `watchedPrice`.

- [ ] **Step 4: Add the same breakdown under Purchase Rate in `PurchaseFormPage.tsx`**

Import `splitInclusiveGST` from `@billscape/core` (add to the existing core import line at the top of the file). Under the "Purchase Rate" input (~line 822-826):

```tsx
<div className="space-y-1">
  <Label className="text-xs">Purchase Rate</Label>
  <Input type="text" inputMode="decimal" value={entry.unit_cost} onFocus={(e) => e.target.select()}
    onChange={(e) => setEntry((p) => ({ ...p, unit_cost: e.target.value.replace(/[^0-9.]/g, '') || '0' }))} className="h-9 text-sm" />
  {parseNum(entry.unit_cost) > 0 && entry.tax_rate > 0 && (() => {
    const { base, tax } = splitInclusiveGST(parseNum(entry.unit_cost), entry.tax_rate)
    return <p className="text-[10px] text-zinc-500">Base: {formatINR(base)} + GST: {formatINR(tax)}</p>
  })()}
</div>
```

(`formatINR` must already be imported in this file — confirm via the existing `formatINR, toMoney, isInterState, ...` import line; it is.)

- [ ] **Step 5: Verify package build**

Run: `pnpm --filter @billscape/core build` then `pnpm --filter @billscape/web build` (or the repo's equivalent full build command) — expected: no TypeScript errors from the new export or its two call sites.

- [ ] **Step 6: Manual verification**

Run `pnpm dev`. On `/products/new`, type Retail Price 250 with GST 18% selected — confirm "Base: ₹211.86 + GST: ₹38.14" (or similarly rounded) appears directly under the field, updating live as either value changes. On `/purchases/new`, type a Purchase Rate with a non-zero GST% selected — confirm the same breakdown appears under that field.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/tax/splitInclusiveGST.ts packages/core/src/index.ts apps/web/src/pages/products/ProductFormPage.tsx apps/web/src/pages/purchases/PurchaseFormPage.tsx
git commit -m "feat: show live Base + GST breakdown under GST-inclusive price inputs"
```

---

### Task 6: QC pass — local login and manual verification of all 4 features

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev` from repo root. Confirm it starts without errors and note the local URL (typically `http://localhost:5173` for Vite).

- [ ] **Step 2: Log in**

Navigate to the local URL, log in with `mdsuhail.designer@gmail.com` / `Test@4321`.

- [ ] **Step 3: Walk through each feature end-to-end**

1. **Payment tracking**: Go to `/purchases`. Confirm KPI cards and Payment Status badges render correctly for existing bills (including any that had old `[PAYMENT: ...]` notes — verify the backfill preserved their paid amounts). Create a new purchase on credit, record two separate partial payments against it via the "Pay" button, confirm Balance Due decreases correctly each time and the status badge transitions pending → partial → paid appropriately.
2. **Variant barcode**: Go to `/products/new`, enable variants, generate a barcode for a variant row, confirm the live barcode image renders and Print opens a working label. Save and reload in edit mode to confirm persistence.
3. **Batch-qty sync**: Go to `/purchases/new`, add a new product with batch tracking enabled, add 2+ batch rows with different quantities, confirm the item row's Qty auto-updates and is disabled with the "Allocated from batches below" caption. Confirm a non-batch row is unaffected.
4. **GST breakdown**: Confirm the "Base: ₹X + GST: ₹Y" line appears and updates live on Product form's Retail Price/Cost Price and on Purchase form's Purchase Rate.

- [ ] **Step 4: Check for regressions in adjacent flows**

Complete one full purchase save (with a mix of an existing product and a new batch-tracked product) end to end and confirm it saves successfully, stock increments correctly (check `/inventory`), and the purchase detail/view page renders without errors.

- [ ] **Step 5: Report findings**

Summarize pass/fail for each of the 4 features plus the regression check. Do NOT push or merge this branch — it stays local per user instruction; report completion back to the user for their own review.
