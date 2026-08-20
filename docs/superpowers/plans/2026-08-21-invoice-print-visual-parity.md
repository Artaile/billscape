# Invoice Print Visual Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the real printed Sale invoice (`InvoicePrint.tsx`, used by both `SaleViewPage.tsx` and `POSTab.tsx`) visually identical in styling to Settings → Print & Layout's "Test Print" reference (`LivePrintBillPreview` inside `SettingsPage.tsx`) — same spacing, same border style (dashed section dividers vs. solid table rules), same color family (zinc, not gray), same relative em-based font scaling, same card/no-card treatment per section — while keeping every real-data wire-up already built (the `print_show_*` toggle parity work from the previous plan). Border thickness and QR code size are explicitly OUT of scope for this plan — the user wants those addressed in a follow-up only after testing the current Test Print design on a real thermal printer.

**Architecture:** `LivePrintBillPreview` (`SettingsPage.tsx:572-1124`) is treated as the frozen visual reference — it is not touched by this plan (the user does not want its look changed). `InvoicePrint.tsx` (`apps/web/src/components/billing/InvoicePrint.tsx`) is restyled section-by-section to use the exact same Tailwind classes, spacing, colors, and border treatment as the reference, while its existing conditional-rendering logic (every `print_show_*` flag, computed from `branding`, wired in the previous plan) stays as the single source of truth for *what* renders — this plan only changes *how* it looks. No new shared component is extracted in this pass (that would be a larger, riskier refactor touching the Settings page's mock-data preview, which the user does not want touched); instead this is a disciplined, section-by-section class/structure port from one file to the other.

**Tech Stack:** React + TypeScript, Tailwind CSS, existing `InvoicePrint.tsx`/`SettingsPage.tsx` components — no new dependencies, no DB changes.

**Spec:** This plan's spec is the reference component itself: `apps/web/src/pages/settings/SettingsPage.tsx:839-1124` (`LivePrintBillPreview`'s JSX return). Every section of `InvoicePrint.tsx` is ported against its corresponding section there. A full side-by-side structural audit was already performed (see plan authoring notes below) — this plan encodes that audit's findings directly into per-task instructions so no task requires re-deriving the diff.

## Global Constraints

- **Do NOT change border thickness or QR code size in this pass.** The reference (`LivePrintBillPreview`) already uses 1px (bare `border`/`border-b`/`border-t`) borders throughout except two already-existing 2px exceptions in `InvoicePrint.tsx` (header bottom rule, Net Payable top rule) — leave those two exactly as they are (do not thin them to match the reference's un-weighted equivalents, and do not thicken anything else). QR size in `InvoicePrint.tsx` (`width: isThermal ? 100 : 120`, display `h-20 w-20`) stays exactly as-is — do not touch `QRCode.toDataURL` options or the QR `<img>` classes anywhere in this plan.
- **Do NOT touch `SettingsPage.tsx` / `LivePrintBillPreview` at all in this plan.** It is the frozen reference. Read from it, never edit it.
- **Preserve every existing conditional/toggle.** Every `show*` boolean already computed in `InvoicePrint.tsx` (from the earlier settings-parity plan) must still gate the same content it gates today — this plan changes Tailwind classes and JSX structure/wrapping, not the truthiness conditions themselves, unless a task explicitly says otherwise (e.g. removing a card wrapper is a structural change but the *content inside* must still be gated by the same flag it was before).
- **Preserve all real-data logic.** Do not change any of `computeLineTax`, `formatINR`, `amountInWords`, `formatDateTime`, the per-row tax math, or any prop. This plan only changes className strings, wrapping div structure, and static label text where the reference's label differs from the current one (e.g. "Bill To:" vs reference's "Billed To:" — call out explicitly per task whether label text changes).
- **Color family: switch `gray-*` to `zinc-*` throughout**, matching the reference's palette exactly (`zinc-950`, `zinc-900`, `zinc-800`, `zinc-700`, `zinc-600`, `zinc-500`, `zinc-400`, `zinc-300`, `zinc-200`, `zinc-100`, `zinc-50`) — this is a project-wide design-system token already used elsewhere in BillScape's dark UI (see CLAUDE.md: "zinc-950 background, zinc-800 sidebar"), so this also fixes a latent inconsistency, not just a print-vs-preview mismatch.
- **Font sizing: switch from fixed Tailwind text-size utilities to relative `text-[N em]` classes**, matching the reference's em-based scaling system, and apply the reference's `getBaseFontSize()`/`getFontFamilyStyle()` equivalent logic (already partially present in `InvoicePrint.tsx`'s injected `<style>` block's `font-size`/`font-family` on the root — this plan makes the *children* actually respect it via `em` units, matching how the reference works, rather than most children hardcoding an absolute px/rem size that ignores the root).
- TypeScript must type-check clean (`npx tsc --noEmit -p apps/web/tsconfig.json`) after every task.
- No automated test suite for this component — verification is `tsc --noEmit` plus careful diff reading against the reference source, plus a live visual check in the browser (navigate to a real Sale, open Preview, compare side-by-side against Settings → Print & Layout's Test Print preview for the same paper size).
- Do NOT `git push`. Local commit only — the user will push after reviewing.
- Run a QC subagent review pass (per the user's explicit ask — multi-agent build AND QC) before declaring the plan done.

---

## File Structure

Only one file changes in this plan:

- **Modify:** `apps/web/src/components/billing/InvoicePrint.tsx` — every visual/structural class in the component's JSX return is ported to match `LivePrintBillPreview`'s corresponding section. No props change, no new state, no new toggle logic (all toggle logic already exists from the prior plan) — purely visual/structural.

No new files, no DB/migration changes, no changes to `SettingsPage.tsx`.

---

## Task 1: Root sheet container + font/color foundation

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx:229-249` (the injected `<style>` block and the root `<div id={rootId}>`)

**Interfaces:**
- Consumes: `branding?.print_font_family`, `branding?.print_text_color`, `paperSize`, `isThermal`, `is58mm` (all already computed, unchanged)
- Produces: root container now uses `text-zinc-900` instead of `text-black`/`#000`, and the injected `<style>`'s font-size strategy is retained (it already sets a root em-basis) but every child element in later tasks will be converted to `text-[N em]` so it actually scales off this root value, matching the reference's `getBaseFontSize()` pattern.

Reference for this section (`SettingsPage.tsx:858-873`):
```tsx
<div className="flex justify-center p-3 bg-zinc-950/80 rounded-xl overflow-x-auto">
  <div
    id="live-print-bill-sheet"
    style={{
      ...getFontFamilyStyle(),
      fontSize: getBaseFontSize(),
      lineHeight: 1.4,
    }}
    className={cn(
      'bg-white text-zinc-900 shadow-2xl transition-all duration-300',
      is2Inch
        ? 'w-[260px] p-3'
        : isThermal
          ? 'w-[320px] p-4'
          : 'w-full max-w-[540px] p-6 rounded-sm'
    )}
  >
```

Note: the outer `flex justify-center p-3 bg-zinc-950/80 rounded-xl` wrapper and the fixed pixel widths (`w-[260px]`, `w-[320px]`, `w-full max-w-[540px]`) are Settings-page-only presentation chrome (a dark mat framing a fixed-width preview card on a settings page) — **do not port those** to `InvoicePrint.tsx`, since the real invoice must remain fluid/full-width for actual print output (a fixed px width would break real paper-size print layout). Only port `bg-white text-zinc-900` and the `lineHeight: 1.4` value.

- [ ] **Step 1: Update the root div's className and remove hardcoded black text color**

Find (`InvoicePrint.tsx:249`):
```tsx
      <div id={rootId} className="bg-white text-black p-4 sm:p-6 rounded-lg">
```

Replace with:
```tsx
      <div id={rootId} className="bg-white text-zinc-900 p-4 sm:p-6 rounded-lg">
```

- [ ] **Step 2: Update the injected `<style>` block's color default and line-height to match the reference**

Find (`InvoicePrint.tsx:229-247`):
```tsx
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body :not(#${rootId}):not(#${rootId} *) { display: none !important; }
          #${rootId} { display: block !important; }
        }
        #${rootId} {
          font-family: ${branding?.print_font_family || 'Arial, sans-serif'};
          color: ${branding?.print_text_color || '#000'};
          background: #fff;
          max-width: ${
            is58mm ? '54mm' : isThermal ? '76mm' : paperSize === 'a5' ? '148mm' : '210mm'
          };
          margin: 0 auto;
          padding: ${isThermal ? '2mm' : paperSize === 'a5' ? '5mm' : '10mm'};
          font-size: ${is58mm ? '9px' : isThermal ? '10px' : '11px'};
          line-height: 1.3;
        }
      `}</style>
```

Replace with (only the `color` default and `line-height` change — everything else about paper sizing stays exactly as-is per the Global Constraints "do not change QR/border sizing" and this being purely a color/line-height match, not a layout change):
```tsx
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body :not(#${rootId}):not(#${rootId} *) { display: none !important; }
          #${rootId} { display: block !important; }
        }
        #${rootId} {
          font-family: ${branding?.print_font_family || 'Arial, sans-serif'};
          color: ${branding?.print_text_color || '#18181b'};
          background: #fff;
          max-width: ${
            is58mm ? '54mm' : isThermal ? '76mm' : paperSize === 'a5' ? '148mm' : '210mm'
          };
          margin: 0 auto;
          padding: ${isThermal ? '2mm' : paperSize === 'a5' ? '5mm' : '10mm'};
          font-size: ${is58mm ? '9px' : isThermal ? '10px' : '11px'};
          line-height: 1.4;
        }
      `}</style>
```

(`#18181b` is Tailwind's `zinc-900` hex value — matches the root div's `text-zinc-900` className from Step 1, so the CSS custom color and the Tailwind class agree; `line-height: 1.4` matches the reference's inline `lineHeight: 1.4` on `SettingsPage.tsx:864`.)

- [ ] **Step 3: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 4: Commit (local only — do not push)**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "style: match invoice print root container color/line-height to Settings preview"
```

---

## Task 2: Business header section — dashed divider, zinc colors, em sizing, uppercase shop name

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx:257-280` (Business Header block)

**Interfaces:**
- Consumes: same props/flags as before (`shopLogoUrl`, `shopName`, `shopAddress`, `shopPhone`, `shopEmail`, `shopGstin`, `shopPan`, `invoiceNo`, `date`, `paymentMode`, all the `show*` header flags from Task 2 of the prior plan) — unchanged
- Produces: header now uses `border-dashed border-zinc-400` divider (was `border-b-2 border-gray-800` — **this is the one exception the Global Constraints call out**: keep this specific rule at its current 2px weight per "do not change border thickness," but do change its color/style from solid-gray to dashed-zinc to match the reference's visual language as closely as possible without altering thickness — use `border-b-2 border-dashed border-zinc-400`), uppercase shop name, em-based text sizing, zinc color family throughout.

Reference for this section (`SettingsPage.tsx:876-919`):
```tsx
<div className={cn('space-y-1 pb-3 border-b border-dashed border-zinc-400', isThermal ? 'text-center' : 'flex items-start justify-between text-left')}>
  <div className={cn('space-y-0.5', isThermal ? 'mx-auto' : '')}>
    {showLogo && logoUrl && (
      <div className={cn('flex items-center', isThermal ? 'justify-center mb-1' : 'justify-start mb-2')}>
        <img src={logoUrl} alt="Logo" className={cn('object-contain', isThermal ? 'h-8' : 'h-10')} />
      </div>
    )}
    {showShopName && shopName && <h4 className="font-bold text-zinc-950 uppercase tracking-tight text-[1.15em]">{shopName}</h4>}
    {showAddress && address && <p className="text-[0.9em] text-zinc-600 leading-tight">{address}</p>}

    <div className="text-[0.9em] text-zinc-600 space-x-1">
      {showContact && phone && <span>Ph: {phone}</span>}
      {showContact && phone && showEmailWebsite && email && <span>|</span>}
      {showEmailWebsite && email && <span>{email}</span>}
    </div>

    <div className="text-[0.9em] font-bold text-zinc-800 space-x-1">
      {showGstin && gstin && <span>GSTIN: {gstin}</span>}
      {showGstin && gstin && showPan && pan && <span>|</span>}
      {showPan && pan && <span>PAN: {pan}</span>}
    </div>
  </div>

  {!isThermal && (
    <div className="text-right text-[0.9em] space-y-0.5 shrink-0">
      <p className="font-bold text-[1.1em] uppercase text-zinc-950">TAX INVOICE</p>
      {showDocumentNumber !== false && <p className="text-zinc-600">Inv: <span className="font-bold">INV-001</span></p>}
      {showDocumentDate !== false && <p className="text-zinc-600">Date: 10/08/2026</p>}
      {showDueDate && <p className="text-zinc-600">Due: 25/08/2026</p>}
      {showPlaceOfSupply && <p className="text-zinc-600">PoS: Tamil Nadu</p>}
      {showDeliveryNote && <p className="text-zinc-600">Del Note: 12345</p>}
      {showPaymentMode && <p className="text-zinc-600">Mode: UPI</p>}
    </div>
  )}
</div>

{isThermal && (showDocumentNumber !== false || showDocumentDate !== false) && (
  <div className="py-1 text-[0.9em] flex justify-between text-zinc-600 border-b border-dashed border-zinc-400 flex-wrap gap-1">
    {showDocumentNumber !== false && <span>Inv: INV-001</span>}
    {showDocumentDate !== false && <span>10/08/2026</span>}
    {showDueDate && <span>Due: 25/08/2026</span>}
    {showPaymentMode && <span>Mode: UPI</span>}
  </div>
)}
```

Note: the reference's `PoS`/`Del Note`/`Due` lines have no real-data backing in `InvoicePrint.tsx` (documented gap from the prior plan — leave as-is, do not add these lines). Also note the reference restructures the doc-info block into a **separate strip below the header** on thermal (its own `<div>` with its own dashed bottom border) rather than nesting inside the header flex container — `InvoicePrint.tsx`'s current thermal handling nests it inside the same header div with just a top border. Port the reference's actual two-block structure (main header div + separate thermal-only doc-info strip) rather than keeping the current single-nested-div approach, since that's a real structural difference the audit flagged.

- [ ] **Step 1: Replace the entire Business Header block**

Find (`InvoicePrint.tsx:257-280`):
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

Replace with:
```tsx
        {/* Business Header */}
        <div className={`space-y-1 pb-3 mb-3 border-b-2 border-dashed border-zinc-400 ${isThermal ? 'text-center' : 'flex items-start justify-between text-left'}`}>
          <div className={`space-y-0.5 ${isThermal ? 'mx-auto' : ''}`}>
            {(shopLogoUrl || branding?.print_show_logo) && (
              <div className={`flex items-center ${isThermal ? 'justify-center mb-1' : 'justify-start mb-2'}`}>
                <img src={shopLogoUrl || branding?.logo_url} alt="Logo" className={`object-contain ${isThermal ? 'h-8' : 'h-10'}`} />
              </div>
            )}
            {showShopName && <h1 className="font-bold text-zinc-950 uppercase tracking-tight text-[1.15em]">{shopName}</h1>}
            {showShopAddress && <p className="text-[0.9em] text-zinc-600 leading-tight">{shopAddress}</p>}
            <div className="text-[0.9em] text-zinc-600 space-x-1">
              {showShopContact && shopPhone && <span>Ph: {shopPhone}</span>}
              {showShopContact && shopPhone && showShopEmailWebsite && shopEmail && <span>|</span>}
              {showShopEmailWebsite && shopEmail && <span>{shopEmail}</span>}
            </div>
            <div className="text-[0.9em] font-bold text-zinc-800 space-x-1">
              {showShopGstin && shopGstin && <span>GSTIN: {shopGstin}</span>}
              {showShopGstin && shopGstin && showShopPan && shopPan && <span>|</span>}
              {showShopPan && shopPan && <span>PAN: {shopPan}</span>}
            </div>
          </div>

          {!isThermal && (
            <div className="text-right text-[0.9em] space-y-0.5 shrink-0">
              <p className="font-bold text-[1.1em] uppercase text-zinc-950">TAX INVOICE</p>
              {showDocumentNumber && <p className="text-zinc-600">Invoice: <span className="font-bold font-mono">{invoiceNo}</span></p>}
              {showDocumentDate && <p className="text-zinc-600">Date: {formatDateTime(date)}</p>}
              {showPaymentModeHeader && <p className="text-zinc-600">Mode: <span className="capitalize">{paymentMode}</span></p>}
            </div>
          )}
        </div>

        {isThermal && (showDocumentNumber || showDocumentDate || showPaymentModeHeader) && (
          <div className="py-1 text-[0.9em] flex justify-between text-zinc-600 border-b border-dashed border-zinc-400 flex-wrap gap-1 mb-3">
            {showDocumentNumber && <span>Invoice: <span className="font-bold font-mono">{invoiceNo}</span></span>}
            {showDocumentDate && <span>{formatDateTime(date)}</span>}
            {showPaymentModeHeader && <span>Mode: <span className="capitalize">{paymentMode}</span></span>}
          </div>
        )}
```

Notes on deliberate choices:
- Kept `border-b-2` (thickness unchanged, per Global Constraints) but changed `border-gray-800` → `border-dashed border-zinc-400` to match the reference's divider *style* as closely as possible while respecting the thickness freeze.
- Kept "TAX INVOICE" heading using the file's own `<h2>` semantic — reference uses a `<p>` for it, but changing heading level is not a visual difference worth introducing a semantic regression for; kept as visually identical `font-bold text-[1.1em] uppercase text-zinc-950` classes, tag choice unchanged (still whatever tag was already appropriate — check current tag; if `InvoicePrint.tsx` already uses `<h2>` here keep `<h2>`, just update its classes to match).
- The non-thermal doc-info block's mb-3 (bottom margin) is now handled by the parent header div's own `pb-3 mb-3`, and the new thermal-only strip carries its own `mb-3` so spacing before the next section (party details / items table) stays consistent in both branches — verify visually in Step 3 below.

- [ ] **Step 2: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 3: Manual visual check**

Start the dev server if not running. Log in, open a Sale's `/billing/sales/:id`, click Preview. Compare the header against Settings → Print & Layout's Test Print preview for the same paper size (A4 and one thermal size at minimum). Confirm: shop name is uppercase, header divider is dashed, spacing before the items table looks consistent (no double-margin gap or missing gap).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "style: port business header section to match Settings preview design"
```

---

## Task 3: Party details ("Bill To") — remove card treatment, dashed divider, zinc colors

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx` (party details block, currently around line 282-291 pre-Task-2-shift — locate by content, search for `showPartyBlock`)

**Interfaces:**
- Consumes: same flags/props as before (`showPartyBlock`, `customerName`, `showCustomerPhoneLine`, `customerPhone`, `showCustomerBillingAddress`, `customerAddress`, `customerGstin`) — unchanged
- Produces: party block no longer wrapped in a bordered/shaded card — becomes a plain inline section with a dashed bottom divider, matching the reference exactly. Label text changes from "Bill To:" to "Billed To:" to match the reference's exact wording.

Reference for this section (`SettingsPage.tsx:922-934`):
```tsx
{showPartyDetails && (
  <div className="py-2 border-b border-dashed border-zinc-400 text-[0.9em]">
    <p className="font-bold text-zinc-800">Billed To:</p>
    <p className="font-medium text-zinc-950">Acme Corporation</p>
    {showCustomerBillingAddress && <p className="text-zinc-600">123 Business St, Chennai</p>}
    {showCustomerShippingAddress && <p className="text-zinc-600">Ship: 456 Warehouse Ave, Chennai</p>}
    <div className="text-zinc-600 space-x-1">
      {showCustomerPhone && <span>Ph: 9876543210</span>}
      {showCustomerPhone && showCustomerPan && <span>|</span>}
      {showCustomerPan && <span>PAN: ABCDE1234F</span>}
    </div>
  </div>
)}
```

- [ ] **Step 1: Replace the party details block**

Find the current block (search for `showPartyBlock &&`):
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

Replace with:
```tsx
        {/* Customer details */}
        {showPartyBlock && (
          <div className="py-2 mb-3 border-b border-dashed border-zinc-400 text-[0.9em]">
            <p className="font-bold text-zinc-800">Billed To:</p>
            {customerName && <p className="font-medium text-zinc-950">{customerName}</p>}
            {showCustomerBillingAddress && <p className="text-zinc-600">{customerAddress}</p>}
            <div className="text-zinc-600 space-x-1">
              {showCustomerPhoneLine && customerPhone && <span>Ph: {customerPhone}</span>}
              {showCustomerPhoneLine && customerPhone && customerGstin && <span>|</span>}
              {customerGstin && <span>GSTIN: {customerGstin}</span>}
            </div>
          </div>
        )}
```

Note: the reference shows phone and PAN (not GSTIN) on the same line separated by `|`. `InvoicePrint.tsx` has no `customerPan` prop (documented gap from the prior plan — no real customer PAN data exists), so this port puts the real `customerGstin` value on that same combined line instead of the reference's non-existent-in-real-data PAN — this is the correct adaptation: same visual *structure* (label + name, address line, combined phone/id line), substituting the one real identifier this codebase actually has (GSTIN) for the reference's mocked PAN slot.

- [ ] **Step 2: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "style: port party details section to match Settings preview design"
```

---

## Task 4: Items table — remove header shading/zebra striping, switch to divide-y row separators, zinc colors, em sizing

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx` (items table block — search for `{/* Items table */}`)

**Interfaces:**
- Consumes: all existing column-toggle flags and per-row computed values (`showSno`, `showColumnItemName`, `showHsn`, `showColumnMrp`, `showColumnQty`, `showColumnUnit`, `showColumnRate`, `showColumnDiscountType`, `showDiscount`, `showTaxRate`, `showColumnTaxableValue`, `showColumnTaxAmount`, `showColumnItemTotal`, and the per-row `displayQty`/`displayUnitSymbol`/`discAmt`/`lineCalc`/`rowTaxable`/`rowTax`/`lineTotal` computations) — **none of this logic changes**, only the JSX className strings and the row-separator mechanism.
- Produces: table header loses `bg-gray-100` shading, becomes a single `border-b border-zinc-950 font-bold` rule (matching reference); body rows lose per-cell `border-b` (moved to a single `divide-y divide-zinc-200` on `<tbody>`, matching the reference's mechanism) and lose zebra striping (`i % 2 === 0 ? '' : 'bg-gray-50/50'` removed entirely — reference has no striping); cell padding changes from `px-1.5 py-1` to `py-1` (reference has no horizontal cell padding, relies on `text-left`/`text-right`/`text-center` alignment only — **verify this doesn't cause columns to visually run together without a horizontal gap; if it looks cramped in the Step 4 visual check, keep a small `px-1` as a pragmatic deviation and note it in the commit message** — the reference's own table also has no gap between adjacent numeric columns like Qty/Rate, so this is intentional in the reference, not an oversight).

Reference for this section (`SettingsPage.tsx:936-985`):
```tsx
<div className="py-2">
  <table className="w-full text-left text-[0.9em]">
    <thead>
      <tr className="border-b border-zinc-950 font-bold">
        {showColumnSno && <th className="py-1 pr-1">#</th>}
        {showColumnItemName !== false && <th className="py-1">Item</th>}
        {showColumnHsn && <th className="py-1">HSN</th>}
        {showColumnMrp && <th className="py-1 text-right">MRP</th>}
        {showColumnQty !== false && <th className="py-1 text-center">Qty</th>}
        {showColumnUnit && <th className="py-1">Unit</th>}
        {showColumnRate !== false && <th className="py-1 text-right">Rate</th>}
        {showColumnDiscount && <th className="py-1 text-right">Disc</th>}
        {showColumnTaxRate && <th className="py-1 text-right">GST%</th>}
        {showColumnTaxableValue && <th className="py-1 text-right">Taxable</th>}
        {showColumnTaxAmount && <th className="py-1 text-right">Tax Amt</th>}
        {showColumnItemTotal !== false && <th className="py-1 text-right">Amount</th>}
      </tr>
    </thead>
    <tbody className="divide-y divide-zinc-200">
      <tr>
        {showColumnSno && <td className="py-1 text-zinc-500">1</td>}
        {showColumnItemName !== false && <td className="py-1 font-medium">Premium Cotton T-Shirt</td>}
        {showColumnHsn && <td className="py-1 text-zinc-600">6109</td>}
        {showColumnMrp && <td className="py-1 text-right text-zinc-600">₹799</td>}
        {showColumnQty !== false && <td className="py-1 text-center font-bold">2</td>}
        {showColumnUnit && <td className="py-1 text-zinc-600">pcs</td>}
        {showColumnRate !== false && <td className="py-1 text-right">₹450</td>}
        {showColumnDiscount && <td className="py-1 text-right text-zinc-600">5%</td>}
        {showColumnTaxRate && <td className="py-1 text-right text-zinc-600">5%</td>}
        {showColumnTaxableValue && <td className="py-1 text-right text-zinc-600">₹855.00</td>}
        {showColumnTaxAmount && <td className="py-1 text-right text-zinc-600">₹42.75</td>}
        {showColumnItemTotal !== false && <td className="py-1 text-right font-bold">₹897.75</td>}
      </tr>
      {/* ...second sample row... */}
    </tbody>
  </table>
</div>
```

Note: reference's Qty column is `text-center font-bold`, not `text-right` — `InvoicePrint.tsx`'s current Qty cell is `text-right`. Port to `text-center` to match. Also note the reference has NO Discount-Type column in its header/body at all (that toggle exists in Settings state but was never added to the preview — a pre-existing gap in the reference itself, documented in the design audit) — **keep `InvoicePrint.tsx`'s `showColumnDiscountType` column** (do not remove it; it has real functioning data and its own toggle, removing it would be a regression, not a parity fix) but style it consistently with the rest of the row (`py-1` cell, `text-zinc-600` for its data cell) since the reference gives no exact class to copy for this one column.

- [ ] **Step 1: Replace the items table block**

Find the current table (search for `{/* Items table */}` through its closing `</table>`):
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
              const sellingSecondary = item.secondary_unit && item.selling_unit_id === item.secondary_unit.id && item.conversion_factor
              const displayQty = sellingSecondary ? item.qty / (item.conversion_factor as number) : item.qty
              const displayUnitSymbol = sellingSecondary ? item.secondary_unit?.symbol : item.unit?.symbol
              const base = item.unit_price * item.qty
              const discAmt = item.discount_type === 'flat'
                ? Math.min(item.discount_amount ?? 0, base)
                : base * (item.discount_pct / 100)
              const lineCalc = computeLineTax(
                item.unit_price,
                item.qty,
                item.discount_pct,
                item.tax_rate,
                totals.is_interstate,
                item.discount_type,
                item.discount_amount,
                taxInclusivePricing,
              )
              const rowTaxable = lineCalc.taxableAmount
              const rowTax = lineCalc.cgst + lineCalc.sgst + lineCalc.igst
              const lineTotal = lineCalc.lineTotal
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
                  {showDiscount && (
                    <td className="px-1.5 py-1 border-b border-gray-200 text-right text-green-700">
                      {item.discount_type === 'flat' ? `-${formatINR(discAmt)}` : `-${item.discount_pct}%`}
                    </td>
                  )}
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

Replace with:
```tsx
        {/* Items table */}
        <div className="py-2">
          <table className="w-full text-left text-[0.9em]">
            <thead>
              <tr className="border-b border-zinc-950 font-bold">
                {showSno && <th className="py-1 pr-1">#</th>}
                {showColumnItemName && <th className="py-1">Item</th>}
                {showHsn && <th className="py-1">HSN</th>}
                {showColumnMrp && <th className="py-1 text-right">MRP</th>}
                {showColumnQty && <th className="py-1 text-center">Qty</th>}
                {showColumnUnit && <th className="py-1">Unit</th>}
                {showColumnRate && <th className="py-1 text-right">Rate</th>}
                {showColumnDiscountType && <th className="py-1">Disc Type</th>}
                {showDiscount && <th className="py-1 text-right">Disc</th>}
                {showTaxRate && <th className="py-1 text-right">GST%</th>}
                {showColumnTaxableValue && <th className="py-1 text-right">Taxable</th>}
                {showColumnTaxAmount && <th className="py-1 text-right">Tax Amt</th>}
                {showColumnItemTotal && <th className="py-1 text-right">Amount</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {items.map((item, i) => {
                const sellingSecondary = item.secondary_unit && item.selling_unit_id === item.secondary_unit.id && item.conversion_factor
                const displayQty = sellingSecondary ? item.qty / (item.conversion_factor as number) : item.qty
                const displayUnitSymbol = sellingSecondary ? item.secondary_unit?.symbol : item.unit?.symbol
                const base = item.unit_price * item.qty
                const discAmt = item.discount_type === 'flat'
                  ? Math.min(item.discount_amount ?? 0, base)
                  : base * (item.discount_pct / 100)
                const lineCalc = computeLineTax(
                  item.unit_price,
                  item.qty,
                  item.discount_pct,
                  item.tax_rate,
                  totals.is_interstate,
                  item.discount_type,
                  item.discount_amount,
                  taxInclusivePricing,
                )
                const rowTaxable = lineCalc.taxableAmount
                const rowTax = lineCalc.cgst + lineCalc.sgst + lineCalc.igst
                const lineTotal = lineCalc.lineTotal
                return (
                  <tr key={item.product_id || i}>
                    {showSno && <td className="py-1 text-zinc-500">{i + 1}</td>}
                    {showColumnItemName && (
                      <td className="py-1 font-medium">
                        {item.product_name}
                      </td>
                    )}
                    {showHsn && <td className="py-1 text-zinc-600">{item.hsn_code ?? '-'}</td>}
                    {showColumnMrp && <td className="py-1 text-right text-zinc-400">—</td>}
                    {showColumnQty && (
                      <td className="py-1 text-center font-bold whitespace-nowrap">
                        {displayQty}
                      </td>
                    )}
                    {showColumnUnit && <td className="py-1 text-zinc-600">{displayUnitSymbol ?? '-'}</td>}
                    {showColumnRate && <td className="py-1 text-right">{formatINR(item.unit_price)}</td>}
                    {showColumnDiscountType && (
                      <td className="py-1 text-zinc-600 capitalize">{item.discount_type ?? '-'}</td>
                    )}
                    {showDiscount && (
                      <td className="py-1 text-right text-zinc-600">
                        {item.discount_type === 'flat' ? `-${formatINR(discAmt)}` : `-${item.discount_pct}%`}
                      </td>
                    )}
                    {showTaxRate && <td className="py-1 text-right text-zinc-600">{item.tax_rate}%</td>}
                    {showColumnTaxableValue && <td className="py-1 text-right text-zinc-600">{formatINR(rowTaxable)}</td>}
                    {showColumnTaxAmount && <td className="py-1 text-right text-zinc-600">{formatINR(rowTax)}</td>}
                    {showColumnItemTotal && <td className="py-1 text-right font-bold">{formatINR(lineTotal)}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
```

Note: reference's item-total cell is `font-bold` (not `font-medium` as the current code had it) — matched to reference. Discount cell text color changed from `text-green-700` to `text-zinc-600` to match the reference's neutral treatment (reference shows discount as plain zinc text, not a colored "savings" callout) — this is a deliberate palette match per the Global Constraints' "switch gray to zinc" instruction extended to this semantic color too, since the reference has no green accent anywhere in the whole document.

- [ ] **Step 2: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 3: Manual visual check**

Compare the rendered table (Preview a real Sale) against Settings' Test Print preview with a multi-item cart. Confirm: no header shading, no zebra striping, thin `divide-y` between rows only, Qty is center-aligned and bold.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "style: port items table to match Settings preview design"
```

---

## Task 5: Tax Summary table — remove full grid borders, zinc colors, em sizing

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx` (tax summary block — search for `showTaxSummaryBlock`)

**Interfaces:**
- Consumes: `showTaxSummaryBlock`, `showCgstSgstIgst`, `totals.tax_breakup`, `totals.is_interstate` — unchanged
- Produces: table loses its full-grid `border` on every `<th>`/`<td>` and its outer box border — becomes an open, rule-only layout matching the reference (`border-t` above the block, `border-b` under the header row only, no per-cell borders, no header background shading).

Reference for this section (`SettingsPage.tsx:988-1020`):
```tsx
{showTaxSummary && (
  <div className="py-1.5 border-t border-zinc-200">
    <p className="font-bold text-[0.85em] mb-1">Tax Summary</p>
    <table className="w-full text-left text-[0.85em] text-zinc-600">
      <thead>
        <tr className="border-b border-zinc-200">
          <th>Tax</th>
          <th className="text-right">Taxable</th>
          {showCgstSgstIgst && <th className="text-right">CGST</th>}
          {showCgstSgstIgst && <th className="text-right">SGST</th>}
          <th className="text-right">Tax Amt</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>GST 5%</td>
          <td className="text-right">₹855.00</td>
          {showCgstSgstIgst && <td className="text-right">₹21.38</td>}
          {showCgstSgstIgst && <td className="text-right">₹21.37</td>}
          <td className="text-right">₹42.75</td>
        </tr>
      </tbody>
    </table>
  </div>
)}
```

Note: reference's header shows plain `CGST`/`SGST` (no IGST branch shown, since the mock data is always intrastate) — `InvoicePrint.tsx`'s real interstate/intrastate branching (`totals.is_interstate ? <IGST col> : <CGST+SGST cols>`) is real logic that must stay; this task only removes the `border`/background classes, not the branching structure itself.

- [ ] **Step 1: Replace the tax summary table's classes**

Find the current block (search for `showTaxSummaryBlock && totals.tax_breakup.length > 0`):
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

Replace with:
```tsx
          {/* Tax breakup */}
          {showTaxSummaryBlock && totals.tax_breakup.length > 0 && (
            <div className="flex-1 py-1.5 border-t border-zinc-200">
              <p className="font-bold text-[0.85em] mb-1">Tax Summary</p>
              <table className="w-full text-left text-[0.85em] text-zinc-600">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th>Rate</th>
                    <th className="text-right">Taxable</th>
                    {showCgstSgstIgst && (
                      totals.is_interstate ? (
                        <th className="text-right">IGST</th>
                      ) : (
                        <>
                          <th className="text-right">CGST</th>
                          <th className="text-right">SGST</th>
                        </>
                      )
                    )}
                    <th className="text-right">Tax Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.tax_breakup.map((line) => (
                    <tr key={line.tax_rate}>
                      <td>{line.tax_rate}%</td>
                      <td className="text-right">{formatINR(line.taxable_amount)}</td>
                      {showCgstSgstIgst && (
                        totals.is_interstate ? (
                          <td className="text-right">{formatINR(line.igst)}</td>
                        ) : (
                          <>
                            <td className="text-right">{formatINR(line.cgst)}</td>
                            <td className="text-right">{formatINR(line.sgst)}</td>
                          </>
                        )
                      )}
                      <td className="text-right">
                        {formatINR(totals.is_interstate ? line.igst : line.cgst + line.sgst)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
```

- [ ] **Step 2: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "style: port tax summary table to match Settings preview design"
```

---

## Task 6: Totals calculation block — flex rows instead of table, zinc colors, em sizing, dashed-free solid rules

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx` (totals card block — search for `showBlockSubtotal`)

**Interfaces:**
- Consumes: all existing totals-block flags and values (`showBlockSubtotal`, `showBlockDiscount`, `showBlockTaxAmount`, `showCgstSgstIgst`, `showBlockGrandTotal`, `showBlockRoundOff`, `totals.*` fields) — unchanged
- Produces: totals card is restructured from a `<table>` to `flex justify-between` rows (matching the reference's mechanism), colors switched to zinc, Grand Total row gets the reference's distinct larger/bolder treatment with its own top divider.

Reference for this section (`SettingsPage.tsx:1022-1066`):
```tsx
<div className="border-t border-zinc-950 pt-1.5 text-right space-y-0.5 text-[0.9em]">
  {showBlockSubtotal !== false && (
    <div className="flex justify-between text-zinc-600">
      <span>Subtotal:</span>
      <span>₹1,854.00</span>
    </div>
  )}
  {showBlockDiscount && (
    <div className="flex justify-between text-zinc-600">
      <span>Discount:</span>
      <span>-₹0.00</span>
    </div>
  )}
  {showBlockTaxAmount !== false && (
    <div className="flex justify-between text-zinc-600">
      <span>Tax (GST):</span>
      <span>₹162.63</span>
    </div>
  )}
  {showBlockRoundOff && (
    <div className="flex justify-between text-zinc-600">
      <span>Round Off:</span>
      <span>₹0.37</span>
    </div>
  )}
  {showBlockGrandTotal !== false && (
    <div className="flex justify-between font-bold text-[1.1em] pt-1 border-t border-zinc-400 text-zinc-950">
      <span>Grand Total:</span>
      <span>₹2,017.00</span>
    </div>
  )}
</div>
```

Note: `InvoicePrint.tsx`'s real totals card has MORE rows than the reference models (Taxable Amount, CGST/SGST/IGST split, Bill Discount, Loyalty Redeemed, and a final "Net Payable" row distinct from Grand Total — none of which the reference's static mock data needed to show). Keep every one of these real rows; only change their *styling* to the reference's `flex justify-between text-zinc-600` row pattern, and apply the reference's Grand-Total emphasis treatment (`font-bold text-[1.1em] pt-1 border-t border-zinc-400 text-zinc-950`) to whichever row is the actual final bolded total in the real component (currently "Net Payable" carries that role, per `InvoicePrint.tsx`'s existing `border-t-2 border-gray-800` on that row — keep Net Payable as the emphasized final row, matching the file's existing intent, and give the earlier "Grand Total" row the reference's plain `flex justify-between` styling like any other regular row, since in the real invoice Grand Total is an intermediate figure, not the final one).

- [ ] **Step 1: Replace the totals calculation card**

Find the current block (search for the `<div className={isThermal ? 'w-full border-t border-gray-300 pt-2' : 'w-56'}>` totals card):
```tsx
          {/* Totals Calculation Card */}
          <div className={isThermal ? 'w-full border-t border-gray-300 pt-2' : 'w-56'}>
            <table className="w-full text-xs">
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
                {showCgstSgstIgst && (
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
            </table>
          </div>
```

Replace with:
```tsx
          {/* Totals Calculation Card */}
          <div className={`border-t border-zinc-950 pt-1.5 space-y-0.5 text-[0.9em] ${isThermal ? 'w-full' : 'w-56'}`}>
            {showBlockSubtotal && (
              <div className="flex justify-between text-zinc-600">
                <span>Subtotal:</span>
                <span>{formatINR(totals.subtotal)}</span>
              </div>
            )}
            {showBlockDiscount && totals.discount_total > 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>Discount:</span>
                <span>-{formatINR(totals.discount_total)}</span>
              </div>
            )}
            {showBlockTaxAmount && (
              <div className="flex justify-between text-zinc-600">
                <span>Taxable Amount:</span>
                <span>{formatINR(totals.taxable_amount)}</span>
              </div>
            )}
            {showCgstSgstIgst && (
              totals.is_interstate ? (
                <div className="flex justify-between text-zinc-600">
                  <span>IGST:</span>
                  <span>{formatINR(totals.igst_total)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-zinc-600">
                    <span>CGST:</span>
                    <span>{formatINR(totals.cgst_total)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>SGST:</span>
                    <span>{formatINR(totals.sgst_total)}</span>
                  </div>
                </>
              )
            )}
            {showBlockGrandTotal && (
              <div className="flex justify-between text-zinc-600">
                <span>Grand Total:</span>
                <span>{formatINR(totals.grand_total)}</span>
              </div>
            )}
            {showBlockDiscount && totals.order_discount_amount > 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>Bill Discount:</span>
                <span>-{formatINR(totals.order_discount_amount)}</span>
              </div>
            )}
            {totals.loyalty_redeem_amount > 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>Loyalty Redeemed:</span>
                <span>-{formatINR(totals.loyalty_redeem_amount)}</span>
              </div>
            )}
            {showBlockRoundOff && typeof totals.round_off_amount === 'number' && totals.round_off_amount !== 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>Round Off:</span>
                <span>{totals.round_off_amount > 0 ? `+${formatINR(totals.round_off_amount)}` : formatINR(totals.round_off_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-[1.1em] pt-1 border-t-2 border-zinc-400 text-zinc-950">
              <span>Net Payable:</span>
              <span>{formatINR(totals.net_payable)}</span>
            </div>
          </div>
```

Note: kept `border-t-2` (not `border-t`) on the Net Payable emphasis rule per Global Constraints (this was one of the two pre-existing 2px exceptions — do not thin it), color changed from `border-gray-800` to `border-zinc-400` to match the reference's Grand-Total-divider color exactly.

- [ ] **Step 2: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "style: port totals calculation card to match Settings preview design"
```

---

## Task 7: Amount in Words, Bank/UPI, Terms, Signatory, Footer — remove card treatments, dashed dividers, zinc colors, em sizing

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx` (everything from "Amount in words" through the final footer note — the rest of the component after the totals block)

**Interfaces:**
- Consumes: `totals.net_payable`, `amountInWords`, `showBankDetails`, `branding.bank_name/bank_account/bank_ifsc/upi_id`, `upiQrDataUrl` (unchanged, per Global Constraints QR size/generation is untouched), `showTerms`, `termsText`, `showSignatory`, `showDigitalSignature`, `signatureUrl`, `showSignatureOutline`, `shopName`, `paymentMode`, `paymentDetail`, `showFooterMsg`, `footerMsg`, `branding.print_thank_you_note` — all unchanged
- Produces: Amount-in-Words box removed entirely (reference has no equivalent section — see note below); Bank+UPI split into two separate elements matching the reference's composition instead of one shared bordered card; Terms loses its top divider; Signatory area gets a dashed signature line and dashed-then-solid divider treatment; footer note loses its top divider.

**Important structural note before starting**: the reference has **no "Amount in Words" section at all**. The design audit confirmed this is real invoice-only content with no reference equivalent. Per the Global Constraints ("preserve every existing conditional... this plan changes classes/structure, not content"), **do not delete this section** — a merchant relies on it for a legally-expected line on a tax invoice. Instead, restyle it to blend into the surrounding flow using the same "no card, just text + divider" language the rest of the reference uses, rather than leaving it as an orphaned bordered box that doesn't match anything.

Reference for the remaining sections (`SettingsPage.tsx:1068-1119`):
```tsx
{/* Footer Details */}
<div className="mt-3 pt-2 border-t border-dashed border-zinc-400 space-y-2">
  {showNotes && notes && (
    <p className="text-[0.85em] text-zinc-600 leading-tight">{notes}</p>
  )}

  {showBankDetails && bankAccount && (
    <div className="text-[0.85em] text-zinc-700 bg-zinc-100 p-1.5 rounded">
      <p className="font-bold">Bank: {bankName || 'HDFC Bank'} | A/C: {bankAccount} | IFSC: {bankIfsc}</p>
    </div>
  )}

  {showUpiQr && (
    <div className="flex items-center gap-3 p-2 bg-zinc-50 border border-zinc-200 rounded justify-center">
      {upiQrUrl ? (
        <img src={upiQrUrl} alt="UPI QR Code" className="h-16 w-16 object-contain rounded border border-zinc-200 shadow-sm" />
      ) : (
        <Smartphone className="h-5 w-5 text-zinc-800" />
      )}
      <div className="text-left space-y-0.5">
        <p className="text-[0.85em] font-bold text-zinc-900 uppercase">Scan & Pay via UPI</p>
        <p className="text-[0.8em] font-mono font-semibold text-zinc-700">{upiId || 'shop@okhdfcbank'}</p>
        <p className="text-[0.75em] text-zinc-500">Google Pay • PhonePe • Paytm</p>
      </div>
    </div>
  )}

  {showTerms && terms && (
    <p className="text-[0.85em] text-zinc-500 italic leading-tight">{terms}</p>
  )}

  {showSignature && (
    <div className="pt-2 flex justify-end">
      <div className="text-center w-28">
        {signatureUrl ? (
          <img src={signatureUrl} alt="Sign" className="h-7 mx-auto object-contain" />
        ) : (
          <div className={cn("h-7 w-full", showSignatureOutline ? "border-b border-dashed border-zinc-300" : "")} />
        )}
        <p className="border-t border-zinc-400 text-[0.75em] font-bold uppercase text-zinc-800 pt-0.5 mt-1">
          Authorized Signatory
        </p>
      </div>
    </div>
  )}

  {thankYouNote && (
    <p className="text-center text-[0.85em] font-semibold text-zinc-700 pt-1">
      {thankYouNote}
    </p>
  )}
</div>
```

Note the reference wraps **everything from Bank details through the final thank-you note in ONE outer container** with a single `mt-3 pt-2 border-t border-dashed border-zinc-400 space-y-2` — i.e. one divider introduces the whole footer zone, not a separate divider per sub-section like `InvoicePrint.tsx` currently has (Terms has its own `border-t`, Signatory row has its own `border-t`, footer note has its own `border-t` — three separate dividers where the reference has one). Port this consolidation: wrap Bank/UPI/Terms/Signatory/Footer-note all inside one outer div with the single dashed top divider, and remove the individual sub-dividers each currently carries. The "Amount in Words" box and the Payment-Mode-line stay OUTSIDE this wrapper (before it), since neither has a reference equivalent to consolidate into — style them independently per the notes below.

- [ ] **Step 1: Restyle the "Amount in Words" box (remove card, blend into flow)**

Find (search for `Amount in Words`):
```tsx
        {/* Amount in words */}
        <div className="border border-gray-300 rounded p-2 mb-3 bg-gray-50 text-xs">
          <span className="font-semibold">Amount in Words: </span>
          <span className="italic">{amountInWords(totals.net_payable)}</span>
        </div>
```

Replace with:
```tsx
        {/* Amount in words */}
        <div className="py-1.5 text-[0.85em] text-zinc-600">
          <span className="font-bold text-zinc-800">Amount in Words: </span>
          <span className="italic">{amountInWords(totals.net_payable)}</span>
        </div>
```

- [ ] **Step 2: Consolidate Bank/UPI/Terms/Signatory/Footer-note into one wrapper with a single dashed divider**

Find the current sequence — Bank/UPI card, Terms block, Signatory+PaymentMode row, and final footer note (search for `{/* Bank Details & UPI QR Code Section */}` through the end of the component's closing `</div>` before `</>`):
```tsx
        {/* Bank Details & UPI QR Code Section */}
        {(showBankDetails || upiQrDataUrl) && (
          <div className="border border-gray-300 rounded p-3 mb-3 bg-gray-50 flex items-center justify-between gap-4">
            {showBankDetails && (
              <div className="text-xs space-y-0.5">
                <p className="font-bold text-gray-800 mb-1">Bank &amp; Payment Details</p>
                {branding?.bank_name && <p><span className="text-gray-500">Bank:</span> <strong>{branding.bank_name}</strong></p>}
                {branding?.bank_account && <p><span className="text-gray-500">A/C No:</span> <strong>{branding.bank_account}</strong></p>}
                {branding?.bank_ifsc && <p><span className="text-gray-500">IFSC:</span> <strong>{branding.bank_ifsc}</strong></p>}
                {branding?.upi_id && <p><span className="text-gray-500">UPI ID:</span> <strong>{branding.upi_id}</strong></p>}
              </div>
            )}
            {upiQrDataUrl && (
              <div className="flex flex-col items-center shrink-0">
                <img src={upiQrDataUrl} alt="Scan & Pay UPI QR" className="h-20 w-20 border border-gray-300 rounded bg-white p-1" />
                <span className="text-[10px] font-semibold text-gray-600 mt-1">Scan &amp; Pay via UPI</span>
              </div>
            )}
          </div>
        )}

        {/* Terms & Conditions */}
        {showTerms && termsText && (
          <div className="text-[10px] text-gray-600 border-t border-gray-200 pt-2 mb-3">
            <p className="font-semibold text-gray-700">Terms &amp; Conditions:</p>
            <p className="whitespace-pre-line mt-0.5">{termsText}</p>
          </div>
        )}

        {/* Signatory & Payment Mode Footer */}
        <div className="flex justify-between items-end border-t border-gray-300 pt-3">
          <div>
            <p className="text-gray-700 text-xs">
              Payment Mode: <strong className="capitalize">{paymentMode}</strong>
              {paymentDetail && <span className="text-gray-500"> ({paymentDetail})</span>}
            </p>
            <p className="text-gray-400 text-[10px] mt-1">
              Computer generated invoice.
            </p>
          </div>

          {showSignatory && (
            <div className="text-center flex flex-col items-center">
              {showDigitalSignature && signatureUrl ? (
                <img src={signatureUrl} alt="Signature" className="h-10 object-contain mb-1" />
              ) : showSignatureOutline ? (
                <div className="h-8" />
              ) : null}
              <div className="border-t border-gray-400 pt-1 w-32">
                <p className="text-[11px] text-gray-600">Authorised Signatory</p>
              </div>
              <p className="text-xs font-semibold mt-0.5">{shopName}</p>
            </div>
          )}
        </div>

        {/* Footer Notes */}
        <p className="text-center text-[10px] text-gray-500 mt-3 border-t border-gray-200 pt-2">
          {(showFooterMsg && footerMsg) || branding?.print_thank_you_note || 'Thank you for your purchase! Visit us again.'}
        </p>
```

Replace with:
```tsx
        {/* Footer: Bank/UPI, Terms, Signatory, Payment Mode, Thank-you note — one consolidated section, matching Settings preview */}
        <div className="mt-3 pt-2 border-t border-dashed border-zinc-400 space-y-2">
          {showBankDetails && (
            <div className="text-[0.85em] text-zinc-700 bg-zinc-100 p-1.5 rounded">
              <p className="font-bold">
                {branding?.bank_name && <>Bank: {branding.bank_name} </>}
                {branding?.bank_account && <>| A/C: {branding.bank_account} </>}
                {branding?.bank_ifsc && <>| IFSC: {branding.bank_ifsc}</>}
              </p>
            </div>
          )}

          {upiQrDataUrl && (
            <div className="flex items-center gap-3 p-2 bg-zinc-50 border border-zinc-200 rounded justify-center">
              <img src={upiQrDataUrl} alt="Scan & Pay UPI QR" className="h-20 w-20 object-contain rounded border border-zinc-200 shadow-sm" />
              <div className="text-left space-y-0.5">
                <p className="text-[0.85em] font-bold text-zinc-900 uppercase">Scan &amp; Pay via UPI</p>
                {branding?.upi_id && <p className="text-[0.8em] font-mono font-semibold text-zinc-700">{branding.upi_id}</p>}
                <p className="text-[0.75em] text-zinc-500">Google Pay • PhonePe • Paytm</p>
              </div>
            </div>
          )}

          {showTerms && termsText && (
            <p className="text-[0.85em] text-zinc-500 italic leading-tight">{termsText}</p>
          )}

          <p className="text-[0.85em] text-zinc-600">
            Payment Mode: <span className="font-bold capitalize">{paymentMode}</span>
            {paymentDetail && <span className="text-zinc-500"> ({paymentDetail})</span>}
          </p>

          {showSignatory && (
            <div className="pt-2 flex justify-end">
              <div className="text-center w-28">
                {showDigitalSignature && signatureUrl ? (
                  <img src={signatureUrl} alt="Signature" className="h-7 mx-auto object-contain" />
                ) : (
                  <div className={`h-7 w-full ${showSignatureOutline ? 'border-b border-dashed border-zinc-300' : ''}`} />
                )}
                <p className="border-t border-zinc-400 text-[0.75em] font-bold uppercase text-zinc-800 pt-0.5 mt-1">
                  Authorised Signatory
                </p>
                <p className="text-[0.75em] font-semibold text-zinc-700 mt-0.5">{shopName}</p>
              </div>
            </div>
          )}

          <p className="text-center text-[0.85em] font-semibold text-zinc-700 pt-1">
            {(showFooterMsg && footerMsg) || branding?.print_thank_you_note || 'Thank you for your purchase! Visit us again.'}
          </p>
        </div>
```

Notes on deliberate adaptations:
- Bank details line: reference always shows all three fields with a hardcoded `|| 'HDFC Bank'` fallback and unconditional `|` separators (since it's mock data that's always fully populated). Real data is sparse (any of the three fields may be missing) — kept each field's own truthy guard and prefixed each subsequent field with `| ` so the pipe separators only appear between fields that actually render, avoiding a dangling `|` when a field is missing. This is a necessary adaptation, not a deviation — the reference's naive concatenation would produce a broken `| A/C: ... |` string with real sparse data.
- UPI: reference falls back to a `Smartphone` icon when no QR is generated yet; `InvoicePrint.tsx`'s `upiQrDataUrl` is only ever set when `showUpiQr && upiId` (see the `useEffect` at the top of the file), and the whole block is already gated on `upiQrDataUrl` truthiness, so there's no case where this renders without a real QR image — no icon fallback needed, matches existing behavior (was already `img`-only before this task, not introducing a new gap).
- "Computer generated invoice." line (previously present, `text-gray-400 text-[10px] mt-1`) has no reference equivalent and is dropped from this consolidated section per matching the reference's exact content set — this is a deliberate content removal to achieve visual parity, flagged here explicitly since Global Constraints says preserve content by default; this one line is judged acceptable to drop since it's boilerplate with no legal/data significance (unlike Amount in Words, which was kept) and its absence is what "matches the reference" concretely requires for the footer to look identical. If the user objects after reviewing, it can be trivially re-added.
- Shop name under "Authorised Signatory": reference has no shop-name-under-signature line at all — `InvoicePrint.tsx` previously had `<p className="text-xs font-semibold mt-0.5">{shopName}</p>` here. Kept it (per "preserve content") but restyled to `text-[0.75em] font-semibold text-zinc-700 mt-0.5` to blend with the reference's sizing scale, since removing it isn't necessary for visual parity (it sits fully inside the signatory box, doesn't clash with anything the reference shows) and it's meaningful content (whose signature this is) worth keeping regardless of the reference's silence on it.

- [ ] **Step 3: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 4: Manual visual check**

Preview a real Sale with bank details, UPI, terms, and a signature all configured (use a test org with all of Settings → Print & Layout's optional fields filled in). Compare the whole footer zone against Settings' Test Print preview. Confirm: one dashed divider introduces the whole footer (not three separate ones), Bank/UPI/Terms/Signatory/thank-you all read top-to-bottom without extra boxes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "style: consolidate and port footer sections to match Settings preview design"
```

---

## Task 8: Optional header/footer message blocks — zinc colors, em sizing (remaining untouched sections)

**Files:**
- Modify: `apps/web/src/components/billing/InvoicePrint.tsx` (the very first conditional block — "Optional Header Message" — which sits before the Business Header and was not covered by Tasks 1-7)

**Interfaces:**
- Consumes: `showHeaderMsg`, `headerMsg` — unchanged

This is the one remaining section using `gray-*`/fixed-px classes not yet ported. It has no direct reference equivalent (the reference has no separate "header message" slot distinct from the business header itself) — restyle it minimally to at least match the zinc color family and em-sizing convention established by every other task in this plan, for internal consistency within the file (not because a reference section demands a specific new structure here).

- [ ] **Step 1: Restyle the optional header message block**

Find (`InvoicePrint.tsx`, near the top of the root div's children, search for `showHeaderMsg`):
```tsx
        {/* Optional Header Message */}
        {showHeaderMsg && (
          <div className="text-center pb-2 mb-2 border-b border-gray-200 text-xs italic text-gray-700">
            {headerMsg}
          </div>
        )}
```

Replace with:
```tsx
        {/* Optional Header Message */}
        {showHeaderMsg && (
          <div className="text-center pb-2 mb-2 border-b border-dashed border-zinc-300 text-[0.85em] italic text-zinc-700">
            {headerMsg}
          </div>
        )}
```

- [ ] **Step 2: Type-check**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "style: port optional header message block color/sizing for consistency"
```

---

## Task 9: Full-file residual scan — confirm no `gray-*`/fixed-px class was missed

**Files:** Read-only check: `apps/web/src/components/billing/InvoicePrint.tsx` (post Tasks 1-8)

- [ ] **Step 1: Grep for any remaining `gray-` usage**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && grep -n "gray-" apps/web/src/components/billing/InvoicePrint.tsx`

Expected: no matches (every `gray-*` class should have been converted to the corresponding `zinc-*` class across Tasks 1-8). If any remain, convert them following the same `gray-N → zinc-N` mapping used throughout this plan (e.g. `gray-200`→`zinc-200`, `gray-300`→`zinc-300`, `gray-400`→`zinc-400`, `gray-600`→`zinc-600`, `gray-700`→`zinc-700`, `gray-800`→`zinc-800`, `gray-900`→`zinc-900`, `gray-950`→`zinc-950`).

- [ ] **Step 2: Grep for stray `green-` accent classes**

Run: `grep -n "green-" apps/web/src/components/billing/InvoicePrint.tsx`

Expected: no matches (Task 4 removed the one `text-green-700` discount-color usage; the reference has no green accents anywhere). If any remain, convert to `text-zinc-600` matching the file's now-neutral palette.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 4: Fix any stragglers found and commit**

```bash
git add apps/web/src/components/billing/InvoicePrint.tsx
git commit -m "style: fix residual gray/green classes found in parity audit"
```

(Skip this commit if Steps 1-2 found nothing to fix.)

---

## Task 10: Multi-agent QC review pass (required — user explicitly asked for it)

**Files:** none (review only)

- [ ] **Step 1: Dispatch an independent QC subagent**

Give it: the full diff (`git diff <plan-start-sha> HEAD -- apps/web/src/components/billing/InvoicePrint.tsx`), this plan document, and the reference source (`apps/web/src/pages/settings/SettingsPage.tsx:839-1124`). Instruct it to:
- Verify every section's classes now match the reference's corresponding section exactly (color family, border style, spacing, font-sizing convention) — go section by section against this plan's own "Reference for this section" blocks.
- Verify the two explicitly-preserved 2px border exceptions (header divider, Net Payable divider) were NOT thinned to 1px anywhere.
- Verify QR generation code (`QRCode.toDataURL` call, `h-20 w-20` display classes) was NOT touched anywhere in the diff — this was explicitly out of scope.
- Verify every `print_show_*` conditional/toggle still gates the same content it gated before this plan — i.e. confirm this was a pure visual/structural port, not a functional regression, by diffing the *condition expressions* (not just the JSX around them) against the pre-plan version.
- Actually load a real Sale in the browser (dev server + chrome devtools tools) and visually compare its Preview against Settings → Print & Layout's Test Print preview for at least two paper sizes (A4 and one thermal size), reporting concretely what still looks different, if anything.
- Report findings; do not rubber-stamp.

- [ ] **Step 2: Address any findings**

Fix and re-commit per finding, following this plan's existing per-section patterns and Global Constraints.

- [ ] **Step 3: Final verification**

Run: `cd "/Users/admin/Documents/Aile creation/Aile Dev/Billing/billscape" && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no output

- [ ] **Step 4: Stop — do not push**

Report to the user that local commits are ready for their review and real-thermal-printer test. Push is intentionally withheld until they explicitly ask for it (they've stated they'll test-print first, then report back on thin-lines/QR-scan issues for a follow-up plan).
