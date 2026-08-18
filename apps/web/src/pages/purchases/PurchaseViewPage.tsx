import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Printer, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { getPurchaseWithItems } from '@billscape/api'
import { formatDate } from '@/lib/utils'
import { printBarcodeLabel } from '@/lib/printBarcodeLabel'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'

export function PurchaseViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-detail', orgId, id],
    enabled: !!orgId && !!id,
    queryFn: async () => {
      const { data, error } = await getPurchaseWithItems(supabase, orgId!, id!)
      if (error) throw error
      return data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error: e1 } = await supabase.from('purchase_items').delete().eq('purchase_id', id!).eq('organization_id', orgId!)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('purchases').delete().eq('id', id!).eq('organization_id', orgId!)
      if (e2) throw e2
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases', orgId] })
      toast.success('Purchase deleted')
      navigate('/purchases')
    },
    onError: (err: Error) => toast.error('Failed to delete purchase', err.message),
  })

  const purchase = data?.purchase
  const items = data?.items ?? []

  const taxableTotal = items.reduce((s: number, it: any) => s + (it.taxable_amount ?? 0), 0)
  const cgstTotal = items.reduce((s: number, it: any) => s + (it.cgst_amount ?? 0), 0)
  const sgstTotal = items.reduce((s: number, it: any) => s + (it.sgst_amount ?? 0), 0)
  const igstTotal = items.reduce((s: number, it: any) => s + (it.igst_amount ?? 0), 0)
  const taxTotal = cgstTotal + sgstTotal + igstTotal
  const interstate = igstTotal > 0

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/purchases')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            Purchase Details
            {purchase?.purchase_no && <span className="font-mono text-sm text-indigo-300">{purchase.purchase_no}</span>}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">View purchase bill and items</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !purchase ? (
        <p className="text-sm text-muted-foreground">Purchase not found.</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><span className="text-zinc-500">Date</span><p className="text-zinc-200">{formatDate(purchase.purchase_date ?? purchase.created_at)}</p></div>
            <div><span className="text-zinc-500">Supplier</span><p className="text-zinc-200">{purchase.suppliers?.name ?? '—'}</p></div>
            <div><span className="text-zinc-500">Invoice No</span><p className="font-mono text-zinc-200">{purchase.invoice_no ?? '—'}</p></div>
            <div><span className="text-zinc-500">Purchase Type</span><p className="text-zinc-200 capitalize">{purchase.purchase_type ?? '—'}</p></div>
            <div className="col-span-2"><span className="text-zinc-500">Notes</span><p className="text-zinc-200">{purchase.notes ?? '—'}</p></div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-300">Items</h3>
            {items.some((it: any) => it.products?.barcode_value) && (
              <Button
                type="button" variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => {
                  for (const it of items) {
                    if (it.products?.barcode_value) {
                      printBarcodeLabel(it.product_name, it.products.barcode_value, it.products.price ?? it.unit_cost)
                    }
                  }
                }}
              >
                <Printer className="h-3.5 w-3.5 mr-1" />Print All Labels
              </Button>
            )}
          </div>
          <div className="rounded-lg border border-zinc-800 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Code</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">GST%</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead className="text-right">Retail</TableHead>
                  <TableHead className="text-right">SP</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[5%]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0
                  ? <TableRow><TableCell colSpan={11} className="text-center text-zinc-500 py-4">No items</TableCell></TableRow>
                  : items.map((it: any) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-mono text-xs text-zinc-400">{it.products?.sku ?? '—'}</TableCell>
                      <TableCell className="text-zinc-200">{it.product_name}</TableCell>
                      <TableCell className="text-right text-zinc-400">{it.tax_rate}%</TableCell>
                      <TableCell className="text-right text-zinc-400">{it.qty}</TableCell>
                      <TableCell className="text-right text-zinc-400">{formatINR(it.unit_cost)}</TableCell>
                      <TableCell className="font-mono text-xs text-zinc-400">{it.products?.barcode_value ?? '—'}</TableCell>
                      <TableCell className="text-right text-zinc-400">{it.products?.mrp != null ? formatINR(it.products.mrp) : '—'}</TableCell>
                      <TableCell className="text-right text-zinc-400">{it.products?.price != null ? formatINR(it.products.price) : '—'}</TableCell>
                      <TableCell className="text-right text-zinc-400">{it.products?.special_price != null ? formatINR(it.products.special_price) : '—'}</TableCell>
                      <TableCell className="text-right font-medium text-white">{formatINR(it.line_total)}</TableCell>
                      <TableCell>
                        {it.products?.barcode_value && (
                          <button
                            type="button"
                            title="Print label"
                            onClick={() => printBarcodeLabel(it.product_name, it.products!.barcode_value!, it.products?.price ?? it.unit_cost)}
                            className="p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-900/20 transition-colors"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><span className="text-zinc-500">Taxable Amount</span><p className="text-zinc-200 font-medium">{formatINR(taxableTotal)}</p></div>
              {interstate ? (
                <div><span className="text-zinc-500">IGST</span><p className="text-zinc-200 font-medium">{formatINR(igstTotal)}</p></div>
              ) : (
                <>
                  <div><span className="text-zinc-500">CGST</span><p className="text-zinc-200 font-medium">{formatINR(cgstTotal)}</p></div>
                  <div><span className="text-zinc-500">SGST</span><p className="text-zinc-200 font-medium">{formatINR(sgstTotal)}</p></div>
                </>
              )}
              <div><span className="text-zinc-500">Tax Total</span><p className="text-zinc-200 font-medium">{formatINR(taxTotal)}</p></div>
            </div>
            {(purchase.bill_discount_value ?? 0) > 0 && (
              <div className="flex justify-between text-zinc-400">
                <span>Bill Discount</span>
                <span>{purchase.bill_discount_type === 'percent' ? `${purchase.bill_discount_value}%` : formatINR(purchase.bill_discount_value ?? 0)}</span>
              </div>
            )}
            {(purchase.round_off ?? 0) !== 0 && (
              <div className="flex justify-between text-zinc-400">
                <span>Round Off</span>
                <span>{formatINR(purchase.round_off ?? 0)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between items-center pt-1">
              <button onClick={() => setDeleteConfirmOpen(true)} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />Delete Purchase
              </button>
              <div className="flex items-center gap-3">
                <span className="text-zinc-400">Total Bill Amount</span>
                <span className="text-lg font-bold text-white">{formatINR(purchase.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Purchase?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete the purchase record and all its items. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Deleting...</> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
