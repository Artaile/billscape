# Invoice Print Settings Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every toggle in Settings → Print & Layout actually change what prints on a real Sale invoice — today only ~10 of ~40 saved `branding.print_show_*` fields are read by `InvoicePrint.tsx`; the rest are silently ignored, so what a merchant configures in Settings does not match what customers receive.

**Architecture:** `InvoicePrint.tsx` is the single component used for every real print/PDF/preview of a sale (and is reused, unmodified in structure, by quotations elsewhere). `SettingsPage.tsx`'s "Live Document Preview" is a *second*, independent implementation with mock data (`Acme Corporation`, `INV-001`) built directly inline in `SettingsPage.tsx` — it is not touched by this plan except where noted, because it is a preview surface, not the print path. This plan extends `InvoicePrint.tsx` to read every `OrgBranding.print_show_*` field that has a real, non-fabricated data source available on a completed `Sale`, in the same visual arrangement the Settings preview already establishes (business header → doc-details block → party block → items table → tax summary + totals blocks → bank/UPI → terms → signature/footer). Toggles whose backing data does not exist on a real sale (MRP per line, Received/Balance Due/Change Returned, Delivery Note, Due Date) are wired to render **only when real data is present** — never fabricated placeholder values — per the "never invent data" constraint below.

**Tech Stack:** React + TypeScript, Tailwind, `@billscape/core` (`OrgBranding`, `CartItem`, `InvoiceTotals`, `Sale` types), existing `InvoicePrint.tsx` component.

**Spec:** This plan's spec is this document itself — derived directly from reading `apps/web/src/pages/settings/SettingsPage.tsx` (Live Document Preview, lines ~839–1124, and the corresponding `printShow*` state block, lines ~1258–1315) against `apps/web/src/components/billing/InvoicePrint.tsx` and `packages/core/src/types/index.ts`'s `OrgBranding`/`CartItem`/`InvoiceTotals`/`Sale` interfaces (all fields already exist — no DB migration needed).

## Global Constraints

- Never fabricate data. If a Settings toggle has no real backing field on a completed `Sale`/`CartItem`/`InvoiceTotals` (MRP, Received Amount, Balance Due, Change Returned, Delivery Note, Due Date), the toggle controls visibility of a block that only renders when the underlying real value is actually present — it must never print `0.00`/`INV-001`-style placeholder text like the Settings mock preview does.
- Every new field read from `branding` must default to the exact same default the corresponding `useState` in `SettingsPage.tsx` uses (e.g. `print_show_column_mrp ?? false`, `print_show_due_date ?? true`) — mismatched defaults would make an org that never touched Settings see a different invoice after this change ships.
- `InvoicePrint.tsx` has exactly two real call sites confirmed by `grep -rln "InvoicePrint" apps/web/src --include="*.tsx"`: `SaleViewPage.tsx` (Task 1) and `POSTab.tsx`'s post-checkout print dialog (Task 1b). `HistoryTab.tsx`'s "Reprint" button just navigates to `SaleViewPage.tsx` — it has no separate `InvoicePrint` instance. Both real call sites must receive identical props for identical data (a bill printed right after checkout must look the same as the same bill reprinted later from history) — this is why Task 1b duplicates Task 1's wiring.
- Do not touch `SettingsPage.tsx`'s Live Document Preview visual JSX — it stays as the design reference. Only read from it to confirm field names/ordering; do not import from it.
- Do not `git push`. The user (Tamil-and-English bilingual, non-developer, name not stated — refer to as "the user"/"they") explicitly said they will push after reviewing. Stop at "ready to review" — commit locally is fine if requested later, but no push.
- TypeScript must type-check clean (`npx tsc --noEmit -p apps/web/tsconfig.json`) after every task.
- Run a QC subagent review pass (per user's explicit ask — "QC agent vachu neeye check panu") before declaring the plan done, using the same strict-QC pattern already used earlier in this session (dispatch an independent Agent with full context, do not rubber-stamp).

---

## File Structure

Three files change in this plan:

- **Modify:** `apps/web/src/components/billing/InvoicePrint.tsx` — add `shopPan` to `InvoicePrintProps`; add every missing `print_show_*` flag; the missing header/party fields (due date, place of supply, delivery note, payment mode header line, PAN); the missing column toggles (MRP, item name, qty, unit, rate, discount type, taxable value, tax amount, item total — currently several of these are unconditionally rendered with no toggle at all); the missing totals-block toggles (subtotal, discount, tax amount, round off, grand total — several are currently unconditionally rendered); fix the currently-dead `showFooterMsg` flag and fold `print_show_notes` into it; `print_show_party_details` (whole-block toggle); `print_show_cgst_sgst_igst`; `print_show_email_website`; `print_show_customer_billing_address`/`pan`/`phone` (party sub-toggles).

- **Modify:** `apps/web/src/pages/billing/SaleViewPage.tsx` — thread `customerAddress` (already fetched via `customers(...,address)` in `getSaleWithItems` but never passed into `invoicePrintProps`) and `shopPan` (`org?.pan`, already available wherever `org` is used) so the new toggles have real data to show/hide.

- **Modify:** `apps/web/src/components/billing/POSTab.tsx` — the second real `<InvoicePrint>` call site (post-checkout print). Add `address` to the `CustomerOption` type and its Supabase `.select(...)`, and pass `customerAddress`/`shopPan` the same way `SaleViewPage.tsx` does, so a bill printed immediately after checkout matches one reprinted later from history.

No new files. No DB/migration changes — every field already exists in `OrgBranding`/`Organization` (`packages/core/src/types/index.ts:18-133`, `:190-206`).

---

## Task 1: Thread `customerAddress` and `shopPan` into `SaleViewPage.tsx`

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx:9-32` (add `shopPan` to `InvoicePrintProps`)
- Modify: `apps/web/src/pages/billing/SaleViewPage.tsx:128-146` (`invoicePrintProps` object)

**Interfaces:**
- Consumes: `sale.customers?.address` (already returned by `getSaleWithItems`, `packages/api/src/sales.ts:521` selects `customers(name, phone, gstin, state_code, address)`); `org?.pan` (`Organization.pan`, `packages/core/src/types/index.ts:200` — already fetched as part of the org object everywhere `org` is used, e.g. `org?.gstin`/`org?.phone` right next to it at `SaleViewPage.tsx:133,135`)
- Produces: `invoicePrintProps.customerAddress: string | undefined` (fills the already-declared but never-populated `InvoicePrint.tsx:21` prop, rendered at `InvoicePrint.tsx:179`); `invoicePrintProps.shopPan: string | undefined` (new prop, backs the new `print_show_pan` toggle in Task 2)

- [ ] **Step 1: Add `shopPan` to `InvoicePrintProps`**

In `apps/web/src/components/billing/InvoicePrint.tsx`, find:

```tsx
  shopGstin?: string
  shopLogoUrl?: string
```

Change to:

```tsx
  shopGstin?: string
  shopPan?: string
  shopLogoUrl?: string
```

Also add `shopPan,` to the destructured props list right after `shopGstin,` in the `InvoicePrint` function signature.

- [ ] **Step 2: Thread both fields from `SaleViewPage.tsx`**

In `apps/web/src/pages/billing/SaleViewPage.tsx`, find:

```tsx
    shopGstin: org?.gstin,
    shopLogoUrl: org?.branding?.logo_url,
    shopPhone: org?.phone,
    shopEmail: org?.email,
    customerName: sale.customers?.name,
    customerPhone: sale.customers?.phone ?? undefined,
    customerGstin: sale.customers?.gstin ?? undefined,
```

Change to:

```tsx
    shopGstin: org?.gstin,
    shopPan: org?.pan,
    shopLogoUrl: org?.branding?.logo_url,
    shopPhone: org?.phone,
    shopEmail: org?.email,
    customerName: sale.customers?.name,
    customerPhone: sale.customers?.phone ?? undefined,
    customerGstin: sale.customers?.gstin ?? undefined,
    customerAddress: sale.customers?.address ?? undefined,
```

- [ ] **Step 3: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output (clean)

- [ ] **Step 4: Commit (local only — do not push)**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx apps/web/src/pages/billing/SaleViewPage.tsx
git commit -m "fix: pass customer address and shop PAN into printed sale invoice"
```

---

## Task 1b: Thread the same fields into `POSTab.tsx`'s post-checkout print

`POSTab.tsx` renders a second, independent `<InvoicePrint>` call site for the "print right after this sale completes" flow (`POSTab.tsx:1318-1336`) — it has the exact same `customerAddress`/`shopPan` gap as `SaleViewPage.tsx` had before Task 1, plus its customer-search query doesn't even fetch `address` yet.

**Files:**
- Modify: `apps/web/src/components/billing/POSTab.tsx:56-62` (`CustomerOption` interface), `:279-280` (customer search query `.select(...)`), `:1318-1336` (`<InvoicePrint>` call site)

**Interfaces:**
- Consumes: `selectedCustomer.address` (new field on `CustomerOption`, populated by the customer-search query); `org?.pan`
- Produces: `<InvoicePrint customerAddress=... shopPan=...>` matching Task 1's `SaleViewPage.tsx` wiring, so a bill printed immediately after checkout shows the same fields as one reprinted later from Sales History

- [ ] **Step 1: Add `address` to `CustomerOption`**

Find (`POSTab.tsx:56-62`):

```tsx
interface CustomerOption {
  id: string
  name: string
  phone?: string | null
  gstin?: string | null
  state_code?: string | null
}
```

Change to:

```tsx
interface CustomerOption {
  id: string
  name: string
  phone?: string | null
  gstin?: string | null
  state_code?: string | null
  address?: string | null
}
```

- [ ] **Step 2: Fetch `address` in the customer search query**

Find (`POSTab.tsx:279-280`):

```tsx
        .from('customers')
        .select('id, name, phone, gstin')
```

Change to:

```tsx
        .from('customers')
        .select('id, name, phone, gstin, address')
```

- [ ] **Step 3: Pass the new props into `<InvoicePrint>`**

Find (`POSTab.tsx:1318-1336`):

```tsx
              <InvoicePrint
                invoiceNo={completedSale.invoiceNo}
                date={new Date().toISOString()}
                shopName={org?.name ?? 'BillScape Shop'}
                shopAddress={org?.address}
                shopGstin={org?.gstin}
                shopLogoUrl={org?.branding?.logo_url}
                shopPhone={org?.phone}
                shopEmail={org?.email}
                customerName={selectedCustomer?.name}
                customerPhone={selectedCustomer?.phone ?? undefined}
                customerGstin={selectedCustomer?.gstin ?? undefined}
                items={completedSale.items}
                totals={completedSale.totals}
                paymentMode={completedSale.paymentMode}
                paymentDetail={completedSale.paymentDetail}
                branding={org?.branding}
                invoiceTemplate={(org as any)?.invoice_template}
              />
```

Change to:

```tsx
              <InvoicePrint
                invoiceNo={completedSale.invoiceNo}
                date={new Date().toISOString()}
                shopName={org?.name ?? 'BillScape Shop'}
                shopAddress={org?.address}
                shopGstin={org?.gstin}
                shopPan={org?.pan}
                shopLogoUrl={org?.branding?.logo_url}
                shopPhone={org?.phone}
                shopEmail={org?.email}
                customerName={selectedCustomer?.name}
                customerPhone={selectedCustomer?.phone ?? undefined}
                customerGstin={selectedCustomer?.gstin ?? undefined}
                customerAddress={selectedCustomer?.address ?? undefined}
                items={completedSale.items}
                totals={completedSale.totals}
                paymentMode={completedSale.paymentMode}
                paymentDetail={completedSale.paymentDetail}
                branding={org?.branding}
                invoiceTemplate={(org as any)?.invoice_template}
              />
```

- [ ] **Step 4: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/billing/POSTab.tsx
git commit -m "fix: pass customer address and shop PAN into POS post-checkout print"
```

---

## Task 2: Business header — wire remaining header toggles

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx:86-108` (visibility-flag block), `:150-171` (business header JSX)

**Interfaces:**
- Consumes: `branding.print_show_shop_name`, `print_show_address`, `print_show_contact`, `print_show_gstin`, `print_show_pan`, `print_show_email_website`, `print_show_document_number`, `print_show_document_date`, `print_show_due_date`, `print_show_place_of_supply`, `print_show_delivery_note`, `print_show_payment_mode` (all `OrgBranding` fields, `packages/core/src/types/index.ts:60-89`); `shopPan` (new prop from Task 1)
- Produces: business header block now fully toggle-driven, matching Settings preview's field set (`SettingsPage.tsx:876-919`)

Settings preview shows, in the right-hand doc-details column (non-thermal) or inline row (thermal): TAX INVOICE label (always on, not toggled in Settings — leave as-is), Inv number, Date, Due Date, Place of Supply, Delivery Note, Payment Mode. Real `Sale` has no due date, delivery note, or place-of-supply field — these three toggles must only render when real data exists. A completed cash sale genuinely has no due date or delivery note, so those two never render on a Sale invoice (their toggle exists for future document types — quotations/purchases — reusing this same component later; do not add fake data to satisfy them here). Place of Supply *does* have a real derivation: GST convention is that for an intra-state sale (not `totals.is_interstate`) the place of supply is the seller's own state; for inter-state it's the buyer's state if known. `Sale`/`InvoicePrintProps` do not currently carry state codes, so also skip rendering real content for Place of Supply in this pass — render the toggle's block only if a future prop supplies it. Document Number/Date already render unconditionally today; gate them behind their toggles (default `true`, so no visible regression for orgs that never touched Settings).

- [ ] **Step 1: Extend the visibility-flag block**

In `InvoicePrint.tsx`, after line 108 (`const showTaxRate = branding?.print_show_column_tax_rate ?? true`), add:

```tsx
  // Header / Business Info Toggles
  const showShopName = branding?.print_show_shop_name ?? true
  const showShopAddress = (branding?.print_show_address ?? true) && !!shopAddress
  const showShopContact = branding?.print_show_contact ?? true
  const showShopGstin = branding?.print_show_gstin ?? true
  const showShopPan = branding?.print_show_pan ?? true
  const showShopEmailWebsite = branding?.print_show_email_website ?? true

  // Document Details Toggles
  const showDocumentNumber = branding?.print_show_document_number ?? true
  const showDocumentDate = branding?.print_show_document_date ?? true
  const showPaymentModeHeader = branding?.print_show_payment_mode ?? false
```

- [ ] **Step 2: Apply the toggles to the business header JSX**

Replace the business header block (`InvoicePrint.tsx:150-171`):

```tsx
        {/* Business Header */}
        <div className={`flex ${isThermal ? 'flex-col text-center items-center' : 'items-start justify-between'} border-b-2 border-gray-800 pb-3 mb-3 gap-2`}>
          <div className={`flex ${isThermal ? 'flex-col items-center text-center' : 'items-start'} gap-3`}>
            {(shopLogoUrl || branding?.print_show_logo) && (
              <img src={shopLogoUrl || branding?.logo_url} alt="Logo" className={`${isThermal ? 'h-10 w-10 mb-1' : 'h-14 w-14'} object-contain`} />
            )}
            <div>
              <h1 className={`${isThermal ? 'text-base' : 'text-lg'} font-bold text-gray-900`}>{shopName}</h1>
              {shopAddress && <p className="text-xs text-gray-600 mt-0.5">{shopAddress}</p>}
              <div className="flex flex-wrap gap-x-3 text-xs text-gray-600">
                {shopPhone && <span>Ph: {shopPhone}</span>}
                {shopEmail && <span>{shopEmail}</span>}
              </div>
              {shopGstin && <p className="text-xs font-semibold text-gray-700 mt-0.5">GSTIN: {shopGstin}</p>}
            </div>
          </div>
          <div className={`${isThermal ? 'text-center border-t border-gray-200 pt-2 w-full' : 'text-right'}`}>
            <h2 className="text-sm sm:text-base font-bold text-gray-800 tracking-wider">TAX INVOICE</h2>
            <p className="text-gray-700 mt-0.5">Invoice: <strong className="font-mono">{invoiceNo}</strong></p>
            <p className="text-gray-600 text-xs">Date: {formatDateTime(date)}</p>
          </div>
        </div>
```

with:

```tsx
        {/* Business Header */}
        <div className={`flex ${isThermal ? 'flex-col text-center items-center' : 'items-start justify-between'} border-b-2 border-gray-800 pb-3 mb-3 gap-2`}>
          <div className={`flex ${isThermal ? 'flex-col items-center text-center' : 'items-start'} gap-3`}>
            {(shopLogoUrl || branding?.print_show_logo) && (
              <img src={shopLogoUrl || branding?.logo_url} alt="Logo" className={`${isThermal ? 'h-10 w-10 mb-1' : 'h-14 w-14'} object-contain`} />
            )}
            <div>
              {showShopName && <h1 className={`${isThermal ? 'text-base' : 'text-lg'} font-bold text-gray-900`}>{shopName}</h1>}
              {showShopAddress && <p className="text-xs text-gray-600 mt-0.5">{shopAddress}</p>}
              <div className="flex flex-wrap gap-x-3 text-xs text-gray-600">
                {showShopContact && shopPhone && <span>Ph: {shopPhone}</span>}
                {showShopEmailWebsite && shopEmail && <span>{shopEmail}</span>}
              </div>
              {showShopGstin && shopGstin && <p className="text-xs font-semibold text-gray-700 mt-0.5">GSTIN: {shopGstin}</p>}
              {showShopPan && shopPan && <p className="text-xs font-semibold text-gray-700">PAN: {shopPan}</p>}
            </div>
          </div>
          <div className={`${isThermal ? 'text-center border-t border-gray-200 pt-2 w-full' : 'text-right'}`}>
            <h2 className="text-sm sm:text-base font-bold text-gray-800 tracking-wider">TAX INVOICE</h2>
            {showDocumentNumber && <p className="text-gray-700 mt-0.5">Invoice: <strong className="font-mono">{invoiceNo}</strong></p>}
            {showDocumentDate && <p className="text-gray-600 text-xs">Date: {formatDateTime(date)}</p>}
            {showPaymentModeHeader && <p className="text-gray-600 text-xs">Mode: <span className="capitalize">{paymentMode}</span></p>}
          </div>
        </div>
```

- [ ] **Step 3: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 4: Manual visual check**

Run the dev server if not already running (`cd apps/web && pnpm dev`), open a Sale's `/billing/sales/:id`, click Preview. Confirm:
- Shop name/address/contact/GSTIN still show by default (all default `true`).
- Nothing crashes if `shopAddress` is empty.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "feat: wire header/document-detail print toggles into InvoicePrint"
```

---

## Task 3: Party (Bill To) block — whole-block toggle + sub-field toggles

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx:104-108` (flags), `:173-182` (party JSX)

**Interfaces:**
- Consumes: `branding.print_show_party_details` (whole block), `print_show_customer_billing_address`, `print_show_customer_pan` (no `customerPan` prop exists on `InvoicePrintProps` today — skip rendering actual PAN value, keep the toggle inert/no-op since no data source exists, matching the "never fabricate" constraint), `print_show_customer_phone`
- Produces: party block gated by `showPartyDetails`, address gated by `showCustomerBillingAddress`, phone gated by `showCustomerPhone`

Note: Settings preview also has `print_show_customer_shipping_address` — `InvoicePrintProps` has no `customerShippingAddress` field and sales don't carry a separate shipping address distinct from billing. Leave that toggle inert (no data to show) rather than duplicating the billing address under a "Ship:" label with fabricated content.

- [ ] **Step 1: Add party-block flags**

After the flags added in Task 2, add:

```tsx
  // Party (Bill To) Toggles
  const showPartyBlock = (branding?.print_show_party_details ?? true) && !!(customerName || customerPhone || customerGstin || customerAddress)
  const showCustomerBillingAddress = (branding?.print_show_customer_billing_address ?? true) && !!customerAddress
  const showCustomerPhoneLine = branding?.print_show_customer_phone ?? true
```

- [ ] **Step 2: Apply to the party JSX**

Replace (`InvoicePrint.tsx:173-182`):

```tsx
        {/* Customer details */}
        {(customerName || customerPhone || customerGstin || customerAddress) && (
          <div className="border border-gray-300 rounded p-2.5 mb-3 bg-gray-50 text-xs">
            <p className="font-semibold text-gray-700 mb-0.5">Bill To:</p>
            {customerName && <p className="font-medium text-gray-900">{customerName}</p>}
            {customerPhone && <p className="text-gray-600">Phone: {customerPhone}</p>}
            {customerAddress && <p className="text-gray-600">Address: {customerAddress}</p>}
            {customerGstin && <p className="text-gray-700 font-semibold">GSTIN: {customerGstin}</p>}
          </div>
        )}
```

with:

```tsx
        {/* Customer details */}
        {showPartyBlock && (
          <div className="border border-gray-300 rounded p-2.5 mb-3 bg-gray-50 text-xs">
            <p className="font-semibold text-gray-700 mb-0.5">Bill To:</p>
            {customerName && <p className="font-medium text-gray-900">{customerName}</p>}
            {showCustomerPhoneLine && customerPhone && <p className="text-gray-600">Phone: {customerPhone}</p>}
            {showCustomerBillingAddress && <p className="text-gray-600">Address: {customerAddress}</p>}
            {customerGstin && <p className="text-gray-700 font-semibold">GSTIN: {customerGstin}</p>}
          </div>
        )}
```

- [ ] **Step 3: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "feat: wire party-details print toggles into InvoicePrint"
```

---

## Task 4: Items table — full column toggle set

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx:104-108` (flags), `:184-224` (table JSX)

**Interfaces:**
- Consumes: `branding.print_show_column_sno`, `_hsn`, `_mrp`, `_item_name`, `_qty`, `_unit`, `_rate`, `_discount_type`, `_discount`, `_tax_rate`, `_taxable_value`, `_tax_amount`, `_item_total` (all `OrgBranding`, `packages/core/src/types/index.ts:92-104`)
- Produces: every column in the items table individually toggleable, matching Settings preview's table exactly (`SettingsPage.tsx:938-985`)

Data availability per new column:
- **MRP**: no `mrp` field on `CartItem` (checked `packages/core/src/types/index.ts:338-359` — confirmed absent). Render the `<th>`/`<td>` only if `branding.print_show_column_mrp` is on AND leave the cell empty (`—`) rather than fabricating a price, since this plan's constraint forbids inventing data. Do not attempt to join `products.mrp` in this pass — that would require a new query in `SaleViewPage.tsx` and is out of scope; note it as a known gap in the final commit message.
- **Unit**: `CartItem.unit?.symbol` already exists and is already used for the Qty column's suffix (`InvoicePrint.tsx:203-205` `displayUnitSymbol`). Add a **separate** Unit column (Settings preview shows Unit as its own column, not appended to Qty) — reuse the same `displayUnitSymbol` computation per row.
- **Discount Type**: `CartItem.discount_type` exists (`'flat' | 'percent'`-shaped `DiscountType`, per `packages/core/src/types/index.ts:349`) — show it as text next to/instead of the existing hardcoded `%` discount rendering.
- **Taxable Value / Tax Amount per line**: not directly on `CartItem` (tax is computed at the invoice level in `totals.tax_breakup`, not stored per-line in the object passed to `InvoicePrint`). Compute per-row inline the same way the existing rate/qty/discount math already does at `InvoicePrint.tsx:199-205`, using `packages/core/src/tax/gst.ts` conventions already established elsewhere in this codebase — reuse the arithmetic pattern from `SaleViewPage.tsx:82-105` (`lineDiscount`, `grossLine`, `lineTax` = but that's aggregate; for the per-row case use `item.tax_rate` applied to the row's own taxable base: `rowTaxable = lineTotal` (already computed), `rowTax = rowTaxable * (item.tax_rate / 100)` when NOT tax-inclusive). Do not import a new tax util for this — a one-line multiply matches the precision already used elsewhere in this same file (see the discount % arithmetic at `InvoicePrint.tsx:200-202`, which is also a plain inline calculation, not a `packages/core` call).
- **Item Total**: already rendered unconditionally as the last `<td>` — just gate it.
- **S.No, Item Name, Qty, Rate**: already rendered unconditionally — gate each behind its own toggle, defaulting to their Settings default (`true` for all four, matching `SettingsPage.tsx:1284-1287`/`1289`).

- [ ] **Step 1: Add column-toggle flags**

Replace the existing column-toggle block (`InvoicePrint.tsx:104-108`):

```tsx
  // Column Visibility Toggles
  const showSno = branding?.print_show_column_sno ?? true
  const showHsn = (branding?.print_show_column_hsn ?? true) && (branding?.show_hsn_on_invoice ?? true)
  const showDiscount = (branding?.print_show_column_discount ?? true) && totals.discount_total > 0
  const showTaxRate = branding?.print_show_column_tax_rate ?? true
```

with:

```tsx
  // Column Visibility Toggles
  const showSno = branding?.print_show_column_sno ?? true
  const showHsn = (branding?.print_show_column_hsn ?? true) && (branding?.show_hsn_on_invoice ?? true)
  const showColumnMrp = branding?.print_show_column_mrp ?? false
  const showColumnItemName = branding?.print_show_column_item_name ?? true
  const showColumnQty = branding?.print_show_column_qty ?? true
  const showColumnUnit = branding?.print_show_column_unit ?? true
  const showColumnRate = branding?.print_show_column_rate ?? true
  const showColumnDiscountType = branding?.print_show_column_discount_type ?? false
  const showDiscount = (branding?.print_show_column_discount ?? true) && totals.discount_total > 0
  const showTaxRate = branding?.print_show_column_tax_rate ?? true
  const showColumnTaxableValue = branding?.print_show_column_taxable_value ?? false
  const showColumnTaxAmount = branding?.print_show_column_tax_amount ?? false
  const showColumnItemTotal = branding?.print_show_column_item_total ?? true
  const taxInclusivePricing = branding?.tax_inclusive ?? false
```

- [ ] **Step 2: Replace the items table**

Replace the full table block (`InvoicePrint.tsx:184-224`):

```tsx
        {/* Items table */}
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-100 border-y border-gray-300">
              {showSno && <th className="px-1.5 py-1 text-left">#</th>}
              <th className="px-1.5 py-1 text-left">Item</th>
              {showHsn && <th className="px-1.5 py-1 text-left">HSN</th>}
              <th className="px-1.5 py-1 text-right">Qty</th>
              <th className="px-1.5 py-1 text-right">Rate</th>
              {showDiscount && <th className="px-1.5 py-1 text-right">Disc</th>}
              {showTaxRate && <th className="px-1.5 py-1 text-right">Tax%</th>}
              <th className="px-1.5 py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const base = item.unit_price * item.qty
              const discAmt = base * (item.discount_pct / 100)
              const lineTotal = base - discAmt
              const sellingSecondary = item.secondary_unit && item.selling_unit_id === item.secondary_unit.id && item.conversion_factor
              const displayQty = sellingSecondary ? item.qty / (item.conversion_factor as number) : item.qty
              const displayUnitSymbol = sellingSecondary ? item.secondary_unit?.symbol : item.unit?.symbol
              return (
                <tr key={item.product_id || i} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                  {showSno && <td className="px-1.5 py-1 border-b border-gray-200">{i + 1}</td>}
                  <td className="px-1.5 py-1 border-b border-gray-200 font-medium">
                    {item.product_name}
                  </td>
                  {showHsn && <td className="px-1.5 py-1 border-b border-gray-200 text-gray-600">{item.hsn_code ?? '-'}</td>}
                  <td className="px-1.5 py-1 border-b border-gray-200 text-right whitespace-nowrap">
                    {displayQty}{displayUnitSymbol ? ` ${displayUnitSymbol}` : ''}
                  </td>
                  <td className="px-1.5 py-1 border-b border-gray-200 text-right">{formatINR(item.unit_price)}</td>
                  {showDiscount && <td className="px-1.5 py-1 border-b border-gray-200 text-right text-green-700">-{item.discount_pct}%</td>}
                  {showTaxRate && <td className="px-1.5 py-1 border-b border-gray-200 text-right">{item.tax_rate}%</td>}
                  <td className="px-1.5 py-1 border-b border-gray-200 text-right font-medium">{formatINR(lineTotal)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
```

with:

```tsx
        {/* Items table */}
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-100 border-y border-gray-300">
              {showSno && <th className="px-1.5 py-1 text-left">#</th>}
              {showColumnItemName && <th className="px-1.5 py-1 text-left">Item</th>}
              {showHsn && <th className="px-1.5 py-1 text-left">HSN</th>}
              {showColumnMrp && <th className="px-1.5 py-1 text-right">MRP</th>}
              {showColumnQty && <th className="px-1.5 py-1 text-right">Qty</th>}
              {showColumnUnit && <th className="px-1.5 py-1 text-left">Unit</th>}
              {showColumnRate && <th className="px-1.5 py-1 text-right">Rate</th>}
              {showColumnDiscountType && <th className="px-1.5 py-1 text-left">Disc Type</th>}
              {showDiscount && <th className="px-1.5 py-1 text-right">Disc</th>}
              {showTaxRate && <th className="px-1.5 py-1 text-right">Tax%</th>}
              {showColumnTaxableValue && <th className="px-1.5 py-1 text-right">Taxable</th>}
              {showColumnTaxAmount && <th className="px-1.5 py-1 text-right">Tax Amt</th>}
              {showColumnItemTotal && <th className="px-1.5 py-1 text-right">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const base = item.unit_price * item.qty
              const discAmt = base * (item.discount_pct / 100)
              const lineTotal = base - discAmt
              const sellingSecondary = item.secondary_unit && item.selling_unit_id === item.secondary_unit.id && item.conversion_factor
              const displayQty = sellingSecondary ? item.qty / (item.conversion_factor as number) : item.qty
              const displayUnitSymbol = sellingSecondary ? item.secondary_unit?.symbol : item.unit?.symbol
              const rowTaxable = taxInclusivePricing ? lineTotal / (1 + item.tax_rate / 100) : lineTotal
              const rowTax = taxInclusivePricing ? lineTotal - rowTaxable : rowTaxable * (item.tax_rate / 100)
              return (
                <tr key={item.product_id || i} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                  {showSno && <td className="px-1.5 py-1 border-b border-gray-200">{i + 1}</td>}
                  {showColumnItemName && (
                    <td className="px-1.5 py-1 border-b border-gray-200 font-medium">
                      {item.product_name}
                    </td>
                  )}
                  {showHsn && <td className="px-1.5 py-1 border-b border-gray-200 text-gray-600">{item.hsn_code ?? '-'}</td>}
                  {showColumnMrp && <td className="px-1.5 py-1 border-b border-gray-200 text-right text-gray-400">—</td>}
                  {showColumnQty && (
                    <td className="px-1.5 py-1 border-b border-gray-200 text-right whitespace-nowrap">
                      {displayQty}
                    </td>
                  )}
                  {showColumnUnit && <td className="px-1.5 py-1 border-b border-gray-200 text-gray-600">{displayUnitSymbol ?? '-'}</td>}
                  {showColumnRate && <td className="px-1.5 py-1 border-b border-gray-200 text-right">{formatINR(item.unit_price)}</td>}
                  {showColumnDiscountType && (
                    <td className="px-1.5 py-1 border-b border-gray-200 text-gray-600 capitalize">{item.discount_type ?? '-'}</td>
                  )}
                  {showDiscount && <td className="px-1.5 py-1 border-b border-gray-200 text-right text-green-700">-{item.discount_pct}%</td>}
                  {showTaxRate && <td className="px-1.5 py-1 border-b border-gray-200 text-right">{item.tax_rate}%</td>}
                  {showColumnTaxableValue && <td className="px-1.5 py-1 border-b border-gray-200 text-right">{formatINR(rowTaxable)}</td>}
                  {showColumnTaxAmount && <td className="px-1.5 py-1 border-b border-gray-200 text-right">{formatINR(rowTax)}</td>}
                  {showColumnItemTotal && <td className="px-1.5 py-1 border-b border-gray-200 text-right font-medium">{formatINR(lineTotal)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
```

- [ ] **Step 3: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 4: Manual visual check**

Open a Sale's Preview. Confirm the table still shows S.No, Item, Qty, Rate, Disc (if any), Tax%, Amount by default (matching pre-change defaults) — no columns should appear or disappear for an org that never touched Settings, since every new toggle's default matches the pre-existing hardcoded behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "feat: wire full items-table column print toggles into InvoicePrint"
```

---

## Task 5: Tax summary block — `print_show_tax_summary` and `print_show_cgst_sgst_igst`

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx:104-108` area (flags), `:226-265` (tax summary JSX)

**Interfaces:**
- Consumes: `branding.print_show_tax_summary`, `print_show_cgst_sgst_igst`
- Produces: tax summary table gated by `showTaxSummary` (was previously gated only by `!isThermal && totals.tax_breakup.length > 0`, now also respects the explicit toggle); CGST/SGST columns hideable independently via `showCgstSgstIgst` (Settings preview keeps a "Taxable"+"Tax Amt" pair of columns even when CGST/SGST are hidden, per `SettingsPage.tsx:992-1017` — replicate that: the two rate/tax-amt columns stay, only the CGST/SGST breakdown columns are conditional)

- [ ] **Step 1: Add flags**

Add after the flags from Task 4:

```tsx
  const showTaxSummaryBlock = (branding?.print_show_tax_summary ?? true) && !isThermal
  const showCgstSgstIgst = branding?.print_show_cgst_sgst_igst ?? true
```

- [ ] **Step 2: Apply to tax summary JSX**

Replace the opening condition and table head/body (`InvoicePrint.tsx:226-265`), specifically:

```tsx
          {/* Tax breakup */}
          {!isThermal && totals.tax_breakup.length > 0 && (
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-700 mb-1">Tax Summary</p>
              <table className="w-full border-collapse text-xs border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-200 px-2 py-1 text-left">Rate</th>
                    <th className="border border-gray-200 px-2 py-1 text-right">Taxable</th>
                    {totals.is_interstate ? (
                      <th className="border border-gray-200 px-2 py-1 text-right">IGST</th>
                    ) : (
                      <>
                        <th className="border border-gray-200 px-2 py-1 text-right">CGST</th>
                        <th className="border border-gray-200 px-2 py-1 text-right">SGST</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {totals.tax_breakup.map((line) => (
                    <tr key={line.tax_rate}>
                      <td className="border border-gray-200 px-2 py-0.5">{line.tax_rate}%</td>
                      <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.taxable_amount)}</td>
                      {totals.is_interstate ? (
                        <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.igst)}</td>
                      ) : (
                        <>
                          <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.cgst)}</td>
                          <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.sgst)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
```

with:

```tsx
          {/* Tax breakup */}
          {showTaxSummaryBlock && totals.tax_breakup.length > 0 && (
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-700 mb-1">Tax Summary</p>
              <table className="w-full border-collapse text-xs border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-200 px-2 py-1 text-left">Rate</th>
                    <th className="border border-gray-200 px-2 py-1 text-right">Taxable</th>
                    {showCgstSgstIgst && (
                      totals.is_interstate ? (
                        <th className="border border-gray-200 px-2 py-1 text-right">IGST</th>
                      ) : (
                        <>
                          <th className="border border-gray-200 px-2 py-1 text-right">CGST</th>
                          <th className="border border-gray-200 px-2 py-1 text-right">SGST</th>
                        </>
                      )
                    )}
                    <th className="border border-gray-200 px-2 py-1 text-right">Tax Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.tax_breakup.map((line) => (
                    <tr key={line.tax_rate}>
                      <td className="border border-gray-200 px-2 py-0.5">{line.tax_rate}%</td>
                      <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.taxable_amount)}</td>
                      {showCgstSgstIgst && (
                        totals.is_interstate ? (
                          <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.igst)}</td>
                        ) : (
                          <>
                            <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.cgst)}</td>
                            <td className="border border-gray-200 px-2 py-0.5 text-right">{formatINR(line.sgst)}</td>
                          </>
                        )
                      )}
                      <td className="border border-gray-200 px-2 py-0.5 text-right">
                        {formatINR(totals.is_interstate ? line.igst : line.cgst + line.sgst)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
```

Note: added a "Tax Amt" total column to match the Settings preview's table shape (`SettingsPage.tsx:999`, `1008`, `1015`) — the previous version had no combined tax-amount column, only the split CGST/SGST/IGST ones.

- [ ] **Step 3: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "feat: wire tax-summary print toggles into InvoicePrint"
```

---

## Task 6: Totals calculation block — full block toggle set

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx` (flags), `:267-337` (totals card JSX)

**Interfaces:**
- Consumes: `branding.print_show_block_subtotal`, `_discount`, `_tax_amount`, `_rounding`, `_round_off`, `_grand_total`, `_received_amount`, `_balance_due`, `_change_returned`
- Produces: every row in the totals card individually toggleable

Data availability: `print_show_block_received_amount`, `_balance_due`, `_change_returned` have no backing fields on `InvoiceTotals` (checked `packages/core/src/types/index.ts:369-384` — no `received_amount`/`balance_due`/`change_returned`). These three toggles are wired but render nothing when off, and when on with no real value present also render nothing (per the "never fabricate" constraint) — this matches the existing pattern already used for e.g. `totals.order_discount_amount > 0` conditionals elsewhere in this file. `print_show_block_rounding` is distinct from `print_show_block_round_off` in Settings (`SettingsPage.tsx:1300` `printShowBlockRounding` vs `1301`'s sibling area's `printShowBlockRoundOff` at line the flags block — re-check exact names) — `InvoiceTotals` only has one `round_off_amount` field, so both toggles gate the same single row; treat `print_show_block_round_off` as authoritative (matches the field name `InvoiceTotals.round_off_amount` most closely) and leave `print_show_block_rounding` unused (documented as a known duplicate toggle in Settings, not a gap in this component).

- [ ] **Step 1: Add flags**

Add after Task 5's flags:

```tsx
  const showBlockSubtotal = branding?.print_show_block_subtotal ?? true
  const showBlockDiscount = branding?.print_show_block_discount ?? true
  const showBlockTaxAmount = branding?.print_show_block_tax_amount ?? true
  const showBlockRoundOff = branding?.print_show_block_round_off ?? true
  const showBlockGrandTotal = branding?.print_show_block_grand_total ?? true
```

- [ ] **Step 2: Apply to totals card JSX**

Replace the totals `<table><tbody>` rows (`InvoicePrint.tsx:270-334`):

```tsx
              <tbody>
                <tr>
                  <td className="py-0.5 text-gray-600">Subtotal</td>
                  <td className="py-0.5 text-right">{formatINR(totals.subtotal)}</td>
                </tr>
                {totals.discount_total > 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Discount</td>
                    <td className="py-0.5 text-right text-green-700">-{formatINR(totals.discount_total)}</td>
                  </tr>
                )}
                <tr>
                  <td className="py-0.5 text-gray-600">Taxable Amount</td>
                  <td className="py-0.5 text-right">{formatINR(totals.taxable_amount)}</td>
                </tr>
                {totals.is_interstate ? (
                  <tr>
                    <td className="py-0.5 text-gray-600">IGST</td>
                    <td className="py-0.5 text-right">{formatINR(totals.igst_total)}</td>
                  </tr>
                ) : (
                  <>
                    <tr>
                      <td className="py-0.5 text-gray-600">CGST</td>
                      <td className="py-0.5 text-right">{formatINR(totals.cgst_total)}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 text-gray-600">SGST</td>
                      <td className="py-0.5 text-right">{formatINR(totals.sgst_total)}</td>
                    </tr>
                  </>
                )}
                <tr>
                  <td className="py-0.5 font-medium text-gray-800">Grand Total</td>
                  <td className="py-0.5 text-right font-medium text-gray-900">
                    {formatINR(totals.grand_total)}
                  </td>
                </tr>
                {totals.order_discount_amount > 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Bill Discount</td>
                    <td className="py-0.5 text-right text-green-700">-{formatINR(totals.order_discount_amount)}</td>
                  </tr>
                )}
                {totals.loyalty_redeem_amount > 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Loyalty Redeemed</td>
                    <td className="py-0.5 text-right text-green-700">-{formatINR(totals.loyalty_redeem_amount)}</td>
                  </tr>
                )}
                {typeof totals.round_off_amount === 'number' && totals.round_off_amount !== 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Round Off</td>
                    <td className="py-0.5 text-right">
                      {totals.round_off_amount > 0 ? `+${formatINR(totals.round_off_amount)}` : formatINR(totals.round_off_amount)}
                    </td>
                  </tr>
                )}
                <tr className="border-t-2 border-gray-800">
                  <td className="pt-1.5 font-bold text-sm text-gray-900">Net Payable</td>
                  <td className="pt-1.5 text-right font-bold text-sm text-gray-900">
                    {formatINR(totals.net_payable)}
                  </td>
                </tr>
              </tbody>
```

with:

```tsx
              <tbody>
                {showBlockSubtotal && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Subtotal</td>
                    <td className="py-0.5 text-right">{formatINR(totals.subtotal)}</td>
                  </tr>
                )}
                {showBlockDiscount && totals.discount_total > 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Discount</td>
                    <td className="py-0.5 text-right text-green-700">-{formatINR(totals.discount_total)}</td>
                  </tr>
                )}
                {showBlockTaxAmount && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Taxable Amount</td>
                    <td className="py-0.5 text-right">{formatINR(totals.taxable_amount)}</td>
                  </tr>
                )}
                {showBlockTaxAmount && (
                  totals.is_interstate ? (
                    <tr>
                      <td className="py-0.5 text-gray-600">IGST</td>
                      <td className="py-0.5 text-right">{formatINR(totals.igst_total)}</td>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <td className="py-0.5 text-gray-600">CGST</td>
                        <td className="py-0.5 text-right">{formatINR(totals.cgst_total)}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 text-gray-600">SGST</td>
                        <td className="py-0.5 text-right">{formatINR(totals.sgst_total)}</td>
                      </tr>
                    </>
                  )
                )}
                {showBlockGrandTotal && (
                  <tr>
                    <td className="py-0.5 font-medium text-gray-800">Grand Total</td>
                    <td className="py-0.5 text-right font-medium text-gray-900">
                      {formatINR(totals.grand_total)}
                    </td>
                  </tr>
                )}
                {showBlockDiscount && totals.order_discount_amount > 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Bill Discount</td>
                    <td className="py-0.5 text-right text-green-700">-{formatINR(totals.order_discount_amount)}</td>
                  </tr>
                )}
                {totals.loyalty_redeem_amount > 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Loyalty Redeemed</td>
                    <td className="py-0.5 text-right text-green-700">-{formatINR(totals.loyalty_redeem_amount)}</td>
                  </tr>
                )}
                {showBlockRoundOff && typeof totals.round_off_amount === 'number' && totals.round_off_amount !== 0 && (
                  <tr>
                    <td className="py-0.5 text-gray-600">Round Off</td>
                    <td className="py-0.5 text-right">
                      {totals.round_off_amount > 0 ? `+${formatINR(totals.round_off_amount)}` : formatINR(totals.round_off_amount)}
                    </td>
                  </tr>
                )}
                <tr className="border-t-2 border-gray-800">
                  <td className="pt-1.5 font-bold text-sm text-gray-900">Net Payable</td>
                  <td className="pt-1.5 text-right font-bold text-sm text-gray-900">
                    {formatINR(totals.net_payable)}
                  </td>
                </tr>
              </tbody>
```

`Net Payable` stays unconditional — it is the actual amount collected and must always print regardless of settings (matches existing behavior; there is no `print_show_block_net_payable` toggle in Settings, confirming it was always meant to be non-optional).

- [ ] **Step 3: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 4: Manual visual check**

Toggle a few blocks off in Settings → Print & Layout → Totals section for a real test org, then open a real Sale's Preview and confirm the row actually disappears.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "feat: wire totals-block print toggles into InvoicePrint"
```

---

## Task 7: Footer — notes, bank details already-toggled, terms already-toggled — add `print_show_notes`

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx` (flags + footer JSX)

**Interfaces:**
- Consumes: `branding.print_show_notes`
- Produces: a Notes block, gated, rendered only if real note text exists

`InvoicePrintProps` has no `notes` field and `Sale` has no `notes` column (checked Task investigation — confirmed absent). The existing `headerMsg`/`footerMsg` (from `invoiceTemplate.invoice_header`/`invoice_footer`) already cover the free-text-note use case. `showFooterMsg` is currently declared (`InvoicePrint.tsx:90`) but **dead** — confirmed by `grep -n "footerMsg\b" InvoicePrint.tsx`: the only usage site (line 403, the final footer paragraph) reads `footerMsg` directly with its own `||` fallback chain and never checks `showFooterMsg` at all, so today the footer message always renders whenever `footerMsg` is truthy, regardless of any toggle. Fix this properly: gate line 403 on `showFooterMsg`, and fold `print_show_notes` into that flag.

- [ ] **Step 1: Gate `showFooterMsg` on `print_show_notes` and actually wire it into its usage site**

Find (`InvoicePrint.tsx:90-91`):

```tsx
  const showFooterMsg = !!(invoiceTemplate?.invoice_footer || branding?.invoice_footer)
  const footerMsg = invoiceTemplate?.invoice_footer || branding?.invoice_footer
```

Replace with:

```tsx
  const showFooterMsg = (branding?.print_show_notes ?? true) && !!(invoiceTemplate?.invoice_footer || branding?.invoice_footer)
  const footerMsg = invoiceTemplate?.invoice_footer || branding?.invoice_footer
```

- [ ] **Step 2: Gate the footer paragraph on `showFooterMsg`**

Find (`InvoicePrint.tsx:401-404`):

```tsx
        {/* Footer Notes */}
        <p className="text-center text-[10px] text-gray-500 mt-3 border-t border-gray-200 pt-2">
          {footerMsg || branding?.print_thank_you_note || 'Thank you for your purchase! Visit us again.'}
        </p>
```

Replace with:

```tsx
        {/* Footer Notes */}
        <p className="text-center text-[10px] text-gray-500 mt-3 border-t border-gray-200 pt-2">
          {(showFooterMsg && footerMsg) || branding?.print_thank_you_note || 'Thank you for your purchase! Visit us again.'}
        </p>
```

This preserves the existing fallback chain (custom footer message → org's thank-you note → hardcoded default) while making `print_show_notes` actually suppress the custom footer message when turned off, falling through to the thank-you note instead — matching how every other toggle in this file degrades (hide the specific content, not the whole line) rather than leaving a blank footer.

- [ ] **Step 3: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "feat: wire notes print toggle into InvoicePrint"
```

---

## Task 8: Full-file review pass — confirm no unconditionally-rendered field was missed

**Files:**
- Read-only check: `apps/web/src/components/billing/InvoicePrint.tsx` (post Tasks 1-7)

- [ ] **Step 1: Diff against the Settings preview field list**

Run: `grep -oP '(?<=branding\?\.)print_show_\w+' apps/web/src/pages/settings/SettingsPage.tsx | sort -u > /tmp/settings-fields.txt && grep -oP '(?<=branding\?\.)print_show_\w+' apps/web/src/components/billing/InvoicePrint.tsx | sort -u > /tmp/invoiceprint-fields.txt && diff /tmp/settings-fields.txt /tmp/invoiceprint-fields.txt`

Expected: no lines prefixed `<` (fields present in Settings but missing from InvoicePrint). Lines prefixed `>` (extra fields InvoicePrint reads that Settings doesn't) are fine/expected (e.g. `print_show_upi_qr`, `print_show_signature*`, `print_show_bank_details`, `print_show_terms` were already correctly wired before this plan).

- [ ] **Step 2: If any `<` lines remain, wire them**

For each missing field, locate its corresponding JSX section in `SettingsPage.tsx` (search the exact toggle name), determine the nearest matching real data source per the same "never fabricate" rule used throughout this plan, and add the flag + JSX gate following the same pattern as Tasks 2-7.

- [ ] **Step 3: Full type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 4: Commit any fixes from this pass**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "fix: wire any remaining print toggles found in parity audit"
```

---

## Task 9: QC review pass (required — user explicitly asked for it)

**Files:** none (review only)

- [ ] **Step 1: Dispatch an independent QC subagent**

Give it: the full diff (`git diff main -- apps/web/src/components/billing/InvoicePrint.tsx apps/web/src/pages/billing/SaleViewPage.tsx`), this plan document, and explicit instructions to:
- Verify every default matches `SettingsPage.tsx`'s corresponding `useState` default exactly (a mismatch changes existing invoices' appearance for orgs that never touched Settings — that is a regression).
- Verify no fabricated/placeholder data was introduced anywhere (re-check Task 4's MRP column, Task 6's received/balance-due/change-returned).
- Verify the items-table column set still renders correctly for both `isThermal` and non-thermal paper sizes (thermal preview in Settings hides some columns structurally — check `InvoicePrint.tsx` didn't lose that responsiveness).
- Actually load a real Sale in the browser (dev server + chrome devtools tools), toggle several Settings → Print & Layout options for the current test org, and confirm the Sale invoice Preview changes accordingly — not just a code read.
- Report findings; do not rubber-stamp.

- [ ] **Step 2: Address any findings**

Fix and re-commit per finding, following this plan's existing per-field patterns.

- [ ] **Step 3: Final verification**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 4: Stop — do not push**

Report to the user that the branch has local commits ready for their review, and that push is intentionally withheld per their instruction ("naan sonnathuku apram git & live push panlaam, neeya push pannadha").
