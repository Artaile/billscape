import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, X, Pencil, Loader2, Printer, RefreshCw, Truck, Package, ListChecks, Receipt, Trash2, Camera, Settings2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  formatINR, toMoney, isInterState, applyOrderDiscount, computeGST,
  generateBarcode, stateCodeFromGSTIN, toBaseQty, hasSecondaryUnit, splitInclusiveGST,
  type GSTRate, type InvoiceTotals,
} from '@billscape/core'
import { createPurchase, updatePurchase, generatePurchaseNo, generateProductCode, getPurchaseWithItems, recordPurchasePayment, createCategory, type PurchaseLineInput } from '@billscape/api'
import { printBarcodeLabel } from '@/lib/printBarcodeLabel'
import { SupplierFormDialog, type SupplierOption } from '@/components/suppliers/SupplierFormDialog'
import { useNavigationGuard, useRegisterNavigationGuard } from '@/contexts/NavigationGuardContext'
import { getPurchaseDrafts, savePurchaseDrafts, type PurchaseDraft } from '@/lib/purchaseDrafts'
import { ScanBarcodeDialog } from '@/components/ui/ScanBarcodeDialog'
import { VariantEditor, emptyVariantRow, type VariantFormRow } from '@/components/products/VariantEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const GST_RATES: GSTRate[] = [0, 5, 12, 18, 28]

interface Supplier { id: string; name: string; phone: string | null; gstin: string | null }
interface ExistingProduct { id: string; name: string; sku: string | null; extra_sku: string | null; barcode_value: string | null; tax_rate: GSTRate; price: number; cost_price: number; mrp: number | null; special_price: number | null; unit_id: string; secondary_unit_id: string | null; conversion_factor: number | null; gst_mode: string | null; expiry_date: string | null }
interface UnitOption { id: string; name: string; symbol: string; allow_decimal: boolean }

interface BatchRow { batch_no: string; expiry_date: string; qty: string }

export interface PurchaseRow {
  product_id: string | null
  is_new_product: boolean
  product_name: string
  sku: string
  // A second, genuinely optional identifier distinct from `sku` (the auto-generated PC0001-style
  // Product Code) — mirrors product_variants' own separate barcode_value + sku columns. Maps to
  // products.extra_sku (migration 032_products_extra_sku.sql). Only shown/editable for a
  // non-variant row — a has_variants row has no single extra_sku of its own.
  extra_sku: string
  barcode_value: string
  tax_rate: GSTRate
  // Whether Purchase Rate/MRP/Retail/SP below are typed tax-inclusive or exclusive — mirrors
  // product_variants' own sale_gst_mode/purchase_gst_mode, and overrides the org-wide
  // tax_inclusive setting for this one row specifically. Maps to products.gst_mode
  // (migration 033_products_expiry_gst_mode.sql). Only meaningful for a non-variant row.
  gst_mode: 'include' | 'exclude'
  qty: string
  unit_cost: string
  mrp: string
  price: string
  special_price: string
  // Simple product-level expiry, distinct from the per-batch expiry_date already used by the
  // Track Batches panel below — for the common case of a single-batch/non-batch-tracked product
  // that still has a shelf life. Maps to products.expiry_date (migration
  // 033_products_expiry_gst_mode.sql). Only shown for a non-variant row.
  expiry_date: string
  update_existing_pricing: boolean
  skuManuallyEdited: boolean
  barcodeManuallyEdited: boolean
  codeError?: string
  // New-product-only metadata — never sent for is_new_product: false rows.
  category_id: string | null
  hsn_code: string
  has_variants: boolean
  variants: VariantFormRow[]
  has_batches: boolean
  batches: BatchRow[]
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
    sku: '', extra_sku: '', barcode_value: '', tax_rate: 18, gst_mode: 'include', qty: '1', unit_cost: '0',
    mrp: '', price: '0', special_price: '', expiry_date: '',
    update_existing_pricing: true, skuManuallyEdited: false, barcodeManuallyEdited: false,
    category_id: null, hsn_code: '', has_variants: false, variants: [],
    has_batches: false, batches: [],
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
  const { org, user, refreshOrg } = useAuth()
  const orgId = org?.id
  const taxInclusive = org?.branding?.tax_inclusive ?? false
  const queryClient = useQueryClient()
  const { requestNavigation } = useNavigationGuard()

  const [supplierId, setSupplierId] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [purchaseType, setPurchaseType] = useState<'credit' | 'cash'>('cash')
  const [notes, setNotes] = useState('')
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  const [entry, setEntry] = useState<PurchaseRow>(emptyRow())
  const [scanOpen, setScanOpen] = useState(false)

  // Add Item form field visibility (gear icon) — persisted per-org on org_settings.branding
  // (see purchase_entry_fields in packages/core's OrgBranding). Undefined key = on by default
  // so existing orgs see no change until a merchant opts a field out.
  const fieldPrefs = org?.branding?.purchase_entry_fields
  const showHsnField = fieldPrefs?.hsn ?? true
  const showBatchesField = fieldPrefs?.batches ?? true
  const showExpiryField = fieldPrefs?.expiry ?? true
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement | null>(null)

  const updateFieldPrefsMutation = useMutation({
    mutationFn: async (next: { hsn: boolean; batches: boolean; expiry: boolean }) => {
      if (!orgId) throw new Error('Not logged in')
      const { error } = await supabase.from('org_settings').upsert({
        organization_id: orgId,
        branding: { ...(org?.branding ?? {}), purchase_entry_fields: next },
      }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: () => { refreshOrg() },
    onError: (err: Error) => toast.error('Failed to save field settings', err.message),
  })

  function toggleFieldPref(key: 'hsn' | 'batches' | 'expiry') {
    const next = { hsn: showHsnField, batches: showBatchesField, expiry: showExpiryField, [key]: !{ hsn: showHsnField, batches: showBatchesField, expiry: showExpiryField }[key] }
    updateFieldPrefsMutation.mutate(next)
    // Batches has no separate in-form toggle any more — the gear's "Batches" switch is the
    // sole on/off control; the has_batches-sync effect below (keyed on showBatchesField)
    // turns entry.has_batches on/off to match automatically once org.branding updates.
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

  // Batches has no separate "Track Batches" toggle any more — the gear's "Show Batches"
  // switch is the sole on/off control (per merchant feedback: a second toggle duplicating a
  // gear switch was confusing). Whenever it's on for a new, non-variant product, batch
  // tracking is simply always active on the row being entered; whenever it's off, or the row
  // isn't eligible (existing product, or has_variants), has_batches is forced back off.
  useEffect(() => {
    const eligible = entry.is_new_product && !entry.has_variants && showBatchesField
    if (eligible && !entry.has_batches) {
      setEntry((p) => ({
        ...p, has_batches: true,
        // Force batch quantities to be entered in the base unit (unit_id), never the
        // secondary unit — batchQtyTotal() has no unit-conversion awareness, so mixing units
        // here would silently mis-scale the synced Qty (see rowBaseQty's own base-unit-only
        // assumption for money math). Mirrors the old manual toggle's own on-click behavior.
        entry_unit_id: p.unit_id,
        batches: p.batches.length === 0 ? [{ batch_no: '', expiry_date: '', qty: p.qty !== '0' ? p.qty : '' }] : p.batches,
      }))
    } else if (!eligible && entry.has_batches) {
      setEntry((p) => ({ ...p, has_batches: false }))
    }
  }, [entry.is_new_product, entry.has_variants, entry.has_batches, showBatchesField])

  const [entrySearch, setEntrySearch] = useState('')
  const [entryDropdownOpen, setEntryDropdownOpen] = useState(false)
  const [rows, setRows] = useState<PurchaseRow[]>([])

  const [billDiscountType, setBillDiscountType] = useState<'flat' | 'percent'>('flat')
  const [billDiscountValue, setBillDiscountValue] = useState('0')
  const [roundOffEnabled, setRoundOffEnabled] = useState(false)
  // Paid amount captured at save time — recorded as a real purchase_payments row (same table and
  // shape as PurchasesPage.tsx's "Record Outward Payment" dialog) right after the purchase itself
  // is created, since recordPurchasePayment needs a real purchase_id that doesn't exist until then.
  const [paidNow, setPaidNow] = useState(false)
  const [paidAmount, setPaidAmount] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [savedPurchase, setSavedPurchase] = useState<{ purchaseNo: string; newProducts: PurchaseRow[] } | null>(null)

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
          const product = (it as unknown as { products?: { sku?: string; extra_sku?: string | null; barcode_value?: string; price?: number; mrp?: number; special_price?: number; unit_id?: string; secondary_unit_id?: string | null; conversion_factor?: number | null; gst_mode?: string | null; expiry_date?: string | null } }).products
          return {
            product_id: it.product_id,
            is_new_product: false,
            product_name: it.product_name,
            sku: product?.sku ?? '',
            extra_sku: product?.extra_sku ?? '',
            barcode_value: product?.barcode_value ?? '',
            tax_rate: (it.tax_rate ?? 0) as GSTRate,
            gst_mode: (product?.gst_mode as 'include' | 'exclude') ?? 'include',
            // purchase_items.qty is always stored in the product's BASE unit — editing always
            // shows/edits in base units too (the entry unit used at original save time isn't
            // persisted), so entry_unit_id defaults to the base unit here.
            qty: String(it.qty),
            unit_cost: String(it.unit_cost),
            mrp: product?.mrp != null ? String(product.mrp) : '',
            price: product?.price != null ? String(product.price) : '0',
            special_price: product?.special_price != null ? String(product.special_price) : '',
            expiry_date: product?.expiry_date ?? '',
            update_existing_pricing: true,
            skuManuallyEdited: true, barcodeManuallyEdited: true,
            category_id: null, hsn_code: '', has_variants: false, variants: [],
            has_batches: false, batches: [],
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

  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('Not logged in')
      const { data, error } = await createCategory(supabase, { organization_id: orgId, name: newCategoryName.trim() })
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['categories', orgId] })
      // Immediately select the newly created category on the row being entered — matches
      // SupplierFormDialog's own onSaved auto-select pattern, so the merchant doesn't have to
      // reopen the dropdown and find their just-typed name in the list.
      setEntry((p) => ({ ...p, category_id: data!.id }))
      toast.success('Category created')
      setShowAddCategory(false)
      setNewCategoryName('')
    },
    onError: (err: Error) => toast.error('Failed to create category', err.message),
  })

  const { data: products } = useQuery({
    queryKey: ['products-all', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, extra_sku, barcode_value, tax_rate, price, cost_price, mrp, special_price, unit_id, secondary_unit_id, conversion_factor, gst_mode, expiry_date')
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
          sku: match.sku ?? '', extra_sku: match.extra_sku ?? '', barcode_value: match.barcode_value ?? '',
          tax_rate: match.tax_rate, gst_mode: (match.gst_mode as 'include' | 'exclude') ?? 'include', qty: imp.qty, unit_cost: imp.unit_cost || String(match.cost_price),
          mrp: match.mrp != null ? String(match.mrp) : '', price: String(match.price),
          special_price: match.special_price != null ? String(match.special_price) : '',
          expiry_date: match.expiry_date ?? '',
          update_existing_pricing: true, skuManuallyEdited: true, barcodeManuallyEdited: true,
          category_id: null, hsn_code: '', has_variants: false, variants: [],
          has_batches: false, batches: [],
          unit_id: match.unit_id, secondary_unit_id: match.secondary_unit_id,
          conversion_factor: match.conversion_factor, entry_unit_id: match.unit_id,
        }
      }
      const sku = `PC${String(counter).padStart(4, '0')}`
      counter += 1
      const defaultUnitId = units?.find((u) => u.name === 'Piece')?.id ?? units?.[0]?.id ?? ''
      return {
        product_id: null, is_new_product: true, product_name: imp.product_name.trim(),
        sku, extra_sku: '', barcode_value: generateBarcode(),
        tax_rate: 18, gst_mode: 'include', qty: imp.qty, unit_cost: imp.unit_cost,
        mrp: '', price: imp.unit_cost, special_price: '', expiry_date: '',
        update_existing_pricing: true, skuManuallyEdited: false, barcodeManuallyEdited: false,
        category_id: null, hsn_code: '', has_variants: false, variants: [],
        has_batches: false, batches: [],
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
    // Variant-carrying rows price/qty live per-variant (r.variants), not on the row's own
    // parent-level unit_cost/qty fields (those are hidden from the entry form and left at their
    // stale defaults once Track Variants is on) — flatten into one synthetic cart line per
    // variant so this on-screen preview total matches the Items table's per-variant rows and the
    // real totals `buildItemRows`/`computeGST` compute at save time (packages/api/src/purchases.ts).
    const cartLike = rows.flatMap((r, i) => {
      if (r.has_variants && r.variants.length > 0) {
        return r.variants
          .filter((v) => v.variant_name.trim() && parseNum(v.qty) > 0)
          .map((v, vi) => ({
            product_id: `${i}-${vi}`, product_name: `${r.product_name} — ${v.variant_name}`,
            tax_rate: v.tax_rate, unit_price: parseNum(v.purchase_price), qty: parseNum(v.qty), discount_pct: 0,
          }))
      }
      if (rowBaseQty(r) <= 0) return []
      return [{
        product_id: String(i), product_name: r.product_name, tax_rate: r.tax_rate,
        unit_price: parseNum(r.unit_cost), qty: rowBaseQty(r), discount_pct: 0,
      }]
    })
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
  // Clamped to [0, grandTotal] — an over-typed Paid amount can never show a negative balance due,
  // matching applyOrderDiscount's own clamping convention elsewhere in this codebase.
  const balanceDue = toMoney(Math.max(0, grandTotal - (paidNow ? Math.min(parseNum(paidAmount), grandTotal) : 0)))

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
      sku: p.sku ?? '', extra_sku: p.extra_sku ?? '', barcode_value: p.barcode_value ?? '',
      tax_rate: p.tax_rate, gst_mode: (p.gst_mode as 'include' | 'exclude') ?? 'include', qty: '1', unit_cost: String(p.cost_price),
      mrp: p.mrp != null ? String(p.mrp) : '', price: String(p.price),
      special_price: p.special_price != null ? String(p.special_price) : '',
      expiry_date: p.expiry_date ?? '',
      update_existing_pricing: true, skuManuallyEdited: true, barcodeManuallyEdited: true,
      category_id: null, hsn_code: '', has_variants: false, variants: [],
      has_batches: false, batches: [],
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
      //
      // has_variants/variants are the one exception — Track Variants is now clickable before
      // any product name is typed (pre-arming variant mode), and that pre-armed choice must
      // survive this reset instead of being silently discarded by emptyRow(). Carried forward
      // from prev regardless of prev.is_new_product, since the toggle is meant to persist
      // across the "was an existing product selected, now typing something else" transition
      // too — the merchant explicitly turned it on and expects it to stick.
      const base = prev.is_new_product ? prev : { ...emptyRow(), has_variants: prev.has_variants, variants: prev.variants }
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
    if (!value.trim()) { setError(undefined); return }

    // Check against sibling rows already sitting in THIS purchase's own list first — these are
    // new, not-yet-saved products, so a DB query can never see the collision between them. Every
    // "New" row in this purchase eventually calls createProductForLine on save, so two rows
    // sharing a code/barcode is exactly as invalid as one colliding with a real saved product,
    // just not something the products-table query below can ever catch. Checked synchronously
    // (no debounce needed — it's an in-memory array, not a network round-trip) and takes priority
    // over the DB check so the user sees the more actionable "already used by row X" message.
    // A has_variants sibling's own barcode_value is excluded from this comparison — its Barcode
    // field is hidden once Track Variants is on (every real barcode lives on its variants
    // instead), and the save mutation always sends barcode_value: undefined for it, so whatever
    // stale/auto-generated value still sits in that row's state on-screen never actually reaches
    // the database. Comparing against it would falsely block an unrelated row's real barcode.
    const siblingIndex = rows.findIndex((r, i) =>
      i !== editingIndex && r.is_new_product && r[field] === value && !(field === 'barcode_value' && r.has_variants),
    )
    if (siblingIndex !== -1) {
      const label = field === 'sku' ? 'code' : 'barcode'
      setError(`This ${label} is already used by "${rows[siblingIndex].product_name}" in this purchase`)
      return
    }

    codeCheckTimer.current = setTimeout(async () => {
      if (!orgId) { setError(undefined); return }
      const { data } = await supabase.from('products').select('id').eq('organization_id', orgId).eq(field, value).maybeSingle()
      setError(data ? `This ${field === 'sku' ? 'code' : 'barcode'} already exists` : undefined)
    }, 400)
  }

  function canAddEntry(): boolean {
    if (!entry.product_name.trim()) return false
    if (!entry.has_variants && parseNum(entry.qty) <= 0) return false
    if (entry.has_variants && !entry.variants.some((v) => v.variant_name.trim() && parseNum(v.qty) > 0)) return false
    if (entry.is_new_product && (!entry.sku.trim() || !entry.barcode_value.trim())) return false
    if (entry.is_new_product && !entry.unit_id) return false
    if (entry.has_variants && entry.variants.some((v) => !v.variant_name.trim())) return false
    if (entry.has_batches && entry.batches.some((b) => !b.batch_no.trim() || !b.expiry_date)) return false
    // A known duplicate code/barcode (sibling row or a real saved product) must block adding —
    // otherwise this exact row sails past validation here only to fail with an opaque DB
    // constraint error later at Save Purchase, once it's too late to tell which row was the
    // problem. See checkCodeUnique for how this gets set (both sibling-row and DB collisions).
    if (entry.is_new_product && entry.codeError) return false
    return true
  }

  function addEntryToGrid() {
    if (!canAddEntry()) {
      let msg = entry.is_new_product ? 'Product code and barcode are required for a new product' : 'Enter product name and qty'
      if (entry.is_new_product && !entry.unit_id) {
        msg = 'Select a unit for the new product'
      } else if (entry.has_variants && !entry.variants.some((v) => v.variant_name.trim() && parseNum(v.qty) > 0)) {
        msg = 'At least one variant needs a name and a quantity greater than 0'
      } else if (entry.has_variants && entry.variants.some((v) => !v.variant_name.trim())) {
        msg = 'Each variant needs a name before it can be added — remove empty rows or fill them in'
      } else if (entry.has_batches && entry.batches.some((b) => !b.batch_no.trim() || !b.expiry_date)) {
        msg = 'Each batch row needs both a Batch No and an Expiry Date — remove empty rows or fill them in'
      } else if (entry.is_new_product && entry.codeError) {
        msg = entry.codeError
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
          // extra_sku is only ever meaningful for a non-variant new product — hidden from the
          // entry UI once Track Variants is on, same reasoning as barcode_value below.
          extra_sku: r.has_variants ? undefined : (r.extra_sku.trim() || undefined),
          // A has_variants row's parent barcode_value field is hidden from the entry UI (see Row 2
          // above) but its state can still hold whatever generateBarcode() auto-filled the instant
          // a new product name was typed, before Track Variants was ever toggled on — the merchant
          // never sees or can clear that leftover value once variants are enabled. Sending it
          // through here would save a stale/duplicate-risking barcode onto the parent product row
          // even though every real barcode now lives on the variants (r.variants[].barcode_value).
          barcode_value: r.has_variants ? undefined : (r.barcode_value.trim() || undefined),
          tax_rate: r.tax_rate,
          // gst_mode is a display flag only (same convention as product_variants' own
          // sale_gst_mode/purchase_gst_mode) — the typed price values below are saved as-is
          // regardless of mode; it just records what the merchant intended when typing them, for
          // the Base+GST breakdown hint to render consistently the next time this row is edited.
          gst_mode: r.has_variants ? undefined : r.gst_mode,
          qty: baseQty,
          unit_cost: parseNum(r.unit_cost),
          mrp: r.mrp ? parseNum(r.mrp) : undefined,
          price: parseNum(r.price),
          special_price: r.special_price ? parseNum(r.special_price) : undefined,
          expiry_date: r.has_variants ? undefined : (r.expiry_date || undefined),
          update_existing_pricing: r.update_existing_pricing,
          category_id: r.is_new_product ? r.category_id : undefined,
          hsn_code: r.is_new_product ? (r.hsn_code.trim() || undefined) : undefined,
          unit_id: r.is_new_product ? r.unit_id : undefined,
          secondary_unit_id: r.is_new_product ? (r.secondary_unit_id ?? undefined) : undefined,
          conversion_factor: r.is_new_product ? (r.conversion_factor ?? undefined) : undefined,
          variants: r.is_new_product && r.has_variants
            ? r.variants.filter((v) => v.variant_name.trim()).map((v) => ({
                variant_name: v.variant_name,
                barcode_value: v.barcode_value || undefined,
                sku: v.sku || undefined,
                tax_rate: v.tax_rate,
                mrp: v.mrp ? parseNum(v.mrp) : undefined,
                sale_price: v.sale_price ? parseNum(v.sale_price) : undefined,
                special_price: v.special_price ? parseNum(v.special_price) : undefined,
                sale_gst_mode: v.gst_mode,
                purchase_price: v.purchase_price ? parseNum(v.purchase_price) : undefined,
                purchase_gst_mode: v.gst_mode,
                qty: v.qty ? parseNum(v.qty) : undefined,
                expiry_date: v.expiry_date || undefined,
                hsn_code: v.hsn_code || undefined,
              }))
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

      // Record the paid-at-save amount as a real purchase_payments row (same table/shape as
      // PurchasesPage.tsx's own "Record Outward Payment" dialog) — this can only happen AFTER
      // the purchase row exists, since recordPurchasePayment needs a real purchase_id. Best-effort:
      // a payment-recording failure must not roll back or fail the purchase save itself (the bill
      // is already committed) — surface it as a separate warning toast instead, matching the
      // non-blocking pattern already used for loyalty bookkeeping in POSTab's createSale flow.
      const amountToPay = paidNow ? Math.min(parseNum(paidAmount), grandTotal) : 0
      if (amountToPay > 0) {
        const { error: payError } = await recordPurchasePayment(supabase, {
          organization_id: orgId,
          purchase_id: result.data!.purchase.id,
          amount: amountToPay,
          mode: 'cash',
          created_by: user.id,
        })
        if (payError) {
          toast.error('Purchase saved, but payment was not recorded', payError.message)
        }
      }

      return result.data!
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchases', orgId] })
      queryClient.invalidateQueries({ queryKey: ['products', orgId] })
      queryClient.invalidateQueries({ queryKey: ['products-all', orgId] })
      queryClient.invalidateQueries({ queryKey: ['inventory', orgId] })
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_summaries', orgId] })
      setSavedPurchase({ purchaseNo: data.purchase.purchase_no, newProducts: rows.filter((r) => r.is_new_product) })
    },
    onError: (err: Error) => toast.error('Failed to save purchase', err.message),
  })

  function handlePrintNewProductLabels() {
    if (!savedPurchase) return
    for (const r of savedPurchase.newProducts) {
      printBarcodeLabel(r.product_name, r.barcode_value, parseNum(r.price))
    }
  }

  // Clears every field back to a brand-new-purchase state, without leaving the page — used when
  // the post-save popup's "New Purchase" action is chosen, so the merchant can start the next
  // bill immediately. Deliberately does NOT touch supplier selection dropdown data (suppliers
  // query itself), only the form's own entered values.
  function resetFormForNextPurchase() {
    setSupplierId('')
    setInvoiceNo('')
    setPurchaseDate(new Date().toISOString().slice(0, 10))
    setPurchaseType('credit')
    setNotes('')
    setRows([])
    setEntry(emptyRow())
    setEntrySearch('')
    setEditingIndex(null)
    setBillDiscountType('flat')
    setBillDiscountValue('0')
    setRoundOffEnabled(false)
    setPaidNow(false)
    setPaidAmount('')
    setSavedPurchase(null)
    queryClient.invalidateQueries({ queryKey: ['purchase-no-preview', orgId] })
  }

  const filtered = getFiltered(entrySearch)

  // Row 2's field count varies with the gear settings (Qty/Purchase Price/MRP/Retail
  // Price/Category/Unit always render, Expiry Date and HSN Code are conditional) — the lg
  // breakpoint's column count must match exactly how many are visible right now, or the
  // remaining fields leave dead space instead of stretching to fill the row. Tailwind's JIT
  // scanner needs full class names present in source (not built via string interpolation),
  // so this is a literal lookup rather than a template string.
  const row2VisibleCount = 6 + (showExpiryField ? 1 : 0) + (showHsnField ? 1 : 0)
  const row2LgColsClass = {
    6: 'lg:grid-cols-6',
    7: 'lg:grid-cols-7',
    8: 'lg:grid-cols-8',
  }[row2VisibleCount] ?? 'lg:grid-cols-8'

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
                  {(['cash', 'credit'] as const).map((t) => (
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

          {/* Full-width body: item entry, items table, bill summary (bottom bar) */}
          <div className="space-y-5">
              {/* Entry strip */}
              <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300 shrink-0">
                    <Package className="h-4 w-4 text-indigo-400" />{editingIndex !== null ? 'Edit Item' : 'Add Item'}
                  </h2>
                  <div className="flex items-center gap-3">
                    {editingIndex !== null && (
                      <button type="button" onClick={cancelEdit} className="text-xs text-zinc-500 hover:text-zinc-300">
                        Cancel edit
                      </button>
                    )}
                    {/* Track Variants is always rendered here (previously gated behind
                        entry.is_new_product, which meant the header's button set visibly
                        changed the instant a product name was typed — the same class of
                        layout-shift bug already fixed for Row 2's fields). It's fully
                        clickable before a product name is typed, pre-arming has_variants so
                        the moment a NEW product name is typed, the variant editor is already
                        active — see handleEntryNameChange's `base` computation, which now
                        preserves a pre-armed has_variants instead of discarding it via
                        emptyRow(). It is DISABLED (not clickable) whenever an EXISTING product
                        is currently selected (entry.product_id set, !is_new_product) — an
                        existing product's variant status is fixed at the DB level and isn't
                        something this purchase-entry form can toggle; a bare unconditional
                        toggle here previously flipped entry.has_variants (which alone drives
                        Row 1's layout) to true with no matching VariantEditor ever rendering
                        (that requires is_new_product too), leaving "Add to List" permanently
                        blocked with no visible recovery — a real dead end caught in QC, not
                        merely a cosmetic no-op as an earlier version of this comment claimed. */}
                    <label className={cn('flex items-center gap-2', entry.product_id ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>
                      <span className="text-xs text-zinc-400 whitespace-nowrap">Track Variants</span>
                      <div
                        onClick={() => {
                          if (entry.product_id) return
                          setEntry((p) => ({
                            ...p, has_variants: !p.has_variants,
                            variants: !p.has_variants && p.variants.length === 0 ? [emptyVariantRow(p.tax_rate)] : p.variants,
                            has_batches: !p.has_variants ? false : p.has_batches,
                            batches: !p.has_variants ? [] : p.batches,
                          }))
                        }}
                        className={cn(
                          'relative h-5 w-9 rounded-full transition-colors shrink-0',
                          entry.product_id ? 'cursor-not-allowed' : 'cursor-pointer',
                          entry.has_variants ? 'bg-indigo-600' : 'bg-zinc-700',
                        )}
                      >
                        <div className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform', entry.has_variants ? 'translate-x-4' : 'translate-x-0')} />
                      </div>
                    </label>
                    <div className="relative" ref={settingsRef}>
                      <button
                        type="button"
                        title="Field settings"
                        onClick={() => setSettingsOpen((o) => !o)}
                        className={cn('p-1.5 rounded-md border transition-colors', settingsOpen ? 'border-indigo-500 text-indigo-400 bg-indigo-950/30' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600')}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </button>
                      {settingsOpen && (
                        <div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-md border border-zinc-700 bg-zinc-900 shadow-xl p-3 space-y-2.5">
                          <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Show fields</p>
                          {([
                            { key: 'hsn' as const, label: 'HSN Code', value: showHsnField },
                            { key: 'batches' as const, label: 'Batches', value: showBatchesField },
                            { key: 'expiry' as const, label: 'Expiry Date', value: showExpiryField },
                          ]).map((opt) => (
                            <label key={opt.key} className="flex items-center justify-between gap-2 cursor-pointer">
                              <span className="text-xs text-zinc-300">{opt.label}</span>
                              <div
                                onClick={() => toggleFieldPref(opt.key)}
                                className={cn('relative h-5 w-9 rounded-full transition-colors cursor-pointer shrink-0', opt.value ? 'bg-indigo-600' : 'bg-zinc-700')}
                              >
                                <div className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform', opt.value ? 'translate-x-4' : 'translate-x-0')} />
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* Row 1 (has_variants only): Product name shares this row with Product Code —
                    VariantEditor below carries every real barcode/SKU/GST/price per-variant, so
                    the parent's own Product Code is the only identifying field left up here. */}
                {entry.has_variants && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px_200px]">
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

                    {/* Category — parent-product-level, same as the non-variant Row 2's own
                        Category field (see below), never duplicated per-variant. Missing here
                        entirely was a real gap caught in QC: a variant-tracked product created
                        via Purchase entry had no way to set its category at all, silently
                        leaving category_id null until a follow-up edit on /products/:id/edit. */}
                    <div className="space-y-1">
                      <Label className="text-xs">Category</Label>
                      {entry.is_new_product ? (
                        <div className="flex gap-1">
                          <select
                            value={entry.category_id ?? ''}
                            onChange={(e) => setEntry((p) => ({ ...p, category_id: e.target.value || null }))}
                            className="h-9 flex-1 min-w-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">— No category —</option>
                            {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <button type="button" title="Add new category" onClick={() => setShowAddCategory(true)}
                            className="shrink-0 p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <Input value="Existing product" disabled className="h-9 text-xs text-zinc-500" />
                      )}
                    </div>
                  </div>
                )}

                {/* Row 1 (non-variant): Product Name, Product Code, Barcode, Tax %, GST mode —
                    reordered per merchant UX request so the auto-generated Product Code sits
                    right next to the name (its primary identifier), followed by Barcode and tax
                    fields. The separate free-text "SKU" field (extra_sku) was removed from this
                    entry form entirely — extra_sku stays on PurchaseRow/products for edit-mode
                    loading and other call sites, it's just no longer collected here. Rendered
                    only when !has_variants; the has_variants Row 1 above already covers Product
                    Name + Code in that case. */}
                {!entry.has_variants && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_0.9fr_1.4fr_0.7fr_0.9fr]">
                    <div className="space-y-1 relative col-span-2 sm:col-span-1" ref={dropdownRef}>
                      <Label className="text-xs">Product Name *</Label>
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
                          <>
                            <button type="button" title="Scan" onClick={() => setScanOpen(true)} className="shrink-0 p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white">
                              <Camera className="h-3 w-3" />
                            </button>
                            <button type="button" title="Regenerate" onClick={() => setEntry((p) => ({ ...p, barcode_value: generateBarcode(), barcodeManuallyEdited: false }))} className="shrink-0 p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white">
                              <RefreshCw className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                      <ScanBarcodeDialog
                        open={scanOpen}
                        onOpenChange={setScanOpen}
                        onScan={(code) => {
                          setEntry((p) => ({ ...p, barcode_value: code, barcodeManuallyEdited: true }))
                          checkCodeUnique('barcode_value', code, (msg) => setEntry((p) => ({ ...p, codeError: msg })))
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Tax %</Label>
                      <select
                        value={entry.tax_rate}
                        onChange={(e) => setEntry((p) => ({ ...p, tax_rate: Number(e.target.value) as GSTRate }))}
                        className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
                      >
                        {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">GST</Label>
                      <select
                        value={entry.gst_mode}
                        onChange={(e) => setEntry((p) => ({ ...p, gst_mode: e.target.value as 'include' | 'exclude' }))}
                        className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
                      >
                        <option value="include">Include</option>
                        <option value="exclude">Exclude</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Row 2 (non-variant): Qty, Unit, Purchase Price, MRP, Retail Price, Category,
                    Expiry Date, HSN Code — one row, reordered per merchant UX request (Unit
                    moved to sit right after Qty). SP
                    (Special Price) was removed from this entry form entirely (special_price
                    stays on PurchaseRow for edit-mode loading and the variant editor's own SP
                    field, just no longer collected here). Expiry Date and HSN Code were
                    originally their own standalone rows below (each gear-gated) but merchant
                    feedback asked for them folded back into this row instead of a 3rd row.
                    Each price field shows its own Base+GST breakdown driven by this row's own
                    GST mode toggle above, not the org-wide tax_inclusive setting.

                    Category/Unit ALWAYS render (a disabled placeholder when not applicable —
                    existing product selected) so the row's shape doesn't change as you type a
                    product name; that's a per-row, per-keystroke concern, gear settings don't
                    control these two. Expiry Date / HSN Code are the opposite: they are gear-
                    controlled fields, and per merchant feedback a gear toggle turned OFF must
                    make the field disappear from the form, not just gray it out — so these two
                    are conditionally rendered on showExpiryField / showHsnField, changing the
                    row's column count only when a gear setting is toggled, never when typing.

                    The grid's column count at the lg breakpoint is computed from how many of
                    these fields are actually visible right now (row2LgColsClass, 6-8 columns)
                    instead of a fixed lg:grid-cols-8 — with a fixed 8 and only 6 rendered, the
                    row left two empty trailing cells instead of the remaining fields stretching
                    to fill the width. Narrower screens keep the static 2/4-col wrap. */}
                {!entry.has_variants && (
                  <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4', row2LgColsClass)}>
                    <div className="space-y-1">
                      <Label className="text-xs">Qty *</Label>
                      {/* Qty is only locked to the batch-editor rollup while that editor is
                          actually visible (showBatchesField on) — otherwise a row edited after
                          the org turned "Show Batches" off would show a permanently disabled Qty
                          with no visible batch editor to fix it (has_batches can still be true on
                          an already-saved row even when the org-wide setting is currently off). */}
                      <Input type="text" inputMode="decimal" value={entry.qty} onFocus={(e) => e.target.select()}
                        disabled={entry.has_batches && showBatchesField}
                        onChange={(e) => setEntry((p) => ({ ...p, qty: e.target.value.replace(/[^0-9.]/g, '') || '0' }))}
                        className={cn('h-9 text-sm text-center', entry.has_batches && showBatchesField && 'opacity-60 cursor-not-allowed')} />
                      {entry.has_batches && showBatchesField && (
                        <p className="text-[10px] text-zinc-500">Allocated from batches below</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Unit{entry.is_new_product && ' *'}</Label>
                      {entry.is_new_product ? (
                        <select
                          value={entry.unit_id}
                          onChange={(e) => setEntry((p) => ({ ...p, unit_id: e.target.value, entry_unit_id: e.target.value }))}
                          className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {!entry.unit_id && <option value="">— Select unit —</option>}
                          {units?.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                        </select>
                      ) : (
                        <Input value={unitOf(entry.unit_id)?.name ?? '—'} disabled className="h-9 text-xs text-zinc-500" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Purchase Price</Label>
                      <Input type="text" inputMode="decimal" value={entry.unit_cost} onFocus={(e) => e.target.select()}
                        onChange={(e) => setEntry((p) => ({ ...p, unit_cost: e.target.value.replace(/[^0-9.]/g, '') || '0' }))} className="h-9 text-sm" />
                      {entry.gst_mode === 'include' && parseNum(entry.unit_cost) > 0 && entry.tax_rate > 0 && (() => {
                        const { base, tax } = splitInclusiveGST(parseNum(entry.unit_cost), entry.tax_rate)
                        return <p className="text-[10px] text-zinc-500">Base: {formatINR(base)} + GST: {formatINR(tax)}</p>
                      })()}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">MRP</Label>
                      <Input type="text" inputMode="decimal" value={entry.mrp} onFocus={(e) => e.target.select()}
                        onChange={(e) => setEntry((p) => ({ ...p, mrp: e.target.value.replace(/[^0-9.]/g, '') }))} className="h-9 text-sm" />
                      {entry.gst_mode === 'include' && parseNum(entry.mrp) > 0 && entry.tax_rate > 0 && (() => {
                        const { base, tax } = splitInclusiveGST(parseNum(entry.mrp), entry.tax_rate)
                        return <p className="text-[10px] text-zinc-500">Base: {formatINR(base)} + GST: {formatINR(tax)}</p>
                      })()}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Retail Price</Label>
                      <Input type="text" inputMode="decimal" value={entry.price} onFocus={(e) => e.target.select()}
                        onChange={(e) => setEntry((p) => ({ ...p, price: e.target.value.replace(/[^0-9.]/g, '') || '0' }))} className="h-9 text-sm" />
                      {entry.gst_mode === 'include' && parseNum(entry.price) > 0 && entry.tax_rate > 0 && (() => {
                        const { base, tax } = splitInclusiveGST(parseNum(entry.price), entry.tax_rate)
                        return <p className="text-[10px] text-zinc-500">Base: {formatINR(base)} + GST: {formatINR(tax)}</p>
                      })()}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Category</Label>
                      {entry.is_new_product ? (
                        <div className="flex gap-1">
                          <select
                            value={entry.category_id ?? ''}
                            onChange={(e) => setEntry((p) => ({ ...p, category_id: e.target.value || null }))}
                            className="h-9 flex-1 min-w-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">— No category —</option>
                            {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <button type="button" title="Add new category" onClick={() => setShowAddCategory(true)}
                            className="shrink-0 p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <Input value="Existing product" disabled className="h-9 text-xs text-zinc-500" />
                      )}
                    </div>

                    {/* Expiry Date — only rendered at all when the gear's "Show Expiry Date"
                        is on; turning that off removes the field from the form entirely rather
                        than merely disabling it. */}
                    {showExpiryField && (
                      <div className="space-y-1">
                        <Label className="text-xs">Expiry Date</Label>
                        <Input type="date" value={entry.expiry_date}
                          onChange={(e) => setEntry((p) => ({ ...p, expiry_date: e.target.value }))}
                          className="h-9 text-sm" />
                      </div>
                    )}

                    {/* HSN Code — only rendered when the gear's "Show HSN Code" is on. New-
                        product-only within that (existing products already carry their own
                        HSN), so it still shows a disabled placeholder for an existing-product
                        row — same convention as Category/Unit — rather than disappearing
                        depending on what's typed in Product Name. */}
                    {showHsnField && (
                      <div className="space-y-1">
                        <Label className="text-xs">HSN Code</Label>
                        <Input
                          placeholder="e.g. 2501"
                          value={entry.hsn_code}
                          disabled={!entry.is_new_product}
                          onChange={(e) => setEntry((p) => ({ ...p, hsn_code: e.target.value }))}
                          className={cn('h-9 text-xs', !entry.is_new_product && 'opacity-60 cursor-not-allowed')}
                        />
                        {hsnCodeError(entry.hsn_code) && (
                          <p className="text-[11px] text-amber-400">{hsnCodeError(entry.hsn_code)}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

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

                {/* Add button — MRP/Retail/SP now live in Row 2 above for the non-variant case
                    (moved there to mirror VariantEditor's own row shape), so this row is just
                    the action button for both has_variants and non-variant entries. */}
                <div className="grid grid-cols-1 gap-2">
                  <Button type="button" size="sm" className="h-9 w-full sm:w-auto sm:ml-auto sm:px-8" onClick={addEntryToGrid}
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

                {/* Variants editor — Track Variants toggle itself now lives in the card header
                    (left of the gear icon), this just renders the per-variant rows once it's on. */}
                {entry.is_new_product && entry.has_variants && (
                  <VariantEditor
                    variants={entry.variants}
                    onChange={(variants) => setEntry((p) => ({ ...p, variants }))}
                    defaultTaxRate={entry.tax_rate}
                    showHsnField={showHsnField}
                  />
                )}

                {/* Batches — no toggle at all any more: the gear's "Show Batches" switch is the
                    sole on/off control (see the has_batches-sync effect near the top of this
                    component), so once it's on for a new, non-variant product the editor just
                    appears directly. Hidden when variants are on, since each variant carries its
                    own expiry_date directly. */}
                {entry.is_new_product && !entry.has_variants && showBatchesField && entry.has_batches && (
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400">Batches</Label>
                    <div className="space-y-1.5">
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
                      <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                      <TableHead className="w-[5%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center text-zinc-500 py-8">No items added yet</TableCell></TableRow>
                    ) : rows.flatMap((r, i) => {
                      const editIcon = (
                        <button type="button" onClick={() => editRow(i)} className="p-1 rounded text-zinc-600 hover:text-indigo-400 hover:bg-indigo-900/20 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )
                      const removeIcon = (
                        <button type="button" onClick={() => removeRow(i)} className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )

                      if (r.has_variants && r.variants.length > 0) {
                        const validVariants = r.variants.filter((v) => v.variant_name.trim())
                        return validVariants.map((v, vi) => (
                          <TableRow key={`${i}-${vi}`} className={cn('hover:bg-zinc-800/40 transition-colors', editingIndex === i ? 'bg-indigo-950/30' : i % 2 === 1 && 'bg-zinc-900/30')}>
                            <TableCell className="font-mono text-xs text-zinc-400 whitespace-nowrap">{r.sku}{v.sku ? ` / ${v.sku}` : ''}</TableCell>
                            <TableCell className="text-sm text-zinc-200 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span>{r.product_name} — {v.variant_name}</span>
                                <span className={cn('shrink-0 text-[10px] px-1.5 py-0.5 rounded-full', r.is_new_product ? 'bg-indigo-600/20 text-indigo-300' : 'bg-blue-600/20 text-blue-300')}>
                                  {r.is_new_product ? 'New' : 'Existing'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm text-zinc-300 whitespace-nowrap">{formatINR(parseNum(v.purchase_price))}</TableCell>
                            <TableCell className="text-right text-sm text-zinc-400 whitespace-nowrap">{v.tax_rate}%</TableCell>
                            <TableCell className="text-right text-sm text-zinc-300 whitespace-nowrap">{parseNum(v.qty)}</TableCell>
                            <TableCell className="font-mono text-xs text-zinc-400 whitespace-nowrap">{v.barcode_value}</TableCell>
                            <TableCell className="text-right text-sm text-zinc-400 whitespace-nowrap">{v.mrp ? formatINR(parseNum(v.mrp)) : '—'}</TableCell>
                            <TableCell className="text-right text-sm text-zinc-300 whitespace-nowrap">{v.sale_price ? formatINR(parseNum(v.sale_price)) : '—'}</TableCell>
                            <TableCell className="text-right text-sm font-medium text-white whitespace-nowrap">{formatINR(toMoney(parseNum(v.purchase_price) * parseNum(v.qty)))}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">{editIcon}{removeIcon}</div>
                            </TableCell>
                          </TableRow>
                        ))
                      }

                      return [(
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
                          <TableCell className="text-right text-sm font-medium text-white whitespace-nowrap">{formatINR(toMoney(parseNum(r.unit_cost) * rowBaseQty(r)))}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">{editIcon}{removeIcon}</div>
                          </TableCell>
                        </TableRow>
                      )]
                    })}
                  </TableBody>
                </Table>
                </div>
              </div>

            {/* Bill Summary: sticky card pinned to viewport bottom — figures row on top, then a
                payment + action row below it. Paid/Balance Due is a genuine amount-paid-at-save
                capture backed by a real purchase_payments row (see saveMutation), not just a
                display — this is deliberately separate from PurchasesPage.tsx's own "Record
                Payment" dialog (which handles LATER partial payments against an already-saved
                bill); this one is for the common case of paying something at the moment of entry. */}
            <div className="sticky bottom-0 -mx-4 lg:-mx-6 px-4 lg:px-6 py-3 bg-zinc-950/95 backdrop-blur border-t border-zinc-800">
              <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                  <Receipt className="h-4 w-4 text-indigo-400" />Bill Summary
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-3 border-b border-zinc-800">
                  <div className="text-sm">
                    <span className="text-zinc-500 mr-1.5">Taxable Amount</span>
                    <span className="text-zinc-200 font-medium">{formatINR(totals.taxable_amount)}</span>
                  </div>

                  <div className="w-px h-8 bg-zinc-800" />

                  {interstate ? (
                    <div className="text-sm">
                      <span className="text-zinc-500 mr-1.5">IGST</span>
                      <span className="text-zinc-200 font-medium">{formatINR(totals.igst_total)}</span>
                    </div>
                  ) : (
                    <div className="text-sm">
                      <span className="text-zinc-500 mr-1.5">CGST</span>
                      <span className="text-zinc-200 font-medium">{formatINR(totals.cgst_total)}</span>
                      <span className="text-zinc-500 mx-1.5">·</span>
                      <span className="text-zinc-500 mr-1.5">SGST</span>
                      <span className="text-zinc-200 font-medium">{formatINR(totals.sgst_total)}</span>
                    </div>
                  )}

                  <div className="w-px h-8 bg-zinc-800" />

                  <div className="text-sm">
                    <span className="text-zinc-500 mr-1.5">Tax Total</span>
                    <span className="text-zinc-200 font-medium">{formatINR(totals.tax_total)}</span>
                  </div>

                  <div className="w-px h-8 bg-zinc-800" />

                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Bill Discount</Label>
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

                  <div className="w-px h-8 bg-zinc-800" />

                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={roundOffEnabled} onChange={(e) => setRoundOffEnabled(e.target.checked)} />
                    Round Off
                  </label>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-y-3">
                  <div className="flex items-center flex-wrap gap-x-5 gap-y-2">
                    <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer whitespace-nowrap">
                      <input type="checkbox" checked={paidNow} onChange={(e) => { setPaidNow(e.target.checked); if (e.target.checked && !paidAmount) setPaidAmount(String(grandTotal)) }} disabled={isEdit} />
                      Paid
                    </label>
                    {paidNow && (
                      <Input type="text" inputMode="decimal" value={paidAmount} onFocus={(e) => e.target.select()}
                        onChange={(e) => setPaidAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="0" className="h-8 w-28 text-sm" />
                    )}

                    <div className="w-px h-8 bg-zinc-800" />

                    <div className="text-sm">
                      <span className="text-zinc-500 mr-1.5">Balance Due</span>
                      <span className={cn('font-semibold', balanceDue > 0 ? 'text-amber-400' : 'text-emerald-400')}>
                        {formatINR(balanceDue)}
                      </span>
                    </div>

                    <div className="w-px h-8 bg-zinc-800" />

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-400">Total Bill Amount</span>
                      <span className="text-xl font-bold text-white">{formatINR(grandTotal)}</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => requestNavigation(() => navigate('/purchases'))}>Cancel</Button>
                    <Button type="button" disabled={saveMutation.isPending || rows.length === 0} onClick={() => saveMutation.mutate()}>
                      {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Purchase'}
                    </Button>
                  </div>
                </div>
              </div>
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

      {/* Dialog focus rules per CLAUDE.md: onOpenAutoFocus/onFocusOutside must preventDefault to
          stop Radix's FocusScope from stealing focus back to the dialog container on every
          re-render (each keystroke) — see index.css [role="dialog"]:focus override too. */}
      <Dialog open={showAddCategory} onOpenChange={(open) => { setShowAddCategory(open); if (!open) setNewCategoryName('') }}>
        <DialogContent
          className="max-w-sm outline-none ring-0 focus:ring-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Category Name</Label>
            <Input
              autoFocus
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newCategoryName.trim()) { e.preventDefault(); createCategoryMutation.mutate() } }}
              placeholder="e.g. Electronics"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowAddCategory(false)}>Cancel</Button>
            <Button type="button" disabled={!newCategoryName.trim() || createCategoryMutation.isPending} onClick={() => createCategoryMutation.mutate()}>
              {createCategoryMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Creating...</> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-save confirmation — reference number, new-product list, and print/next-purchase
          actions. Not dismissible by clicking outside/Escape (onInteractOutside/onEscapeKeyDown
          preventDefault) since the purchase is already committed and this popup is the only place
          the merchant sees the reference number and gets to print labels; an accidental dismiss
          would lose that chance. "New Purchase" resets the page in place rather than navigating,
          so the next bill can start immediately. */}
      <Dialog open={!!savedPurchase} onOpenChange={() => { /* only closable via the buttons below */ }}>
        <DialogContent
          className="max-w-md outline-none ring-0 focus:ring-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400">
              <Receipt className="h-4 w-4" />Purchase Saved
            </DialogTitle>
          </DialogHeader>
          {savedPurchase && (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2">
                <p className="text-xs text-zinc-500">Reference Number</p>
                <p className="text-sm font-mono font-semibold text-emerald-300">{savedPurchase.purchaseNo}</p>
              </div>

              {savedPurchase.newProducts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-zinc-500">
                    {savedPurchase.newProducts.length} new product{savedPurchase.newProducts.length > 1 ? 's' : ''} created
                  </p>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                    {savedPurchase.newProducts.map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                        <span className="text-zinc-200 truncate">{r.product_name}</span>
                        <span className="font-mono text-xs text-zinc-500 shrink-0 ml-2">{r.sku}</span>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={handlePrintNewProductLabels}>
                    <Printer className="h-3.5 w-3.5 mr-1" />Print Barcode Labels
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => navigate('/purchases')}>Go to Purchases</Button>
            <Button type="button" onClick={resetFormForNextPurchase}>New Purchase</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
