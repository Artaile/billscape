import { useEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
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

export function BarcodeLabelDialog({ open, onOpenChange, items, orgName }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [copiesByKey, setCopiesByKey] = useState<Record<string, number>>({})
  const [showName, setShowName] = useState(true)
  const [showPrice, setShowPrice] = useState(true)

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

  const handlePrint = () => {
    const labelHtml = buildLabelHtml(checkedItems, copiesByKey, orgName, showName, showPrice)
    const win = window.open('', '_blank', 'width=600,height=400')
    if (!win) return
    win.document.write(labelHtml)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
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
      </DialogContent>
    </Dialog>
  )
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
  showName: boolean,
  showPrice: boolean,
): string {
  const rows = items.flatMap((item) => {
    const copies = copiesByKey[item.key] ?? 1
    const displayName = item.variantLabel ? `${item.name} — ${item.variantLabel}` : item.name
    return Array.from({ length: copies }, () => `
      <div class="label">
        ${orgName ? `<div class="shop">${escapeHtml(orgName)}</div>` : ''}
        ${showName ? `<div class="name">${escapeHtml(displayName)}</div>` : ''}
        ${item.barcode_value ? `<svg data-barcode="${escapeHtml(item.barcode_value)}" id="bc_${Math.random().toString(36).slice(2)}"></svg>` : ''}
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
