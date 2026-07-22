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
  const [showPrice, setShowPrice] = useState(true)

  useEffect(() => {
    if (!open || !product.barcode_value || !svgRef.current) return
    try {
      JsBarcode(svgRef.current, product.barcode_value, {
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
  }, [open, product.barcode_value])

  const handlePrint = () => {
    const labelHtml = buildLabelHtml(product, orgName, showPrice, copies)
    const win = window.open('', '_blank', 'width=600,height=400')
    if (!win) return
    win.document.write(labelHtml)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Print Barcode Label</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          <div className="rounded-lg border border-border bg-white p-3 flex flex-col items-center text-black">
            {orgName && (
              <p className="text-[10px] font-semibold text-center mb-1">{orgName}</p>
            )}
            <p className="text-xs font-bold text-center leading-tight mb-1">{product.name}</p>
            {product.barcode_value ? (
              <svg ref={svgRef} />
            ) : (
              <p className="text-[10px] text-gray-400 py-4">No barcode set</p>
            )}
            {showPrice && (
              <p className="text-sm font-bold mt-1">₹{product.price.toFixed(2)}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Copies</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                  className="rounded"
                />
                Show price
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePrint} disabled={!product.barcode_value}>
            <Printer className="h-4 w-4" />
            Print {copies > 1 ? `${copies} Labels` : 'Label'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function buildLabelHtml(product: Product, orgName: string | undefined, showPrice: boolean, copies: number): string {
  const rows = Array.from({ length: copies }, () => `
    <div class="label">
      ${orgName ? `<div class="shop">${orgName}</div>` : ''}
      <div class="name">${product.name}</div>
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
