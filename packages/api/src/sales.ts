import type { TypedSupabaseClient } from './client'
import type { CartItem, GSTContext, InvoiceTotals } from '@billscape/core'
import { computeGST, computeLineTax } from '@billscape/core'

interface CreateSaleInput {
  organization_id: string
  customer_id?: string
  items: CartItem[]
  payment_mode: 'cash' | 'card' | 'upi' | 'split'
  cash_amount?: number
  card_amount?: number
  upi_amount?: number
  notes?: string
  gst_context: GSTContext
  created_by: string
}

export async function createSale(client: TypedSupabaseClient, input: CreateSaleInput) {
  const totals: InvoiceTotals = computeGST(input.gst_context, input.items)
  const interstate = totals.is_interstate

  // Generate invoice number (format: BS-YYYYMMDD-XXXX)
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const seq = Math.floor(Math.random() * 9000) + 1000
  const invoice_no = `BS-${datePart}-${seq}`

  const { data: sale, error: saleError } = await client
    .from('sales')
    .insert({
      organization_id: input.organization_id,
      invoice_no,
      customer_id: input.customer_id ?? null,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      tax_total: totals.tax_total,
      grand_total: totals.grand_total,
      payment_mode: input.payment_mode,
      cash_amount: input.cash_amount ?? null,
      card_amount: input.card_amount ?? null,
      upi_amount: input.upi_amount ?? null,
      notes: input.notes ?? null,
      created_by: input.created_by,
    })
    .select()
    .single()

  if (saleError || !sale) {
    return { data: null, error: saleError }
  }

  // Insert sale items with tax breakdown
  const saleItems = input.items.map((item) => {
    const lineTax = computeLineTax(
      item.unit_price,
      item.qty,
      item.discount_pct,
      item.tax_rate,
      interstate,
    )
    return {
      sale_id: sale.id,
      organization_id: input.organization_id,
      product_id: item.product_id,
      product_name: item.product_name,
      hsn_code: item.hsn_code ?? null,
      qty: item.qty,
      unit_price: item.unit_price,
      discount_pct: item.discount_pct,
      tax_rate: item.tax_rate,
      cgst_amount: lineTax.cgst,
      sgst_amount: lineTax.sgst,
      igst_amount: lineTax.igst,
      line_total: lineTax.lineTotal,
    }
  })

  const { error: itemsError } = await client.from('sale_items').insert(saleItems)

  if (itemsError) {
    return { data: null, error: itemsError }
  }

  return { data: { sale, totals }, error: null }
}

export async function getSales(
  client: TypedSupabaseClient,
  orgId: string,
  options?: { from?: string; to?: string; limit?: number },
) {
  let query = client
    .from('sales')
    .select('*, customers(name, phone), profiles!created_by(full_name)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (options?.from) query = query.gte('created_at', options.from)
  if (options?.to) query = query.lte('created_at', options.to)
  if (options?.limit) query = query.limit(options.limit)

  return query
}

export async function getSaleWithItems(client: TypedSupabaseClient, orgId: string, saleId: string) {
  const [saleResult, itemsResult] = await Promise.all([
    client
      .from('sales')
      .select('*, customers(name, phone, gstin, state_code, address)')
      .eq('organization_id', orgId)
      .eq('id', saleId)
      .single(),
    client
      .from('sale_items')
      .select('*')
      .eq('sale_id', saleId),
  ])

  return { sale: saleResult.data, items: itemsResult.data, error: saleResult.error ?? itemsResult.error }
}

export async function getTodaySummary(client: TypedSupabaseClient, orgId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  return client
    .from('sales')
    .select('grand_total, payment_mode, created_at')
    .eq('organization_id', orgId)
    .gte('created_at', todayISO)
}
