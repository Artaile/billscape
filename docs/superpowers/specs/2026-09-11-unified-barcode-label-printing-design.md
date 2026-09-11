# Unified barcode label printing, driven entirely by Settings → Barcode

Date: 2026-09-11

## Problem

BillScape has three independent barcode-print code paths that don't agree
with each other or with the org's actual Settings → Barcode configuration:

1. **`printBarcodeLabel.ts`** — a one-shot `window.open()` popup with 4
   template layouts (`standard`, `saravana_stores`, `circular_bottle`,
   `compact_jewelry`), QR/CODE128/EAN13/CODE39 support, and show/hide
   toggles for shop name/SKU/code value/MRP/SP/strikethrough. Used from:
   - `PurchaseFormPage.tsx`'s post-save "Print Barcode Labels" button
     (`handlePrintNewProductLabels`, line ~945) — loops over
     `savedPurchase.newProducts` (the raw `PurchaseRow[]` the form just
     saved) and calls `printBarcodeLabel(r.product_name, r.barcode_value,
     r.price)` **per row**, using only the row's own (parent-level)
     barcode/price. For a `has_variants` row, `r.barcode_value` is always
     blank (per Purchase Entry's established convention — real barcodes
     live on `r.variants[]`), so a variant purchase's post-save print
     button silently prints nothing useful for that row. This is the bug
     in the user's screenshot: "Purchase Saved" → "1 new product created:
     Polo Tshirt" → clicking "Print Barcode Labels" shows only the (blank
     for a variant product) parent barcode, never the variants.
   - `PurchaseViewPage.tsx` (2 call sites) and `ProductFormPage.tsx`
     (2 call sites) — of these 4, only `ProductFormPage.tsx`'s SECOND call
     site (line 1318) actually passes the full Settings config
     (`barcodeType`, `labelSize`, `templateStyle`, `shopName`, `shopAddress`,
     show/hide `options`). Its FIRST call site (line 343,
     `handlePrintLabel`) passes template/size/shop but omits the show/hide
     `options`. The 3 remaining call sites pass none of it at all,
     defaulting silently to `templateStyle: 'standard'` and every toggle on.
2. **`BarcodeLabelDialog.tsx`** — the multi-item checkbox-picker dialog
   built for variant support (Products list, Product Details, Inventory).
   It has its own **local, per-print** "Show Product Name" / "Show Price"
   toggles, ignores Settings → Barcode entirely, only ever renders one
   generic rectangular layout (never the 4 template styles), and is
   CODE128-only (no QR/EAN13/CODE39).
3. **Settings → Barcode's own `LiveBarcodePreview`** — the reference
   implementation of what the 4 templates should look like with the
   current toggles, used only for the in-Settings preview and disconnected
   from both of the above.

Net effect: what a merchant configures in Settings → Barcode is honored in
at most one of five real print call sites, and never for a variant
product's post-purchase print flow — the exact case in the screenshot.

## Explicit requirement (non-negotiable per user)

**Whatever the merchant has configured in Settings → Barcode must be
reflected identically everywhere a barcode label is printed, with no
per-print override.** The print dialog itself must not offer its own
independent Show Name/Show Price toggles — those decisions live in
Settings only.

## Design

### 1. `OrgBranding` gets its real barcode fields

`packages/core/src/types/index.ts`'s `OrgBranding` interface currently
declares only `barcode_type`, `barcode_label_size`,
`auto_print_barcode_on_purchase`. Every other barcode field
(`barcode_template_style`, `barcode_show_shop_name`, `barcode_show_sku`,
`barcode_show_code_value`, `barcode_show_mrp`, `barcode_show_sp`,
`barcode_strikethrough_mrp`) is read and written today only via `as any`
casts in `SettingsPage.tsx`. Add all 7 to the real interface, typed
properly (`barcode_template_style?: 'standard' | 'saravana_stores' |
'circular_bottle' | 'compact_jewelry'`, the rest `boolean`), and remove the
`as any` casts at every read/write site this touches.

### 2. `BarcodeLabelDialog` becomes the one print surface, fully Settings-driven

- **Remove** the dialog's own `showName`/`showPrice` state and the two
  toggle switches from its JSX entirely.
- The dialog reads `org?.branding` via `useAuth()` directly (same source
  `SettingsPage.tsx` and `LiveBarcodePreview` already use) and derives, on
  every render, the same 7+ values Settings exposes:
  `templateStyle`, `barcodeType` (`code128`/`ean13`/`code39`/`qr`),
  `labelSize`, `showShopName`, `showSku`, `showCodeValue`, `showMrp`,
  `showSp`, `strikethroughMrp` — all with the exact same defaults
  `SettingsPage.tsx` uses (`'standard'`, `'code128'`, `'5x3cm'`, all
  booleans default `true`).
- **Port the 4 template layouts** from `printBarcodeLabel.ts`'s `bodyHtml`
  branch (`compact_jewelry`, `saravana_stores`, `circular_bottle`,
  standard) into `BarcodeLabelDialog`'s print-HTML generator
  (`buildLabelHtml`) and into its live on-screen preview, so both render
  the SAME layout logic Settings' own preview shows — not a redesign, a
  port of the existing markup/CSS, adapted to loop over N checked
  `LabelItem`s instead of one hardcoded example. Each per-item render
  respects `showShopName`/`showSku`/`showCodeValue`/`showMrp`/`showSp`/
  `strikethroughMrp` exactly as `LiveBarcodePreview` does today (MRP
  struck through when `strikethroughMrp` is on and an MRP is present and
  differs from SP; SKU line uses the item's own SKU, not the barcode
  value).
- **Add QR support**: when `barcodeType === 'qr'`, render a QR code (via
  the same `qrcode` library already used by `SettingsPage.tsx` and
  `InvoicePrint.tsx`) instead of a JsBarcode SVG, in both the preview and
  the generated print HTML. EAN13/CODE39 already work through JsBarcode's
  `format` option — just thread `barcodeType` into the existing
  `JsBarcode(..., { format })` calls instead of hardcoding `'CODE128'`.
- **`LabelItem` gains two fields**: `mrp?: number | null` and
  `sku?: string | null` (the existing `price` field is the selling
  price/SP). Every call site building a `LabelItem` now supplies these
  from whatever product/variant record it already has.
- The dialog's copy-count picker, checkbox multi-select, and "Print N
  variants · M labels" footer logic (built in the prior variant-inventory
  plan) are unchanged — those are print-run mechanics, not visual/
  Settings concerns, and the user has not asked to change them.

### 3. All 5 `printBarcodeLabel` call sites migrate to `BarcodeLabelDialog`

Each site currently calls `printBarcodeLabel(...)` synchronously (it opens
its own popup and returns immediately). Each becomes: build a `LabelItem[]`
from the data already in scope, store it in local state, and render
`<BarcodeLabelDialog open={...} items={...} orgName={org?.name} />` — the
exact pattern already used by `ProductsPage.tsx`/`ProductViewPage.tsx`/
`InventoryPage.tsx` from the prior plan.

- **`PurchaseFormPage.tsx`'s `handlePrintNewProductLabels`** (the
  screenshot's bug): rewritten to build one `LabelItem` per SKU actually
  created by the purchase — for a `has_variants` row, one item per
  `r.variants[]` entry (`variantLabel: v.variant_name`, `barcode_value:
  v.barcode_value`, `price: v.sale_price`, `mrp: v.mrp`, `sku: v.sku`);
  for a non-variant row, one item from the row itself. This is the
  concrete fix for "veriation product barcode kaatala" — every variant a
  purchase just created gets its own checked-by-default row in the dialog.
- **`PurchaseViewPage.tsx`** (2 sites) and **`ProductFormPage.tsx`**
  (2 sites): same swap, single-item or per-line as appropriate to each
  site's existing data shape.
- Once all 5 are migrated and verified, **delete `printBarcodeLabel.ts`**
  and remove its now-unused import from every file that had it.

### 4. Wire up "Auto-Print Barcode on Purchase"

`org_settings.branding.auto_print_barcode_on_purchase` is saved by
Settings but read nowhere else in the codebase today — confirmed by
search, this toggle is currently a dead switch. Wire it into
`PurchaseFormPage.tsx`'s save-success handler: when true, automatically
open `BarcodeLabelDialog` (pre-populated the same way as the manual
button) the moment `savedPurchase` is set, instead of requiring the
merchant to click "Print Barcode Labels" themselves. When false (the
default), behavior is unchanged — the button remains, click-to-open.

## Non-goals

- No new visual template designs — port the 4 existing layouts as-is.
- No change to the checkbox/copies-count/multi-select mechanics already
  built in `BarcodeLabelDialog` for variant printing.
- No per-print override UI of any kind — this is the explicit point of
  the request.
- `printBarcodeLabel.ts` is deleted, not deprecated-but-kept — once no
  caller references it, it has no reason to remain.

## Testing

- `tsc --noEmit` clean after each file's changes.
- Manual QC via chrome-devtools MCP against the live dev server: change
  Settings → Barcode's template style / toggles, then verify the SAME
  choices are reflected in the print dialog opened from (a) Purchase Save
  confirmation for a purchase that creates a variant product, (b) Purchase
  View, (c) Product Form, (d) Products list, (e) Product Details — same
  template, same fields shown/hidden, same MRP strikethrough behavior,
  everywhere. Verify a variant purchase's post-save dialog shows every
  variant's own barcode, not just the parent's.
