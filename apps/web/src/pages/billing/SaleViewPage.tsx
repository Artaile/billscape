import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getSaleWithItems } from '@billscape/api'
import type { CartItem, InvoiceTotals } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { InvoicePrint } from '@/components/billing/InvoicePrint'

export function SaleViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { org } = useAuth()
  const orgId = org?.id

  const { data, isLoading } = useQuery({
    queryKey: ['sale-detail', orgId, id],
    enabled: !!orgId && !!id,
    queryFn: async () => getSaleWithItems(supabase as Parameters<typeof getSaleWithItems>[0], orgId!, id!),
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
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => navigate('/billing?tab=history')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            {sale?.invoice_no ?? 'Sale'}
            {sale?.voided_at && <Badge variant="destructive">Voided</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">View and reprint invoice</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sale && totals ? (
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
      ) : (
        <p className="text-sm text-muted-foreground">Sale not found.</p>
      )}
    </div>
  )
}
