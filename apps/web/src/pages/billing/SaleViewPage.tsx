import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Printer, Download, Eye, Loader2, Building2, FileText, Calendar, MoreVertical, Pencil, Trash2, UserCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getSaleWithItems, voidSale } from '@billscape/api'
import { formatINR } from '@billscape/core'
import type { CartItem, InvoiceTotals } from '@billscape/core'
import { formatDateTime, parseBilledBy } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InvoicePrint } from '@/components/billing/InvoicePrint'
import { EditSaleDialog } from '@/components/billing/HistoryTab'
import { toast } from '@/hooks/use-toast'

const canEditDelete = (role: string | null) => role === 'owner' || role === 'manager'

export function SaleViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/billing?tab=history'
  const isAutoPrint = (location.state as { autoPrint?: boolean } | null)?.autoPrint || searchParams.get('print') === 'true'
  const autoPrintedRef = useRef(false)

  const { org, user, role } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()
  const allowManage = canEditDelete(role)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const printRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sale-detail', orgId, id],
    enabled: !!orgId && !!id,
    queryFn: async () => getSaleWithItems(supabase as Parameters<typeof getSaleWithItems>[0], orgId!, id!),
  })

  const voidMutation = useMutation({
    mutationFn: async () => {
      const { error } = await voidSale(supabase as Parameters<typeof voidSale>[0], orgId!, id!, voidReason || 'No reason given', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Bill moved to Recycle Bin')
      queryClient.invalidateQueries({ queryKey: ['sales-history', orgId] })
      navigate('/billing?tab=history')
    },
    onError: (err: Error) => toast.error('Failed to delete bill', err.message),
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
      const taxInclusive = org?.branding?.tax_inclusive ?? false
      const cgstTotal = items.reduce((sum, it) => sum + Number(it.cgst_amount ?? 0), 0)
      const sgstTotal = items.reduce((sum, it) => sum + Number(it.sgst_amount ?? 0), 0)
      const igstTotal = items.reduce((sum, it) => sum + Number(it.igst_amount ?? 0), 0)
      const isInterstate = igstTotal > 0

      const breakupMap = new Map<number, { tax_rate: number; taxable_amount: number; cgst: number; sgst: number; igst: number }>()
      for (const it of items) {
        const lineDiscount = it.discount_type === 'flat' ? Number(it.discount_amount ?? 0) : (Number(it.unit_price) * Number(it.qty)) * (Number(it.discount_pct) / 100)
        const grossLine = Number(it.unit_price) * Number(it.qty) - lineDiscount
        const lineTax = Number(it.cgst_amount ?? 0) + Number(it.sgst_amount ?? 0) + Number(it.igst_amount ?? 0)
        // When prices are tax-inclusive, unit_price already contains tax, so the taxable
        // base is the gross line total minus the tax already computed for it at sale time.
        const lineTaxable = taxInclusive ? grossLine - lineTax : grossLine
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

      const breakupValues = Array.from(breakupMap.values())
      const taxableAmount = breakupValues.reduce((sum, b) => sum + b.taxable_amount, 0)

      return {
        subtotal: sale.subtotal,
        discount_total: sale.discount_total,
        taxable_amount: taxableAmount,
        tax_breakup: breakupValues as InvoiceTotals['tax_breakup'],
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

  const invoicePrintProps = sale && totals ? {
    invoiceNo: sale.invoice_no,
    date: sale.created_at,
    shopName: org?.name ?? 'BillScape Shop',
    shopAddress: org?.address,
    shopGstin: org?.gstin,
    shopPan: org?.pan,
    shopLogoUrl: org?.branding?.logo_url,
    shopPhone: org?.phone,
    shopEmail: org?.email,
    customerName: sale.customers?.name,
    customerPhone: sale.customers?.phone ?? undefined,
    customerGstin: sale.customers?.gstin ?? undefined,
    customerAddress: sale.customers?.address ?? undefined,
    items: cartItems,
    totals,
    paymentMode: sale.payment_mode,
    billedBy: parseBilledBy(sale.notes, user?.user_metadata?.full_name || user?.email?.split('@')[0], role ?? 'cashier'),
    branding: org?.branding,
    invoiceTemplate: (org as any)?.invoice_template,
    hidePrintButton: true,
  } : null

  const handlePrint = () => {
    const elem = printRef.current
    if (!elem) {
      window.print()
      return
    }

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) {
      window.print()
      return
    }

    let styles = ''
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      styles += node.outerHTML
    })

    doc.open()
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice ${sale?.invoice_no ?? ''}</title>
          ${styles}
          <style>
            @page {
              margin: 10mm 12mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
            }
          </style>
        </head>
        <body>
          ${elem.innerHTML}
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.focus();
                window.print();
                setTimeout(() => {
                  window.frameElement?.remove();
                }, 1000);
              }, 250);
            };
          </script>
        </body>
      </html>
    `)
    doc.close()
  }

  useEffect(() => {
    if (!isAutoPrint || !sale || !totals || autoPrintedRef.current) return
    autoPrintedRef.current = true
    const timer = setTimeout(() => {
      handlePrint()
    }, 350)
    return () => clearTimeout(timer)
  }, [isAutoPrint, sale, totals])

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
      pdf.save(`${sale.invoice_no}.pdf`)
    } catch (err) {
      toast.error('Failed to generate PDF', err instanceof Error ? err.message : undefined)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(backTo)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              Invoice {sale?.invoice_no ?? ''}
              {sale?.voided_at && <Badge variant="destructive">Voided</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {sale ? `Created on ${formatDateTime(sale.created_at)}` : 'View and reprint invoice'}
            </p>
          </div>
        </div>

        {sale && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5 mr-1.5" />Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={downloading}>
              {downloading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
              Download PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-3.5 w-3.5 mr-1.5" />Preview
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
                        onClick={() => { setMenuOpen(false); setEditing(true) }}
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
      ) : sale && totals ? (
        <div className="space-y-4">
          {/* Party + Invoice details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                <Building2 className="h-4 w-4 text-indigo-400" />Party Details
              </h2>
              <p className="text-base font-medium text-foreground">
                {sale.customers?.name ?? <span className="text-muted-foreground font-normal">Walk-in customer</span>}
              </p>
              {sale.customers?.phone && <p className="text-sm text-muted-foreground mt-1">{sale.customers.phone}</p>}
              {sale.customers?.gstin && <p className="text-sm text-muted-foreground">GSTIN: {sale.customers.gstin}</p>}
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                <FileText className="h-4 w-4 text-indigo-400" />Invoice Details
              </h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Invoice Number</p>
                  <p className="font-medium text-foreground">{sale.invoice_no}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" />Invoice Date</p>
                  <p className="font-medium text-foreground">{formatDateTime(sale.created_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Payment Mode</p>
                  <p className="font-medium text-foreground capitalize">{sale.payment_mode}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs flex items-center gap-1"><UserCheck className="h-3 w-3 text-indigo-400" />Billed By</p>
                  <p className="font-semibold text-white-300">{parseBilledBy(sale.notes, user?.user_metadata?.full_name || user?.email?.split('@')[0], role ?? 'cashier')}</p>
                </div>
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
                    const lineDiscount = it.discount_type === 'flat' ? Number(it.discount_amount ?? 0) : (Number(it.unit_price) * Number(it.qty)) * (Number(it.discount_pct) / 100)
                    const grossLine = Number(it.unit_price) * Number(it.qty) - lineDiscount
                    const lineTax = Number(it.cgst_amount ?? 0) + Number(it.sgst_amount ?? 0) + Number(it.igst_amount ?? 0)
                    const taxInclusive = org?.branding?.tax_inclusive ?? false
                    const lineTaxable = taxInclusive ? grossLine - lineTax : grossLine
                    const lineTotal = taxInclusive ? grossLine : grossLine + lineTax
                    return (
                      <TableRow key={it.id ?? i}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium text-foreground">{it.product_name}</TableCell>
                        <TableCell className="text-right">{it.qty}</TableCell>
                        <TableCell className="text-right">{formatINR(it.unit_price)}</TableCell>
                        <TableCell className="text-right">
                          {it.discount_type === 'flat' ? formatINR(Number(it.discount_amount ?? 0)) : `${it.discount_pct ?? 0}%`}
                        </TableCell>
                        <TableCell className="text-right">{it.tax_rate}%</TableCell>
                        <TableCell className="text-right">{formatINR(lineTaxable)}</TableCell>
                        <TableCell className="text-right">{formatINR(lineTax)}</TableCell>
                        <TableCell className="text-right font-medium">{formatINR(lineTotal)}</TableCell>
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
              <span className="text-foreground">{formatINR(totals.taxable_amount)}</span>
            </div>
            {totals.is_interstate ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGST</span>
                <span className="text-foreground">{formatINR(totals.igst_total)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST</span>
                  <span className="text-foreground">{formatINR(totals.cgst_total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST</span>
                  <span className="text-foreground">{formatINR(totals.sgst_total)}</span>
                </div>
              </>
            )}
            {totals.order_discount_amount > 0 && (
              <div className="flex justify-between text-emerald-500">
                <span>Bill Discount</span>
                <span>-{formatINR(totals.order_discount_amount)}</span>
              </div>
            )}
            {totals.loyalty_redeem_amount > 0 && (
              <div className="flex justify-between text-emerald-500">
                <span>Loyalty Redeemed</span>
                <span>-{formatINR(totals.loyalty_redeem_amount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-border font-bold text-base">
              <span className="text-foreground">Total</span>
              <span className="text-foreground">{formatINR(totals.net_payable)}</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sale not found.</p>
      )}

      {/* Hidden print target — mounted off-screen so window.print()/PDF capture works without
          the raw paper-size layout being the page's own visible body. */}
      {invoicePrintProps && (
        <div id="invoice-print-offscreen" className="fixed left-[-9999px] top-0" aria-hidden>
          <div ref={printRef}>
            <InvoicePrint {...invoicePrintProps} />
          </div>
        </div>
      )}
      <style>{`
        @media print {
          #invoice-print-offscreen { position: static !important; left: auto !important; top: auto !important; }
        }
      `}</style>

      {/* Preview dialog — shows the actual print layout */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {invoicePrintProps && <InvoicePrint {...invoicePrintProps} rootId="invoice-preview-root" />}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      {editing && id && (
        <EditSaleDialog
          saleId={id}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            queryClient.invalidateQueries({ queryKey: ['sale-detail', orgId, id] })
            queryClient.invalidateQueries({ queryKey: ['sales-history', orgId] })
          }}
        />
      )}

      {/* Delete (void) confirm dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="h-4 w-4" /> Delete Bill {sale?.invoice_no}
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
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={voidMutation.isPending}
              onClick={() => voidMutation.mutate()}
            >
              {voidMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
