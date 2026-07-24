import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, X, Eye, ShoppingBag, Trash2, Loader2, Pencil,
  Upload, Download, FileSpreadsheet, AlertCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/hooks/use-toast'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Supplier { id: string; name: string; phone: string | null; email: string | null; gstin: string | null }
interface Product  { id: string; name: string; price: number }

interface PurchaseItemForm {
  product_id: string | null
  product_name: string
  qty: string        // kept as string so input "0" can be selected & replaced
  unit_cost: string
}

interface PurchaseItem {
  product_id: string | null
  product_name: string
  qty: number
  unit_cost: number
  line_total: number
}

interface Purchase {
  id: string
  purchase_no: string | null
  invoice_no: string | null
  total_amount: number
  notes: string | null
  created_at: string
  suppliers: { name: string } | null
  purchase_items: { id: string }[]
}

interface PurchaseItemDetail {
  id: string; product_name: string; qty: number; unit_cost: number; line_total: number
}

interface ViewPurchase extends Purchase {
  purchase_items_detail?: PurchaseItemDetail[]
}

// ─── Pure helpers (defined once, outside any component) ───────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  return digits.length <= 5 ? digits : `${digits.slice(0, 5)} ${digits.slice(5)}`
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

function lineTotal(qty: string, unit_cost: string): number {
  return parseNum(qty) * parseNum(unit_cost)
}

const emptyFormItem = (): PurchaseItemForm => ({ product_id: null, product_name: '', qty: '1', unit_cost: '0' })

function downloadTemplate() {
  const csv = 'Product Name,Qty,Unit Cost (Rs)\nExample Product,10,250.00\n'
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'purchase_import_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function parseCSV(text: string): { items: PurchaseItemForm[]; errors: string[] } {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return { items: [], errors: ['CSV is empty or has no data rows'] }
  const errors: string[] = []
  const items: PurchaseItemForm[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const name = cols[0] ?? ''
    if (!name) { errors.push(`Row ${i + 1}: Product name is empty`); continue }
    const qtyNum = parseFloat(cols[1] ?? '')
    if (isNaN(qtyNum) || qtyNum <= 0) { errors.push(`Row ${i + 1}: Invalid qty "${cols[1]}"`); continue }
    const costNum = parseFloat(cols[2] ?? '')
    if (isNaN(costNum) || costNum < 0) { errors.push(`Row ${i + 1}: Invalid cost "${cols[2]}"`); continue }
    items.push({ product_id: null, product_name: name, qty: String(qtyNum), unit_cost: String(costNum) })
  }
  return { items, errors }
}

// ─── PurchaseFormBody — top-level component, stable identity ─────────────────
// Props are explicit so React never remounts this on parent re-renders.

interface PurchaseFormBodyProps {
  supplierId: string
  setSupplierId: (v: string) => void
  invoiceNo: string
  setInvoiceNo: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  formItems: PurchaseItemForm[]
  productSearches: string[]
  productDropdownOpen: number | null
  dropdownRef: React.MutableRefObject<HTMLDivElement | null>
  products: Product[] | undefined
  suppliers: Supplier[] | undefined
  showAddSupplier: boolean
  setShowAddSupplier: (v: boolean) => void
  newSupplierName: string
  setNewSupplierName: (v: string) => void
  newSupplierPhone: string
  setNewSupplierPhone: (v: string) => void
  savingSupplier: boolean
  totalAmount: number
  onAddSupplier: () => void
  onUpdateItem: (index: number, patch: Partial<PurchaseItemForm>) => void
  onAddItem: () => void
  onRemoveItem: (index: number) => void
  onSelectProduct: (index: number, product: Product) => void
  onSetProductSearches: React.Dispatch<React.SetStateAction<string[]>>
  onSetDropdownOpen: React.Dispatch<React.SetStateAction<number | null>>
}

function PurchaseFormBody({
  supplierId, setSupplierId,
  invoiceNo, setInvoiceNo,
  notes, setNotes,
  formItems, productSearches, productDropdownOpen, dropdownRef, products, suppliers,
  showAddSupplier, setShowAddSupplier,
  newSupplierName, setNewSupplierName,
  newSupplierPhone, setNewSupplierPhone,
  savingSupplier, totalAmount,
  onAddSupplier, onUpdateItem, onAddItem, onRemoveItem, onSelectProduct,
  onSetProductSearches, onSetDropdownOpen,
}: PurchaseFormBodyProps) {
  function getFiltered(search: string): Product[] {
    if (!products) return []
    if (!search.trim()) return products.slice(0, 8)
    const lower = search.toLowerCase()
    return products.filter((p) => p.name.toLowerCase().includes(lower)).slice(0, 8)
  }

  return (
    <div className="space-y-5">
      {/* Supplier */}
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

        {showAddSupplier && (
          <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-800/60 p-3 space-y-2">
            <p className="text-xs font-medium text-zinc-400">Quick-add supplier</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Name *</Label>
                <Input
                  placeholder="Supplier name"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  placeholder="98765 43210"
                  inputMode="numeric"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(formatPhone(e.target.value))}
                  className="h-8 text-sm"
                  maxLength={11}
                />
                {newSupplierPhone.replace(/\D/g, '').length > 0 &&
                  newSupplierPhone.replace(/\D/g, '').length < 10 && (
                  <p className="text-[11px] text-amber-400">10-digit number required</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                onClick={() => { setShowAddSupplier(false); setNewSupplierName(''); setNewSupplierPhone('') }}>
                Cancel
              </Button>
              <Button type="button" size="sm" className="h-7 text-xs"
                disabled={!newSupplierName.trim() || savingSupplier}
                onClick={onAddSupplier}>
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
          <Label>Notes</Label>
          <Input placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <Separator />

      {/* Items */}
      <div className="space-y-2">
        <Label>Items</Label>
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Product</TableHead>
                <TableHead className="w-[15%]">Qty</TableHead>
                <TableHead className="w-[22%]">Unit Cost (₹)</TableHead>
                <TableHead className="w-[18%] text-right">Total</TableHead>
                <TableHead className="w-[5%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formItems.map((item, index) => {
                const filtered = getFiltered(productSearches[index] ?? '')
                return (
                  <TableRow key={index}>
                    <TableCell className="py-1.5 relative">
                      <div ref={productDropdownOpen === index ? dropdownRef : null} className="relative">
                        <Input
                          placeholder="Search or type product name..."
                          value={productSearches[index] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value
                            onSetProductSearches((prev) => { const next = [...prev]; next[index] = val; return next })
                            onUpdateItem(index, { product_id: null, product_name: val })
                            onSetDropdownOpen(index)
                          }}
                          onFocus={() => onSetDropdownOpen(index)}
                          className="h-8 text-sm"
                        />
                        {productDropdownOpen === index && filtered.length > 0 && (
                          <div className="absolute top-full left-0 z-50 mt-0.5 w-full rounded-md border border-zinc-700 bg-zinc-900 shadow-xl max-h-48 overflow-y-auto">
                            {filtered.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-zinc-800 text-zinc-200"
                                onMouseDown={(e) => { e.preventDefault(); onSelectProduct(index, p) }}
                              >
                                <span>{p.name}</span>
                                <span className="text-zinc-500 text-xs">{formatINR(p.price)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={item.qty}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => onUpdateItem(index, { qty: e.target.value.replace(/[^0-9]/g, '') || '0' })}
                        className="h-8 text-sm w-full text-center"
                      />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={item.unit_cost}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => onUpdateItem(index, { unit_cost: e.target.value.replace(/[^0-9.]/g, '') || '0' })}
                        className="h-8 text-sm w-full"
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium text-zinc-200 py-1.5">
                      {formatINR(lineTotal(item.qty, item.unit_cost))}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {formItems.length > 1 && (
                        <button type="button" onClick={() => onRemoveItem(index)}
                          className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAddItem} className="text-xs h-7">
          <Plus className="h-3.5 w-3.5 mr-1" />Add Item
        </Button>
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        <span className="text-sm text-zinc-400">Total</span>
        <span className="text-lg font-bold text-white">{formatINR(totalAmount)}</span>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PurchasesPage() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [showNew, setShowNew] = useState(false)
  const [viewPurchase, setViewPurchase] = useState<ViewPurchase | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [editingPurchase, setEditingPurchase] = useState<ViewPurchase | null>(null)
  const [showEdit, setShowEdit] = useState(false)

  // Import state
  const [showImport, setShowImport] = useState(false)
  const [importItems, setImportItems] = useState<PurchaseItemForm[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importParsed, setImportParsed] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)

  // Shared form state (New + Edit)
  const [supplierId, setSupplierId] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [formItems, setFormItems] = useState<PurchaseItemForm[]>([emptyFormItem()])
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [productSearches, setProductSearches] = useState<string[]>([''])
  const [productDropdownOpen, setProductDropdownOpen] = useState<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const totalAmount = formItems.reduce((sum, it) => sum + lineTotal(it.qty, it.unit_cost), 0)

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('id, purchase_no, invoice_no, total_amount, notes, created_at, suppliers(name), purchase_items(id)')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Purchase[]
    },
  })

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name, phone, email, gstin').eq('organization_id', orgId!).order('name')
      return (data ?? []) as Supplier[]
    },
  })

  const { data: products } = useQuery({
    queryKey: ['products-all', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, price').eq('organization_id', orgId!).eq('is_active', true).order('name')
      return (data ?? []) as Product[]
    },
  })

  // ── Outside-click close dropdown ──────────────────────────────────────────

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProductDropdownOpen(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Form helpers ──────────────────────────────────────────────────────────

  function resetForm() {
    setSupplierId('')
    setInvoiceNo('')
    setNotes('')
    setFormItems([emptyFormItem()])
    setProductSearches([''])
    setShowAddSupplier(false)
    setNewSupplierName('')
    setNewSupplierPhone('')
    setEditingPurchase(null)
  }

  function updateItem(index: number, patch: Partial<PurchaseItemForm>) {
    setFormItems((prev) => { const next = [...prev]; next[index] = { ...next[index], ...patch }; return next })
  }

  function addItem() {
    setFormItems((prev) => [...prev, emptyFormItem()])
    setProductSearches((prev) => [...prev, ''])
  }

  function removeItem(index: number) {
    setFormItems((prev) => prev.filter((_, i) => i !== index))
    setProductSearches((prev) => prev.filter((_, i) => i !== index))
  }

  function selectProduct(index: number, product: Product) {
    updateItem(index, { product_id: product.id, product_name: product.name, unit_cost: String(product.price) })
    setProductSearches((prev) => { const next = [...prev]; next[index] = product.name; return next })
    setProductDropdownOpen(null)
  }

  function getValidItems(items: PurchaseItemForm[]): PurchaseItem[] {
    return items
      .filter((it) => it.product_name.trim() && parseNum(it.qty) > 0)
      .map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name.trim(),
        qty: parseNum(it.qty),
        unit_cost: parseNum(it.unit_cost),
        line_total: lineTotal(it.qty, it.unit_cost),
      }))
  }

  async function generatePurchaseNo(): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const { count } = await supabase.from('purchases').select('id', { count: 'exact', head: true }).eq('organization_id', orgId!)
    return `PUR-${datePart}-${String((count ?? 0) + 1).padStart(4, '0')}`
  }

  async function savePurchaseItems(purchaseId: string, validItems: PurchaseItem[]) {
    const { error } = await supabase.from('purchase_items').insert(
      validItems.map((it) => ({
        purchase_id: purchaseId, organization_id: orgId!,
        product_id: it.product_id ?? null, product_name: it.product_name,
        qty: it.qty, unit_cost: it.unit_cost, line_total: it.line_total,
      }))
    )
    if (error) throw error
    for (const it of validItems) {
      if (!it.product_id) continue
      const { data: inv } = await supabase.from('inventory').select('stock_qty').eq('product_id', it.product_id).eq('organization_id', orgId!).maybeSingle()
      await supabase.from('inventory').upsert(
        { product_id: it.product_id, organization_id: orgId!, stock_qty: (inv?.stock_qty ?? 0) + it.qty },
        { onConflict: 'product_id,organization_id' }
      )
    }
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

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in')
      const validItems = getValidItems(formItems)
      if (validItems.length === 0) throw new Error('Add at least one item with product name and qty')
      const purchaseNo = await generatePurchaseNo()
      const total = validItems.reduce((s, it) => s + it.line_total, 0)
      const { data: purchase, error } = await supabase.from('purchases').insert({
        organization_id: orgId!, supplier_id: supplierId || null,
        purchase_no: purchaseNo, invoice_no: invoiceNo.trim() || null,
        notes: notes.trim() || null, total_amount: total, created_by: user.id,
      }).select('id').single()
      if (error) throw error
      await savePurchaseItems(purchase.id, validItems)
      return purchaseNo
    },
    onSuccess: (purchaseNo) => {
      queryClient.invalidateQueries({ queryKey: ['purchases', orgId] })
      queryClient.invalidateQueries({ queryKey: ['inventory', orgId] })
      toast.success(`Purchase saved — ${purchaseNo}`)
      resetForm(); setShowNew(false)
    },
    onError: (err: Error) => toast.error('Failed to save purchase', err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingPurchase) throw new Error('No purchase selected')
      const validItems = getValidItems(formItems)
      if (validItems.length === 0) throw new Error('Add at least one item')
      const total = validItems.reduce((s, it) => s + it.line_total, 0)
      const { error: updateError } = await supabase.from('purchases').update({
        supplier_id: supplierId || null, invoice_no: invoiceNo.trim() || null,
        notes: notes.trim() || null, total_amount: total,
      }).eq('id', editingPurchase.id).eq('organization_id', orgId!)
      if (updateError) throw updateError
      const { error: delErr } = await supabase.from('purchase_items').delete().eq('purchase_id', editingPurchase.id).eq('organization_id', orgId!)
      if (delErr) throw delErr
      await savePurchaseItems(editingPurchase.id, validItems)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases', orgId] })
      queryClient.invalidateQueries({ queryKey: ['inventory', orgId] })
      toast.success('Purchase updated')
      resetForm(); setShowEdit(false)
    },
    onError: (err: Error) => toast.error('Failed to update purchase', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase.from('purchase_items').delete().eq('purchase_id', id).eq('organization_id', orgId!)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('purchases').delete().eq('id', id).eq('organization_id', orgId!)
      if (e2) throw e2
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases', orgId] })
      toast.success('Purchase deleted')
      setDeleteConfirmId(null)
      if (viewPurchase?.id === deleteConfirmId) setViewPurchase(null)
    },
    onError: (err: Error) => toast.error('Delete failed', err.message),
  })

  const importSaveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in')
      const validItems = getValidItems(importItems)
      if (validItems.length === 0) throw new Error('No valid items to import')
      const purchaseNo = await generatePurchaseNo()
      const total = validItems.reduce((s, it) => s + it.line_total, 0)
      const { data: purchase, error } = await supabase.from('purchases').insert({
        organization_id: orgId!, purchase_no: purchaseNo, total_amount: total, created_by: user.id,
      }).select('id').single()
      if (error) throw error
      await savePurchaseItems(purchase.id, validItems)
      return purchaseNo
    },
    onSuccess: (purchaseNo) => {
      queryClient.invalidateQueries({ queryKey: ['purchases', orgId] })
      queryClient.invalidateQueries({ queryKey: ['inventory', orgId] })
      toast.success(`Import saved — ${purchaseNo}`)
      setShowImport(false); setImportItems([]); setImportErrors([]); setImportParsed(false)
    },
    onError: (err: Error) => toast.error('Import failed', err.message),
  })

  // ── View / Edit loaders ───────────────────────────────────────────────────

  async function handleViewPurchase(purchase: Purchase) {
    setViewLoading(true)
    const { data, error } = await supabase.from('purchase_items').select('id, product_name, qty, unit_cost, line_total').eq('purchase_id', purchase.id)
    setViewLoading(false)
    if (error) { toast.error('Failed to load purchase details', error.message); return }
    setViewPurchase({ ...purchase, purchase_items_detail: data ?? [] })
  }

  async function handleEditPurchase(purchase: Purchase) {
    setViewLoading(true)
    const { data, error } = await supabase.from('purchase_items').select('id, product_name, qty, unit_cost, line_total').eq('purchase_id', purchase.id)
    setViewLoading(false)
    if (error) { toast.error('Failed to load purchase details', error.message); return }
    setEditingPurchase({ ...purchase, purchase_items_detail: data ?? [] })
    setSupplierId(purchase.suppliers ? (suppliers?.find((s) => s.name === purchase.suppliers!.name)?.id ?? '') : '')
    setInvoiceNo(purchase.invoice_no ?? '')
    setNotes(purchase.notes ?? '')
    const loaded: PurchaseItemForm[] = (data ?? []).map((it) => ({ product_id: null, product_name: it.product_name, qty: String(it.qty), unit_cost: String(it.unit_cost) }))
    setFormItems(loaded.length > 0 ? loaded : [emptyFormItem()])
    setProductSearches(loaded.map((it) => it.product_name))
    setShowEdit(true)
  }

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const { items, errors } = parseCSV(ev.target?.result as string)
      setImportItems(items); setImportErrors(errors); setImportParsed(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  function updateImportItem(index: number, patch: Partial<PurchaseItemForm>) {
    setImportItems((prev) => { const next = [...prev]; next[index] = { ...next[index], ...patch }; return next })
  }

  // Shared props for PurchaseFormBody
  const formProps: PurchaseFormBodyProps = {
    supplierId, setSupplierId,
    invoiceNo, setInvoiceNo,
    notes, setNotes,
    formItems, productSearches, productDropdownOpen, dropdownRef, products, suppliers,
    showAddSupplier, setShowAddSupplier,
    newSupplierName, setNewSupplierName,
    newSupplierPhone, setNewSupplierPhone,
    savingSupplier, totalAmount,
    onAddSupplier: handleAddSupplier,
    onUpdateItem: updateItem,
    onAddItem: addItem,
    onRemoveItem: removeItem,
    onSelectProduct: selectProduct,
    onSetProductSearches: setProductSearches,
    onSetDropdownOpen: setProductDropdownOpen,
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Purchases</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{purchases?.length ?? 0} records</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setImportItems([]); setImportErrors([]); setImportParsed(false); setShowImport(true) }}>
            <Upload className="h-4 w-4 mr-1" />Import CSV
          </Button>
          <Button onClick={() => { resetForm(); setShowNew(true) }}>
            <Plus className="h-4 w-4" />New Purchase
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchase No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Invoice No</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases && purchases.length > 0 ? purchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs text-indigo-300 whitespace-nowrap">
                    {p.purchase_no ?? <span className="text-zinc-600">—</span>}
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm whitespace-nowrap">{formatDate(p.created_at)}</TableCell>
                  <TableCell className="font-medium text-zinc-100">
                    {p.suppliers?.name ?? <span className="text-zinc-500 italic">No supplier</span>}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-zinc-300">{p.invoice_no ?? <span className="text-zinc-600">—</span>}</TableCell>
                  <TableCell className="text-right text-zinc-400">{p.purchase_items.length}</TableCell>
                  <TableCell className="text-right font-semibold text-white">{formatINR(p.total_amount)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-400 hover:text-white" onClick={() => handleViewPurchase(p)}>
                        <Eye className="h-3.5 w-3.5 mr-1" />View
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-400 hover:text-white" onClick={() => handleEditPurchase(p)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                      </Button>
                      <button onClick={() => setDeleteConfirmId(p.id)} className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-zinc-500">
                      <ShoppingBag className="h-10 w-10 text-zinc-700" />
                      <p className="text-sm">No purchases yet. Click New Purchase to record stock received.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── New Purchase Dialog ── */}
      <Dialog open={showNew} onOpenChange={(open) => { if (!open) resetForm(); setShowNew(open) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Purchase</DialogTitle></DialogHeader>
          <PurchaseFormBody {...formProps} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { resetForm(); setShowNew(false) }}>Cancel</Button>
            <Button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Purchase'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Purchase Dialog ── */}
      <Dialog open={showEdit} onOpenChange={(open) => { if (!open) { resetForm(); setShowEdit(false) } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit Purchase
              {editingPurchase?.purchase_no && <span className="ml-2 font-mono text-sm text-indigo-300">{editingPurchase.purchase_no}</span>}
            </DialogTitle>
          </DialogHeader>
          {viewLoading
            ? <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            : <PurchaseFormBody {...formProps} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { resetForm(); setShowEdit(false) }}>Cancel</Button>
            <Button type="button" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
              {updateMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import CSV Dialog ── */}
      <Dialog open={showImport} onOpenChange={(open) => { if (!open) { setShowImport(false); setImportItems([]); setImportErrors([]); setImportParsed(false) } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-indigo-400" />Import Purchase from CSV
            </DialogTitle>
          </DialogHeader>

          {!importParsed ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 border border-indigo-600/40 text-xs font-bold text-indigo-300">1</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-200">Download the template</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Fill in Product Name, Qty, and Unit Cost for each item</p>
                    <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={downloadTemplate}>
                      <Download className="h-3.5 w-3.5 mr-1" />Download Template (CSV)
                    </Button>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 border border-indigo-600/40 text-xs font-bold text-indigo-300">2</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-200">Upload your filled CSV file</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Supplier PDF or image import is not supported — use CSV only for accurate data</p>
                    <label className="mt-2 cursor-pointer inline-block">
                      <input ref={importFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
                      <div className="flex items-center gap-2 rounded-md border border-dashed border-zinc-600 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 hover:border-indigo-500 hover:text-white transition-colors">
                        <Upload className="h-4 w-4" />Choose CSV file
                      </div>
                    </label>
                  </div>
                </div>
              </div>
              <p className="text-xs text-zinc-600 text-center">For supplier PDF / image — open the file, manually enter items using New Purchase.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {importErrors.length > 0 && (
                <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
                    <AlertCircle className="h-3.5 w-3.5" />{importErrors.length} row(s) skipped:
                  </div>
                  {importErrors.map((e, i) => <p key={i} className="text-xs text-amber-500 pl-5">{e}</p>)}
                </div>
              )}
              {importItems.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <p className="text-sm">No valid items found. Check your CSV and try again.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => { setImportParsed(false); setImportItems([]); setImportErrors([]) }}>Try Again</Button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-zinc-300"><span className="font-semibold text-white">{importItems.length}</span> items parsed — review and edit before saving.</p>
                  <div className="rounded-lg border border-zinc-800 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[45%]">Product Name</TableHead>
                          <TableHead className="w-[18%]">Qty</TableHead>
                          <TableHead className="w-[25%]">Unit Cost (₹)</TableHead>
                          <TableHead className="w-[10%] text-right">Total</TableHead>
                          <TableHead className="w-[5%]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importItems.map((item, i) => (
                          <TableRow key={i}>
                            <TableCell className="py-1.5">
                              <Input value={item.product_name} onChange={(e) => updateImportItem(i, { product_name: e.target.value })} className="h-8 text-sm" />
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input type="text" inputMode="numeric" value={item.qty} onFocus={(e) => e.target.select()}
                                onChange={(e) => updateImportItem(i, { qty: e.target.value.replace(/[^0-9]/g, '') || '0' })} className="h-8 text-sm text-center" />
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input type="text" inputMode="decimal" value={item.unit_cost} onFocus={(e) => e.target.select()}
                                onChange={(e) => updateImportItem(i, { unit_cost: e.target.value.replace(/[^0-9.]/g, '') || '0' })} className="h-8 text-sm" />
                            </TableCell>
                            <TableCell className="text-right text-sm text-zinc-200 py-1.5">{formatINR(lineTotal(item.qty, item.unit_cost))}</TableCell>
                            <TableCell className="py-1.5">
                              <button type="button" onClick={() => setImportItems((prev) => prev.filter((_, j) => j !== i))}
                                className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <Button variant="ghost" size="sm" className="text-xs text-zinc-500" onClick={() => { setImportParsed(false); setImportItems([]); setImportErrors([]) }}>
                      ← Upload different file
                    </Button>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-zinc-400">Total</span>
                      <span className="text-lg font-bold text-white">{formatINR(importItems.reduce((s, it) => s + lineTotal(it.qty, it.unit_cost), 0))}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImport(false); setImportItems([]); setImportErrors([]); setImportParsed(false) }}>Cancel</Button>
            {importParsed && importItems.length > 0 && (
              <Button disabled={importSaveMutation.isPending} onClick={() => importSaveMutation.mutate()}>
                {importSaveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : `Save ${importItems.length} Items`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Purchase Dialog ── */}
      <Dialog open={!!viewPurchase} onOpenChange={(o) => { if (!o) setViewPurchase(null) }}>
        <DialogContent className="max-w-lg">
          {viewLoading
            ? <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            : viewPurchase && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    Purchase Details
                    {viewPurchase.purchase_no && <span className="ml-2 font-mono text-sm text-indigo-300">{viewPurchase.purchase_no}</span>}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-zinc-500">Date</span><p className="text-zinc-200">{formatDate(viewPurchase.created_at)}</p></div>
                    <div><span className="text-zinc-500">Supplier</span><p className="text-zinc-200">{viewPurchase.suppliers?.name ?? '—'}</p></div>
                    <div><span className="text-zinc-500">Invoice No</span><p className="font-mono text-zinc-200">{viewPurchase.invoice_no ?? '—'}</p></div>
                    <div><span className="text-zinc-500">Notes</span><p className="text-zinc-200">{viewPurchase.notes ?? '—'}</p></div>
                  </div>
                  <Separator />
                  <div className="rounded-lg border border-zinc-800 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit Cost</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewPurchase.purchase_items_detail?.length === 0
                          ? <TableRow><TableCell colSpan={4} className="text-center text-zinc-500 py-4">No items</TableCell></TableRow>
                          : viewPurchase.purchase_items_detail?.map((it) => (
                            <TableRow key={it.id}>
                              <TableCell className="text-zinc-200">{it.product_name}</TableCell>
                              <TableCell className="text-right text-zinc-400">{it.qty}</TableCell>
                              <TableCell className="text-right text-zinc-400">{formatINR(it.unit_cost)}</TableCell>
                              <TableCell className="text-right font-medium text-white">{formatINR(it.line_total)}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <button onClick={() => setDeleteConfirmId(viewPurchase.id)} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />Delete Purchase
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-400">Total</span>
                      <span className="text-lg font-bold text-white">{formatINR(viewPurchase.total_amount)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Purchase?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete the purchase record and all its items. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}>
              {deleteMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Deleting...</> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
