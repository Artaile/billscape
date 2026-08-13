import React, { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  X,
  Eye,
  Pencil,
  Trash2,
  Printer,
  RotateCcw,
  Trash,
  ArchiveX,
  Loader2,
  Plus,
  Minus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { computeGST, computeLineTax, applyOrderDiscount, formatINR } from '@billscape/core'
import {
  getSales,
  getSaleWithItems,
  updateSale,
  voidSale,
  restoreSale,
  purgeSale,
  purgeExpiredVoidedSales,
} from '@billscape/api'
import type { CartItem, DiscountType, GSTContext, InvoiceTotals } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InvoicePrint } from '@/components/billing/InvoicePrint'
import { DateRangeFilter } from '@/components/ui/date-range-filter'
import { toast } from '@/hooks/use-toast'
import { formatDateTime, cn } from '@/lib/utils'

interface SaleRow {
  id: string
  invoice_no: string
  created_at: string
  customer_id: string | null
  customers: { name: string; phone: string | null } | null
  payment_mode: string
  grand_total: number
  net_payable: number
  voided_at: string | null
  void_reason: string | null
  purge_after: string | null
}

const canEditDelete = (role: string | null) => role === 'owner' || role === 'manager'

export function HistoryTab() {
  const { org, user, role } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [view, setView] = useState<'list' | 'bin'>('list')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [viewingSaleId, setViewingSaleId] = useState<string | null>(null)
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null)
  const [deletingSale, setDeletingSale] = useState<SaleRow | null>(null)
  const [voidReason, setVoidReason] = useState('')

  const allowManage = canEditDelete(role)

  // Sweep expired bin entries once on mount
  useEffect(() => {
    if (!orgId) return
    purgeExpiredVoidedSales(supabase as Parameters<typeof purgeExpiredVoidedSales>[0], orgId)
  }, [orgId])

  const { data: sales, isLoading } = useQuery({
    queryKey: ['sales-history', orgId, view, fromDate, toDate],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await getSales(supabase as Parameters<typeof getSales>[0], orgId!, {
        from: fromDate ? new Date(fromDate).toISOString() : undefined,
        to: toDate ? new Date(new Date(toDate).getTime() + 86400000).toISOString() : undefined,
        voidedOnly: view === 'bin',
        limit: 200,
      })
      if (error) throw error
      return (data ?? []) as unknown as SaleRow[]
    },
  })

  const filteredSales = useMemo(() => {
    if (!sales) return []
    if (!search.trim()) return sales
    const q = search.trim().toLowerCase()
    return sales.filter(
      (s) =>
        s.invoice_no.toLowerCase().includes(q) ||
        s.customers?.name?.toLowerCase().includes(q) ||
        s.customers?.phone?.toLowerCase().includes(q),
    )
  }, [sales, search])

  const voidMutation = useMutation({
    mutationFn: async ({ saleId, reason }: { saleId: string; reason: string }) => {
      const { error } = await voidSale(supabase as Parameters<typeof voidSale>[0], orgId!, saleId, reason, user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Bill moved to Recycle Bin')
      queryClient.invalidateQueries({ queryKey: ['sales-history', orgId] })
      setDeletingSale(null)
      setVoidReason('')
    },
    onError: (err: Error) => toast.error('Failed to delete bill', err.message),
  })

  const restoreMutation = useMutation({
    mutationFn: async (saleId: string) => {
      const { error } = await restoreSale(supabase as Parameters<typeof restoreSale>[0], orgId!, saleId, user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Bill restored')
      queryClient.invalidateQueries({ queryKey: ['sales-history', orgId] })
    },
    onError: (err: Error) => toast.error('Failed to restore bill', err.message),
  })

  const purgeMutation = useMutation({
    mutationFn: async (saleId: string) => {
      const { error } = await purgeSale(supabase as Parameters<typeof purgeSale>[0], orgId!, saleId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Bill permanently deleted')
      queryClient.invalidateQueries({ queryKey: ['sales-history', orgId] })
    },
    onError: (err: Error) => toast.error('Failed to delete bill', err.message),
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
        <div className="flex rounded-lg bg-zinc-800 p-1 gap-1">
          <button
            onClick={() => setView('list')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              view === 'list' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200',
            )}
          >
            All Bills
          </button>
          <button
            onClick={() => setView('bin')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1',
              view === 'bin' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200',
            )}
          >
            <ArchiveX className="h-3 w-3" /> Recycle Bin
          </button>
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search invoice no, customer name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9 h-9"
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

        <DateRangeFilter
          from={fromDate}
          to={toDate}
          onChange={(f, t) => {
            setFromDate(f)
            setToDate(t)
          }}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-zinc-500 text-sm">
            {view === 'bin' ? 'Recycle bin is empty' : 'No bills found'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice No</TableHead>
                <TableHead>Date/Time</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Grand Total</TableHead>
                <TableHead className="text-right">Payable</TableHead>
                {view === 'bin' && <TableHead>Purge After</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium">{sale.invoice_no}</TableCell>
                  <TableCell className="text-xs text-zinc-400">{formatDateTime(sale.created_at)}</TableCell>
                  <TableCell className="text-xs">
                    {sale.customers?.name ?? <span className="text-zinc-600">Walk-in</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{sale.payment_mode}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(sale.grand_total)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatINR(sale.net_payable ?? sale.grand_total)}
                  </TableCell>
                  {view === 'bin' && (
                    <TableCell className="text-xs text-amber-400">
                      {sale.purge_after ? formatDateTime(sale.purge_after) : '-'}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View / Reprint"
                        onClick={() => setViewingSaleId(sale.id)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {view === 'list' && allowManage && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit"
                            onClick={() => setEditingSaleId(sale.id)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-400" title="Delete"
                            onClick={() => setDeletingSale(sale)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {view === 'bin' && allowManage && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-400" title="Restore"
                            onClick={() => restoreMutation.mutate(sale.id)}>
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-400" title="Delete Permanently"
                            onClick={() => {
                              if (confirm(`Permanently delete ${sale.invoice_no}? This cannot be undone.`)) {
                                purgeMutation.mutate(sale.id)
                              }
                            }}>
                            <Trash className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* View / Reprint dialog */}
      <ViewSaleDialog saleId={viewingSaleId} onClose={() => setViewingSaleId(null)} />

      {/* Edit dialog */}
      {editingSaleId && (
        <EditSaleDialog
          saleId={editingSaleId}
          onClose={() => setEditingSaleId(null)}
          onSaved={() => {
            setEditingSaleId(null)
            queryClient.invalidateQueries({ queryKey: ['sales-history', orgId] })
          }}
        />
      )}

      {/* Delete (void) confirm dialog */}
      <Dialog open={!!deletingSale} onOpenChange={(open) => !open && setDeletingSale(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="h-4 w-4" /> Delete Bill {deletingSale?.invoice_no}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This moves the bill to the Recycle Bin and reverses stock. It will be permanently
            deleted automatically after 30 days, or you can restore it before then.
          </p>
          <Input
            placeholder="Reason (optional)"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
          />
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeletingSale(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={voidMutation.isPending}
              onClick={() => deletingSale && voidMutation.mutate({ saleId: deletingSale.id, reason: voidReason || 'No reason given' })}
            >
              {voidMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── View / Reprint ────────────────────────────────────────────────────────
function ViewSaleDialog({ saleId, onClose }: { saleId: string | null; onClose: () => void }) {
  const { org } = useAuth()
  const orgId = org?.id

  const { data } = useQuery({
    queryKey: ['sale-detail', orgId, saleId],
    enabled: !!orgId && !!saleId,
    queryFn: async () => getSaleWithItems(supabase as Parameters<typeof getSaleWithItems>[0], orgId!, saleId!),
  })

  const sale = data?.sale as any
  const items = (data?.items ?? []) as any[]

  const cartItems: CartItem[] = items.map((it) => ({
    product_id: it.product_id,
    product_name: it.product_name,
    hsn_code: it.hsn_code ?? undefined,
    tax_rate: it.tax_rate,
    unit_price: it.unit_price,
    qty: it.qty,
    discount_pct: it.discount_pct,
    discount_type: it.discount_type,
    discount_amount: it.discount_amount,
  }))

  const totals: InvoiceTotals | null = sale
    ? (() => {
        const cgstTotal = items.reduce((sum, it) => sum + Number(it.cgst_amount ?? 0), 0)
        const sgstTotal = items.reduce((sum, it) => sum + Number(it.sgst_amount ?? 0), 0)
        const igstTotal = items.reduce((sum, it) => sum + Number(it.igst_amount ?? 0), 0)
        const isInterstate = igstTotal > 0

        const breakupMap = new Map<number, { tax_rate: number; taxable_amount: number; cgst: number; sgst: number; igst: number }>()
        for (const it of items) {
          const lineDiscount = it.discount_type === 'flat' ? Number(it.discount_amount ?? 0) : (Number(it.unit_price) * Number(it.qty)) * (Number(it.discount_pct) / 100)
          const lineTaxable = Number(it.unit_price) * Number(it.qty) - lineDiscount
          const existing = breakupMap.get(it.tax_rate)
          if (existing) {
            existing.taxable_amount += lineTaxable
            existing.cgst += Number(it.cgst_amount ?? 0)
            existing.sgst += Number(it.sgst_amount ?? 0)
            existing.igst += Number(it.igst_amount ?? 0)
          } else {
            breakupMap.set(it.tax_rate, {
              tax_rate: it.tax_rate,
              taxable_amount: lineTaxable,
              cgst: Number(it.cgst_amount ?? 0),
              sgst: Number(it.sgst_amount ?? 0),
              igst: Number(it.igst_amount ?? 0),
            })
          }
        }

        return {
          subtotal: sale.subtotal,
          discount_total: sale.discount_total,
          taxable_amount: sale.subtotal - sale.discount_total,
          tax_breakup: Array.from(breakupMap.values()) as InvoiceTotals['tax_breakup'],
          cgst_total: cgstTotal,
          sgst_total: sgstTotal,
          igst_total: igstTotal,
          tax_total: sale.tax_total,
          grand_total: sale.grand_total,
          is_interstate: isInterstate,
          order_discount_amount: sale.order_discount_amount ?? 0,
          loyalty_redeem_amount: sale.loyalty_redeem_amount ?? 0,
          net_payable: sale.net_payable ?? sale.grand_total,
        }
      })()
    : null

  return (
    <Dialog open={!!saleId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4" /> {sale?.invoice_no}
            {sale?.voided_at && <Badge variant="destructive">Voided</Badge>}
          </DialogTitle>
        </DialogHeader>
        {sale && totals && (
          <InvoicePrint
            invoiceNo={sale.invoice_no}
            date={sale.created_at}
            shopName={org?.name ?? 'BillScape Shop'}
            shopAddress={org?.address}
            shopGstin={org?.gstin}
            shopLogoUrl={org?.branding?.logo_url}
            shopPhone={org?.phone}
            shopEmail={org?.email}
            customerName={sale.customers?.name}
            customerPhone={sale.customers?.phone ?? undefined}
            customerGstin={sale.customers?.gstin ?? undefined}
            items={cartItems}
            totals={totals}
            paymentMode={sale.payment_mode}
            branding={org?.branding}
            invoiceTemplate={(org as any)?.invoice_template}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit sale ──────────────────────────────────────────────────────────────
function EditSaleDialog({
  saleId,
  onClose,
  onSaved,
}: {
  saleId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { org, user } = useAuth()
  const orgId = org?.id
  const [items, setItems] = useState<CartItem[]>([])
  const [loaded, setLoaded] = useState(false)

  const { data } = useQuery({
    queryKey: ['sale-detail-edit', orgId, saleId],
    enabled: !!orgId,
    queryFn: async () => getSaleWithItems(supabase as Parameters<typeof getSaleWithItems>[0], orgId!, saleId),
  })

  useEffect(() => {
    if (data?.items && !loaded) {
      const mapped: CartItem[] = (data.items as any[]).map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        hsn_code: it.hsn_code ?? undefined,
        tax_rate: it.tax_rate,
        unit_price: it.unit_price,
        qty: it.qty,
        discount_pct: it.discount_pct,
        discount_type: it.discount_type,
        discount_amount: it.discount_amount,
      }))
      setItems(mapped)
      setLoaded(true)
    }
  }, [data, loaded])

  const gstContext: GSTContext = { shopStateCode: org?.state_code ?? 'TN' }
  const sale = data?.sale as any

  const totals = useMemo(() => {
    if (items.length === 0) return null
    const base = computeGST(gstContext, items)
    if (sale?.order_discount_type && sale.order_discount_value > 0) {
      return applyOrderDiscount(base, sale.order_discount_type as DiscountType, sale.order_discount_value)
    }
    return base
  }, [items, gstContext, sale])

  const updateQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.product_id !== productId))
      return
    }
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, qty } : i)))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !user || !sale) throw new Error('Not ready')
      const { error } = await updateSale(supabase as Parameters<typeof updateSale>[0], orgId, saleId, {
        items,
        customer_id: sale.customer_id ?? undefined,
        payment_mode: sale.payment_mode,
        cash_amount: sale.cash_amount ?? undefined,
        card_amount: sale.card_amount ?? undefined,
        upi_amount: sale.upi_amount ?? undefined,
        notes: sale.notes ?? undefined,
        gst_context: gstContext,
        order_discount_type: sale.order_discount_type ?? undefined,
        order_discount_value: sale.order_discount_value ?? undefined,
        updated_by: user.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Bill updated', 'Stock and totals have been recalculated.')
      onSaved()
    },
    onError: (err: Error) => toast.error('Failed to update bill', err.message),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Edit Bill — {sale?.invoice_no}
          </DialogTitle>
        </DialogHeader>

        {!loaded ? (
          <div className="flex items-center justify-center h-32 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-amber-400">
              Changing quantities here reverses the original stock deduction and re-applies it for
              the new quantities. Item removal or price is not editable — use Returns for refunds.
            </p>
            {items.map((item) => (
              <div key={item.product_id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{item.product_name}</p>
                  <p className="text-xs text-zinc-500">{formatINR(item.unit_price)} × {item.qty}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQty(item.product_id, item.qty - 1)}
                    disabled={item.qty <= 1}
                    className="flex h-7 w-7 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:opacity-30"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm text-zinc-100">{item.qty}</span>
                  <button
                    onClick={() => updateQty(item.product_id, item.qty + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {totals && (
              <div className="flex justify-between items-center pt-3 border-t border-zinc-800">
                <span className="text-sm font-semibold text-zinc-300">New Payable</span>
                <span className="text-lg font-bold text-indigo-300">{formatINR(totals.net_payable)}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={saveMutation.isPending || items.length === 0}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
