import { useState } from 'react'
import { Plus, RefreshCw, Trash2, Copy, Camera } from 'lucide-react'
import { splitInclusiveGST, type GSTRate } from '@billscape/core'
import { generateBarcode } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScanBarcodeDialog } from '@/components/ui/ScanBarcodeDialog'
import { cn } from '@/lib/utils'

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
  // Single GST mode shared by MRP/Retail/Purchase Price on this variant — a UI simplification
  // over having a separate toggle per price field (which tested as fiddly and duplicative in
  // brainstorming). Still written into both DB columns (sale_gst_mode, purchase_gst_mode) so a
  // future need to split them again doesn't require a migration.
  gst_mode: 'include' | 'exclude'
  qty: string
  expiry_date: string
  // Maps to product_variants.hsn_code (migration 034_variant_hsn_code.sql) — per merchant
  // request, HSN is entered per-variant here rather than only once at the parent product
  // level, since variants can legitimately carry different HSN codes.
  hsn_code: string
}

export function emptyVariantRow(defaultTaxRate: GSTRate): VariantFormRow {
  return {
    variant_name: '', barcode_value: '', sku: '', tax_rate: defaultTaxRate,
    mrp: '', sale_price: '', special_price: '', purchase_price: '', gst_mode: 'include',
    qty: '', expiry_date: '', hsn_code: '',
  }
}

function parseNum(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

// Mirrors ProductSchema.hsn_code in packages/core/src/validation/index.ts and the equivalent
// check in PurchaseFormPage.tsx — 4, 6, or 8 digits.
function hsnCodeError(value: string): string | undefined {
  if (!value) return undefined
  return /^\d{4}(\d{2}(\d{2})?)?$/.test(value) ? undefined : 'Must be 4, 6, or 8 digits'
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

export function VariantEditor({ variants, onChange, defaultTaxRate, showHsnField = true }: {
  variants: VariantFormRow[]
  onChange: (variants: VariantFormRow[]) => void
  defaultTaxRate: GSTRate
  // Same gear toggle ("HSN Code" in PurchaseFormPage's Add Item settings) that controls the
  // main non-variant Row 2's HSN field also controls this one — one switch, both places.
  // Defaults true so any other caller of VariantEditor (e.g. ProductFormPage) that doesn't
  // pass this prop keeps showing HSN, unaffected by the purchase-entry gear setting.
  showHsnField?: boolean
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

          {/* Row 1: Variant Name, Barcode, Tax %, GST — mirrors the main non-variant Row 1's
              field set and order (Product Name, Product Code, Barcode, Tax %, GST) minus the
              Product Code (variants have no parent-level code of their own, Barcode is their
              identifier) and minus SKU, which was removed here for the same reason the main
              form dropped its own separate free-text SKU field — a redundant second identifier
              nobody used. GST Mode here applies to all 3 price fields below (MRP/Retail/
              Purchase), a single shared toggle per variant rather than one per price field. */}
          <div className="grid grid-cols-[1.7fr_1.6fr_0.7fr_0.9fr] gap-1.5">
            <div>
              <label className="text-[9px] uppercase text-zinc-500">Variant Name *</label>
              <Input placeholder="e.g. 256GB · Blue" value={v.variant_name} onChange={(e) => updateRow(i, { variant_name: e.target.value })} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[9px] uppercase text-zinc-500">Barcode</label>
              <VariantBarcodeField value={v.barcode_value} onChange={(val) => updateRow(i, { barcode_value: val })} onGenerate={() => updateRow(i, { barcode_value: generateBarcode() })} />
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
                <option value="include">Include</option>
                <option value="exclude">Exclude</option>
              </select>
            </div>
          </div>

          {/* Row 2: Qty, Purchase Price, MRP, Retail Price, Expiry, HSN Code — mirrors the main
              non-variant Row 2's order (Qty first, then pricing) and its SP (Special Price)
              removal; there's no per-variant Category/Unit equivalent (both are parent-product-
              level fields, unaffected by the variant being tracked). HSN Code is gear-controlled
              (same "HSN Code" switch as the main non-variant Row 2 in PurchaseFormPage) — only
              rendered when showHsnField is on, which shrinks the grid rather than leaving a dead
              trailing cell. */}
          <div className={cn('grid gap-1.5', showHsnField ? 'grid-cols-[0.6fr_1fr_1fr_1fr_0.75fr_0.75fr]' : 'grid-cols-[0.6fr_1fr_1fr_1fr_0.75fr]')}>
            <div>
              <label className="text-[9px] uppercase text-zinc-500">Qty *</label>
              <Input type="text" inputMode="decimal" value={v.qty} onFocus={(e) => e.target.select()}
                onChange={(e) => updateRow(i, { qty: e.target.value.replace(/[^0-9.]/g, '') })} className="h-8 text-xs" />
            </div>
            <PriceField label="Purchase Price" required amount={v.purchase_price} gstMode={v.gst_mode} taxRate={v.tax_rate}
              onAmountChange={(val) => updateRow(i, { purchase_price: val })} />
            <PriceField label="MRP" amount={v.mrp} gstMode={v.gst_mode} taxRate={v.tax_rate}
              onAmountChange={(val) => updateRow(i, { mrp: val })} />
            <PriceField label="Retail Price" required amount={v.sale_price} gstMode={v.gst_mode} taxRate={v.tax_rate}
              onAmountChange={(val) => updateRow(i, { sale_price: val })} />
            <div>
              <label className="text-[9px] uppercase text-zinc-500">Expiry</label>
              <Input type="date" value={v.expiry_date} onChange={(e) => updateRow(i, { expiry_date: e.target.value })} className="h-8 text-xs" />
            </div>
            {showHsnField && (
              <div>
                <label className="text-[9px] uppercase text-zinc-500">HSN Code</label>
                <Input placeholder="e.g. 2501" value={v.hsn_code} onChange={(e) => updateRow(i, { hsn_code: e.target.value })} className="h-8 text-xs" />
                {hsnCodeError(v.hsn_code) && (
                  <p className="text-[9px] text-amber-400 mt-0.5">{hsnCodeError(v.hsn_code)}</p>
                )}
              </div>
            )}
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
