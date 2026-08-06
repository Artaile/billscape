import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, X, Pencil, Loader2, Printer, RefreshCw, Truck, Package, ListChecks, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  formatINR, toMoney, isInterState, applyOrderDiscount, computeGST,
  generateBarcode, stateCodeFromGSTIN,
  type GSTRate, type InvoiceTotals,
} from '@billscape/core'
import { createPurchase, updatePurchase, generatePurchaseNo, generateProductCode, getPurchaseWithItems, type PurchaseLineInput } from '@billscape/api'
import { printBarcodeLabel } from '@/lib/printBarcodeLabel'
import { SupplierFormDialog, type SupplierOption } from '@/components/suppliers/SupplierFormDialog'
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

// Shape handed off by the CSV Import flow (PurchasesPage.tsx) via navigate(..., { state }) —
// just the raw parsed columns; matching against existing products and filling in
// sku/barcode/tax_rate/mrp/price happens here once the products list has loaded.
export interface ImportedPurchaseRow {
  product_name: string
  qty: string
  unit_cost: string
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


export function PurchaseFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const importedRows = (location.state as { importedRows?: ImportedPurchaseRow[]; importSupplierId?: string } | null)?.importedRows
  const importSupplierIdFromState = (location.state as { importSupplierId?: string } | null)?.importSupplierId
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [supplierId, setSupplierId] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [purchaseType, setPurchaseType] = useState<'credit' | 'cash'>('credit')
  const [notes, setNotes] = useState('')
  const [showAddSupplier, setShowAddSupplier] = useState(false)

  const [entry, setEntry] = useState<PurchaseRow>(emptyRow())
  const [entrySearch, setEntrySearch] = useState('')
  const [entryDropdownOpen, setEntryDropdownOpen] = useState(false)
  const [rows, setRows] = useState<PurchaseRow[]>([])

  const [billDiscountType, setBillDiscountType] = useState<'flat' | 'percent'>('flat')
  const [billDiscountValue, setBillDiscountValue] = useState('0')
  const [roundOffEnabled, setRoundOffEnabled] = useState(false)
  const [justSavedNewProducts, setJustSavedNewProducts] = useState<PurchaseRow[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const productNameRef = useRef<HTMLInputElement | null>(null)

  const { data: purchaseNoPreview } = useQuery({
    queryKey: ['purchase-no-preview', orgId],
    enabled: !!orgId && !isEdit,
    queryFn: () => generatePurchaseNo(supabase, orgId!),
  })

  // Sequential product code (PC0001, PC0002...) — pre-fetch the next available number once,
  // then advance a local counter as new-product rows are added within this session so multiple
  // rows in one purchase get distinct codes without re-querying the DB (products aren't
  // committed until Save). Enabled even in edit mode since edits can add new-product rows too.
  const { data: nextProductCodePreview } = useQuery({
    queryKey: ['next-product-code', orgId],
    enabled: !!orgId,
    queryFn: () => generateProductCode(supabase, orgId!),
  })
  const [productCodeCounter, setProductCodeCounter] = useState<number | null>(null)
  useEffect(() => {
    if (nextProductCodePreview && productCodeCounter === null) {
      const n = parseInt(nextProductCodePreview.replace(/^PC/, ''), 10)
      setProductCodeCounter(isNaN(n) ? 1 : n)
    }
  }, [nextProductCodePreview, productCodeCounter])

  function nextProductCode(): string {
    const n = productCodeCounter ?? 1
    return `PC${String(n).padStart(4, '0')}`
  }

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

  // Prefills the grid from a CSV Import CSV hand-off (see PurchasesPage.tsx) — runs once
  // products has loaded so each row can be matched by exact name to an existing product
  // (carrying over its GST/MRP/retail/SP/code/barcode); unmatched names become new-product
  // rows with an auto-generated code + barcode, same as typing a new name in the Add Item form.
  const importConsumedRef = useRef(false)
  useEffect(() => {
    if (importConsumedRef.current) return
    if (!importedRows || importedRows.length === 0) return
    if (!products) return
    importConsumedRef.current = true

    let counter = productCodeCounter ?? 1
    const newRows: PurchaseRow[] = importedRows.map((imp) => {
      const match = products.find((p) => p.name.toLowerCase() === imp.product_name.trim().toLowerCase())
      if (match) {
        return {
          product_id: match.id, is_new_product: false, product_name: match.name,
          sku: match.sku ?? '', barcode_value: match.barcode_value ?? '',
          tax_rate: match.tax_rate, qty: imp.qty, unit_cost: imp.unit_cost || String(match.cost_price),
          mrp: match.mrp != null ? String(match.mrp) : '', price: String(match.price),
          special_price: match.special_price != null ? String(match.special_price) : '',
          update_existing_pricing: true, skuManuallyEdited: true, barcodeManuallyEdited: true,
        }
      }
      const sku = `PC${String(counter).padStart(4, '0')}`
      counter += 1
      return {
        product_id: null, is_new_product: true, product_name: imp.product_name.trim(),
        sku, barcode_value: generateBarcode(),
        tax_rate: 18, qty: imp.qty, unit_cost: imp.unit_cost,
        mrp: '', price: imp.unit_cost, special_price: '',
        update_existing_pricing: true, skuManuallyEdited: false, barcodeManuallyEdited: false,
      }
    })
    setRows(newRows)
    setProductCodeCounter(counter)
    if (importSupplierIdFromState) setSupplierId(importSupplierIdFromState)
    toast.success(`${newRows.length} item(s) imported from CSV`, 'Review GST, MRP and pricing before saving')
    navigate(location.pathname, { replace: true, state: null })
  }, [importedRows, products, productCodeCounter, importSupplierIdFromState, navigate, location.pathname])

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
      sku: prev.skuManuallyEdited ? prev.sku : (val ? nextProductCode() : ''),
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
    if (entry.is_new_product && !entry.skuManuallyEdited && entry.sku === nextProductCode()) {
      setProductCodeCounter((n) => (n ?? 1) + 1)
    }
    if (editingIndex !== null) {
      setRows((prev) => prev.map((r, i) => (i === editingIndex ? entry : r)))
      setEditingIndex(null)
    } else {
      setRows((prev) => [...prev, entry])
    }
    setEntry(emptyRow())
    setEntrySearch('')
    productNameRef.current?.focus()
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
    if (editingIndex === index) setEditingIndex(null)
  }

  function editRow(index: number) {
    setEntry({ ...rows[index] })
    setEntrySearch(rows[index].product_name)
    setEditingIndex(index)
    productNameRef.current?.focus()
  }

  function cancelEdit() {
    setEntry(emptyRow())
    setEntrySearch('')
    setEditingIndex(null)
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
    <div className="p-4 lg:p-6 max-w-[1800px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
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
        {rows.length > 0 && !loadingExisting && (
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2">
            <span className="text-xs text-zinc-500">{rows.length} item{rows.length > 1 ? 's' : ''} · Total</span>
            <span className="text-base font-bold text-white">{formatINR(grandTotal)}</span>
          </div>
        )}
      </div>

      {loadingExisting ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-5">
          {/* Header card */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <Truck className="h-4 w-4 text-indigo-400" />Purchase Details
            </h2>
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
                    onClick={() => setShowAddSupplier(true)} title="Add new supplier">
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
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Two-column body: item entry + table on the left, bill summary sticky on the right */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5">
            <div className="space-y-5 min-w-0">
              {/* Entry strip */}
              <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                    <Package className="h-4 w-4 text-indigo-400" />{editingIndex !== null ? 'Edit Item' : 'Add Item'}
                  </h2>
                  {editingIndex !== null && (
                    <button type="button" onClick={cancelEdit} className="text-xs text-zinc-500 hover:text-zinc-300">
                      Cancel edit
                    </button>
                  )}
                </div>
                {/* Row 1: Product name (full width) */}
                <div className="space-y-1 relative" ref={dropdownRef}>
                  <Label className="text-xs">Product</Label>
                  <Input
                    ref={productNameRef}
                    placeholder="Search or type new product"
                    value={entrySearch}
                    onChange={(e) => handleEntryNameChange(e.target.value)}
                    onFocus={() => setEntryDropdownOpen(true)}
                    className="h-9 text-sm"
                  />
                  {entry.product_name && (
                    <span className={cn('absolute right-2 top-[26px] text-[10px] px-1.5 py-0.5 rounded-full',
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

                {/* Row 2: Code, Barcode, GST%, Rate, Qty */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Product Code</Label>
                    <div className="flex gap-1">
                      <Input
                        value={entry.sku}
                        disabled={!entry.is_new_product}
                        onChange={(e) => { setEntry((p) => ({ ...p, sku: e.target.value, skuManuallyEdited: true })); checkCodeUnique('sku', e.target.value, (msg) => setEntry((p) => ({ ...p, codeError: msg }))) }}
                        className="h-9 text-xs font-mono"
                      />
                      {entry.is_new_product && (
                        <button type="button" title="Regenerate" onClick={() => setEntry((p) => ({ ...p, sku: nextProductCode(), skuManuallyEdited: false }))} className="shrink-0 p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white">
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
                        className="h-9 text-xs font-mono"
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
                      className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
                    >
                      {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Purchase Rate</Label>
                    <Input type="text" inputMode="decimal" value={entry.unit_cost} onFocus={(e) => e.target.select()}
                      onChange={(e) => setEntry((p) => ({ ...p, unit_cost: e.target.value.replace(/[^0-9.]/g, '') || '0' }))} className="h-9 text-sm" />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Qty</Label>
                    <Input type="text" inputMode="numeric" value={entry.qty} onFocus={(e) => e.target.select()}
                      onChange={(e) => setEntry((p) => ({ ...p, qty: e.target.value.replace(/[^0-9]/g, '') || '0' }))} className="h-9 text-sm text-center" />
                  </div>
                </div>

                <Separator />

                {/* Row 3: MRP, Retail, SP, Add button */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">MRP</Label>
                    <Input type="text" inputMode="decimal" value={entry.mrp} onFocus={(e) => e.target.select()}
                      onChange={(e) => setEntry((p) => ({ ...p, mrp: e.target.value.replace(/[^0-9.]/g, '') }))} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Retail Price</Label>
                    <Input type="text" inputMode="decimal" value={entry.price} onFocus={(e) => e.target.select()}
                      onChange={(e) => setEntry((p) => ({ ...p, price: e.target.value.replace(/[^0-9.]/g, '') || '0' }))} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">SP (Special)</Label>
                    <Input type="text" inputMode="decimal" value={entry.special_price} onFocus={(e) => e.target.select()}
                      onChange={(e) => setEntry((p) => ({ ...p, special_price: e.target.value.replace(/[^0-9.]/g, '') }))} className="h-9 text-sm" />
                  </div>
                  <Button type="button" size="sm" className="h-9 w-full" onClick={addEntryToGrid}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntryToGrid() } }}>
                    {editingIndex !== null ? (
                      <><Pencil className="h-3.5 w-3.5 mr-1" />Update Item</>
                    ) : (
                      <><Plus className="h-3.5 w-3.5 mr-1" />Add to List</>
                    )}
                  </Button>
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
                <div className="px-5 pt-4 pb-1 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                    <ListChecks className="h-4 w-4 text-indigo-400" />Items ({rows.length})
                  </h2>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                <Table className="min-w-[900px]">
                  <TableHeader className="sticky top-0 z-10 bg-zinc-900">
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Product Code</TableHead>
                      <TableHead className="whitespace-nowrap">Product</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Rate</TableHead>
                      <TableHead className="text-right whitespace-nowrap">GST%</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Qty</TableHead>
                      <TableHead className="whitespace-nowrap">Barcode</TableHead>
                      <TableHead className="text-right whitespace-nowrap">MRP</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Retail</TableHead>
                      <TableHead className="text-right whitespace-nowrap">SP</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                      <TableHead className="w-[5%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow><TableCell colSpan={11} className="text-center text-zinc-500 py-8">No items added yet</TableCell></TableRow>
                    ) : rows.map((r, i) => (
                      <TableRow key={i} className={cn('hover:bg-zinc-800/40 transition-colors', editingIndex === i ? 'bg-indigo-950/30' : i % 2 === 1 && 'bg-zinc-900/30')}>
                        <TableCell className="font-mono text-xs text-zinc-400 whitespace-nowrap">{r.sku}</TableCell>
                        <TableCell className="text-sm text-zinc-200 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span>{r.product_name}</span>
                            <span className={cn('shrink-0 text-[10px] px-1.5 py-0.5 rounded-full', r.is_new_product ? 'bg-indigo-600/20 text-indigo-300' : 'bg-blue-600/20 text-blue-300')}>
                              {r.is_new_product ? 'New' : 'Existing'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm text-zinc-300 whitespace-nowrap">{formatINR(parseNum(r.unit_cost))}</TableCell>
                        <TableCell className="text-right text-sm text-zinc-400 whitespace-nowrap">{r.tax_rate}%</TableCell>
                        <TableCell className="text-right text-sm text-zinc-300 whitespace-nowrap">{parseNum(r.qty)}</TableCell>
                        <TableCell className="font-mono text-xs text-zinc-400 whitespace-nowrap">{r.barcode_value}</TableCell>
                        <TableCell className="text-right text-sm text-zinc-400 whitespace-nowrap">{r.mrp ? formatINR(parseNum(r.mrp)) : '—'}</TableCell>
                        <TableCell className="text-right text-sm text-zinc-300 whitespace-nowrap">{formatINR(parseNum(r.price))}</TableCell>
                        <TableCell className="text-right text-sm text-zinc-400 whitespace-nowrap">{r.special_price ? formatINR(parseNum(r.special_price)) : '—'}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-white whitespace-nowrap">{formatINR(toMoney(parseNum(r.unit_cost) * parseNum(r.qty)))}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => editRow(i)} className="p-1 rounded text-zinc-600 hover:text-indigo-400 hover:bg-indigo-900/20 transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => removeRow(i)} className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>
            </div>

            {/* Right column: sticky bill summary + actions */}
            <div className="space-y-5 lg:sticky lg:top-4">
              <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                  <Receipt className="h-4 w-4 text-indigo-400" />Bill Summary
                </h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-zinc-500">Taxable Amount</span><span className="text-zinc-200 font-medium">{formatINR(totals.taxable_amount)}</span></div>
                  {interstate ? (
                    <div className="flex justify-between"><span className="text-zinc-500">IGST</span><span className="text-zinc-200 font-medium">{formatINR(totals.igst_total)}</span></div>
                  ) : (
                    <>
                      <div className="flex justify-between"><span className="text-zinc-500">CGST</span><span className="text-zinc-200 font-medium">{formatINR(totals.cgst_total)}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">SGST</span><span className="text-zinc-200 font-medium">{formatINR(totals.sgst_total)}</span></div>
                    </>
                  )}
                  <div className="flex justify-between"><span className="text-zinc-500">Tax Total</span><span className="text-zinc-200 font-medium">{formatINR(totals.tax_total)}</span></div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">Bill Discount</Label>
                    <div className="flex items-center gap-1">
                      <select value={billDiscountType} onChange={(e) => setBillDiscountType(e.target.value as 'flat' | 'percent')}
                        className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100">
                        <option value="flat">₹</option>
                        <option value="percent">%</option>
                      </select>
                      <Input type="text" inputMode="decimal" value={billDiscountValue} onFocus={(e) => e.target.select()}
                        onChange={(e) => setBillDiscountValue(e.target.value.replace(/[^0-9.]/g, '') || '0')} className="h-8 w-20 text-sm" />
                    </div>
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
                <div className="rounded-lg border border-indigo-700 bg-indigo-950/30 p-4 space-y-3">
                  <p className="text-sm text-zinc-200">
                    Purchase saved. {justSavedNewProducts.length} new product{justSavedNewProducts.length > 1 ? 's' : ''} created — print barcode labels now?
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="flex-1" onClick={handlePrintNewProductLabels}>
                      <Printer className="h-3.5 w-3.5 mr-1" />Print Labels
                    </Button>
                    <Button type="button" size="sm" className="flex-1" onClick={() => navigate('/purchases')}>Continue</Button>
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
          </div>
        </div>
      )}

      <SupplierFormDialog
        open={showAddSupplier}
        onOpenChange={setShowAddSupplier}
        orgId={orgId ?? ''}
        onSaved={(supplier: SupplierOption) => {
          queryClient.invalidateQueries({ queryKey: ['suppliers', orgId] })
          setSupplierId(supplier.id)
        }}
      />
    </div>
  )
}

function emptyTotals(interstate: boolean): InvoiceTotals {
  return {
    subtotal: 0, discount_total: 0, taxable_amount: 0, tax_breakup: [],
    cgst_total: 0, sgst_total: 0, igst_total: 0, tax_total: 0, grand_total: 0,
    is_interstate: interstate, order_discount_amount: 0, loyalty_redeem_amount: 0, net_payable: 0,
  }
}
