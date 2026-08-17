import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, FileText, Eye, Trash2, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR, formatDocumentNumber } from '@billscape/core'
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

interface Quotation {
  id: string
  quote_no: string
  customer_name: string
  customer_phone: string | null
  valid_until: string | null
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
  total_amount: number
  notes: string | null
  created_at: string
  quotation_items: { id: string }[]
}

interface QuoteItem {
  product_name: string
  qty: number
  unit_price: number
  discount_pct: number
  line_total: number
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  sent: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  accepted: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  expired: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

export function QuotationsPage() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [showDialog, setShowDialog] = useState(false)
  const [viewQuote, setViewQuote] = useState<Quotation & { items_detail?: QuoteItem[] } | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([{ product_name: '', qty: 1, unit_price: 0, discount_pct: 0, line_total: 0 }])

  const total = items.reduce((s, i) => s + i.line_total, 0)

  const { data: quotations = [], isLoading } = useQuery({
    queryKey: ['quotations', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select('*, quotation_items(id)')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Quotation[]
    },
  })

  function updateItem(index: number, patch: Partial<QuoteItem>) {
    setItems((prev) => {
      const next = [...prev]
      const merged = { ...next[index], ...patch }
      const base = merged.qty * merged.unit_price
      merged.line_total = base - (base * merged.discount_pct) / 100
      next[index] = merged
      return next
    })
  }

  function resetForm() {
    setCustomerName(''); setCustomerPhone(''); setValidUntil(''); setNotes('')
    setItems([{ product_name: '', qty: 1, unit_price: 0, discount_pct: 0, line_total: 0 }])
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in')
      if (!customerName.trim()) throw new Error('Customer name required')
      const validItems = items.filter((i) => i.product_name.trim() && i.qty > 0)
      if (validItems.length === 0) throw new Error('Add at least one item')

      const { count } = await supabase.from('quotations').select('*', { count: 'exact', head: true }).eq('organization_id', orgId!)
      const prefix = (org as any)?.invoice_template?.prefix_estimate || 'EST'
      const format = (org as any)?.invoice_template?.number_format
      const suffix = (org as any)?.invoice_template?.number_suffix
      const quoteNo = formatDocumentNumber(prefix, (count ?? 0) + 1, { format, suffix })

      const { data: quote, error: quoteErr } = await supabase.from('quotations').insert({
        organization_id: orgId!,
        quote_no: quoteNo,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        valid_until: validUntil || null,
        status: 'draft',
        total_amount: total,
        notes: notes.trim() || null,
        created_by: user.id,
      }).select('id').single()
      if (quoteErr) throw quoteErr

      const { error: itemsErr } = await supabase.from('quotation_items').insert(
        validItems.map((i) => ({
          quotation_id: quote.id,
          organization_id: orgId!,
          product_name: i.product_name.trim(),
          qty: i.qty,
          unit_price: i.unit_price,
          discount_pct: i.discount_pct,
          line_total: i.line_total,
        }))
      )
      if (itemsErr) throw itemsErr

      await logActivity({
        organizationId: orgId!,
        action: 'created',
        entity: 'quotation',
        entityId: quote.id,
        metadata: {
          quote_no: quoteNo,
          customer_name: customerName,
          total_amount: total,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success('Quotation created')
      resetForm(); setShowDialog(false)
    },
    onError: (err: Error) => toast.error('Failed to create quotation', err.message),
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('quotations').update({ status }).eq('id', id).eq('organization_id', orgId!)
      if (error) throw error

      await logActivity({
        organizationId: orgId!,
        action: 'updated',
        entity: 'quotation',
        entityId: id,
        metadata: { status },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
    },
    onError: (err: Error) => toast.error('Update failed', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (quote: Quotation) => {
      await supabase.from('quotation_items').delete().eq('quotation_id', quote.id)
      const { error } = await supabase.from('quotations').delete().eq('id', quote.id).eq('organization_id', orgId!)
      if (error) throw error

      await logActivity({
        organizationId: orgId!,
        action: 'deleted',
        entity: 'quotation',
        entityId: quote.id,
        metadata: {
          quote_no: quote.quote_no,
          customer_name: quote.customer_name,
          total_amount: quote.total_amount,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success('Quotation deleted')
    },
    onError: (err: Error) => toast.error('Delete failed', err.message),
  })

  async function handleView(q: Quotation) {
    const { data } = await supabase.from('quotation_items').select('product_name, qty, unit_price, discount_pct, line_total').eq('quotation_id', q.id)
    setViewQuote({ ...q, items_detail: data ?? [] })
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Quotations & Estimates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create quotes for customers before billing</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true) }}>
          <Plus className="h-4 w-4" /> New Quotation
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(['draft', 'sent', 'accepted', 'rejected'] as const).map((s) => (
          <div key={s} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground capitalize mb-1">{s}</p>
            <p className="text-2xl font-bold text-foreground">{quotations.filter((q) => q.status === s).length}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : quotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32">
            <FileText className="h-8 w-8 text-zinc-600 mb-2" />
            <p className="text-sm text-muted-foreground">No quotations yet</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote No</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.map((q) => {
                const isExpired = q.valid_until && q.valid_until < today && q.status !== 'accepted'
                return (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-sm font-medium">{q.quote_no}</TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-foreground">{q.customer_name}</p>
                      {q.customer_phone && <p className="text-xs text-muted-foreground">{q.customer_phone}</p>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {q.valid_until ? new Date(q.valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No expiry'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{q.quotation_items.length}</TableCell>
                    <TableCell className="text-right font-semibold">{formatINR(q.total_amount)}</TableCell>
                    <TableCell>
                      <select
                        value={isExpired ? 'expired' : q.status}
                        disabled={isExpired === true}
                        onChange={(e) => statusMutation.mutate({ id: q.id, status: e.target.value })}
                        className={cn('rounded-full border px-2 py-0.5 text-xs font-medium bg-transparent cursor-pointer', STATUS_COLORS[isExpired ? 'expired' : q.status])}
                      >
                        {['draft', 'sent', 'accepted', 'rejected'].map((s) => <option key={s} value={s} className="bg-zinc-900">{s}</option>)}
                        {isExpired && <option value="expired" className="bg-zinc-900">expired</option>}
                      </select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleView(q)}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                        <button onClick={() => deleteMutation.mutate(q)}
                          className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* New Quotation Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) resetForm() }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Quotation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer Name *</Label>
                <Input placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input placeholder="Phone number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valid Until</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Items</Label>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[38%]">Product</TableHead>
                      <TableHead className="w-[12%]">Qty</TableHead>
                      <TableHead className="w-[18%]">Price (₹)</TableHead>
                      <TableHead className="w-[12%]">Disc%</TableHead>
                      <TableHead className="w-[15%] text-right">Total</TableHead>
                      <TableHead className="w-[5%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="py-1.5">
                          <Input placeholder="Product name" value={item.product_name}
                            onChange={(e) => updateItem(idx, { product_name: e.target.value })} className="h-8 text-sm" />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input type="number" min={1} value={item.qty}
                            onChange={(e) => updateItem(idx, { qty: Number(e.target.value) || 1 })} className="h-8 text-sm" />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input type="number" min={0} step="0.01" value={item.unit_price}
                            onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) || 0 })} className="h-8 text-sm" />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input type="number" min={0} max={100} value={item.discount_pct}
                            onChange={(e) => updateItem(idx, { discount_pct: Number(e.target.value) || 0 })} className="h-8 text-sm" />
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium py-1.5">{formatINR(item.line_total)}</TableCell>
                        <TableCell className="py-1.5">
                          {items.length > 1 && (
                            <button onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                              className="p-1 rounded text-zinc-500 hover:text-red-400">✕</button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button type="button" variant="outline" size="sm" className="text-xs h-7"
                onClick={() => setItems((p) => [...p, { product_name: '', qty: 1, unit_price: 0, discount_pct: 0, line_total: 0 }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
              </Button>
            </div>

            <div className="flex justify-end items-center gap-3 pt-1 border-t border-border">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-bold">{formatINR(total)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm() }}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Creating...</> : 'Create Quotation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewQuote} onOpenChange={(o) => { if (!o) setViewQuote(null) }}>
        <DialogContent className="max-w-md">
          {viewQuote && (
            <>
              <DialogHeader><DialogTitle>Quotation {viewQuote.quote_no}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-xs text-muted-foreground">Customer</p><p>{viewQuote.customer_name}</p></div>
                  <div><p className="text-xs text-muted-foreground">Phone</p><p>{viewQuote.customer_phone ?? '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Valid Until</p>
                    <p>{viewQuote.valid_until ? new Date(viewQuote.valid_until).toLocaleDateString('en-IN') : 'No expiry'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p>
                    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize', STATUS_COLORS[viewQuote.status])}>{viewQuote.status}</span></div>
                </div>
                {viewQuote.notes && <p className="text-xs text-muted-foreground">{viewQuote.notes}</p>}
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
                      {viewQuote.items_detail?.map((item, i) => (
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
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-lg font-bold">{formatINR(viewQuote.total_amount)}</span>
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button size="sm" className="h-7 text-xs gap-1"
                    onClick={() => { statusMutation.mutate({ id: viewQuote.id, status: 'accepted' }); setViewQuote(null) }}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark Accepted
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
