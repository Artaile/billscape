import { useEffect, useMemo, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

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

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  items: LabelItem[]
  orgName?: string
}

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

export function BarcodeLabelDialog({ open, onOpenChange, items, orgName }: Props) {
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
  const labelSize = branding?.barcode_label_size ?? '5x3cm'

  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [copiesByKey, setCopiesByKey] = useState<Record<string, number>>({})
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setChecked(new Set(items.filter((i) => i.barcode_value).map((i) => i.key)))
    setCopiesByKey(Object.fromEntries(items.map((i) => [i.key, 1])))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `items` is intentionally excluded:
    // every call site passes an inline array literal with an unstable reference on every render,
    // so including it here would reset checked/copies on every parent re-render (e.g. a
    // background query refetch), silently discarding whatever the merchant had already
    // unchecked or changed. This effect should only fire when the dialog transitions from
    // closed to open; it still reads the current `items` from this render's closure when it runs.
  }, [open])

  const checkedItems = items.filter((i) => checked.has(i.key))
  const totalLabels = checkedItems.reduce((sum, i) => sum + (copiesByKey[i.key] ?? 1), 0)
  const isMulti = items.length > 1

  const svgRefs = useRef<Record<string, SVGSVGElement | null>>({})
  const PREVIEW_CAP = 6
  // previewItemsKey is a stable PRIMITIVE STRING — every call site passes an inline `items`
  // array literal with an unstable reference on every render (same reasoning as the
  // `checked`/`copiesByKey` seed effect above), and `checkedItems`/`.slice()` here derive a new
  // array from it on every render too. Memoizing previewItems on this string (not on
  // `checkedItems` itself, which is a fresh array every render) means the two effects below
  // that depend on it only actually re-run when something the preview/QR/barcode rendering
  // actually consumes has changed, not on every parent re-render. Without this, the QR effect's
  // setQrDataUrls(...) at the end of every run produces a new object reference, which triggers
  // another render, which produces a new previewItems array, which re-triggers the effect — a
  // real synchronous infinite loop for any org with barcode_type: 'qr' (100% CPU, browser tab
  // wedged, reproduced live from PurchaseFormPage's post-save "Print Barcode Labels" button —
  // the JsBarcode effect has the same unstable-dependency shape but happens to not
  // self-perpetuate since it never calls a state setter).
  //
  // The key must capture BOTH the checked-key membership AND the actual field values the
  // preview reads (barcode_value/price/mrp/sku/name/variantLabel) — not just `.key`. A call
  // site backed by live React Query data (ProductsPage.tsx, ProductViewPage.tsx) can have a
  // background refetch change e.g. barcode_value or sale_price on an item that's already
  // checked, with the checked-key SET staying identical — keying on `.key` alone would return
  // the stale cached previewItems array forever in that case, silently showing an outdated
  // barcode/QR/price in the preview panel (a real bug caught in code review, though it never
  // affects the actual print output since handlePrint reads checkedItems directly, unmemoized).
  const previewItemsKey = checkedItems
    .slice(0, PREVIEW_CAP)
    .map((i) => `${i.key}:${i.barcode_value}:${i.price}:${i.mrp}:${i.sku}:${i.name}:${i.variantLabel}`)
    .join('|')
  const previewItems = useMemo(
    () => checkedItems.slice(0, PREVIEW_CAP),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on previewItemsKey (a stable
    // primitive string derived from checkedItems' relevant fields), not checkedItems itself, by
    // design — see comment above.
    [previewItemsKey],
  )

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

  const handlePrint = async () => {
    // Pre-render every barcode/QR to a data URI in the host page BEFORE opening the print
    // popup — the previous approach loaded JsBarcode/QRCode from a CDN inside the popup and
    // printed after a blind 400ms setTimeout, which lost the race against script download +
    // execution on anything but a warm cache, producing a print with missing barcodes/QR and
    // a broken/unmeasured flex layout (each label its own near-empty page). Rendering to plain
    // <img> tags up front removes both the network dependency and the timing race entirely.
    const format = barcodeType === 'ean13' ? 'EAN13' : barcodeType === 'code39' ? 'CODE39' : 'CODE128'
    const { widthMm: printWidthMm, heightMm: printHeightMm } = getLabelDimensionsMm(labelSize)
    const scale = labelSize === 'A4 Sheet' ? 1 : getLabelScale(printWidthMm, printHeightMm)
    const codeDataUris: Record<string, string> = {}
    for (const item of checkedItems) {
      if (!item.barcode_value) continue
      try {
        if (barcodeType === 'qr') {
          codeDataUris[item.key] = await QRCode.toDataURL(item.barcode_value, { width: Math.round(120 * scale), margin: 1 })
        } else {
          const canvas = document.createElement('canvas')
          JsBarcode(canvas, item.barcode_value, {
            format,
            width: 1.5 * scale,
            height: Math.round(40 * scale),
            displayValue: true,
            fontSize: Math.round(9 * scale),
            margin: 2,
            background: '#ffffff',
            lineColor: '#000000',
          })
          codeDataUris[item.key] = canvas.toDataURL('image/png')
        }
      } catch {
        // invalid barcode value — leave this item's code blank in the printout
      }
    }

    const labelHtml = buildLabelHtml(
      checkedItems, copiesByKey, orgName, templateStyle, labelSize, barcodeType,
      showShopName, showSku, showCodeValue, showMrp, showSp, strikethroughMrp, codeDataUris,
    )
    const win = window.open('', '_blank', 'width=600,height=400')
    if (!win) return
    win.document.write(labelHtml)
    win.document.close()
    win.focus()
    // Wait for the popup's own document (images included) to finish loading before printing,
    // rather than guessing a fixed delay. The 1500ms setTimeout is a fallback in case 'load'
    // never fires — guarded so a slow-but-eventually-successful load doesn't also fire the
    // fallback and print/close an already-closed window a second time.
    let printed = false
    const triggerPrint = () => {
      if (printed) return
      printed = true
      win.print()
      win.close()
    }
    if (win.document.readyState === 'complete') {
      triggerPrint()
    } else {
      win.addEventListener('load', triggerPrint)
      setTimeout(triggerPrint, 1500)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4.5 w-4.5 text-indigo-400" />
            Print Barcode Labels
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-zinc-400">
            {isMulti ? (
              <>Product: <span className="font-semibold text-zinc-200">{items[0]?.name}</span> — {items.length} variants</>
            ) : (
              <>Product: <span className="font-semibold text-zinc-200">{items[0]?.name}</span></>
            )}
          </div>
          <div className="text-xs text-zinc-500">
            Print Mode: <span className="font-medium text-zinc-300">Thermal ({labelSize})</span>{' '}
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
                    max={100}
                    value={copiesByKey[item.key] ?? 1}
                    onChange={(e) => setCopiesByKey((prev) => ({ ...prev, [item.key]: Math.min(100, Math.max(1, parseInt(e.target.value) || 1)) }))}
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
                  const previewSize = getPreviewSizePx(labelSize)
                  const previewStyle = { width: previewSize.widthPx, minHeight: previewSize.minHeightPx }
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
                      <div key={item.key} className="rounded-lg border border-border bg-white p-3 text-black flex items-center justify-between gap-2 mx-auto" style={previewStyle}>
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
                      <div key={item.key} className="rounded-lg border border-border bg-white text-black flex overflow-hidden mx-auto" style={previewStyle}>
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
                      <div
                        key={item.key}
                        className="rounded-full border-2 border-gray-300 bg-white text-black mx-auto flex flex-col items-center justify-center text-center p-2"
                        style={{ width: previewSize.widthPx, height: previewSize.widthPx }}
                      >
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
                    <div key={item.key} className="rounded-lg border border-border bg-white p-3 flex flex-col items-center text-black mx-auto" style={previewStyle}>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button onClick={handlePrint} disabled={checkedItems.length === 0}>
            <Printer className="h-4 w-4" />
            {isMulti ? `Print ${checkedItems.length} variant${checkedItems.length !== 1 ? 's' : ''} · ${totalLabels} labels` : `Print ${totalLabels > 1 ? `${totalLabels} Labels` : '1 Label'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Parses a Settings → Barcode `labelSize` value (e.g. "5x3cm") into physical mm dimensions.
 * "A4 Sheet" has no single label size (A4 tiles multiple labels per sheet) — callers handle it
 * separately. Falls back to the "5x3cm" default's dimensions for any unrecognized value.
 */
function getLabelDimensionsMm(labelSize: string): { widthMm: number; heightMm: number } {
  const match = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)cm$/.exec(labelSize)
  if (!match) return { widthMm: 50, heightMm: 30 }
  return { widthMm: parseFloat(match[1]) * 10, heightMm: parseFloat(match[2]) * 10 }
}

/**
 * A unitless scale factor relative to the "5x3cm" (50x30mm) baseline every font-size/padding/
 * QR-pixel-size value in the generated print HTML was originally tuned for. Without this, a
 * 3x2cm label prints with the exact same fixed 7-10pt text and a 120px QR as a 6x4cm label —
 * the small label's content physically overflows its own tiny @page box and spills onto a
 * second, near-empty printed page (confirmed live via a user screenshot). Scaling every size
 * down/up together keeps each label internally proportional and keeps content within one page.
 * Clamped to [0.6, 1.6] so a very small label doesn't shrink text below legibility and a very
 * large one (e.g. 6x4cm) doesn't look comically oversized relative to its own content.
 */
function getLabelScale(widthMm: number, heightMm: number): number {
  const BASELINE_WIDTH_MM = 50
  const BASELINE_HEIGHT_MM = 30
  const rawScale = Math.min(widthMm / BASELINE_WIDTH_MM, heightMm / BASELINE_HEIGHT_MM)
  return Math.min(1.6, Math.max(0.6, rawScale))
}

/** Preview-panel box size (px) roughly proportional to the label's real aspect ratio, capped
 * within the dialog's available width. A4 Sheet has no single label — shown at a fixed
 * "generic sheet label" size like the standalone Settings preview does. */
function getPreviewSizePx(labelSize: string): { widthPx: number; minHeightPx: number } {
  if (labelSize === 'A4 Sheet') return { widthPx: 180, minHeightPx: 100 }
  const { widthMm, heightMm } = getLabelDimensionsMm(labelSize)
  const PX_PER_MM = 3.6
  const MIN_WIDTH_PX = 130
  const MAX_WIDTH_PX = 260
  const widthPx = Math.min(MAX_WIDTH_PX, Math.max(MIN_WIDTH_PX, widthMm * PX_PER_MM))
  const minHeightPx = widthPx * (heightMm / widthMm)
  return { widthPx, minHeightPx }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildLabelHtml(
  items: LabelItem[],
  copiesByKey: Record<string, number>,
  orgName: string | undefined,
  templateStyle: string,
  labelSize: string,
  barcodeType: string,
  showShopName: boolean,
  showSku: boolean,
  showCodeValue: boolean,
  showMrp: boolean,
  showSp: boolean,
  strikethroughMrp: boolean,
  codeDataUris: Record<string, string>,
): string {
  const { widthMm, heightMm } = getLabelDimensionsMm(labelSize)
  // A4 tiles multiple labels per sheet rather than being one big label, so the printed page
  // itself is A4 — there's no single "label size" @page value to derive.
  const pageSizeCss = labelSize === 'A4 Sheet' ? 'A4' : `${widthMm}mm ${heightMm}mm`
  const labelWidthMm = labelSize === 'A4 Sheet' ? '58mm' : `${widthMm}mm`
  const labelHeightMm = labelSize === 'A4 Sheet' ? undefined : `${heightMm}mm`
  // Every font-size/padding/gap value below was originally tuned for the "5x3cm" baseline —
  // scaling them together keeps a small label's content from physically overflowing its own
  // tiny @page box and spilling onto a second, near-empty printed page (see getLabelScale doc).
  const scale = labelSize === 'A4 Sheet' ? 1 : getLabelScale(widthMm, heightMm)
  const pt = (basePt: number) => `${(basePt * scale).toFixed(1)}pt`
  const mm = (baseMm: number) => `${(baseMm * scale).toFixed(2)}mm`

  const rows = items.flatMap((item) => {
    const copies = copiesByKey[item.key] ?? 1
    const displayName = item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name
    const mrpStrike = strikethroughMrp && item.mrp != null && item.mrp > item.price && item.price > 0
    const mrpLine = showMrp && item.mrp != null
      ? `<div class="mrp">MRP &#8377;${mrpStrike ? `<span style="text-decoration:line-through">${item.mrp.toFixed(2)}</span>` : item.mrp.toFixed(2)}</div>`
      : ''
    const spLine = showSp ? `<div class="sp">SP &#8377;${item.price.toFixed(2)}</div>` : ''
    const skuLine = showSku && item.sku ? `<div class="sku">${escapeHtml(item.sku)}</div>` : ''
    const codeDataUri = codeDataUris[item.key]
    const codeEl = codeDataUri ? `<img class="code-img" src="${codeDataUri}" alt="">` : ''
    const codeValueLine = showCodeValue && barcodeType !== 'qr' && item.barcode_value
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
        ${showShopName ? `<div class="shop">${escapeHtml(orgName || displayName)}</div>` : ''}
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
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; font-family: Arial, sans-serif; }
  .labels { display: flex; flex-wrap: wrap; padding: ${labelHeightMm ? '0' : mm(4)}; gap: ${mm(2)}; }
  .label {
    width: ${labelWidthMm};
    ${labelHeightMm ? `height: ${labelHeightMm};` : ''}
    box-sizing: border-box;
    border: 0.5pt solid #ccc;
    padding: ${mm(2)};
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .label-standard, .label-compact_jewelry, .label-circular_bottle { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .label-saravana_stores { display: flex; flex-direction: column; justify-content: center; }
  .shop { font-size: ${pt(7)}; font-weight: 700; text-align: center; margin-bottom: ${mm(1)}; text-transform: uppercase; }
  .name { font-size: ${pt(8)}; font-weight: bold; text-align: center; margin-bottom: ${mm(1)}; word-break: break-word; }
  .sku { font-size: ${pt(6.5)}; color: #666; font-family: monospace; margin-bottom: ${mm(1)}; }
  .codevalue { font-size: ${pt(7)}; font-family: monospace; font-weight: bold; margin: ${mm(1)} 0; }
  .mrp { font-size: ${pt(7)}; color: #666; margin-top: ${mm(1)}; }
  .sp { font-size: ${pt(10)}; font-weight: 900; margin-top: ${mm(0.5)}; }
  .code-img { max-width: 100%; max-height: ${mm(labelSize === 'A4 Sheet' ? 20 : heightMm * 0.55)}; display: block; }
  .jewelry { display: flex; align-items: center; justify-content: space-between; gap: ${mm(2)}; width: 100%; }
  .jewelry-text { text-align: left; }
  .saravana-main { display: flex; align-items: center; gap: ${mm(2)}; flex: 1; }
  .saravana-text { text-align: left; }
  .saravana-side { background: linear-gradient(to bottom, #f59e0b, #ea580c); color: #fff; font-size: ${pt(6)}; font-weight: bold; text-align: center; text-transform: uppercase; padding: ${mm(1)}; margin-top: ${mm(1)}; }
  .circular { border-radius: 50%; }
  @media print {
    @page { margin: ${labelSize === 'A4 Sheet' ? '4mm' : '0mm'}; size: ${pageSizeCss}; }
    body { margin: 0; }
  }
</style>
</head>
<body>
<div class="labels">${rows}</div>
</body>
</html>`
}
