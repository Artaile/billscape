import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, RotateCcw, Search, Eye } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import { logActivity } from '@/lib/activityLog'
import { cn } from '@/lib/utils'

interface Return {
  id: string
  return_type: 'sale' | 'purchase'
  original_invoice_no: string
  purchase_ref: string | null
  reason: string
  refund_mode: string
  refund_amount: number
  notes: string | null
  created_at: string
  return_items: { id: string }[]
}

interface ReturnItem {
  product_name: string
  qty: number
  unit_price: number
  line_total: number
}

const REFUND_MODES = ['Cash', 'Card', 'UPI', 'Store Credit']
const REASONS = ['Defective product', 'Wrong item', 'Customer changed mind', 'Expired product', 'Other']

export function ReturnsPage() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [showDialog, setShowDialog] = useState(false)
  const [viewReturn, setViewReturn] = useState<Return & { return_items_detail?: ReturnItem[] } | null>(null)
  const [returnType, setReturnType] = useState<'sale' | 'purchase'>('sale')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [purchaseRef, setPurchaseRef] = useState('')
  const [reason, setReason] = useState(REASONS[0])
  const [refundMode, setRefundMode] = useState('Cash')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ReturnItem[]>([{ product_name: '', qty: 1, unit_price: 0, line_total: 0 }])
  const [restockInventory, setRestockInventory] = useState<boolean>(true)
  const [search, setSearch] = useState('')

  const totalRefund = items.reduce((s, i) => s + i.line_total, 0)

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ['returns', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('returns')
        .select('*, return_items(id)')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Return[]
    },
  })

  const filtered = search.trim()
    ? returns.filter((r) => r.original_invoice_no.toLowerCase().includes(search.toLowerCase()))
    : returns

  function updateItem(index: number, patch: Partial<ReturnItem>) {
    setItems((prev) => {
      const next = [...prev]
      const merged = { ...next[index], ...patch }
      merged.line_total = merged.qty * merged.unit_price
      next[index] = merged
      return next
    })
  }

  function resetForm() {
    setReturnType('sale')
    setInvoiceNo(''); setPurchaseRef(''); setReason(REASONS[0]); setRefundMode('Cash'); setNotes('')
    setItems([{ product_name: '', qty: 1, unit_price: 0, line_total: 0 }])
    setRestockInventory(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in')
      const validItems = items.filter((i) => i.product_name.trim() && i.qty > 0)
      if (returnType === 'sale' && !invoiceNo.trim()) throw new Error('Enter original invoice number')
      if (returnType === 'purchase' && !purchaseRef.trim()) throw new Error('Enter purchase reference number')
      if (validItems.length === 0) throw new Error('Add at least one returned item')

      const { data: ret, error: retErr } = await supabase
        .from('returns')
        .insert({
          organization_id: orgId!,
          return_type: returnType,
          original_invoice_no: returnType === 'sale' ? invoiceNo.trim().toUpperCase() : (purchaseRef.trim().toUpperCase()),
          purchase_ref: returnType === 'purchase' ? purchaseRef.trim().toUpperCase() : null,
          reason: `${reason}${!restockInventory ? ' (Without Stock Movement)' : ''}`,
          refund_mode: refundMode,
          refund_amount: totalRefund,
          notes: notes.trim() || null,
          created_by: user.id,
        })
        .select('id')
        .single()
      if (retErr) throw retErr

      const { error: itemsErr } = await supabase.from('return_items').insert(
        validItems.map((i) => ({
          return_id: ret.id,
          organization_id: orgId!,
          product_name: i.product_name.trim(),
          qty: i.qty,
          unit_price: i.unit_price,
          line_total: i.line_total,
        }))
      )
      if (itemsErr) throw itemsErr

      // Auto-adjust stock only if restockInventory is true
      if (restockInventory) {
        const stockMovements = validItems
          .filter((i) => i.product_name.trim())
          .map(async (item) => {
            const { data: product } = await supabase
              .from('products')
              .select('id')
              .eq('organization_id', orgId!)
              .ilike('name', item.product_name.trim())
              .maybeSingle()

            if (!product) return

            const qtyChange = returnType === 'sale' ? item.qty : -item.qty

            await supabase.from('stock_movements').insert({
              organization_id: orgId!,
              product_id: product.id,
              qty_change: qtyChange,
              reason: 'return',
              reference_id: ret.id,
              note: `${returnType === 'sale' ? 'Sale' : 'Purchase'} return — ${reason}`,
              created_by: user.id,
            })

            await supabase.rpc('increment_inventory', {
              p_org_id: orgId!,
              p_product_id: product.id,
              p_qty: qtyChange,
            }).maybeSingle()
          })

        await Promise.allSettled(stockMovements)
      }

      await logActivity({
        organizationId: orgId!,
        action: 'return',
        entity: 'return',
        entityId: ret.id,
        metadata: {
          type: returnType,
          invoice_no: returnType === 'sale' ? invoiceNo.trim().toUpperCase() : purchaseRef.trim().toUpperCase(),
          amount: totalRefund,
          mode: refundMode,
          reason,
          restock: restockInventory,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success('Return processed successfully')
      resetForm()
      setShowDialog(false)
    },
    onError: (err: Error) => toast.error('Failed to process return', err.message),
  })

  async function handleView(r: Return) {
    const { data } = await supabase
      .from('return_items')
      .select('product_name, qty, unit_price, line_total')
      .eq('return_id', r.id)
    setViewReturn({ ...r, return_items_detail: data ?? [] })
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Returns & Refunds</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Process customer returns and issue refunds</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true) }}>
          <Plus className="h-4 w-4" />
          New Return
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Returns</p>
          <p className="text-2xl font-bold text-foreground">{returns.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Refunded</p>
          <p className="text-2xl font-bold text-foreground">{formatINR(returns.reduce((s, r) => s + r.refund_amount, 0))}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">This Month</p>
          <p className="text-2xl font-bold text-foreground">
            {formatINR(returns.filter((r) => {
              const d = new Date(r.created_at)
              const now = new Date()
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            }).reduce((s, r) => s + r.refund_amount, 0))}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by invoice no..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32">
            <RotateCcw className="h-8 w-8 text-zinc-600 mb-2" />
            <p className="text-sm text-muted-foreground">No returns yet</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference No</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Refund Mode</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Refund Amount</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </TableCell>
                  <TableCell>
                    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                      r.return_type === 'sale'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    )}>
                      {r.return_type === 'sale' ? 'Sale' : 'Purchase'}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-foreground">{r.original_invoice_no}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.reason}</TableCell>
                  <TableCell>
                    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                      r.refund_mode === 'Cash' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                      r.refund_mode === 'Card' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      r.refund_mode === 'UPI' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                      'bg-orange-500/10 text-orange-400 border-orange-500/20'
                    )}>
                      {r.refund_mode}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.return_items.length}</TableCell>
                  <TableCell className="text-right font-semibold text-foreground">{formatINR(r.refund_amount)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleView(r)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* New Return Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) resetForm() }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Process Return</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Return type toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['sale', 'purchase'] as const).map((type) => (
                <button key={type}
                  type="button"
                  onClick={() => setReturnType(type)}
                  className={cn('flex-1 py-2 text-sm font-medium transition-colors',
                    returnType === type
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary'
                  )}>
                  {type === 'sale' ? '↩ Sale Return' : '↪ Purchase Return'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                {returnType === 'sale' ? (
                  <>
                    <Label>Original Invoice No *</Label>
                    <Input placeholder="e.g. INV-20260723-001" value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value.toUpperCase())}
                      className="font-mono uppercase" />
                  </>
                ) : (
                  <>
                    <Label>Purchase Reference No *</Label>
                    <Input placeholder="e.g. PO-20260723-001" value={purchaseRef}
                      onChange={(e) => setPurchaseRef(e.target.value.toUpperCase())}
                      className="font-mono uppercase" />
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Refund Mode</Label>
                <select value={refundMode} onChange={(e) => setRefundMode(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {REFUND_MODES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason for Return</Label>
              <select value={reason} onChange={(e) => setReason(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>

            {/* Inventory Movement Mode Toggle */}
            <div className="rounded-lg border border-border p-3 space-y-2 bg-secondary/20">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="font-semibold text-foreground">Inventory Stock Movement</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {restockInventory
                      ? returnType === 'sale'
                        ? 'Goods will be returned to inventory stock'
                        : 'Goods will be deducted from inventory stock'
                      : 'Value-only credit / Damaged item — No inventory movement'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={restockInventory}
                  onClick={() => setRestockInventory(!restockInventory)}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer',
                    restockInventory ? 'bg-primary' : 'bg-zinc-600'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                      restockInventory ? 'translate-x-4' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>

              <div className={cn(
                'rounded-md p-2 text-xs flex items-center gap-2 border transition-all',
                restockInventory
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              )}>
                <span className="font-bold">Mode:</span>
                <span>
                  {restockInventory
                    ? '✓ Physical stock inventory will be automatically updated.'
                    : '⚠ Only financial refund/credit is recorded. Stock quantity will NOT be modified.'}
                </span>
              </div>
            </div>

            {/* Return Items */}
            <div className="space-y-2">
              <Label>Returned Items</Label>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[45%]">Product</TableHead>
                      <TableHead className="w-[15%]">Qty</TableHead>
                      <TableHead className="w-[20%]">Unit Price (₹)</TableHead>
                      <TableHead className="w-[15%] text-right">Total</TableHead>
                      <TableHead className="w-[5%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="py-1.5">
                          <Input placeholder="Product name" value={item.product_name}
                            onChange={(e) => updateItem(idx, { product_name: e.target.value })}
                            className="h-8 text-sm" />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input type="number" min={1} value={item.qty}
                            onChange={(e) => updateItem(idx, { qty: Number(e.target.value) || 1 })}
                            className="h-8 text-sm" />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input type="number" min={0} step="0.01" value={item.unit_price}
                            onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) || 0 })}
                            className="h-8 text-sm" />
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium py-1.5">{formatINR(item.line_total)}</TableCell>
                        <TableCell className="py-1.5">
                          {items.length > 1 && (
                            <button onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1 rounded text-zinc-500 hover:text-red-400">✕</button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button type="button" variant="outline" size="sm" className="text-xs h-7"
                onClick={() => setItems((prev) => [...prev, { product_name: '', qty: 1, unit_price: 0, line_total: 0 }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input placeholder="Additional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex justify-end items-center gap-3 pt-1 border-t border-border">
              <span className="text-sm text-muted-foreground">Total Refund</span>
              <span className="text-lg font-bold text-foreground">{formatINR(totalRefund)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm() }}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Processing...</> : 'Process Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewReturn} onOpenChange={(o) => { if (!o) setViewReturn(null) }}>
        <DialogContent className="max-w-md">
          {viewReturn && (
            <>
              <DialogHeader><DialogTitle>Return Details</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-xs text-muted-foreground">Date</p>
                    <p>{new Date(viewReturn.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p></div>
                  <div><p className="text-xs text-muted-foreground">Invoice No</p>
                    <p className="font-mono">{viewReturn.original_invoice_no}</p></div>
                  <div><p className="text-xs text-muted-foreground">Reason</p><p>{viewReturn.reason}</p></div>
                  <div><p className="text-xs text-muted-foreground">Refund Mode</p><p>{viewReturn.refund_mode}</p></div>
                  {viewReturn.notes && <div className="col-span-2"><p className="text-xs text-muted-foreground">Notes</p><p>{viewReturn.notes}</p></div>}
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewReturn.return_items_detail?.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{item.qty}</TableCell>
                          <TableCell className="text-right font-medium">{formatINR(item.line_total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end items-center gap-3">
                  <span className="text-muted-foreground">Total Refund</span>
                  <span className="text-lg font-bold">{formatINR(viewReturn.refund_amount)}</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
