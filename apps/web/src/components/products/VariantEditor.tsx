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
