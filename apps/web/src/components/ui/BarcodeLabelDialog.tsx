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

export function BarcodeLabelDialog({ open, onOpenChange, product, orgName }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [copies, setCopies] = useState(1)
  const [showName, setShowName] = useState(true)
  const [showPrice, setShowPrice] = useState(true)

  useEffect(() => {
    if (!open || !product.barcode_value) return
    // Dialog animates in — wait for SVG to be in the DOM
    const timer = setTimeout(() => {
      if (!svgRef.current) return
      try {
        JsBarcode(svgRef.current, product.barcode_value!, {
          format: 'CODE128',
          width: 1.8,
          height: 50,
          displayValue: true,
          fontSize: 11,
          margin: 4,
          background: '#ffffff',
          lineColor: '#000000',
        })
      } catch {
        // invalid barcode value — leave svg blank
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [open, product.barcode_value])

  const handlePrint = () => {
    const labelHtml = buildLabelHtml(product, orgName, showName, showPrice, copies)
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
            Product: <span className="font-semibold text-zinc-200">{product.name}</span>
          </div>
          <div className="text-xs text-zinc-500">
            Print Mode: <span className="font-medium text-zinc-300">Thermal (58mm)</span>{' '}
            <span className="text-zinc-600">(Change in Settings → Barcode)</span>
          </div>

          <div className="space-y-1.5">
            <Label>Number of Labels</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={copies}
              onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>

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
            <div className="rounded-lg border border-border bg-white p-4 flex flex-col items-center text-black">
              {showName && (
                <p className="text-xs font-bold text-center leading-tight mb-1">{product.name}</p>
              )}
              {product.barcode_value ? (
                <svg ref={svgRef} />
              ) : (
                <p className="text-[10px] text-gray-400 py-4">No barcode set</p>
              )}
              {showPrice && (
                <p className="text-sm font-bold mt-1">₹{product.price.toFixed(2)}</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button onClick={handlePrint} disabled={!product.barcode_value}>
            <Printer className="h-4 w-4" />
            Print {copies > 1 ? `${copies} Labels` : '1 Label'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function buildLabelHtml(product: Product, orgName: string | undefined, showName: boolean, showPrice: boolean, copies: number): string {
  const rows = Array.from({ length: copies }, () => `
    <div class="label">
      ${orgName ? `<div class="shop">${orgName}</div>` : ''}
      ${showName ? `<div class="name">${product.name}</div>` : ''}
      ${product.barcode_value
        ? `<svg id="bc_${Math.random().toString(36).slice(2)}"></svg>`
        : ''
      }
      ${showPrice ? `<div class="price">&#8377;${product.price.toFixed(2)}</div>` : ''}
    </div>
  `).join('')

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
  document.querySelectorAll('svg').forEach(function(el) {
    JsBarcode(el, ${JSON.stringify(product.barcode_value ?? '')}, {
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
