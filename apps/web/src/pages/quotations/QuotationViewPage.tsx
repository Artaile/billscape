import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Printer, Download, Loader2, Building2, FileText, Calendar,
  MoreVertical, Pencil, Trash2, Share2, ArrowRightCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getQuotationWithItems, deleteQuotation } from '@billscape/api'
import { formatINR } from '@billscape/core'
import { formatDateTime, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  sent: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  accepted: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  expired: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

export function QuotationViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { org, role } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()
  const allowManage = role === 'owner' || role === 'manager'

  const [menuOpen, setMenuOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['quotation-detail', orgId, id],
    enabled: !!orgId && !!id,
    queryFn: async () => getQuotationWithItems(supabase as Parameters<typeof getQuotationWithItems>[0], orgId!, id!),
  })

  const quote = data?.quotation as any
  const items = (data?.items ?? []) as any[]
  const isInterstate = (quote?.igst_total ?? 0) > 0
  const today = new Date().toISOString().split('T')[0]
  const isExpired = quote?.valid_until && quote.valid_until < today && quote.status !== 'accepted'
  const displayStatus = isExpired ? 'expired' : quote?.status

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await deleteQuotation(supabase as Parameters<typeof deleteQuotation>[0], orgId!, id!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Quotation deleted')
      queryClient.invalidateQueries({ queryKey: ['quotations', orgId] })
      navigate('/quotations')
    },
    onError: (err: Error) => toast.error('Failed to delete quotation', err.message),
  })

  const convertMutation = useMutation({
    mutationFn: async () => {
      const HELD_BILLS_KEY = 'billscape_held_bills'
      let stored: any[] = []
      try { stored = JSON.parse(sessionStorage.getItem(HELD_BILLS_KEY) ?? '[]') } catch { stored = [] }

      const cart = items.map((it) => ({
        product_id: it.product_id || '',
        product_name: it.product_name,
        hsn_code: it.hsn_code ?? undefined,
        tax_rate: it.tax_rate,
        unit_price: it.unit_price,
        qty: it.qty,
        discount_pct: it.discount_pct,
      }))

      const holdId = `quote-${quote.id}-${Date.now()}`
      const newBill = {
        id: holdId,
        name: `Quote ${quote.quote_no}`,
        cart,
        customer: quote.customers && quote.customer_id ? {
          id: quote.customer_id,
          name: quote.customers.name,
          phone: quote.customers.phone,
          gstin: quote.customers.gstin,
          state_code: quote.customers.state_code,
        } : null,
        savedAt: Date.now(),
      }
      sessionStorage.setItem(HELD_BILLS_KEY, JSON.stringify([...stored, newBill]))
      return holdId
    },
    onSuccess: (holdId) => {
      navigate(`/billing?resumeHold=${holdId}`)
    },
    onError: () => toast.error('Failed to convert quotation'),
  })

  const handlePrint = () => window.print()

  const handleDownloadPdf = async () => {
    if (!printRef.current) return
    setDownloading(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ unit: 'px', format: [canvas.width, canvas.height] })
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height)
      pdf.save(`${quote.quote_no}.pdf`)
    } catch (err) {
      toast.error('Failed to generate PDF', err instanceof Error ? err.message : undefined)
    } finally {
      setDownloading(false)
    }
  }

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: `Quotation ${quote.quote_no}`, url })
      } catch {
        // user cancelled the share sheet — no error toast needed
      }
    } else {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard')
    }
  }

  const detailCard = quote && (
    <div className="space-y-4">
      {/* Party + Quote details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <Building2 className="h-4 w-4 text-indigo-400" />Party Details
          </h2>
          <p className="text-base font-medium text-foreground">{quote.customer_name}</p>
          {quote.customer_phone && <p className="text-sm text-muted-foreground mt-1">{quote.customer_phone}</p>}
          {quote.customers?.address && <p className="text-sm text-muted-foreground">{quote.customers.address}</p>}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <FileText className="h-4 w-4 text-indigo-400" />Estimate Details
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Estimate Number</p>
              <p className="font-medium text-foreground">{quote.quote_no}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" />Estimate Date</p>
              <p className="font-medium text-foreground">{formatDateTime(quote.created_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Status</p>
              <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize mt-0.5', STATUS_COLORS[displayStatus])}>
                {displayStatus}
              </span>
            </div>
            {quote.valid_until && (
              <div>
                <p className="text-muted-foreground text-xs">Valid Until</p>
                <p className="font-medium text-foreground">{new Date(quote.valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <h2 className="text-sm font-semibold text-foreground px-4 pt-4 pb-2">Items</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Tax %</TableHead>
                <TableHead className="text-right">Taxable Value</TableHead>
                <TableHead className="text-right">Tax Amount</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it, i) => {
                const lineTax = Number(it.cgst_amount ?? 0) + Number(it.sgst_amount ?? 0) + Number(it.igst_amount ?? 0)
                const grossLine = Number(it.unit_price) * Number(it.qty) * (1 - Number(it.discount_pct ?? 0) / 100)
                const taxable = grossLine - lineTax >= 0 ? grossLine - lineTax : grossLine
                return (
                  <TableRow key={it.id ?? i}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium text-foreground">{it.product_name}</TableCell>
                    <TableCell className="text-right">{it.qty}</TableCell>
                    <TableCell className="text-right">{formatINR(it.unit_price)}</TableCell>
                    <TableCell className="text-right">{it.discount_pct ?? 0}%</TableCell>
                    <TableCell className="text-right">{it.tax_rate}%</TableCell>
                    <TableCell className="text-right">{formatINR(taxable)}</TableCell>
                    <TableCell className="text-right">{formatINR(lineTax)}</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(it.line_total)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Totals */}
      <div className="rounded-lg border border-border bg-card p-4 max-w-xs ml-auto space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Qty</span>
          <span className="text-foreground">{items.reduce((s, it) => s + Number(it.qty), 0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="text-foreground">{formatINR(quote.subtotal ?? 0)}</span>
        </div>
        {isInterstate ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">IGST</span>
            <span className="text-foreground">{formatINR(quote.igst_total ?? 0)}</span>
          </div>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">CGST</span>
              <span className="text-foreground">{formatINR(quote.cgst_total ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">SGST</span>
              <span className="text-foreground">{formatINR(quote.sgst_total ?? 0)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between pt-2 border-t border-border font-bold text-base">
          <span className="text-foreground">Total</span>
          <span className="text-foreground">{formatINR(quote.net_payable ?? quote.total_amount)}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/quotations')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              Estimate {quote?.quote_no ?? ''}
              {quote && <Badge className={cn('capitalize', STATUS_COLORS[displayStatus])} variant="outline">{displayStatus}</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {quote ? `Created on ${formatDateTime(quote.created_at)}` : 'View quotation'}
            </p>
          </div>
        </div>

        {quote && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5 mr-1.5" />Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={downloading}>
              {downloading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
              Download PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-3.5 w-3.5 mr-1.5" />Share
            </Button>
            <Button size="sm" onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>
              {convertMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowRightCircle className="h-3.5 w-3.5 mr-1.5" />}
              Convert to Sale
            </Button>
            {allowManage && (
              <div className="relative">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMenuOpen((prev) => !prev)}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full z-40 mt-1 w-40 rounded-lg border border-border bg-card shadow-xl overflow-hidden py-1">
                      <button
                        onClick={() => { setMenuOpen(false); toast.error('Edit not available yet', 'Delete and recreate the quotation for now.') }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5 shrink-0" />Edit
                      </button>
                      <button
                        onClick={() => { setMenuOpen(false); setDeleteConfirmOpen(true) }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : quote ? (
        <div ref={printRef} id="quotation-print-root">
          {detailCard}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Quotation not found.</p>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body :not(#quotation-print-root):not(#quotation-print-root *) { display: none !important; }
          #quotation-print-root { display: block !important; }
        }
      `}</style>

      {/* Delete confirm dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="h-4 w-4" /> Delete Quotation {quote?.quote_no}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This permanently deletes the quotation. This cannot be undone.</p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
