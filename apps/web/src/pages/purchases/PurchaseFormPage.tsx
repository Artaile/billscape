import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, X, Pencil, Loader2, Printer, RefreshCw, Truck, Package, ListChecks, Receipt, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  formatINR, toMoney, isInterState, applyOrderDiscount, computeGST,
  generateBarcode, stateCodeFromGSTIN, toBaseQty, hasSecondaryUnit,
  type GSTRate, type InvoiceTotals,
} from '@billscape/core'
import { createPurchase, updatePurchase, generatePurchaseNo, generateProductCode, getPurchaseWithItems, type PurchaseLineInput } from '@billscape/api'
import { printBarcodeLabel } from '@/lib/printBarcodeLabel'
import { SupplierFormDialog, type SupplierOption } from '@/components/suppliers/SupplierFormDialog'
import { useNavigationGuard, useRegisterNavigationGuard } from '@/contexts/NavigationGuardContext'
import { getPurchaseDrafts, savePurchaseDrafts, type PurchaseDraft } from '@/lib/purchaseDrafts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const GST_RATES: GSTRate[] = [0, 5, 12, 18, 28]

interface Supplier { id: string; name: string; phone: string | null; gstin: string | null }
interface ExistingProduct { id: string; name: string; sku: string | null; barcode_value: string | null; tax_rate: GSTRate; price: number; cost_price: number; mrp: number | null; special_price: number | null; unit_id: string; secondary_unit_id: string | null; conversion_factor: number | null }
interface UnitOption { id: string; name: string; symbol: string; allow_decimal: boolean }

interface VariantRow { size: string; color: string; price_delta: string; stock_qty: string }
interface BatchRow { batch_no: string; expiry_date: string; qty: string }

export interface PurchaseRow {
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
  // New-product-only metadata — never sent for is_new_product: false rows.
  category_id: string | null
  hsn_code: string
  has_variants: boolean
  variants: VariantRow[]
  has_batches: boolean
  batches: BatchRow[]
  showMoreDetails: boolean
  // Unit of measure. unit_id is the product's base (stocking) unit — required for new products,
  // read-only/inherited for existing products. entry_unit_id is which unit THIS purchase line was
  // entered in (base or secondary) — qty is converted to base-unit qty via toBaseQty() on save.
  unit_id: string
  secondary_unit_id: string | null
  conversion_factor: number | null
  entry_unit_id: string
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

// r.qty is entered in r.entry_unit_id (base or secondary unit) — unit_cost/price are always
// BASE-unit values, so any money math against a row's qty must use the base-unit-equivalent
// qty, not the raw entered value, or a "2 Box" line would price as if it were "2 Piece".
function rowBaseQty(r: PurchaseRow): number {
  const entered = parseNum(r.qty)
  if (r.entry_unit_id !== r.secondary_unit_id) return entered
  return toBaseQty(entered, { unitId: r.unit_id, secondaryUnitId: r.secondary_unit_id, conversionFactor: r.conversion_factor })
}

function batchQtyTotal(batches: BatchRow[]): number {
  return batches.reduce((sum, b) => sum + (parseNum(b.qty) || 0), 0)
}

// Mirrors ProductSchema.hsn_code in packages/core/src/validation/index.ts — 4, 6, or 8 digits.
function hsnCodeError(value: string): string | undefined {
  if (!value) return undefined
  return /^\d{4}(\d{2}(\d{2})?)?$/.test(value) ? undefined : 'HSN code must be 4, 6, or 8 digits'
}

function emptyRow(): PurchaseRow {
  return {
    product_id: null, is_new_product: false, product_name: '',
    sku: '', barcode_value: '', tax_rate: 18, qty: '1', unit_cost: '0',
    mrp: '', price: '0', special_price: '',
    update_existing_pricing: true, skuManuallyEdited: false, barcodeManuallyEdited: false,
    category_id: null, hsn_code: '', has_variants: false, variants: [],
    has_batches: false, batches: [], showMoreDetails: false,
    unit_id: '', secondary_unit_id: null, conversion_factor: null, entry_unit_id: '',
  }
}


export function PurchaseFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const importedRows = (location.state as { importedRows?: ImportedPurchaseRow[]; importSupplierId?: string } | null)?.importedRows
  const importSupplierIdFromState = (location.state as { importSupplierId?: string } | null)?.importSupplierId
  const draftId = (location.state as { draftId?: string } | null)?.draftId
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()
  const { requestNavigation } = useNavigationGuard()

  const [supplierId, setSupplierId] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [purchaseType, setPurchaseType] = useState<'credit' | 'cash'>('credit')
  const [notes, setNotes] = useState('')
  const [showAddSupplier, setShowAddSupplier] = useState(false)

  const [entry, setEntry] = useState<PurchaseRow>(emptyRow())

  // When batch tracking is enabled for the entry row, Qty becomes a read-only rollup of
  // the batch quantities below it (matches IppoBill's "Allocated from batches below" pattern) —
  // keeps the two numbers from silently drifting apart. Non-batch-tracked rows are unaffected;
  // Qty stays freely editable, matching the common case.
  useEffect(() => {
    if (entry.has_batches && entry.batches.length > 0) {
      const total = batchQtyTotal(entry.batches)
      setEntry((p) => (p.has_batches ? { ...p, qty: String(total) } : p))
    }
  }, [entry.has_batches, entry.batches])

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
        items.map((it: any) => {
          const product = (it as unknown as { products?: { sku?: string; barcode_value?: string; price?: number; mrp?: number; special_price?: number; unit_id?: string; secondary_unit_id?: string | null; conversion_factor?: number | null } }).products
          return {
            product_id: it.product_id,
            is_new_product: false,
            product_name: it.product_name,
            sku: product?.sku ?? '',
            barcode_value: product?.barcode_value ?? '',
            tax_rate: (it.tax_rate ?? 0) as GSTRate,
            // purchase_items.qty is always stored in the product's BASE unit — editing always
            // shows/edits in base units too (the entry unit used at original save time isn't
            // persisted), so entry_unit_id defaults to the base unit here.
            qty: String(it.qty),
            unit_cost: String(it.unit_cost),
            mrp: product?.mrp != null ? String(product.mrp) : '',
            price: product?.price != null ? String(product.price) : '0',
            special_price: product?.special_price != null ? String(product.special_price) : '',
            update_existing_pricing: true,
            skuManuallyEdited: true, barcodeManuallyEdited: true,
            category_id: null, hsn_code: '', has_variants: false, variants: [],
            has_batches: false, batches: [], showMoreDetails: false,
            unit_id: product?.unit_id ?? '',
            secondary_unit_id: product?.secondary_unit_id ?? null,
            conversion_factor: product?.conversion_factor ?? null,
            entry_unit_id: product?.unit_id ?? '',
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

  const { data: categories } = useQuery({
    queryKey: ['categories', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('id, name').eq('organization_id', orgId!).order('name')
      return (data ?? []) as { id: string; name: string }[]
    },
  })

  const { data: products } = useQuery({
    queryKey: ['products-all', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, barcode_value, tax_rate, price, cost_price, mrp, special_price, unit_id, secondary_unit_id, conversion_factor')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .order('name')
      return (data ?? []) as ExistingProduct[]
    },
  })

  const { data: units } = useQuery({
    queryKey: ['units', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('units').select('id, name, symbol, allow_decimal').eq('organization_id', orgId!).order('name')
      return (data ?? []) as UnitOption[]
    },
  })

  function unitOf(unitId: string | null | undefined): UnitOption | undefined {
    return units?.find((u) => u.id === unitId)
  }

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
          category_id: null, hsn_code: '', has_variants: false, variants: [],
          has_batches: false, batches: [], showMoreDetails: false,
          unit_id: match.unit_id, secondary_unit_id: match.secondary_unit_id,
          conversion_factor: match.conversion_factor, entry_unit_id: match.unit_id,
        }
      }
      const sku = `PC${String(counter).padStart(4, '0')}`
      counter += 1
      const defaultUnitId = units?.find((u) => u.name === 'Piece')?.id ?? units?.[0]?.id ?? ''
      return {
        product_id: null, is_new_product: true, product_name: imp.product_name.trim(),
        sku, barcode_value: generateBarcode(),
        tax_rate: 18, qty: imp.qty, unit_cost: imp.unit_cost,
        mrp: '', price: imp.unit_cost, special_price: '',
        update_existing_pricing: true, skuManuallyEdited: false, barcodeManuallyEdited: false,
        category_id: null, hsn_code: '', has_variants: false, variants: [],
        has_batches: false, batches: [], showMoreDetails: false,
        unit_id: defaultUnitId, secondary_unit_id: null, conversion_factor: null, entry_unit_id: defaultUnitId,
      }
    })
    setRows(newRows)
    setProductCodeCounter(counter)
    if (importSupplierIdFromState) setSupplierId(importSupplierIdFromState)
    toast.success(`${newRows.length} item(s) imported from CSV`, 'Review GST, MRP and pricing before saving')
    navigate(location.pathname, { replace: true, state: null })
  }, [importedRows, products, productCodeCounter, importSupplierIdFromState, navigate, location.pathname])

  // Resumes a draft handed off from the Purchases page's "Drafts" list (see purchaseDrafts.ts) —
  // consumed on load (removed from storage) same as resumeHeldBill's "resume = pop" semantics.
  const draftConsumedRef = useRef(false)
  useEffect(() => {
    if (draftConsumedRef.current) return
    if (!draftId) return
    draftConsumedRef.current = true

    const drafts = getPurchaseDrafts()
    const draft = drafts.find((d) => d.id === draftId)
    if (!draft) return

    setSupplierId(draft.supplierId)
    setInvoiceNo(draft.invoiceNo)
    setPurchaseDate(draft.purchaseDate)
    setPurchaseType(draft.purchaseType)
    setNotes(draft.notes)
    setRows(draft.rows)
    setBillDiscountType(draft.billDiscountType)
    setBillDiscountValue(draft.billDiscountValue)
    setRoundOffEnabled(draft.roundOffEnabled)

    savePurchaseDrafts(drafts.filter((d) => d.id !== draftId))
    toast.success(`Resumed "${draft.name}"`)
    navigate(location.pathname, { replace: true, state: null })
  }, [draftId, navigate, location.pathname])

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

  // Unsaved-work guard: true whenever leaving now would silently lose data (a supplier or item
  // entered but not yet saved as a real purchase). Read via refs inside callbacks so the guard/
  // beforeunload handler always see current values without re-subscribing on every keystroke.
  const hasUnsavedWork = () =>
    rows.length > 0 || !!supplierId || invoiceNo.trim() !== '' || notes.trim() !== '' || parseNum(billDiscountValue) > 0

  const draftSnapshotRef = useRef({ supplierId, invoiceNo, purchaseDate, purchaseType, notes, rows, billDiscountType, billDiscountValue, roundOffEnabled, selectedSupplierName: selectedSupplier?.name ?? null })
  draftSnapshotRef.current = { supplierId, invoiceNo, purchaseDate, purchaseType, notes, rows, billDiscountType, billDiscountValue, roundOffEnabled, selectedSupplierName: selectedSupplier?.name ?? null }
  const hasUnsavedWorkRef = useRef(hasUnsavedWork)
  hasUnsavedWorkRef.current = hasUnsavedWork

  function saveDraftFromCurrentState() {
    const s = draftSnapshotRef.current
    const draft: PurchaseDraft = {
      id: Date.now().toString(),
      name: s.selectedSupplierName ?? `Draft ${getPurchaseDrafts().length + 1}`,
      supplierId: s.supplierId,
      supplierName: s.selectedSupplierName,
      invoiceNo: s.invoiceNo,
      purchaseDate: s.purchaseDate,
      purchaseType: s.purchaseType,
      notes: s.notes,
      rows: s.rows,
      billDiscountType: s.billDiscountType,
      billDiscountValue: s.billDiscountValue,
      roundOffEnabled: s.roundOffEnabled,
      savedAt: Date.now(),
    }
    savePurchaseDrafts([...getPurchaseDrafts(), draft])
    toast.success(`"${draft.name}" saved as draft`, 'Find it under Drafts on the Purchases page.')
  }

  useRegisterNavigationGuard({
    shouldBlock: () => hasUnsavedWorkRef.current(),
    title: 'Leave this purchase?',
    message: "You have unsaved changes to this purchase. Save it as a draft to resume later, or discard it.",
    onSaveDraft: () => saveDraftFromCurrentState(),
  })

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedWorkRef.current()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const totals: InvoiceTotals = useMemo(() => {
    const cartLike = rows
      .filter((r) => rowBaseQty(r) > 0)
      .map((r, i) => ({
        product_id: String(i), product_name: r.product_name, tax_rate: r.tax_rate,
        unit_price: parseNum(r.unit_cost), qty: rowBaseQty(r), discount_pct: 0,
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
      category_id: null, hsn_code: '', has_variants: false, variants: [],
      has_batches: false, batches: [], showMoreDetails: false,
      unit_id: p.unit_id, secondary_unit_id: p.secondary_unit_id,
      conversion_factor: p.conversion_factor, entry_unit_id: p.unit_id,
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
    setEntry((prev) => {
      // Leaving an existing-product selection (or its stale leftovers) behind — start from a
      // clean new-product row rather than spreading prev, otherwise its SKU/barcode/pricing
      // (tax_rate, unit_cost, mrp, price, special_price, update_existing_pricing, and the
      // manually-edited flags that suppress SKU/barcode regeneration) linger and a "New" row
      // can end up reusing an existing product's SKU/barcode on save.
      const base = prev.is_new_product ? prev : emptyRow()
      const defaultUnitId = base.unit_id || units?.find((u) => u.name === 'Piece')?.id || units?.[0]?.id || ''
      return {
        ...base, product_id: null, is_new_product: true, product_name: val,
        sku: base.skuManuallyEdited ? base.sku : (val ? nextProductCode() : ''),
        barcode_value: base.barcodeManuallyEdited ? base.barcode_value : (val ? generateBarcode() : ''),
        unit_id: defaultUnitId, entry_unit_id: defaultUnitId,
      }
    })
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
    if (entry.is_new_product && !entry.unit_id) return false
    if (entry.has_variants && entry.variants.some((v) => !v.size.trim() && !v.color.trim() && (v.price_delta || v.stock_qty))) return false
    if (entry.has_batches && entry.batches.some((b) => !b.batch_no.trim() || !b.expiry_date)) return false
    return true
  }

  function addEntryToGrid() {
    if (!canAddEntry()) {
      let msg = entry.is_new_product ? 'Product code and barcode are required for a new product' : 'Enter product name and qty'
      if (entry.is_new_product && !entry.unit_id) {
        msg = 'Select a unit for the new product'
      } else if (entry.has_variants && entry.variants.some((v) => !v.size.trim() && !v.color.trim() && (v.price_delta || v.stock_qty))) {
        msg = 'Each variant row needs a Size or Color — remove empty rows'
      } else if (entry.has_batches && entry.batches.some((b) => !b.batch_no.trim() || !b.expiry_date)) {
        msg = 'Each batch row needs both a Batch No and an Expiry Date — remove empty rows or fill them in'
      }
      toast.error('Incomplete row', msg)
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

      const items: PurchaseLineInput[] = rows.map((r) => {
        // r.qty is entered in r.entry_unit_id (base or secondary) — purchase_items.qty and
        // inventory.stock_qty are always in the product's BASE unit, so convert here, once,
        // at the save boundary. When entry_unit_id is the base unit this is a no-op.
        const conv = { unitId: r.unit_id, secondaryUnitId: r.secondary_unit_id, conversionFactor: r.conversion_factor }
        const enteredQty = parseNum(r.qty)
        const baseQty = r.entry_unit_id === r.secondary_unit_id ? toBaseQty(enteredQty, conv) : enteredQty
        return {
          product_id: r.product_id,
          is_new_product: r.is_new_product,
          product_name: r.product_name.trim(),
          sku: r.sku.trim() || undefined,
          barcode_value: r.barcode_value.trim() || undefined,
          tax_rate: r.tax_rate,
          qty: baseQty,
          unit_cost: parseNum(r.unit_cost),
          mrp: r.mrp ? parseNum(r.mrp) : undefined,
          price: parseNum(r.price),
          special_price: r.special_price ? parseNum(r.special_price) : undefined,
          update_existing_pricing: r.update_existing_pricing,
          category_id: r.is_new_product ? r.category_id : undefined,
          hsn_code: r.is_new_product ? (r.hsn_code.trim() || undefined) : undefined,
          unit_id: r.is_new_product ? r.unit_id : undefined,
          secondary_unit_id: r.is_new_product ? (r.secondary_unit_id ?? undefined) : undefined,
          conversion_factor: r.is_new_product ? (r.conversion_factor ?? undefined) : undefined,
          variants: r.is_new_product && r.has_variants
            ? r.variants.filter((v) => v.size.trim() || v.color.trim()).map((v) => ({ size: v.size, color: v.color, price_delta: parseNum(v.price_delta), stock_qty: parseNum(v.stock_qty) }))
            : undefined,
          batches: r.is_new_product && r.has_batches
            ? r.batches.filter((b) => b.batch_no.trim() && b.expiry_date).map((b) => ({ batch_no: b.batch_no, expiry_date: b.expiry_date, qty: parseNum(b.qty) }))
            : undefined,
        }
      })

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
          <Button variant="ghost" size="icon" onClick={() => requestNavigation(() => navigate('/purchases'))}>
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
            <div className="flex flex-col lg:flex-row lg:items-start gap-4">
              <div className="lg:w-[280px] shrink-0 space-y-1.5">
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

              <div className="lg:w-[160px] shrink-0 space-y-1.5">
                <Label>Invoice No</Label>
                <Input placeholder="INV-001 (optional)" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
              </div>

              <div className="lg:w-[150px] shrink-0 space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              </div>

              <div className="lg:w-[170px] shrink-0 space-y-1.5">
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

              <div className="flex-1 min-w-[160px] space-y-1.5">
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
                  <Label className="text-xs">Product *</Label>
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
                    <Label className="text-xs">Product Code{entry.is_new_product && ' *'}</Label>
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
                    <Label className="text-xs">Barcode{entry.is_new_product && ' *'}</Label>
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
                    <Label className="text-xs">Qty *</Label>
                    <Input type="text" inputMode="decimal" value={entry.qty} onFocus={(e) => e.target.select()}
                      disabled={entry.has_batches}
                      onChange={(e) => setEntry((p) => ({ ...p, qty: e.target.value.replace(/[^0-9.]/g, '') || '0' }))}
                      className={cn('h-9 text-sm text-center', entry.has_batches && 'opacity-60 cursor-not-allowed')} />
                    {entry.has_batches && (
                      <p className="text-[10px] text-zinc-500">Allocated from batches below</p>
                    )}
                  </div>
                </div>

                {hasSecondaryUnit({ unitId: entry.unit_id, secondaryUnitId: entry.secondary_unit_id, conversionFactor: entry.conversion_factor }) && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-zinc-500">Qty in:</Label>
                    <div className="flex gap-1">
                      {[entry.unit_id, entry.secondary_unit_id!].map((uid) => (
                        <button
                          key={uid}
                          type="button"
                          onClick={() => setEntry((p) => ({ ...p, entry_unit_id: uid }))}
                          className={cn(
                            'px-2 py-1 rounded-md text-xs font-medium border transition-all',
                            entry.entry_unit_id === uid
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'border-zinc-700 text-zinc-400 hover:border-zinc-600',
                          )}
                        >
                          {unitOf(uid)?.symbol}
                        </button>
                      ))}
                    </div>
                    {entry.entry_unit_id === entry.secondary_unit_id && (
                      <span className="text-[11px] text-zinc-600">
                        = {toBaseQty(parseNum(entry.qty), { unitId: entry.unit_id, secondaryUnitId: entry.secondary_unit_id, conversionFactor: entry.conversion_factor })} {unitOf(entry.unit_id)?.symbol}
                      </span>
                    )}
                  </div>
                )}

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

                {/* More details — new-product-only metadata (category, HSN, variants, batches).
                    Existing products already carry this on their own record, nothing to add. */}
                {entry.is_new_product && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setEntry((p) => ({ ...p, showMoreDetails: !p.showMoreDetails }))}
                      className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {entry.showMoreDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      More details
                      <span className="text-zinc-600">(Category, HSN, Unit, Variants, Batches)</span>
                    </button>

                    {entry.showMoreDetails && (
                      <div className="mt-3 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Category</Label>
                            <select
                              value={entry.category_id ?? ''}
                              onChange={(e) => setEntry((p) => ({ ...p, category_id: e.target.value || null }))}
                              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">— No category —</option>
                              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Unit *</Label>
                            <select
                              value={entry.unit_id}
                              onChange={(e) => setEntry((p) => ({ ...p, unit_id: e.target.value, entry_unit_id: e.target.value }))}
                              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              {!entry.unit_id && <option value="">— Select unit —</option>}
                              {units?.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">HSN Code</Label>
                            <Input
                              placeholder="e.g. 2501"
                              value={entry.hsn_code}
                              onChange={(e) => setEntry((p) => ({ ...p, hsn_code: e.target.value }))}
                              className="h-9 text-xs"
                            />
                            {hsnCodeError(entry.hsn_code) && (
                              <p className="text-[11px] text-amber-400">{hsnCodeError(entry.hsn_code)}</p>
                            )}
                          </div>
                        </div>

                        {/* Variants */}
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer w-fit">
                            <div
                              onClick={() => setEntry((p) => ({
                                ...p, has_variants: !p.has_variants,
                                variants: !p.has_variants && p.variants.length === 0
                                  ? [{ size: '', color: '', price_delta: '', stock_qty: '' }]
                                  : p.variants,
                              }))}
                              className={cn('relative h-5 w-9 rounded-full transition-colors cursor-pointer', entry.has_variants ? 'bg-indigo-600' : 'bg-zinc-700')}
                            >
                              <div className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform', entry.has_variants ? 'translate-x-4' : 'translate-x-0')} />
                            </div>
                            <span className="text-xs text-zinc-400">Track Variants</span>
                          </label>

                          {entry.has_variants && (
                            <div className="space-y-1.5 pl-1">
                              <div className="grid grid-cols-5 gap-2 text-[11px] text-zinc-500">
                                <span>Size</span><span>Color</span><span>Price +/-</span><span>Stock</span><span></span>
                              </div>
                              {entry.variants.map((v, i) => {
                                const vTouched = v.size.trim() || v.color.trim() || v.price_delta || v.stock_qty
                                const vMissing = vTouched && !v.size.trim() && !v.color.trim()
                                return (
                                <div key={i} className="grid grid-cols-5 gap-2 items-center">
                                  <Input placeholder="S / M / L" value={v.size}
                                    onChange={(e) => setEntry((p) => ({ ...p, variants: p.variants.map((x, j) => j === i ? { ...x, size: e.target.value } : x) }))}
                                    className={cn('h-8 text-xs', vMissing && 'border-red-500')} />
                                  <Input placeholder="Red / Blue" value={v.color}
                                    onChange={(e) => setEntry((p) => ({ ...p, variants: p.variants.map((x, j) => j === i ? { ...x, color: e.target.value } : x) }))}
                                    className={cn('h-8 text-xs', vMissing && 'border-red-500')} />
                                  <Input type="text" inputMode="decimal" placeholder="0.00" value={v.price_delta}
                                    onChange={(e) => setEntry((p) => ({ ...p, variants: p.variants.map((x, j) => j === i ? { ...x, price_delta: e.target.value.replace(/[^0-9.]/g, '') } : x) }))}
                                    className="h-8 text-xs" />
                                  <Input type="text" inputMode="decimal" placeholder="0" value={v.stock_qty}
                                    onChange={(e) => setEntry((p) => ({ ...p, variants: p.variants.map((x, j) => j === i ? { ...x, stock_qty: e.target.value.replace(/[^0-9.]/g, '') } : x) }))}
                                    className="h-8 text-xs" />
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300"
                                    onClick={() => setEntry((p) => ({ ...p, variants: p.variants.filter((_, j) => j !== i) }))}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                                )
                              })}
                              <Button type="button" variant="outline" size="sm" className="text-xs"
                                onClick={() => setEntry((p) => ({ ...p, variants: [...p.variants, { size: '', color: '', price_delta: '', stock_qty: '' }] }))}>
                                <Plus className="h-3.5 w-3.5" /> Add Variant
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Batches */}
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer w-fit">
                            <div
                              onClick={() => setEntry((p) => ({
                                ...p, has_batches: !p.has_batches,
                                batches: !p.has_batches && p.batches.length === 0
                                  ? [{ batch_no: '', expiry_date: '', qty: '' }]
                                  : p.batches,
                              }))}
                              className={cn('relative h-5 w-9 rounded-full transition-colors cursor-pointer', entry.has_batches ? 'bg-indigo-600' : 'bg-zinc-700')}
                            >
                              <div className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform', entry.has_batches ? 'translate-x-4' : 'translate-x-0')} />
                            </div>
                            <span className="text-xs text-zinc-400">Track Batches</span>
                          </label>

                          {entry.has_batches && (
                            <div className="space-y-1.5 pl-1">
                              <div className="grid grid-cols-5 gap-2 text-[11px] text-zinc-500">
                                <span className="col-span-2">Batch No *</span><span>Expiry Date *</span><span>Qty</span><span></span>
                              </div>
                              {entry.batches.map((b, i) => {
                                const bTouched = b.batch_no.trim() || b.expiry_date || b.qty
                                const bMissingBatchNo = bTouched && !b.batch_no.trim()
                                const bMissingExpiry = bTouched && !b.expiry_date
                                return (
                                <div key={i} className="grid grid-cols-5 gap-2 items-center">
                                  <Input placeholder="BATCH-001" value={b.batch_no}
                                    onChange={(e) => setEntry((p) => ({ ...p, batches: p.batches.map((x, j) => j === i ? { ...x, batch_no: e.target.value } : x) }))}
                                    className={cn('h-8 text-xs col-span-2', bMissingBatchNo && 'border-red-500')} />
                                  <Input type="date" value={b.expiry_date}
                                    onChange={(e) => setEntry((p) => ({ ...p, batches: p.batches.map((x, j) => j === i ? { ...x, expiry_date: e.target.value } : x) }))}
                                    className={cn('h-8 text-xs', bMissingExpiry && 'border-red-500')} />
                                  <Input type="text" inputMode="decimal" placeholder="0" value={b.qty}
                                    onChange={(e) => setEntry((p) => ({ ...p, batches: p.batches.map((x, j) => j === i ? { ...x, qty: e.target.value.replace(/[^0-9.]/g, '') } : x) }))}
                                    className="h-8 text-xs" />
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300"
                                    onClick={() => setEntry((p) => ({ ...p, batches: p.batches.filter((_, j) => j !== i) }))}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                                )
                              })}
                              {entry.batches.length > 0 && (
                                <p className="text-[11px] text-zinc-500 pl-1">
                                  Total batch qty: {batchQtyTotal(entry.batches)} {unitOf(entry.unit_id)?.symbol ?? 'units'}
                                </p>
                              )}
                              <Button type="button" variant="outline" size="sm" className="text-xs"
                                onClick={() => setEntry((p) => ({ ...p, batches: [...p.batches, { batch_no: '', expiry_date: '', qty: '' }] }))}>
                                <Plus className="h-3.5 w-3.5" /> Add Batch
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
                        <TableCell className="text-right text-sm text-zinc-300 whitespace-nowrap">
                          {parseNum(r.qty)}{unitOf(r.entry_unit_id) ? ` ${unitOf(r.entry_unit_id)?.symbol}` : ''}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-zinc-400 whitespace-nowrap">{r.barcode_value}</TableCell>
                        <TableCell className="text-right text-sm text-zinc-400 whitespace-nowrap">{r.mrp ? formatINR(parseNum(r.mrp)) : '—'}</TableCell>
                        <TableCell className="text-right text-sm text-zinc-300 whitespace-nowrap">{formatINR(parseNum(r.price))}</TableCell>
                        <TableCell className="text-right text-sm text-zinc-400 whitespace-nowrap">{r.special_price ? formatINR(parseNum(r.special_price)) : '—'}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-white whitespace-nowrap">{formatINR(toMoney(parseNum(r.unit_cost) * rowBaseQty(r)))}</TableCell>
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
                  <Button type="button" variant="outline" className="flex-1" onClick={() => requestNavigation(() => navigate('/purchases'))}>Cancel</Button>
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
