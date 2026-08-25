import { useState } from 'react'
import { Plus, RefreshCw, Trash2, Copy, Camera } from 'lucide-react'
import { splitInclusiveGST, type GSTRate } from '@billscape/core'
import { generateBarcode, generateSku } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScanBarcodeDialog } from '@/components/ui/ScanBarcodeDialog'

const GST_RATES: GSTRate[] = [0, 5, 12, 18, 28]

export interface VariantFormRow {
  id?: string
  variant_name: string
  barcode_value: string
  sku: string
  tax_rate: GSTRate
  mrp: string
  sale_price: string
  special_price: string
  purchase_price: string
  // Single GST mode shared by MRP/Retail/SP/Purchase Price on this variant — a UI simplification
  // over having a separate toggle per price field (which tested as fiddly and duplicative in
  // brainstorming). Still written into both DB columns (sale_gst_mode, purchase_gst_mode) so a
  // future need to split them again doesn't require a migration.
  gst_mode: 'include' | 'exclude'
  qty: string
  expiry_date: string
}

export function emptyVariantRow(defaultTaxRate: GSTRate): VariantFormRow {
  return {
    variant_name: '', barcode_value: '', sku: '', tax_rate: defaultTaxRate,
    mrp: '', sale_price: '', special_price: '', purchase_price: '', gst_mode: 'include',
    qty: '', expiry_date: '',
  }
}

function parseNum(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function VariantBarcodeField({ value, onChange, onGenerate }: { value: string; onChange: (v: string) => void; onGenerate: () => void }) {
  const [scanOpen, setScanOpen] = useState(false)
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <Input placeholder="Scan or enter barcode" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs font-mono" />
        <button type="button" title="Scan" onClick={() => setScanOpen(true)} className="shrink-0 w-7 h-8 flex items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:text-white">
          <Camera className="h-3 w-3" />
        </button>
        <button type="button" title="Generate" onClick={onGenerate} className="shrink-0 w-7 h-8 flex items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:text-white">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      <ScanBarcodeDialog open={scanOpen} onOpenChange={setScanOpen} onScan={onChange} />
    </div>
  )
}

function PriceField({ label, required, amount, gstMode, taxRate, onAmountChange }: {
  label: string
  required?: boolean
  amount: string
  gstMode: 'include' | 'exclude'
  taxRate: GSTRate
  onAmountChange: (v: string) => void
}) {
  const amt = parseNum(amount)
  const { base, tax } = splitInclusiveGST(amt, taxRate)
  return (
    <div>
      <label className="text-[9px] uppercase text-zinc-500">{label}{required && ' *'}</label>
      <Input type="text" inputMode="decimal" value={amount} onFocus={(e) => e.target.select()}
        onChange={(e) => onAmountChange(e.target.value.replace(/[^0-9.]/g, ''))} className="h-8 text-xs" />
      <p className="text-[9px] text-zinc-500 mt-0.5 min-h-[11px]">
        {gstMode === 'include' && amt > 0 && taxRate > 0 ? `Base: ₹${base.toFixed(2)} + GST: ₹${tax.toFixed(2)}` : ''}
      </p>
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
  function duplicateRow(i: number) {
    const source = variants[i]
    const copy: VariantFormRow = {
      ...source,
      id: undefined, // a duplicate is a genuinely new variant, never the same DB row as its source
      variant_name: source.variant_name ? `${source.variant_name} (copy)` : '',
      barcode_value: '', // never duplicate a barcode — it must stay unique per variant
      sku: '',
    }
    onChange([...variants.slice(0, i + 1), copy, ...variants.slice(i + 1)])
  }
  return (
    <div className="space-y-2">
      {variants.map((v, i) => (
        <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500">VARIANT {i + 1}</span>
            <div className="flex items-center gap-1.5">
              <button type="button" title="Duplicate variant" onClick={() => duplicateRow(i)}
                className="w-6 h-6 flex items-center justify-center rounded border border-zinc-700 text-indigo-300 hover:bg-indigo-950/40 hover:border-indigo-700">
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Delete variant" onClick={() => removeRow(i)}
                className="w-6 h-6 flex items-center justify-center rounded border border-zinc-700 text-red-300 hover:bg-red-950/40 hover:border-red-700">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Row 1: Name, Barcode, SKU, Tax %, GST Mode — GST Mode here applies to all 4 price
              fields below (MRP/Retail/SP/Purchase), a single shared toggle per variant rather
              than one per price field. */}
          <div className="grid grid-cols-[1.7fr_1.6fr_1.3fr_0.55fr_0.55fr] gap-1.5">
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
              <div className="flex gap-1">
                <Input placeholder="Auto or type" value={v.sku} onChange={(e) => updateRow(i, { sku: e.target.value })} className="h-8 text-xs" />
                <button type="button" title="Generate" onClick={() => updateRow(i, { sku: generateSku() })}
                  className="shrink-0 w-7 h-8 flex items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:text-white">
                  <RefreshCw className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div>
              <label className="text-[9px] uppercase text-zinc-500">Tax %</label>
              <select value={v.tax_rate} onChange={(e) => updateRow(i, { tax_rate: Number(e.target.value) as GSTRate })}
                className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100">
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase text-zinc-500">GST</label>
              <select value={v.gst_mode} onChange={(e) => updateRow(i, { gst_mode: e.target.value as 'include' | 'exclude' })}
                className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100">
                <option value="include">Incl</option>
                <option value="exclude">Excl</option>
              </select>
            </div>
          </div>

          {/* Row 2: MRP, Retail Price, SP, Purchase Price (all equal width, each with its own
              Base+GST breakdown line) | Qty | Expiry — one grid so everything aligns. */}
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_0.6fr_0.75fr] gap-1.5">
            <PriceField label="MRP" amount={v.mrp} gstMode={v.gst_mode} taxRate={v.tax_rate}
              onAmountChange={(val) => updateRow(i, { mrp: val })} />
            <PriceField label="Retail Price" required amount={v.sale_price} gstMode={v.gst_mode} taxRate={v.tax_rate}
              onAmountChange={(val) => updateRow(i, { sale_price: val })} />
            <PriceField label="SP (Special)" amount={v.special_price} gstMode={v.gst_mode} taxRate={v.tax_rate}
              onAmountChange={(val) => updateRow(i, { special_price: val })} />
            <PriceField label="Purchase Price" required amount={v.purchase_price} gstMode={v.gst_mode} taxRate={v.tax_rate}
              onAmountChange={(val) => updateRow(i, { purchase_price: val })} />
            <div>
              <label className="text-[9px] uppercase text-zinc-500">Qty *</label>
              <Input type="text" inputMode="decimal" value={v.qty} onFocus={(e) => e.target.select()}
                onChange={(e) => updateRow(i, { qty: e.target.value.replace(/[^0-9.]/g, '') })} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[9px] uppercase text-zinc-500">Expiry</label>
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
