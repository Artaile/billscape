import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, X, Loader2, Printer, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  formatINR, toMoney, isInterState, applyOrderDiscount, computeGST,
  generateBarcode, generateSku, stateCodeFromGSTIN,
  type GSTRate, type InvoiceTotals,
} from '@billscape/core'
import { createPurchase, updatePurchase, generatePurchaseNo, getPurchaseWithItems, type PurchaseLineInput } from '@billscape/api'
import { printBarcodeLabel } from '@/lib/printBarcodeLabel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const GST_RATES: GSTRate[] = [0, 5, 12, 18, 28]

interface Supplier { id: string; name: string; phone: string | null; gstin: string | null }
interface ExistingProduct { id: string; name: string; sku: string | null; barcode_value: string | null; tax_rate: GSTRate; price: number; cost_price: number; mrp: number | null; special_price: number | null }

interface PurchaseRow {
  product_id: string | null
  is_new_product: boolean
  product_name: string
  sku: string
  barcode_value: string
  tax_rate: GSTRate
  qty: string
  unit_cost: string
  mrp: string
  price: string
  special_price: string
  update_existing_pricing: boolean
  skuManuallyEdited: boolean
  barcodeManuallyEdited: boolean
  codeError?: string
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

function emptyRow(): PurchaseRow {
  return {
    product_id: null, is_new_product: false, product_name: '',
    sku: '', barcode_value: '', tax_rate: 18, qty: '1', unit_cost: '0',
    mrp: '', price: '0', special_price: '',
    update_existing_pricing: true, skuManuallyEdited: false, barcodeManuallyEdited: false,
  }
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  return digits.length <= 5 ? digits : `${digits.slice(0, 5)} ${digits.slice(5)}`
}

export function PurchaseFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [supplierId, setSupplierId] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [purchaseType, setPurchaseType] = useState<'credit' | 'cash'>('credit')
  const [notes, setNotes] = useState('')
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)

  const [entry, setEntry] = useState<PurchaseRow>(emptyRow())
  const [entrySearch, setEntrySearch] = useState('')
  const [entryDropdownOpen, setEntryDropdownOpen] = useState(false)
  const [rows, setRows] = useState<PurchaseRow[]>([])

  const [billDiscountType, setBillDiscountType] = useState<'flat' | 'percent'>('flat')
  const [billDiscountValue, setBillDiscountValue] = useState('0')
  const [roundOffEnabled, setRoundOffEnabled] = useState(false)
  const [justSavedNewProducts, setJustSavedNewProducts] = useState<PurchaseRow[]>([])

  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const productNameRef = useRef<HTMLInputElement | null>(null)

  const { data: purchaseNoPreview } = useQuery({
    queryKey: ['purchase-no-preview', orgId],
    enabled: !!orgId && !isEdit,
    queryFn: () => generatePurchaseNo(supabase, orgId!),
  })

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['purchase-edit', id, orgId],
    enabled: isEdit && !!orgId,
    queryFn: () => getPurchaseWithItems(supabase, orgId!, id!),
  })

  useEffect(() => {
    if (existing?.data) {
      const { purchase, items } = existing.data
      setSupplierId(purchase.supplier_id ?? '')
      setInvoiceNo(purchase.invoice_no ?? '')
      setPurchaseDate(purchase.purchase_date ?? new Date().toISOString().slice(0, 10))
      setPurchaseType((purchase.purchase_type as 'credit' | 'cash') ?? 'credit')
      setNotes(purchase.notes ?? '')
      setRows(
        items.map((it) => {
          const product = (it as unknown as { products?: { sku?: string; barcode_value?: string; price?: number; mrp?: number; special_price?: number } }).products
          return {
            product_id: it.product_id,
            is_new_product: false,
            product_name: it.product_name,
            sku: product?.sku ?? '',
            barcode_value: product?.barcode_value ?? '',
            tax_rate: (it.tax_rate ?? 0) as GSTRate,
            qty: String(it.qty),
            unit_cost: String(it.unit_cost),
            mrp: product?.mrp != null ? String(product.mrp) : '',
            price: product?.price != null ? String(product.price) : '0',
            special_price: product?.special_price != null ? String(product.special_price) : '',
            update_existing_pricing: true,
            skuManuallyEdited: true, barcodeManuallyEdited: true,
          }
        }),
      )
    }
  }, [existing])

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name, phone, gstin').eq('organization_id', orgId!).order('name')
      return (data ?? []) as Supplier[]
    },
  })

  const { data: products } = useQuery({
    queryKey: ['products-all', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, barcode_value, tax_rate, price, cost_price, mrp, special_price')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .order('name')
      return (data ?? []) as ExistingProduct[]
    },
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setEntryDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectedSupplier = suppliers?.find((s) => s.id === supplierId)
  const gstContext = {
    shopStateCode: org?.state_code ?? 'TN',
    customerStateCode: stateCodeFromGSTIN(selectedSupplier?.gstin),
  }
  const interstate = isInterState(gstContext)

  const totals: InvoiceTotals = useMemo(() => {
    const cartLike = rows
      .filter((r) => parseNum(r.qty) > 0)
      .map((r, i) => ({
        product_id: String(i), product_name: r.product_name, tax_rate: r.tax_rate,
        unit_price: parseNum(r.unit_cost), qty: parseNum(r.qty), discount_pct: 0,
      }))
    const base = cartLike.length
      ? computeGST(gstContext, cartLike)
      : emptyTotals(interstate)
    const withDiscount = parseNum(billDiscountValue) > 0
      ? applyOrderDiscount(base, billDiscountType, parseNum(billDiscountValue))
      : base
    return withDiscount
  }, [rows, gstContext.shopStateCode, gstContext.customerStateCode, billDiscountType, billDiscountValue])

  const roundOff = roundOffEnabled ? toMoney(Math.round(totals.net_payable) - totals.net_payable) : 0
  const grandTotal = toMoney(totals.net_payable + roundOff)

  // ── Entry row: product search / new-product detection ──────────────────

  function getFiltered(search: string): ExistingProduct[] {
    if (!products) return []
    if (!search.trim()) return []
    const lower = search.toLowerCase()
    return products.filter((p) => p.name.toLowerCase().includes(lower)).slice(0, 8)
  }

  function selectExistingProduct(p: ExistingProduct) {
    setEntry({
      product_id: p.id, is_new_product: false, product_name: p.name,
      sku: p.sku ?? '', barcode_value: p.barcode_value ?? '',
      tax_rate: p.tax_rate, qty: '1', unit_cost: String(p.cost_price),
      mrp: p.mrp != null ? String(p.mrp) : '', price: String(p.price),
      special_price: p.special_price != null ? String(p.special_price) : '',
      update_existing_pricing: true, skuManuallyEdited: true, barcodeManuallyEdited: true,
    })
    setEntrySearch(p.name)
    setEntryDropdownOpen(false)
  }

  function handleEntryNameChange(val: string) {
    setEntrySearch(val)
    setEntryDropdownOpen(true)
    const exactMatch = products?.find((p) => p.name.toLowerCase() === val.toLowerCase())
    if (exactMatch) {
      selectExistingProduct(exactMatch)
      return
    }
    setEntry((prev) => ({
      ...prev, product_id: null, is_new_product: true, product_name: val,
      sku: prev.skuManuallyEdited ? prev.sku : (val ? generateSku() : ''),
      barcode_value: prev.barcodeManuallyEdited ? prev.barcode_value : (val ? generateBarcode() : ''),
    }))
  }

  const codeCheckTimer = useRef<ReturnType<typeof setTimeout>>()
  function checkCodeUnique(field: 'sku' | 'barcode_value', value: string, setError: (msg: string | undefined) => void) {
    clearTimeout(codeCheckTimer.current)
    codeCheckTimer.current = setTimeout(async () => {
      if (!value.trim() || !orgId) { setError(undefined); return }
      const { data } = await supabase.from('products').select('id').eq('organization_id', orgId).eq(field, value).maybeSingle()
      setError(data ? `This ${field === 'sku' ? 'code' : 'barcode'} already exists` : undefined)
    }, 400)
  }

  function canAddEntry(): boolean {
    if (!entry.product_name.trim() || parseNum(entry.qty) <= 0) return false
    if (entry.is_new_product && (!entry.sku.trim() || !entry.barcode_value.trim())) return false
    return true
  }

  function addEntryToGrid() {
    if (!canAddEntry()) {
      toast.error('Incomplete row', entry.is_new_product ? 'Product code and barcode are required for a new product' : 'Enter product name and qty')
      return
    }
    setRows((prev) => [...prev, entry])
    setEntry(emptyRow())
    setEntrySearch('')
    productNameRef.current?.focus()
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleAddSupplier() {
    if (!newSupplierName.trim()) return
    const rawDigits = newSupplierPhone.replace(/\D/g, '')
    if (rawDigits.length > 0 && rawDigits.length < 10) { toast.error('Invalid phone', 'Enter a 10-digit India mobile number'); return }
    setSavingSupplier(true)
    const { data, error } = await supabase.from('suppliers').insert({ organization_id: orgId!, name: newSupplierName.trim(), phone: rawDigits || null }).select('id').single()
    setSavingSupplier(false)
    if (error) { toast.error('Failed to add supplier'); return }
    queryClient.invalidateQueries({ queryKey: ['suppliers', orgId] })
    setSupplierId(data.id)
    setShowAddSupplier(false)
    setNewSupplierName('')
    setNewSupplierPhone('')
    toast.success('Supplier added')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !orgId) throw new Error('Not logged in')
      if (rows.length === 0) throw new Error('Add at least one item')

      const items: PurchaseLineInput[] = rows.map((r) => ({
        product_id: r.product_id,
        is_new_product: r.is_new_product,
        product_name: r.product_name.trim(),
        sku: r.sku.trim() || undefined,
        barcode_value: r.barcode_value.trim() || undefined,
        tax_rate: r.tax_rate,
        qty: parseNum(r.qty),
        unit_cost: parseNum(r.unit_cost),
        mrp: r.mrp ? parseNum(r.mrp) : undefined,
        price: parseNum(r.price),
        special_price: r.special_price ? parseNum(r.special_price) : undefined,
        update_existing_pricing: r.update_existing_pricing,
      }))

      if (isEdit && id) {
        const result = await updatePurchase(supabase, id, {
          organization_id: orgId,
          supplier_id: supplierId || null,
          invoice_no: invoiceNo.trim() || undefined,
          purchase_date: purchaseDate,
          purchase_type: purchaseType,
          notes: notes.trim() || undefined,
          items,
          gst_context: gstContext,
          bill_discount_type: parseNum(billDiscountValue) > 0 ? billDiscountType : undefined,
          bill_discount_value: parseNum(billDiscountValue) > 0 ? parseNum(billDiscountValue) : undefined,
          round_off: roundOff,
          created_by: user.id,
        })
        if (result.error) throw new Error(result.error.message)
        return result.data!
      }

      const purchaseNo = purchaseNoPreview ?? (await generatePurchaseNo(supabase, orgId))

      const result = await createPurchase(supabase, {
        organization_id: orgId,
        supplier_id: supplierId || null,
        invoice_no: invoiceNo.trim() || undefined,
        purchase_no: purchaseNo,
        purchase_date: purchaseDate,
        purchase_type: purchaseType,
        notes: notes.trim() || undefined,
        items,
        gst_context: gstContext,
        bill_discount_type: parseNum(billDiscountValue) > 0 ? billDiscountType : undefined,
        bill_discount_value: parseNum(billDiscountValue) > 0 ? parseNum(billDiscountValue) : undefined,
        round_off: roundOff,
        created_by: user.id,
      })

      if (result.error) throw new Error(result.error.message)
      return result.data!
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchases', orgId] })
      queryClient.invalidateQueries({ queryKey: ['products', orgId] })
      queryClient.invalidateQueries({ queryKey: ['products-all', orgId] })
      queryClient.invalidateQueries({ queryKey: ['inventory', orgId] })
      toast.success(`Purchase saved — ${data.purchase.purchase_no}`)
      const newProductRows = rows.filter((r) => r.is_new_product)
      if (newProductRows.length > 0) {
        setJustSavedNewProducts(newProductRows)
      } else {
        navigate('/purchases')
      }
    },
    onError: (err: Error) => toast.error('Failed to save purchase', err.message),
  })

  function handlePrintNewProductLabels() {
    for (const r of justSavedNewProducts) {
      printBarcodeLabel(r.product_name, r.barcode_value, parseNum(r.price))
    }
  }

  const filtered = getFiltered(entrySearch)

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/purchases')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-white">{isEdit ? 'Edit Purchase' : 'New Purchase'}</h1>
          {(purchaseNoPreview || existing?.data?.purchase.purchase_no) && (
            <p className="text-xs font-mono text-indigo-300 mt-0.5">
              {existing?.data?.purchase.purchase_no ?? purchaseNoPreview}
            </p>
          )}
        </div>
      </div>

      {loadingExisting ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-5">
          {/* Header card */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <div className="flex gap-2">
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="flex-1 h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select supplier (optional)</option>
                    {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <Button type="button" variant="outline" size="sm" className="h-9 px-3"
                    onClick={() => setShowAddSupplier(!showAddSupplier)} title="Add new supplier">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {selectedSupplier?.gstin && (
                  <span className={cn(
                    'inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full border',
                    interstate ? 'border-amber-700 text-amber-400 bg-amber-950/30' : 'border-emerald-700 text-emerald-400 bg-emerald-950/30',
                  )}>
                    {interstate ? 'Interstate (IGST)' : 'Intrastate (CGST+SGST)'}
                  </span>
                )}

                {showAddSupplier && (
                  <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-800/60 p-3 space-y-2">
                    <p className="text-xs font-medium text-zinc-400">Quick-add supplier</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Name *</Label>
                        <Input placeholder="Supplier name" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Phone</Label>
                        <Input
                          placeholder="98765 43210" inputMode="numeric" value={newSupplierPhone}
                          onChange={(e) => setNewSupplierPhone(formatPhone(e.target.value))}
                          className="h-8 text-sm" maxLength={11}
                        />
                        {newSupplierPhone.replace(/\D/g, '').length > 0 && newSupplierPhone.replace(/\D/g, '').length < 10 && (
                          <p className="text-[11px] text-amber-400">10-digit number required</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => { setShowAddSupplier(false); setNewSupplierName(''); setNewSupplierPhone('') }}>Cancel</Button>
                      <Button type="button" size="sm" className="h-7 text-xs" disabled={!newSupplierName.trim() || savingSupplier} onClick={handleAddSupplier}>
                        {savingSupplier ? 'Adding...' : 'Add'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Invoice No</Label>
                  <Input placeholder="INV-001 (optional)" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Purchase Type</Label>
                  <div className="flex gap-2">
                    {(['credit', 'cash'] as const).map((t) => (
                      <button key={t} type="button" onClick={() => setPurchaseType(t)}
                        className={cn('px-3 py-1.5 rounded-md text-sm font-medium border transition-all capitalize',
                          purchaseType === t ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-600')}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Entry strip */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-300">Add Item</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 items-end">
              <div className="col-span-2 lg:col-span-2 space-y-1 relative" ref={dropdownRef}>
                <Label className="text-xs">Product</Label>
                <Input
                  ref={productNameRef}
                  placeholder="Search or type new product"
                  value={entrySearch}
                  onChange={(e) => handleEntryNameChange(e.target.value)}
                  onFocus={() => setEntryDropdownOpen(true)}
                  className="h-8 text-sm"
                />
                {entry.product_name && (
                  <span className={cn('absolute -top-1 right-0 text-[10px] px-1.5 py-0.5 rounded-full',
                    entry.is_new_product ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-700' : 'bg-blue-600/20 text-blue-300 border border-blue-700')}>
                    {entry.is_new_product ? 'New' : 'Existing'}
                  </span>
                )}
                {entryDropdownOpen && filtered.length > 0 && (
                  <div className="absolute top-full left-0 z-50 mt-0.5 w-full rounded-md border border-zinc-700 bg-zinc-900 shadow-xl max-h-48 overflow-y-auto">
                    {filtered.map((p) => (
                      <button key={p.id} type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-zinc-800 text-zinc-200"
                        onMouseDown={(e) => { e.preventDefault(); selectExistingProduct(p) }}>
                        <span>{p.name}</span>
                        <span className="text-zinc-500 text-xs">{formatINR(p.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Code</Label>
                <div className="flex gap-1">
                  <Input
                    value={entry.sku}
                    disabled={!entry.is_new_product}
                    onChange={(e) => { setEntry((p) => ({ ...p, sku: e.target.value, skuManuallyEdited: true })); checkCodeUnique('sku', e.target.value, (msg) => setEntry((p) => ({ ...p, codeError: msg }))) }}
                    className="h-8 text-xs font-mono"
                  />
                  {entry.is_new_product && (
                    <button type="button" title="Regenerate" onClick={() => setEntry((p) => ({ ...p, sku: generateSku(), skuManuallyEdited: false }))} className="shrink-0 p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white">
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Barcode</Label>
                <div className="flex gap-1">
                  <Input
                    value={entry.barcode_value}
                    disabled={!entry.is_new_product}
                    onChange={(e) => { setEntry((p) => ({ ...p, barcode_value: e.target.value, barcodeManuallyEdited: true })); checkCodeUnique('barcode_value', e.target.value, (msg) => setEntry((p) => ({ ...p, codeError: msg }))) }}
                    className="h-8 text-xs font-mono"
                  />
                  {entry.is_new_product && (
                    <button type="button" title="Regenerate" onClick={() => setEntry((p) => ({ ...p, barcode_value: generateBarcode(), barcodeManuallyEdited: false }))} className="shrink-0 p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white">
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">GST %</Label>
                <select
                  value={entry.tax_rate}
                  onChange={(e) => setEntry((p) => ({ ...p, tax_rate: Number(e.target.value) as GSTRate }))}
                  className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
                >
                  {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Purchase Rate</Label>
                <Input type="text" inputMode="decimal" value={entry.unit_cost} onFocus={(e) => e.target.select()}
                  onChange={(e) => setEntry((p) => ({ ...p, unit_cost: e.target.value.replace(/[^0-9.]/g, '') || '0' }))} className="h-8 text-sm" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input type="text" inputMode="numeric" value={entry.qty} onFocus={(e) => e.target.select()}
                  onChange={(e) => setEntry((p) => ({ ...p, qty: e.target.value.replace(/[^0-9]/g, '') || '0' }))} className="h-8 text-sm text-center" />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-xs">MRP</Label>
                <Input type="text" inputMode="decimal" value={entry.mrp} onFocus={(e) => e.target.select()}
                  onChange={(e) => setEntry((p) => ({ ...p, mrp: e.target.value.replace(/[^0-9.]/g, '') }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Retail Price</Label>
                <Input type="text" inputMode="decimal" value={entry.price} onFocus={(e) => e.target.select()}
                  onChange={(e) => setEntry((p) => ({ ...p, price: e.target.value.replace(/[^0-9.]/g, '') || '0' }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">SP (Special Price)</Label>
                <Input type="text" inputMode="decimal" value={entry.special_price} onFocus={(e) => e.target.select()}
                  onChange={(e) => setEntry((p) => ({ ...p, special_price: e.target.value.replace(/[^0-9.]/g, '') }))} className="h-8 text-sm" />
              </div>
              <div className="flex items-end">
                <Button type="button" size="sm" className="h-8 w-full" onClick={addEntryToGrid}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntryToGrid() } }}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add to List
                </Button>
              </div>
            </div>
            {entry.codeError && <p className="text-xs text-red-400">{entry.codeError}</p>}
            {!entry.is_new_product && entry.product_id && (
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={entry.update_existing_pricing} onChange={(e) => setEntry((p) => ({ ...p, update_existing_pricing: e.target.checked }))} />
                Update this product's cost/price/GST to the values above
              </label>
            )}
          </div>

          {/* Items table */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">GST%</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead className="text-right">Retail</TableHead>
                  <TableHead className="text-right">SP</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[5%]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center text-zinc-500 py-8">No items added yet</TableCell></TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs text-zinc-400">{r.sku}</TableCell>
                    <TableCell className="text-sm text-zinc-200">
                      {r.product_name}
                      <span className={cn('ml-2 text-[10px] px-1.5 py-0.5 rounded-full', r.is_new_product ? 'bg-indigo-600/20 text-indigo-300' : 'bg-blue-600/20 text-blue-300')}>
                        {r.is_new_product ? 'New' : 'Existing'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm text-zinc-300">{formatINR(parseNum(r.unit_cost))}</TableCell>
                    <TableCell className="text-right text-sm text-zinc-400">{r.tax_rate}%</TableCell>
                    <TableCell className="text-right text-sm text-zinc-300">{parseNum(r.qty)}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400">{r.barcode_value}</TableCell>
                    <TableCell className="text-right text-sm text-zinc-400">{r.mrp ? formatINR(parseNum(r.mrp)) : '—'}</TableCell>
                    <TableCell className="text-right text-sm text-zinc-300">{formatINR(parseNum(r.price))}</TableCell>
                    <TableCell className="text-right text-sm text-zinc-400">{r.special_price ? formatINR(parseNum(r.special_price)) : '—'}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-white">{formatINR(toMoney(parseNum(r.unit_cost) * parseNum(r.qty)))}</TableCell>
                    <TableCell>
                      <button type="button" onClick={() => removeRow(i)} className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Footer totals */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-zinc-500">Taxable Amount</span><p className="text-zinc-200 font-medium">{formatINR(totals.taxable_amount)}</p></div>
              {interstate ? (
                <div><span className="text-zinc-500">IGST</span><p className="text-zinc-200 font-medium">{formatINR(totals.igst_total)}</p></div>
              ) : (
                <>
                  <div><span className="text-zinc-500">CGST</span><p className="text-zinc-200 font-medium">{formatINR(totals.cgst_total)}</p></div>
                  <div><span className="text-zinc-500">SGST</span><p className="text-zinc-200 font-medium">{formatINR(totals.sgst_total)}</p></div>
                </>
              )}
              <div><span className="text-zinc-500">Tax Total</span><p className="text-zinc-200 font-medium">{formatINR(totals.tax_total)}</p></div>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Bill Discount</Label>
                <select value={billDiscountType} onChange={(e) => setBillDiscountType(e.target.value as 'flat' | 'percent')}
                  className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100">
                  <option value="flat">₹</option>
                  <option value="percent">%</option>
                </select>
                <Input type="text" inputMode="decimal" value={billDiscountValue} onFocus={(e) => e.target.select()}
                  onChange={(e) => setBillDiscountValue(e.target.value.replace(/[^0-9.]/g, '') || '0')} className="h-8 w-24 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={roundOffEnabled} onChange={(e) => setRoundOffEnabled(e.target.checked)} />
                Round Off
              </label>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Total Bill Amount</span>
              <span className="text-xl font-bold text-white">{formatINR(grandTotal)}</span>
            </div>
          </div>

          {justSavedNewProducts.length > 0 ? (
            <div className="rounded-lg border border-indigo-700 bg-indigo-950/30 p-4 flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-200">
                Purchase saved. {justSavedNewProducts.length} new product{justSavedNewProducts.length > 1 ? 's' : ''} created — print barcode labels now?
              </p>
              <div className="flex gap-2 shrink-0">
                <Button type="button" variant="outline" size="sm" onClick={handlePrintNewProductLabels}>
                  <Printer className="h-3.5 w-3.5 mr-1" />Print Labels
                </Button>
                <Button type="button" size="sm" onClick={() => navigate('/purchases')}>Continue</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => navigate('/purchases')}>Cancel</Button>
              <Button type="button" className="flex-1" disabled={saveMutation.isPending || rows.length === 0} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Purchase'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function emptyTotals(interstate: boolean): InvoiceTotals {
  return {
    subtotal: 0, discount_total: 0, taxable_amount: 0, tax_breakup: [],
    cgst_total: 0, sgst_total: 0, igst_total: 0, tax_total: 0, grand_total: 0,
    is_interstate: interstate, order_discount_amount: 0, net_payable: 0,
  }
}
