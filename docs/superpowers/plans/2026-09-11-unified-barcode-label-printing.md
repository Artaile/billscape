# Unified Barcode Label Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Settings → Barcode's configuration (template style, barcode type, label size, shop-name/SKU/code-value/MRP/SP/strikethrough toggles) the single source of truth for every barcode-label print in the app, with no per-print override, and fix the bug where a variant product's post-purchase print only shows the parent barcode.

**Architecture:** Add the 7 missing barcode fields to `OrgBranding`'s real type. Rewrite `BarcodeLabelDialog` to read `org.branding` directly (removing its own local Show Name/Show Price toggles) and render the 4 existing template layouts + QR/EAN13/CODE39 support, porting the layout logic from `printBarcodeLabel.ts` and `SettingsPage.tsx`'s `LiveBarcodePreview`. Migrate all 5 `printBarcodeLabel()` call sites to open `BarcodeLabelDialog` instead. Wire the dead `auto_print_barcode_on_purchase` toggle. Delete `printBarcodeLabel.ts`.

**Tech Stack:** React + TypeScript + TanStack Query + Supabase, `jsbarcode` (already a dependency), `qrcode` (already a dependency, used by `SettingsPage.tsx` and `InvoicePrint.tsx`), shadcn/ui `Dialog`/`Button`/`Input`/`Label`.

**Spec:** `docs/superpowers/specs/2026-09-11-unified-barcode-label-printing-design.md`

## Global Constraints

- **No per-print override UI** — `BarcodeLabelDialog` must not offer its own Show Name/Show Price (or any other) toggle; every visual choice comes from `org.branding` only. This is explicit, non-negotiable user direction.
- Whatever Settings → Barcode currently shows in its own `LiveBarcodePreview` (in `SettingsPage.tsx`) is the reference for what the dialog's preview and printed output must visually match — port that logic, don't redesign it.
- `OrgBranding` defaults (when a field is unset) must stay identical to what `SettingsPage.tsx` already defaults to: `barcode_type: 'code128'`, `barcode_label_size: '5x3cm'`, `barcode_template_style: 'standard'`, every `barcode_show_*` boolean `true`, `barcode_strikethrough_mrp: true`.
- `ProductFormPage.tsx`'s inline live-preview-while-typing (Templates 1-4, lines ~1173-1310) is OUT OF SCOPE — it is a pre-save preview, not a print action, and already reads `org.branding` correctly. Do not touch it except at its two `printBarcodeLabel(...)` **print button** call sites.
- `tsc --noEmit -p .` (via `pnpm --filter web exec tsc --noEmit -p .`) must be clean after every task.
- Do not add a DB migration — all 7 barcode fields already exist as live `org_settings.branding` JSON keys (written today via `as any` casts); this plan only fixes their TypeScript typing, not their storage.

---

### Task 1: Add real barcode fields to `OrgBranding`

**Files:**
- Modify: `packages/core/src/types/index.ts`

**Interfaces:**
- Produces: `OrgBranding` gains `barcode_template_style?: 'standard' | 'saravana_stores' | 'circular_bottle' | 'compact_jewelry'`, `barcode_show_shop_name?: boolean`, `barcode_show_sku?: boolean`, `barcode_show_code_value?: boolean`, `barcode_show_mrp?: boolean`, `barcode_show_sp?: boolean`, `barcode_strikethrough_mrp?: boolean`. These are consumed by Task 2 (BarcodeLabelDialog) without `as any` casts.

- [ ] **Step 1: Locate and extend the interface**

In `packages/core/src/types/index.ts`, find the existing block (around line 42):
```ts
  barcode_type?: string
  barcode_label_size?: string
  auto_print_barcode_on_purchase?: boolean
```
Replace with:
```ts
  barcode_type?: string
  barcode_label_size?: string
  barcode_template_style?: 'standard' | 'saravana_stores' | 'circular_bottle' | 'compact_jewelry'
  barcode_show_shop_name?: boolean
  barcode_show_sku?: boolean
  barcode_show_code_value?: boolean
  barcode_show_mrp?: boolean
  barcode_show_sp?: boolean
  barcode_strikethrough_mrp?: boolean
  auto_print_barcode_on_purchase?: boolean
```

- [ ] **Step 2: Remove now-unnecessary `as any` casts in `SettingsPage.tsx` for these 7 fields**

Run: `grep -n "org?.branding as any)?.barcode_" apps/web/src/pages/settings/SettingsPage.tsx`

For each match in the state-initializer block (around lines 1370-1377) and the save-mutation block (around lines 2043-2052), remove the `as any` cast — e.g. change `(org?.branding as any)?.barcode_template_style ?? 'standard'` to `org?.branding?.barcode_template_style ?? 'standard'`. Do this for all 7 fields in both blocks. Leave any OTHER `as any` cast in this file untouched (this file has unrelated `as any` usage elsewhere — only touch the 7 barcode fields from Task 1 Step 1).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: clean. If removing an `as any` cast surfaces a new type error elsewhere (e.g. a prop expecting a plain `string` now receiving the narrower union type), fix the narrowest possible way (e.g. widen that one prop's type to match, or keep the value as the union — do not reintroduce `as any`).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types/index.ts apps/web/src/pages/settings/SettingsPage.tsx
git commit -m "feat: add real barcode template/toggle fields to OrgBranding type

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Rewrite `BarcodeLabelDialog` to be fully Settings-driven with 4 templates + QR

**Files:**
- Modify: `apps/web/src/components/ui/BarcodeLabelDialog.tsx`

**Interfaces:**
- Consumes: `useAuth` from `@/contexts/AuthContext` (for `org?.branding`, `org?.name`), `QRCode` from `qrcode` (already a project dependency — confirm via `grep -n "from 'qrcode'" apps/web/src/pages/settings/SettingsPage.tsx` which already imports it as `import QRCode from 'qrcode'`).
- Produces: `LabelItem` gains two new optional fields: `mrp?: number | null`, `sku?: string | null`. The `Props` interface (`open`, `onOpenChange`, `items`, `orgName`) is UNCHANGED — `orgName` stays a separate prop (callers already pass `org?.name`), the dialog additionally reads `org?.branding` internally via its own `useAuth()` call rather than taking branding as a prop, since every existing/planned call site already has `useAuth()` available and this avoids a wide prop-drilling change across 8 call sites (5 from this plan + 3 already migrated from the prior plan).

This is a full rewrite of the component's visual logic, not just its data source. Read the CURRENT file (`apps/web/src/components/ui/BarcodeLabelDialog.tsx`) fully first — it already has the checkbox multi-select, per-item copies, and "Print N variants · M labels" footer mechanics from a prior plan; KEEP those exactly as they are. What changes is: (a) remove the `showName`/`showPrice` local state and their two toggle switches, (b) replace the single generic preview/print layout with 4 template-aware layouts reading from `org.branding`, (c) add QR rendering.

- [ ] **Step 1: Extend `LabelItem` and remove local toggle state**

Change:
```ts
export interface LabelItem {
  key: string
  name: string
  /** e.g. "XS" — omitted for a non-variant item, appended to the printed name when present. */
  variantLabel?: string
  barcode_value?: string | null
  price: number
}
```
to:
```ts
export interface LabelItem {
  key: string
  name: string
  /** e.g. "XS" — omitted for a non-variant item, appended to the printed name when present. */
  variantLabel?: string
  barcode_value?: string | null
  price: number
  mrp?: number | null
  sku?: string | null
}
```

In the component body, remove these two lines:
```ts
  const [showName, setShowName] = useState(true)
  const [showPrice, setShowPrice] = useState(true)
```
and add, in their place, derived (not stateful) values read from Settings:
```ts
  const { org } = useAuth()
  const branding = org?.branding
  const templateStyle = branding?.barcode_template_style ?? 'standard'
  const barcodeType = branding?.barcode_type ?? 'code128'
  const showShopName = branding?.barcode_show_shop_name ?? true
  const showSku = branding?.barcode_show_sku ?? true
  const showCodeValue = branding?.barcode_show_code_value ?? true
  const showMrp = branding?.barcode_show_mrp ?? true
  const showSp = branding?.barcode_show_sp ?? true
  const strikethroughMrp = branding?.barcode_strikethrough_mrp ?? true
```
Add `import { useAuth } from '@/contexts/AuthContext'` to the file's import block.

- [ ] **Step 2: Remove the two toggle-switch JSX blocks**

Delete both of these blocks entirely (the "Show Product Name" and "Show Price" `<div className="flex items-center justify-between">...</div>` blocks, each containing a `<Label>` and a `role="switch"` button) — there is no replacement UI for them; the dialog simply no longer offers this choice.

- [ ] **Step 3: Add QR code generation state and effect**

Add near the top of the component body:
```ts
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({})
```//
Add a new `useEffect` (alongside the existing barcode-preview `useEffect`) that generates QR data URLs for preview when `barcodeType === 'qr'`:
```ts
  useEffect(() => {
    if (!open || barcodeType !== 'qr') return
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(
        previewItems
          .filter((item) => item.barcode_value)
          .map(async (item) => {
            const url = await QRCode.toDataURL(item.barcode_value!, { width: 120, margin: 1 })
            return [item.key, url] as const
          }),
      )
      if (!cancelled) setQrDataUrls(Object.fromEntries(entries))
    })()
    return () => { cancelled = true }
  }, [open, barcodeType, previewItems])
```
Add `import QRCode from 'qrcode'` to the file's import block.

- [ ] **Step 4: Update the existing JsBarcode preview effect to use `barcodeType`'s format and skip when QR**

Find the existing barcode-preview `useEffect` (the one calling `JsBarcode(el, item.barcode_value, { format: 'CODE128', ... })`). Guard it to skip entirely when `barcodeType === 'qr'` (QR is handled by Step 3's effect instead), and map `barcodeType` to a JsBarcode `format` string for the non-QR cases:
```ts
  useEffect(() => {
    if (!open || barcodeType === 'qr') return
    const format = barcodeType === 'ean13' ? 'EAN13' : barcodeType === 'code39' ? 'CODE39' : 'CODE128'
    const timer = setTimeout(() => {
      for (const item of previewItems) {
        const el = svgRefs.current[item.key]
        if (!el || !item.barcode_value) continue
        try {
          JsBarcode(el, item.barcode_value, {
            format,
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
  }, [open, previewItems, isMulti, barcodeType])
```

- [ ] **Step 5: Replace the single-layout preview JSX with 4 template-aware layouts**

Find the current Preview section:
```tsx
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
```

Replace with a version that renders one of 4 layouts per item, matching `printBarcodeLabel.ts`'s `bodyHtml` branches (`compact_jewelry`, `saravana_stores`, `circular_bottle`, standard) adapted to Tailwind classes and this dialog's per-item loop. Add a small helper function ABOVE the component (module scope, alongside `escapeHtml`) that renders one item's code visual (SVG ref or QR img) as a JSX fragment, since all 4 templates need it:

```tsx
function ItemCode({ item, barcodeType, qrDataUrl, svgRef, sizeClass }: {
  item: LabelItem
  barcodeType: string
  qrDataUrl: string | undefined
  svgRef: (el: SVGSVGElement | null) => void
  sizeClass: string
}) {
  if (!item.barcode_value) return <p className="text-[10px] text-gray-400 py-2">No barcode set</p>
  if (barcodeType === 'qr') {
    return qrDataUrl ? <img src={qrDataUrl} alt="QR" className={sizeClass} /> : <div className={cn(sizeClass, 'bg-gray-100')} />
  }
  return <svg ref={svgRef} className={sizeClass} />
}
```

Then replace the Preview section body with:
```tsx
          {/* Preview */}
          <div className="space-y-1.5">
            <Label className="text-zinc-500">Preview</Label>
            {previewItems.length === 0 ? (
              <div className="rounded-lg border border-border bg-white p-4 flex flex-col items-center text-black">
                <p className="text-[10px] text-gray-400 py-4">No labels selected</p>
              </div>
            ) : (
              <div className={cn('space-y-2', isMulti && 'max-h-48 overflow-y-auto pr-1')}>
                {previewItems.map((item) => {
                  const displayName = item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name
                  const mrpStrike = strikethroughMrp && item.mrp != null && item.mrp > item.price && item.price > 0
                  const code = (
                    <ItemCode
                      item={item}
                      barcodeType={barcodeType}
                      qrDataUrl={qrDataUrls[item.key]}
                      svgRef={(el) => { svgRefs.current[item.key] = el }}
                      sizeClass="max-w-[110px] max-h-[60px]"
                    />
                  )
                  if (templateStyle === 'compact_jewelry') {
                    return (
                      <div key={item.key} className="rounded-lg border border-border bg-white p-3 text-black flex items-center justify-between gap-2">
                        <div className="text-left">
                          {showShopName && <p className="text-[9px] font-bold uppercase">{orgName || 'JEWELRY TAG'}</p>}
                          <p className="text-[9px] font-bold mt-0.5">{displayName}</p>
                          {showSku && item.sku && <p className="text-[8px] text-gray-500 font-mono">{item.sku}</p>}
                          {showMrp && item.mrp != null && (
                            <p className="text-[8px] text-gray-500 mt-0.5">MRP ₹{mrpStrike ? <span className="line-through">{item.mrp.toFixed(2)}</span> : item.mrp.toFixed(2)}</p>
                          )}
                          {showSp && <p className="text-[10px] font-black mt-0.5">SP ₹{item.price.toFixed(2)}</p>}
                        </div>
                        <div className="shrink-0">{code}</div>
                      </div>
                    )
                  }
                  if (templateStyle === 'saravana_stores') {
                    return (
                      <div key={item.key} className="rounded-lg border border-border bg-white text-black flex overflow-hidden">
                        <div className="flex-1 p-3 flex items-center gap-2 text-left">
                          {code}
                          <div>
                            <p className="text-[9px] font-bold uppercase">{displayName}</p>
                            {showSku && item.sku && <p className="text-[8px] text-gray-500 font-mono">{item.sku}</p>}
                            {showMrp && item.mrp != null && (
                              <p className="text-[8px] text-gray-500 mt-0.5">MRP ₹{mrpStrike ? <span className="line-through">{item.mrp.toFixed(2)}</span> : item.mrp.toFixed(2)}</p>
                            )}
                            {showSp && <p className="text-[10px] font-black mt-0.5">SP ₹{item.price.toFixed(2)}</p>}
                          </div>
                        </div>
                        {showShopName && (
                          <div className="w-6 bg-gradient-to-b from-amber-500 to-orange-600 text-white text-[7px] font-bold flex items-center justify-center uppercase [writing-mode:vertical-rl] rotate-180 px-1">
                            {orgName || 'DEPARTMENT STORE'}
                          </div>
                        )}
                      </div>
                    )
                  }
                  if (templateStyle === 'circular_bottle') {
                    return (
                      <div key={item.key} className="rounded-full border-2 border-gray-300 bg-white text-black w-36 h-36 mx-auto flex flex-col items-center justify-center text-center p-2">
                        {showShopName && <p className="text-[8px] font-bold uppercase">{orgName || 'JAR LABEL'}</p>}
                        <p className="text-[8px] mt-0.5">{displayName}</p>
                        {code}
                        {showMrp && item.mrp != null && (
                          <p className="text-[7.5px] text-gray-500 mt-0.5">MRP ₹{mrpStrike ? <span className="line-through">{item.mrp.toFixed(2)}</span> : item.mrp.toFixed(2)}</p>
                        )}
                        {showSp && <p className="text-[9px] font-black mt-0.5">SP ₹{item.price.toFixed(2)}</p>}
                      </div>
                    )
                  }
                  // standard
                  return (
                    <div key={item.key} className="rounded-lg border border-border bg-white p-3 flex flex-col items-center text-black">
                      {showShopName && <p className="text-xs font-bold text-center leading-tight uppercase">{orgName || displayName}</p>}
                      <p className="text-[10px] text-gray-500 mt-0.5">{displayName}</p>
                      {showSku && item.sku && <p className="text-[9px] text-gray-500 font-mono mt-0.5">SKU: {item.sku}</p>}
                      <div className="my-1">{code}</div>
                      {showCodeValue && barcodeType !== 'qr' && item.barcode_value && (
                        <p className="text-[9px] font-mono font-bold">{item.barcode_value}</p>
                      )}
                      {showMrp && item.mrp != null && (
                        <p className="text-[9px] text-gray-500 mt-0.5">MRP ₹{mrpStrike ? <span className="line-through">{item.mrp.toFixed(2)}</span> : item.mrp.toFixed(2)}</p>
                      )}
                      {showSp && <p className="text-sm font-bold mt-0.5">SP ₹{item.price.toFixed(2)}</p>}
                    </div>
                  )
                })}
                {checkedItems.length > PREVIEW_CAP && (
                  <p className="text-[11px] text-zinc-500 text-center">+{checkedItems.length - PREVIEW_CAP} more</p>
                )}
              </div>
            )}
          </div>
```

Note: `JsBarcode`'s `displayValue: true` (in Steps 3-4's effect) already renders the code text baked into the SVG for the non-QR case — the `showCodeValue` text line added above in the "standard" template is an ADDITIONAL text line matching `printBarcodeLabel.ts`'s own standard-template behavior (which shows both the SVG's own baked-in number AND a separate text line) — do not treat this as a duplicate to remove; it matches the ported reference exactly. For the 3 non-standard templates, `printBarcodeLabel.ts`'s originals never showed a separate code-value line, so none was added above — only `showCodeValue` support for the standard template, matching the reference precisely.

- [ ] **Step 6: Update `buildLabelHtml` to accept template/toggle/barcodeType parameters and render all 4 layouts + QR**

Replace the function signature and body:
```ts
function buildLabelHtml(
  items: LabelItem[],
  copiesByKey: Record<string, number>,
  orgName: string | undefined,
  templateStyle: string,
  barcodeType: string,
  showShopName: boolean,
  showSku: boolean,
  showCodeValue: boolean,
  showMrp: boolean,
  showSp: boolean,
  strikethroughMrp: boolean,
): string {
  const format = barcodeType === 'ean13' ? 'EAN13' : barcodeType === 'code39' ? 'CODE39' : 'CODE128'
  const isQr = barcodeType === 'qr'

  const rows = items.flatMap((item) => {
    const copies = copiesByKey[item.key] ?? 1
    const displayName = item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name
    const mrpStrike = strikethroughMrp && item.mrp != null && item.mrp > item.price && item.price > 0
    const mrpLine = showMrp && item.mrp != null
      ? `<div class="mrp">MRP &#8377;${mrpStrike ? `<span style="text-decoration:line-through">${item.mrp.toFixed(2)}</span>` : item.mrp.toFixed(2)}</div>`
      : ''
    const spLine = showSp ? `<div class="sp">SP &#8377;${item.price.toFixed(2)}</div>` : ''
    const skuLine = showSku && item.sku ? `<div class="sku">${escapeHtml(item.sku)}</div>` : ''
    const codeId = `bc_${Math.random().toString(36).slice(2)}`
    const codeEl = !item.barcode_value
      ? ''
      : isQr
        ? `<canvas class="qr-canvas" data-qr="${escapeHtml(item.barcode_value)}" id="${codeId}"></canvas>`
        : `<svg data-barcode="${escapeHtml(item.barcode_value)}" data-format="${format}" id="${codeId}"></svg>`
    const codeValueLine = showCodeValue && !isQr && item.barcode_value
      ? `<div class="codevalue">${escapeHtml(item.barcode_value)}</div>`
      : ''

    let labelInner = ''
    if (templateStyle === 'compact_jewelry') {
      labelInner = `
        <div class="jewelry">
          <div class="jewelry-text">
            ${showShopName ? `<div class="shop">${escapeHtml(orgName || 'JEWELRY TAG')}</div>` : ''}
            <div class="name">${escapeHtml(displayName)}</div>
            ${skuLine}${mrpLine}${spLine}
          </div>
          <div class="jewelry-code">${codeEl}</div>
        </div>`
    } else if (templateStyle === 'saravana_stores') {
      labelInner = `
        <div class="saravana">
          <div class="saravana-main">
            ${codeEl}
            <div class="saravana-text">
              <div class="name">${escapeHtml(displayName)}</div>
              ${skuLine}${mrpLine}${spLine}
            </div>
          </div>
          ${showShopName ? `<div class="saravana-side">${escapeHtml(orgName || 'DEPARTMENT STORE')}</div>` : ''}
        </div>`
    } else if (templateStyle === 'circular_bottle') {
      labelInner = `
        <div class="circular">
          ${showShopName ? `<div class="shop">${escapeHtml(orgName || 'JAR LABEL')}</div>` : ''}
          <div class="name">${escapeHtml(displayName)}</div>
          ${codeEl}
          ${mrpLine}${spLine}
        </div>`
    } else {
      labelInner = `
        ${orgName ? `<div class="shop">${escapeHtml(orgName)}</div>` : ''}
        ${showShopName ? '' : ''}
        <div class="name">${escapeHtml(displayName)}</div>
        ${skuLine}
        ${codeEl}
        ${codeValueLine}
        ${mrpLine}${spLine}`
    }

    return Array.from({ length: copies }, () => `<div class="label label-${templateStyle}">${labelInner}</div>`)
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Barcode Label</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"><\/script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; font-family: Arial, sans-serif; }
  .labels { display: flex; flex-wrap: wrap; padding: 4mm; gap: 2mm; }
  .label { width: 58mm; border: 0.5pt solid #ccc; padding: 2mm; page-break-inside: avoid; }
  .label-standard, .label-compact_jewelry, .label-circular_bottle { display: flex; flex-direction: column; align-items: center; text-align: center; }
  .label-saravana_stores { display: flex; flex-direction: column; }
  .shop { font-size: 7pt; font-weight: 700; text-align: center; margin-bottom: 1mm; text-transform: uppercase; }
  .name { font-size: 8pt; font-weight: bold; text-align: center; margin-bottom: 1mm; word-break: break-word; }
  .sku { font-size: 6.5pt; color: #666; font-family: monospace; margin-bottom: 1mm; }
  .codevalue { font-size: 7pt; font-family: monospace; font-weight: bold; margin: 1mm 0; }
  .mrp { font-size: 7pt; color: #666; margin-top: 1mm; }
  .sp { font-size: 10pt; font-weight: 900; margin-top: 0.5mm; }
  svg, canvas.qr-canvas, img { max-width: 100%; }
  .jewelry { display: flex; align-items: center; justify-content: space-between; gap: 2mm; }
  .jewelry-text { text-align: left; }
  .saravana-main { display: flex; align-items: center; gap: 2mm; flex: 1; }
  .saravana-text { text-align: left; }
  .saravana-side { background: linear-gradient(to bottom, #f59e0b, #ea580c); color: #fff; font-size: 6pt; font-weight: bold; text-align: center; text-transform: uppercase; padding: 1mm; margin-top: 1mm; }
  .circular { border-radius: 50%; }
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
      format: el.getAttribute('data-format') || 'CODE128',
      width: 1.5,
      height: 40,
      displayValue: true,
      fontSize: 9,
      margin: 2,
      background: '#ffffff',
      lineColor: '#000000'
    });
  });
  document.querySelectorAll('canvas[data-qr]').forEach(function(el) {
    QRCode.toCanvas(el, el.getAttribute('data-qr'), { width: 60, margin: 1 });
  });
<\/script>
</body>
</html>`
}
```

- [ ] **Step 7: Update `handlePrint` to pass the new parameters**

Change:
```ts
  const handlePrint = () => {
    const labelHtml = buildLabelHtml(checkedItems, copiesByKey, orgName, showName, showPrice)
```
to:
```ts
  const handlePrint = () => {
    const labelHtml = buildLabelHtml(
      checkedItems, copiesByKey, orgName, templateStyle, barcodeType,
      showShopName, showSku, showCodeValue, showMrp, showSp, strikethroughMrp,
    )
```

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: 0 errors in `BarcodeLabelDialog.tsx` itself. Errors may appear in the 3 files that already call this dialog from the PRIOR plan (`ProductsPage.tsx`, `ProductViewPage.tsx`, `InventoryPage.tsx`) if TypeScript flags a missing required prop — it should not, since `mrp`/`sku` are optional and `Props` is unchanged, but verify. If those 3 files show errors, this task must fix them (they are not "later tasks" — they are ALREADY-existing callers that must keep working, unlike Task 3-6's NEW migrations).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/ui/BarcodeLabelDialog.tsx
git commit -m "feat: make BarcodeLabelDialog read Settings->Barcode directly, render all 4 templates + QR

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Migrate `PurchaseFormPage.tsx`'s post-save print (the reported bug)

**Files:**
- Modify: `apps/web/src/pages/purchases/PurchaseFormPage.tsx`

**Interfaces:**
- Consumes: `BarcodeLabelDialog`, `LabelItem` from `@/components/ui/BarcodeLabelDialog` (Task 2).
- Produces: no new exports.

This is the exact bug in the user's screenshot: `handlePrintNewProductLabels` loops `savedPurchase.newProducts` (type `PurchaseRow[]`) and calls `printBarcodeLabel(r.product_name, r.barcode_value, r.price)` per row — for a `has_variants` row, `r.barcode_value` is always blank (real barcodes live on `r.variants[]`), so nothing useful prints for that row.

- [ ] **Step 1: Add dialog-open state and remove the old import**

Find `import { printBarcodeLabel } from '@/lib/printBarcodeLabel'` near the top of the file and remove it. Add:
```ts
import { BarcodeLabelDialog, type LabelItem } from '@/components/ui/BarcodeLabelDialog'
```
Add state near `savedPurchase`'s own `useState` declaration (line ~288):
```ts
  const [printLabelsOpen, setPrintLabelsOpen] = useState(false)
```

- [ ] **Step 2: Build the full `LabelItem[]` from `savedPurchase.newProducts`, expanding variants**

Replace `handlePrintNewProductLabels`:
```ts
  function handlePrintNewProductLabels() {
    if (!savedPurchase) return
    setPrintLabelsOpen(true)
  }
```
Add a derived value (a `useMemo` or plain computation is fine — this recomputes on every render, which is acceptable since `savedPurchase` only changes on save) right below `savedPurchase`'s state declaration or near `handlePrintNewProductLabels`:
```ts
  const newProductLabelItems: LabelItem[] = (savedPurchase?.newProducts ?? []).flatMap((r) => {
    if (r.has_variants && r.variants.length > 0) {
      return r.variants
        .filter((v) => v.variant_name.trim())
        .map((v) => ({
          key: `${r.sku}-${v.variant_name}`,
          name: r.product_name,
          variantLabel: v.variant_name,
          barcode_value: v.barcode_value || null,
          price: parseNum(v.sale_price),
          mrp: v.mrp ? parseNum(v.mrp) : null,
          sku: v.sku || null,
        }))
    }
    return [{
      key: r.sku,
      name: r.product_name,
      barcode_value: r.barcode_value || null,
      price: parseNum(r.price),
      mrp: r.mrp ? parseNum(r.mrp) : null,
      sku: r.sku || null,
    }]
  })
```
This file already defines a local `parseNum(s: string): number` helper (confirm via `grep -n "^function parseNum" apps/web/src/pages/purchases/PurchaseFormPage.tsx` — it exists at module scope) — reuse it, do not redefine it.

- [ ] **Step 3: Render the dialog**

Find the "Purchase Saved" `<Dialog>` block (around line 1905) and add the new dialog as a sibling, right after that `</Dialog>` closes:
```tsx
      <BarcodeLabelDialog
        open={printLabelsOpen}
        onOpenChange={setPrintLabelsOpen}
        items={newProductLabelItems}
        orgName={org?.name}
      />
```
Confirm `org` is already destructured from `useAuth()` in this file (it is, per existing code) — reuse it, do not add a second `useAuth()` call.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 5: Manual QC in the browser**

Start the dev server (`pnpm --filter web dev`), log in as `mdsuhail.designer@gmail.com` / `Test@4321` at `localhost:5173`, go to `/purchases/new`, create a purchase with a NEW variant-tracked product (Track Variants on, 2+ variants with their own barcodes) plus a NEW non-variant product, save it. In the "Purchase Saved" dialog, click "Print Barcode Labels" — verify the opened `BarcodeLabelDialog` lists EVERY variant of the variant product (each with its own barcode) plus the non-variant product, not just parent-level blanks. Stop the dev server after QC.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/purchases/PurchaseFormPage.tsx
git commit -m "fix: post-purchase Print Barcode Labels now shows every variant, not just the parent

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Migrate `PurchaseViewPage.tsx`'s two print call sites

**Files:**
- Modify: `apps/web/src/pages/purchases/PurchaseViewPage.tsx`

**Interfaces:**
- Consumes: `BarcodeLabelDialog`, `LabelItem` from `@/components/ui/BarcodeLabelDialog` (Task 2).

- [ ] **Step 1: Remove the old import, add the new one, add dialog state**

Remove `import { printBarcodeLabel } from '@/lib/printBarcodeLabel'`. Add:
```ts
import { BarcodeLabelDialog, type LabelItem } from '@/components/ui/BarcodeLabelDialog'
```
Add state near the existing `deleteConfirmOpen` state:
```ts
  const [printAllOpen, setPrintAllOpen] = useState(false)
  const [printOneItem, setPrintOneItem] = useState<LabelItem | null>(null)
```

- [ ] **Step 2: Replace the "Print All Labels" button's handler**

Find:
```tsx
            {items.some((it: any) => it.products?.barcode_value) && (
              <Button
                type="button" variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => {
                  for (const it of items) {
                    if (it.products?.barcode_value) {
                      printBarcodeLabel(it.product_name, it.products.barcode_value, it.products.price ?? it.unit_cost)
                    }
                  }
                }}
              >
                <Printer className="h-3.5 w-3.5 mr-1" />Print All Labels
              </Button>
            )}
```
Replace with:
```tsx
            {items.some((it: any) => it.products?.barcode_value) && (
              <Button
                type="button" variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => setPrintAllOpen(true)}
              >
                <Printer className="h-3.5 w-3.5 mr-1" />Print All Labels
              </Button>
            )}
```

- [ ] **Step 3: Replace the per-row print button's handler**

Find:
```tsx
                        {it.products?.barcode_value && (
                          <button
                            type="button"
                            title="Print label"
                            onClick={() => printBarcodeLabel(it.product_name, it.products!.barcode_value!, it.products?.price ?? it.unit_cost)}
                            className="p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-900/20 transition-colors"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                        )}
```
Replace with:
```tsx
                        {it.products?.barcode_value && (
                          <button
                            type="button"
                            title="Print label"
                            onClick={() => setPrintOneItem({
                              key: it.id,
                              name: it.product_name,
                              barcode_value: it.products!.barcode_value!,
                              price: it.products?.price ?? it.unit_cost,
                              mrp: it.products?.mrp ?? null,
                              sku: it.products?.sku ?? null,
                            })}
                            className="p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-900/20 transition-colors"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                        )}
```

- [ ] **Step 4: Render both dialogs**

Near the end of the component's JSX (after the closing of the main content, before the component's final `</div>`), add:
```tsx
      <BarcodeLabelDialog
        open={printAllOpen}
        onOpenChange={setPrintAllOpen}
        items={items.filter((it: any) => it.products?.barcode_value).map((it: any) => ({
          key: it.id,
          name: it.product_name,
          barcode_value: it.products.barcode_value,
          price: it.products.price ?? it.unit_cost,
          mrp: it.products.mrp ?? null,
          sku: it.products.sku ?? null,
        }))}
        orgName={org?.name}
      />
      {printOneItem && (
        <BarcodeLabelDialog
          open={!!printOneItem}
          onOpenChange={(v) => { if (!v) setPrintOneItem(null) }}
          items={[printOneItem]}
          orgName={org?.name}
        />
      )}
```
Confirm `org` is already destructured from `useAuth()` in this file (it is, per existing code) — reuse it.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 6: Manual QC in the browser**

Log in, navigate to `/purchases`, open any existing purchase's View page. Click "Print All Labels" — verify the dialog opens with every line item checked. Click one row's print icon — verify a single-item dialog opens scoped to that row. Stop the dev server after QC.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/purchases/PurchaseViewPage.tsx
git commit -m "fix: route Purchase View's barcode printing through the unified BarcodeLabelDialog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Migrate `ProductFormPage.tsx`'s two print button call sites

**Files:**
- Modify: `apps/web/src/pages/products/ProductFormPage.tsx`

**Interfaces:**
- Consumes: `BarcodeLabelDialog`, `LabelItem` from `@/components/ui/BarcodeLabelDialog` (Task 2).

Reminder (Global Constraints): this file's inline Templates 1-4 live-preview JSX (lines ~1173-1310, rendered while the merchant is typing the form, before any save) is OUT OF SCOPE — do not touch it. Only the two `onClick={() => printBarcodeLabel(...)}` button handlers change.

- [ ] **Step 1: Remove the old import, add the new one, add dialog state**

Remove `import { printBarcodeLabel } from '@/lib/printBarcodeLabel'`. Add:
```ts
import { BarcodeLabelDialog, type LabelItem } from '@/components/ui/BarcodeLabelDialog'
```
Add state near the component's other `useState` declarations:
```ts
  const [printLabelOpen, setPrintLabelOpen] = useState(false)
```

- [ ] **Step 2: Build a single shared `LabelItem` from the form's current `watch()` values**

Add near `handlePrintLabel`'s current definition (or replace it directly):
```ts
  const printLabelItem: LabelItem = {
    key: 'current-product',
    name: watch('name') || 'Product',
    barcode_value: barcodeValue || null,
    price: watch('price') || 0,
    mrp: watch('mrp') ? Number(watch('mrp')) : null,
    sku: watch('sku') || null,
  }

  const handlePrintLabel = () => {
    setPrintLabelOpen(true)
  }
```
This replaces the OLD `handlePrintLabel` body entirely (the one that called `printBarcodeLabel(watch('name') || 'Product', barcodeValue ?? '', watch('price') || 0, barcodeType, ...)` at line ~343) — confirm by reading the current file that `barcodeValue` and `barcodeType` are already in-scope local variables here (they are, used elsewhere in this same file for the live preview) so `printLabelItem` can reference them directly without new plumbing.

- [ ] **Step 3: Replace the second call site's inline `onClick`**

Find (around line 1313-1333):
```tsx
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      printBarcodeLabel(
                        watch('name') || 'Product',
                        barcodeValue ?? '',
                        watch('price') || 0,
                        barcodeType,
                        org?.branding?.barcode_label_size,
                        (org?.branding as any)?.barcode_template_style ?? 'standard',
                        org?.name,
                        org?.address,
                        {
                          showShopName: (org?.branding as any)?.barcode_show_shop_name ?? true,
                          showSku: (org?.branding as any)?.barcode_show_sku ?? true,
                          showCodeValue: (org?.branding as any)?.barcode_show_code_value ?? true,
                          showPrice: (org?.branding as any)?.barcode_show_price ?? true,
                        }
                      )
                    }}
```
Replace the `onClick` body with:
```tsx
                    onClick={() => setPrintLabelOpen(true)}
```
(Read the surrounding JSX first — this Button's other props like `variant`/`size`/its children are unchanged, only the `onClick` value changes.)

- [ ] **Step 4: Render the dialog once**

Near the end of this component's JSX (alongside its other dialogs, e.g. near the "Add Category" dialog or wherever this file's other `<Dialog>`/modal components are rendered), add:
```tsx
      <BarcodeLabelDialog
        open={printLabelOpen}
        onOpenChange={setPrintLabelOpen}
        items={[printLabelItem]}
        orgName={org?.name}
      />
```
Confirm `org` is already destructured from `useAuth()` in this file (it is, used extensively for the live preview) — reuse it.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 6: Manual QC in the browser**

Log in, go to `/products/new` (or edit an existing product), fill in a name/price/barcode, click either "Print Label" button (the one near the live preview, and/or the header one if this page has one — confirm both by reading the file) — verify `BarcodeLabelDialog` opens with the current form's data and the visual template matches whatever Settings → Barcode is currently configured to. Stop the dev server after QC.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/products/ProductFormPage.tsx
git commit -m "fix: route Product Form's barcode printing through the unified BarcodeLabelDialog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire `auto_print_barcode_on_purchase` + delete `printBarcodeLabel.ts`

**Files:**
- Modify: `apps/web/src/pages/purchases/PurchaseFormPage.tsx`
- Delete: `apps/web/src/lib/printBarcodeLabel.ts`

**Interfaces:**
- Consumes: `org?.branding?.auto_print_barcode_on_purchase` (now properly typed per Task 1), `printLabelsOpen`/`setPrintLabelsOpen` state from Task 3.

- [ ] **Step 1: Confirm no remaining references to `printBarcodeLabel.ts`**

Run: `grep -rln "printBarcodeLabel" apps/web/src --include="*.tsx" --include="*.ts" | grep -v printBarcodeLabel.ts`
Expected: EMPTY output — Tasks 3, 4, and 5 already removed every caller. If this returns any file, STOP this task and go fix that file first (a caller was missed) — do not delete the source file while a caller still references it.

- [ ] **Step 2: Wire auto-print in `PurchaseFormPage.tsx`'s save-success handler**

Find the `saveMutation`'s `onSuccess` callback (around line 934):
```ts
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchases', orgId] })
      queryClient.invalidateQueries({ queryKey: ['products', orgId] })
      queryClient.invalidateQueries({ queryKey: ['products-all', orgId] })
      queryClient.invalidateQueries({ queryKey: ['inventory', orgId] })
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_summaries', orgId] })
      setSavedPurchase({ purchaseNo: data.purchase.purchase_no, newProducts: rows.filter((r) => r.is_new_product) })
    },
```
Add one line at the end of this callback, after `setSavedPurchase(...)`:
```ts
      if (org?.branding?.auto_print_barcode_on_purchase && rows.some((r) => r.is_new_product)) {
        setPrintLabelsOpen(true)
      }
```
This works because `newProductLabelItems` (Task 3, Step 2) is derived from `savedPurchase.newProducts` on every render, and `setSavedPurchase` runs synchronously just above this new line within the same state-update batch — by the time `BarcodeLabelDialog` actually renders with `open={true}`, `newProductLabelItems` will already reflect the just-saved products on the next render. Confirm `org` is in scope here (it is, already used throughout this file).

- [ ] **Step 3: Delete the old file**

Run: `rm apps/web/src/lib/printBarcodeLabel.ts`

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: clean — no dangling imports of the deleted file.

- [ ] **Step 5: Manual QC in the browser**

Log in, go to Settings → Barcode, toggle "Auto-Print Barcode on Purchase" ON and save. Go to `/purchases/new`, create a purchase with a new product, save it — verify `BarcodeLabelDialog` opens AUTOMATICALLY without clicking "Print Barcode Labels". Turn the setting back OFF, save, create another purchase with a new product — verify the dialog does NOT auto-open this time (the button still works manually). Stop the dev server after QC.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/purchases/PurchaseFormPage.tsx
git rm apps/web/src/lib/printBarcodeLabel.ts
git commit -m "feat: wire auto-print-on-purchase setting; retire the old one-shot print helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end Settings-consistency QC pass

**Files:**
- None modified — this is a verification-only task.

- [ ] **Step 1: Change Settings → Barcode's configuration to a non-default combination**

Log in, go to Settings → Barcode. Change: Template Style to "Saravana Stores", Barcode Type to "QR Code", turn OFF "Show MRP", turn ON "Strike-through MRP" (if not already), save.

- [ ] **Step 2: Verify the SAME choices are reflected in every print entry point**

For each of the following, open its barcode print dialog and confirm: the template visually matches Saravana Stores' layout, the code renders as a QR (not a barcode), MRP is NOT shown anywhere, and this is true with NO per-print toggle available to change it:
- Purchase Save confirmation (`/purchases/new`, save a purchase with a new product)
- Purchase View (`/purchases`, open any purchase, "Print All Labels")
- Product Form (`/products/new` or edit, click Print Label)
- Products list (`/products`, click Print on any product card)
- Product Details (`/products/:id`, click header "Print Label")
- Inventory Stock List (`/inventory`, expand a variant product, click a variant's print icon)

- [ ] **Step 2 (report):** Write a short pass/fail note for each of the 6 entry points above — this task's "test" is this manual matrix, since there is no automated UI test suite in this project. If any entry point does NOT match, that is a regression from Tasks 2-6 and must be fixed before this plan is considered done — identify which task's change is responsible and fix it there (re-open that task, do not patch around it here).

- [ ] **Step 3: Reset Settings → Barcode back to defaults** (Standard template, Code128, all toggles on) so the org's live data isn't left in a QC-only state, unless the user asked to keep the test configuration.

- [ ] **Step 4: Final typecheck**

Run: `pnpm --filter web exec tsc --noEmit -p .`
Expected: clean.

- [ ] **Step 5: Commit (only if Step 2's QC required any fix commits — otherwise this task produces no diff and needs no commit)**

If fixes were needed and committed under their originating task already, no additional commit is needed here. If this task's own Step 3 (resetting Settings) was done through the UI against live data, no commit applies (it's a data change, not a code change).

---

## Self-Review Notes (completed during planning)

- **Spec coverage:** §1 (OrgBranding fields) → Task 1. §2 (BarcodeLabelDialog Settings-driven + 4 templates + QR) → Task 2. §3 (5 call-site migrations) → Tasks 3, 4, 5 (Task 3 covers the reported bug specifically). §4 (auto-print wiring + deletion) → Task 6. Testing section → Task 7.
- **Type consistency:** `LabelItem`'s new `mrp`/`sku` fields (Task 2) are populated identically in Tasks 3, 4, 5 (`null` fallback when absent, matching the interface's `?: number | null` / `?: string | null` optionality).
- **No placeholders:** every step includes complete, pasteable code or an exact grep/shell command to run.
- **Global constraint check:** no task adds a per-print toggle; Task 2 explicitly removes the two that existed. `ProductFormPage.tsx`'s live-preview JSX is explicitly called out as out-of-scope in Task 5's reminder.
