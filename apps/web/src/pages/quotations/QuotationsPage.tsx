import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, FileText, Eye, Trash2, Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR, formatDocumentNumber, computeGST } from '@billscape/core'
import type { CartItem, GSTContext } from '@billscape/core'
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

interface QuoteItemRow {
  product_name: string
  qty: number
  unit_price: number
  discount_pct: number
  tax_rate: number
  line_total: number
}

interface CustomerOption {
  id: string
  name: string
  phone: string | null
  state_code: string | null
}

const GST_RATES = [0, 5, 12, 18, 28] as const

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  sent: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  accepted: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  expired: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

function emptyItem(): QuoteItemRow {
  return { product_name: '', qty: 1, unit_price: 0, discount_pct: 0, tax_rate: 18, line_total: 0 }
}

export function QuotationsPage() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showDialog, setShowDialog] = useState(false)
  const [search, setSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<QuoteItemRow[]>([emptyItem()])

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

  const { data: customers } = useQuery({
    queryKey: ['customers-for-quote', orgId],
    enabled: !!orgId && showDialog,
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, state_code')
        .eq('organization_id', orgId!)
        .order('name')
      return (data ?? []) as CustomerOption[]
    },
  })

  const selectedCustomer = customers?.find((c) => c.id === customerId)

  const gstContext: GSTContext = {
    shopStateCode: org?.state_code ?? 'TN',
    customerStateCode: selectedCustomer?.state_code ?? undefined,
    taxInclusive: org?.branding?.tax_inclusive ?? false,
  }

  const cartItems: CartItem[] = items
    .filter((i) => i.product_name.trim() && i.qty > 0)
    .map((i) => ({
      product_id: '',
      product_name: i.product_name.trim(),
      tax_rate: i.tax_rate as any,
      unit_price: i.unit_price,
      qty: i.qty,
      discount_pct: i.discount_pct,
    }))

  const totals = computeGST(gstContext, cartItems)

  function updateItem(index: number, patch: Partial<QuoteItemRow>) {
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
    setCustomerId(''); setCustomerName(''); setCustomerPhone(''); setValidUntil(''); setNotes('')
    setItems([emptyItem()])
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in')
      const finalCustomerName = selectedCustomer?.name ?? customerName.trim()
      if (!finalCustomerName) throw new Error('Customer name required')
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
        customer_id: customerId || null,
        customer_name: finalCustomerName,
        customer_phone: selectedCustomer?.phone ?? (customerPhone.trim() || null),
        valid_until: validUntil || null,
        status: 'draft',
        total_amount: totals.net_payable,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        cgst_total: totals.cgst_total,
        sgst_total: totals.sgst_total,
        igst_total: totals.igst_total,
        net_payable: totals.net_payable,
        notes: notes.trim() || null,
        created_by: user.id,
      }).select('id').single()
      if (quoteErr) throw quoteErr

      const interstate = totals.is_interstate
      const { error: itemsErr } = await supabase.from('quotation_items').insert(
        validItems.map((i) => {
          const line = computeGST(gstContext, [{
            product_id: '',
            product_name: i.product_name,
            tax_rate: i.tax_rate as any,
            unit_price: i.unit_price,
            qty: i.qty,
            discount_pct: i.discount_pct,
          }])
          const breakup = line.tax_breakup[0]
          return {
            quotation_id: quote.id,
            organization_id: orgId!,
            product_name: i.product_name.trim(),
            qty: i.qty,
            unit_price: i.unit_price,
            discount_pct: i.discount_pct,
            tax_rate: i.tax_rate,
            cgst_amount: interstate ? 0 : (breakup?.cgst ?? 0),
            sgst_amount: interstate ? 0 : (breakup?.sgst ?? 0),
            igst_amount: interstate ? (breakup?.igst ?? 0) : 0,
            line_total: (breakup?.taxable_amount ?? 0) + (breakup?.cgst ?? 0) + (breakup?.sgst ?? 0) + (breakup?.igst ?? 0),
          }
        })
      )
      if (itemsErr) throw itemsErr

      await logActivity({
        organizationId: orgId!,
        action: 'created',
        entity: 'quotation',
        entityId: quote.id,
        metadata: {
          quote_no: quoteNo,
          customer_name: finalCustomerName,
          total_amount: totals.net_payable,
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

  const today = new Date().toISOString().split('T')[0]

  const filteredQuotations = search.trim()
    ? quotations.filter((q) => {
        const t = search.trim().toLowerCase()
        return (
          q.quote_no.toLowerCase().includes(t) ||
          q.customer_name.toLowerCase().includes(t) ||
          (q.customer_phone ?? '').toLowerCase().includes(t)
        )
      })
    : quotations

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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search quote no, customer name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filteredQuotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32">
            <FileText className="h-8 w-8 text-zinc-600 mb-2" />
            <p className="text-sm text-muted-foreground">
              {quotations.length > 0 ? 'No quotations match your search.' : 'No quotations yet'}
            </p>
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
              {filteredQuotations.map((q) => {
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
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize', STATUS_COLORS[isExpired ? 'expired' : q.status])}>
                        {isExpired ? 'expired' : q.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => navigate(`/quotations/${q.id}`)}>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Quotation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— Walk-in / type name below —</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ''}</option>
                  ))}
                </select>
              </div>
              {!customerId && (
                <div className="space-y-1.5">
                  <Label>Customer Name *</Label>
                  <Input placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </div>
              )}
              {!customerId && (
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input placeholder="Phone number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Valid Until</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Items</Label>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[28%]">Product</TableHead>
                      <TableHead className="w-[10%]">Qty</TableHead>
                      <TableHead className="w-[14%]">Price (₹)</TableHead>
                      <TableHead className="w-[10%]">Disc%</TableHead>
                      <TableHead className="w-[16%]">GST%</TableHead>
                      <TableHead className="w-[17%] text-right">Total</TableHead>
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
                        <TableCell className="py-1.5">
                          <select
                            value={item.tax_rate}
                            onChange={(e) => updateItem(idx, { tax_rate: Number(e.target.value) })}
                            className="flex h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                          </select>
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
                onClick={() => setItems((p) => [...p, emptyItem()])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-1 text-sm max-w-xs ml-auto">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatINR(totals.taxable_amount)}</span></div>
              {totals.is_interstate ? (
                <div className="flex justify-between text-muted-foreground"><span>IGST</span><span>{formatINR(totals.igst_total)}</span></div>
              ) : (
                <>
                  <div className="flex justify-between text-muted-foreground"><span>CGST</span><span>{formatINR(totals.cgst_total)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>SGST</span><span>{formatINR(totals.sgst_total)}</span></div>
                </>
              )}
              <div className="flex justify-between items-center pt-1.5 border-t border-border font-bold">
                <span>Total</span>
                <span className="text-lg">{formatINR(totals.net_payable)}</span>
              </div>
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
    </div>
  )
}
