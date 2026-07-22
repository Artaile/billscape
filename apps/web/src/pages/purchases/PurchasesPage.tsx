import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Eye, ShoppingBag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/hooks/use-toast'

interface Supplier {
  id: string
  name: string
  phone: string | null
  email: string | null
  gstin: string | null
}

interface Product {
  id: string
  name: string
  price: number
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
  invoice_no: string | null
  total_amount: number
  notes: string | null
  created_at: string
  suppliers: { name: string } | null
  purchase_items: { id: string }[]
}

interface ViewPurchase extends Purchase {
  purchase_items_detail?: {
    id: string
    product_name: string
    qty: number
    unit_cost: number
    line_total: number
  }[]
}

const emptyItem = (): PurchaseItem => ({
  product_id: null,
  product_name: '',
  qty: 1,
  unit_cost: 0,
  line_total: 0,
})

export function PurchasesPage() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [showNew, setShowNew] = useState(false)
  const [viewPurchase, setViewPurchase] = useState<ViewPurchase | null>(null)

  const [supplierId, setSupplierId] = useState<string>('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<PurchaseItem[]>([emptyItem()])

  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)

  const [productSearches, setProductSearches] = useState<string[]>([''])
  const [productDropdownOpen, setProductDropdownOpen] = useState<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const totalAmount = items.reduce((sum, it) => sum + it.line_total, 0)

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('id, invoice_no, total_amount, notes, created_at, suppliers(name), purchase_items(id)')
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
      const { data } = await supabase
        .from('suppliers')
        .select('id, name, phone, email, gstin')
        .eq('organization_id', orgId!)
        .order('name')
      return (data ?? []) as Supplier[]
    },
  })

  const { data: products } = useQuery({
    queryKey: ['products-all', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, price')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .order('name')
      return (data ?? []) as Product[]
    },
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProductDropdownOpen(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function resetForm() {
    setSupplierId('')
    setInvoiceNo('')
    setNotes('')
    setItems([emptyItem()])
    setProductSearches([''])
    setShowAddSupplier(false)
    setNewSupplierName('')
    setNewSupplierPhone('')
  }

  function updateItem(index: number, patch: Partial<PurchaseItem>) {
    setItems((prev) => {
      const next = [...prev]
      const merged = { ...next[index], ...patch }
      merged.line_total = merged.qty * merged.unit_cost
      next[index] = merged
      return next
    })
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
    setProductSearches((prev) => [...prev, ''])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
    setProductSearches((prev) => prev.filter((_, i) => i !== index))
  }

  function selectProduct(index: number, product: Product) {
    updateItem(index, {
      product_id: product.id,
      product_name: product.name,
      unit_cost: product.price,
    })
    setProductSearches((prev) => {
      const next = [...prev]
      next[index] = product.name
      return next
    })
    setProductDropdownOpen(null)
  }

  function getFilteredProducts(search: string): Product[] {
    if (!products) return []
    if (!search.trim()) return products.slice(0, 8)
    const lower = search.toLowerCase()
    return products.filter((p) => p.name.toLowerCase().includes(lower)).slice(0, 8)
  }

  async function handleAddSupplier() {
    if (!newSupplierName.trim()) return
    setSavingSupplier(true)
    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        organization_id: orgId!,
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || null,
      })
      .select('id')
      .single()
    setSavingSupplier(false)
    if (error) {
      toast.error('Failed to add supplier')
      return
    }
    queryClient.invalidateQueries({ queryKey: ['suppliers', orgId] })
    setSupplierId(data.id)
    setShowAddSupplier(false)
    setNewSupplierName('')
    setNewSupplierPhone('')
    toast.success('Supplier added')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validItems = items.filter((it) => it.product_name.trim() && it.qty > 0)
      if (validItems.length === 0) throw new Error('Add at least one item')

      const { data: purchase, error: purchaseError } = await supabase
        .from('purchases')
        .insert({
          organization_id: orgId!,
          supplier_id: supplierId || null,
          invoice_no: invoiceNo.trim() || null,
          notes: notes.trim() || null,
          total_amount: totalAmount,
          created_by: user!.id,
        })
        .select('id')
        .single()

      if (purchaseError) throw purchaseError

      const purchaseId = purchase.id

      const { error: itemsError } = await supabase.from('purchase_items').insert(
        validItems.map((it) => ({
          purchase_id: purchaseId,
          organization_id: orgId!,
          product_id: it.product_id || null,
          product_name: it.product_name,
          qty: it.qty,
          unit_cost: it.unit_cost,
          line_total: it.line_total,
        }))
      )
      if (itemsError) throw itemsError

      const itemsWithProduct = validItems.filter((it) => !!it.product_id)
      for (const it of itemsWithProduct) {
        const { data: inv } = await supabase
          .from('inventory')
          .select('stock_qty')
          .eq('product_id', it.product_id!)
          .eq('organization_id', orgId!)
          .maybeSingle()

        const currentQty = inv?.stock_qty ?? 0
        await supabase.from('inventory').upsert(
          {
            product_id: it.product_id!,
            organization_id: orgId!,
            stock_qty: currentQty + it.qty,
          },
          { onConflict: 'product_id,organization_id' }
        )
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases', orgId] })
      queryClient.invalidateQueries({ queryKey: ['inventory', orgId] })
      toast.success('Purchase saved')
      resetForm()
      setShowNew(false)
    },
    onError: (err: Error) => {
      toast.error('Failed to save purchase', err.message)
    },
  })

  async function handleViewPurchase(purchase: Purchase) {
    const { data } = await supabase
      .from('purchase_items')
      .select('id, product_name, qty, unit_cost, line_total')
      .eq('purchase_id', purchase.id)
      .eq('organization_id', orgId!)
    setViewPurchase({ ...purchase, purchase_items_detail: data ?? [] })
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Purchases</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{purchases?.length ?? 0} records</p>
        </div>
        <Button onClick={() => { resetForm(); setShowNew(true) }}>
          <Plus className="h-4 w-4" />
          New Purchase
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Invoice No</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-zinc-800 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : purchases && purchases.length > 0 ? (
              purchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-zinc-400 text-sm whitespace-nowrap">
                    {formatDate(p.created_at)}
                  </TableCell>
                  <TableCell className="font-medium text-zinc-100">
                    {p.suppliers?.name ?? <span className="text-zinc-500 italic">No supplier</span>}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-zinc-300">
                    {p.invoice_no ?? <span className="text-zinc-600">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-zinc-400">
                    {p.purchase_items.length}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-white">
                    {formatINR(p.total_amount)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-zinc-400 hover:text-white"
                      onClick={() => handleViewPurchase(p)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-zinc-500">
                    <ShoppingBag className="h-10 w-10 text-zinc-700" />
                    <p className="text-sm">No purchases yet. Click New Purchase to record stock received.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* New Purchase Dialog */}
      <Dialog open={showNew} onOpenChange={(open) => { if (!open) resetForm(); setShowNew(open) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Purchase</DialogTitle>
          </DialogHeader>

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
                  <option value="" className="bg-zinc-900">Select supplier (optional)</option>
                  {suppliers?.map((s) => (
                    <option key={s.id} value={s.id} className="bg-zinc-900">
                      {s.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  onClick={() => setShowAddSupplier((v) => !v)}
                  title="Add new supplier"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {showAddSupplier && (
                <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-2">
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
                        placeholder="Phone"
                        value={newSupplierPhone}
                        onChange={(e) => setNewSupplierPhone(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { setShowAddSupplier(false); setNewSupplierName(''); setNewSupplierPhone('') }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!newSupplierName.trim() || savingSupplier}
                      onClick={handleAddSupplier}
                    >
                      {savingSupplier ? 'Adding...' : 'Add'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Invoice No</Label>
                <Input
                  placeholder="INV-001 (optional)"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input
                  placeholder="Optional notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
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
                      <TableHead className="w-[20%]">Unit Cost (₹)</TableHead>
                      <TableHead className="w-[18%] text-right">Total</TableHead>
                      <TableHead className="w-[7%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => {
                      const filteredProducts = getFilteredProducts(productSearches[index] ?? '')
                      return (
                        <TableRow key={index}>
                          <TableCell className="py-1.5 relative">
                            <div ref={productDropdownOpen === index ? dropdownRef : null} className="relative">
                              <Input
                                placeholder="Search product..."
                                value={productSearches[index] ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setProductSearches((prev) => {
                                    const next = [...prev]
                                    next[index] = val
                                    return next
                                  })
                                  updateItem(index, { product_id: null, product_name: val })
                                  setProductDropdownOpen(index)
                                }}
                                onFocus={() => setProductDropdownOpen(index)}
                                className="h-8 text-sm"
                              />
                              {productDropdownOpen === index && filteredProducts.length > 0 && (
                                <div className="absolute top-full left-0 z-50 mt-0.5 w-full rounded-md border border-zinc-700 bg-zinc-900 shadow-xl max-h-48 overflow-y-auto">
                                  {filteredProducts.map((p) => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-zinc-800 text-zinc-200"
                                      onMouseDown={(e) => { e.preventDefault(); selectProduct(index, p) }}
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
                              type="number"
                              min={1}
                              value={item.qty}
                              onChange={(e) => updateItem(index, { qty: Number(e.target.value) || 0 })}
                              className="h-8 text-sm w-full"
                            />
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.unit_cost}
                              onChange={(e) => updateItem(index, { unit_cost: Number(e.target.value) || 0 })}
                              className="h-8 text-sm w-full"
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium text-zinc-200 py-1.5">
                            {formatINR(item.line_total)}
                          </TableCell>
                          <TableCell className="py-1.5">
                            {items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeItem(index)}
                                className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                              >
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

              <Button type="button" variant="outline" size="sm" onClick={addItem} className="text-xs h-7">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Item
              </Button>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <span className="text-sm text-zinc-400">Total</span>
              <span className="text-lg font-bold text-white">{formatINR(totalAmount)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { resetForm(); setShowNew(false) }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Purchase'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Purchase Dialog */}
      <Dialog open={!!viewPurchase} onOpenChange={() => setViewPurchase(null)}>
        <DialogContent className="max-w-lg">
          {viewPurchase && (
            <>
              <DialogHeader>
                <DialogTitle>Purchase Details</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-zinc-500">Date</span>
                    <p className="text-zinc-200">{formatDate(viewPurchase.created_at)}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Supplier</span>
                    <p className="text-zinc-200">{viewPurchase.suppliers?.name ?? '—'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Invoice No</span>
                    <p className="font-mono text-zinc-200">{viewPurchase.invoice_no ?? '—'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Notes</span>
                    <p className="text-zinc-200">{viewPurchase.notes ?? '—'}</p>
                  </div>
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
                      {viewPurchase.purchase_items_detail?.map((it) => (
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
                <div className="flex justify-end items-center gap-3 pt-1">
                  <span className="text-zinc-400">Total</span>
                  <span className="text-lg font-bold text-white">{formatINR(viewPurchase.total_amount)}</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
