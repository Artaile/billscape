import type { TypedSupabaseClient } from './client'
import type { CartItem, DiscountType, GSTContext, InvoiceTotals } from '@billscape/core'
import { applyOrderDiscount, computeGST, computeLineTax } from '@billscape/core'

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
  order_discount_type?: DiscountType
  order_discount_value?: number
}

function buildSaleItemRows(saleId: string, orgId: string, items: CartItem[], interstate: boolean) {
  return items.map((item) => {
    const lineTax = computeLineTax(
      item.unit_price,
      item.qty,
      item.discount_pct,
      item.tax_rate,
      interstate,
      item.discount_type,
      item.discount_amount,
    )
    return {
      sale_id: saleId,
      organization_id: orgId,
      product_id: item.product_id,
      product_name: item.product_name,
      hsn_code: item.hsn_code ?? null,
      qty: item.qty,
      unit_price: item.unit_price,
      discount_pct: item.discount_pct,
      discount_type: item.discount_type ?? 'percent',
      discount_amount: item.discount_amount ?? 0,
      tax_rate: item.tax_rate,
      cgst_amount: lineTax.cgst,
      sgst_amount: lineTax.sgst,
      igst_amount: lineTax.igst,
      line_total: lineTax.lineTotal,
    }
  })
}

export async function createSale(client: TypedSupabaseClient, input: CreateSaleInput) {
  const baseTotals: InvoiceTotals = computeGST(input.gst_context, input.items)
  const totals = input.order_discount_type
    ? applyOrderDiscount(baseTotals, input.order_discount_type, input.order_discount_value ?? 0)
    : baseTotals
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
      order_discount_type: input.order_discount_type ?? null,
      order_discount_value: input.order_discount_value ?? 0,
      order_discount_amount: totals.order_discount_amount,
      net_payable: totals.net_payable,
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
  const saleItems = buildSaleItemRows(sale.id, input.organization_id, input.items, interstate)
  const { error: itemsError } = await client.from('sale_items').insert(saleItems)

  if (itemsError) {
    return { data: null, error: itemsError }
  }

  return { data: { sale, totals }, error: null }
}

interface UpdateSaleInput {
  items: CartItem[]
  customer_id?: string
  payment_mode: 'cash' | 'card' | 'upi' | 'split'
  cash_amount?: number
  card_amount?: number
  upi_amount?: number
  notes?: string
  gst_context: GSTContext
  order_discount_type?: DiscountType
  order_discount_value?: number
  updated_by: string
}

// Full item edit: reverses stock for the previous line items, replaces sale_items,
// and lets the existing INSERT trigger (decrement_stock_on_sale) re-decrement for the new lines.
export async function updateSale(
  client: TypedSupabaseClient,
  orgId: string,
  saleId: string,
  input: UpdateSaleInput,
) {
  const { data: oldItems, error: oldItemsError } = await client
    .from('sale_items')
    .select('product_id, qty')
    .eq('sale_id', saleId)

  if (oldItemsError) return { data: null, error: oldItemsError }

  // Restore stock consumed by the original items before replacing them.
  for (const item of oldItems ?? []) {
    await client.rpc('increment_inventory', {
      p_org_id: orgId,
      p_product_id: item.product_id,
      p_qty: item.qty,
    })
    await client.from('stock_movements').insert({
      organization_id: orgId,
      product_id: item.product_id,
      qty_change: item.qty,
      reason: 'adjustment',
      reference_id: saleId,
      note: 'Bill edited — original quantity reversed',
      created_by: input.updated_by,
    })
  }

  const baseTotals: InvoiceTotals = computeGST(input.gst_context, input.items)
  const totals = input.order_discount_type
    ? applyOrderDiscount(baseTotals, input.order_discount_type, input.order_discount_value ?? 0)
    : baseTotals
  const interstate = totals.is_interstate

  const { error: deleteError } = await client.from('sale_items').delete().eq('sale_id', saleId)
  if (deleteError) return { data: null, error: deleteError }

  const newItems = buildSaleItemRows(saleId, orgId, input.items, interstate)
  const { error: insertError } = await client.from('sale_items').insert(newItems)
  if (insertError) return { data: null, error: insertError }

  const { data: sale, error: saleError } = await client
    .from('sales')
    .update({
      customer_id: input.customer_id ?? null,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      tax_total: totals.tax_total,
      grand_total: totals.grand_total,
      order_discount_type: input.order_discount_type ?? null,
      order_discount_value: input.order_discount_value ?? 0,
      order_discount_amount: totals.order_discount_amount,
      net_payable: totals.net_payable,
      payment_mode: input.payment_mode,
      cash_amount: input.cash_amount ?? null,
      card_amount: input.card_amount ?? null,
      upi_amount: input.upi_amount ?? null,
      notes: input.notes ?? null,
    })
    .eq('id', saleId)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (saleError || !sale) return { data: null, error: saleError }

  await client.from('activity_log').insert({
    organization_id: orgId,
    actor_id: input.updated_by,
    actor_name: '',
    action: 'sale_edited',
    entity: 'sales',
    entity_id: saleId,
  })

  return { data: { sale, totals }, error: null }
}

const BIN_RETENTION_DAYS = 30

// Soft delete: reverses stock for all line items, marks the sale voided, sets a purge date.
export async function voidSale(
  client: TypedSupabaseClient,
  orgId: string,
  saleId: string,
  reason: string,
  userId: string,
) {
  const { data: items, error: itemsError } = await client
    .from('sale_items')
    .select('product_id, qty')
    .eq('sale_id', saleId)

  if (itemsError) return { data: null, error: itemsError }

  for (const item of items ?? []) {
    await client.rpc('increment_inventory', {
      p_org_id: orgId,
      p_product_id: item.product_id,
      p_qty: item.qty,
    })
    await client.from('stock_movements').insert({
      organization_id: orgId,
      product_id: item.product_id,
      qty_change: item.qty,
      reason: 'adjustment',
      reference_id: saleId,
      note: `Sale voided — ${reason}`,
      created_by: userId,
    })
  }

  const purgeAfter = new Date(Date.now() + BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: sale, error: saleError } = await client
    .from('sales')
    .update({
      voided_at: new Date().toISOString(),
      voided_by: userId,
      void_reason: reason,
      purge_after: purgeAfter,
    })
    .eq('id', saleId)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (saleError || !sale) return { data: null, error: saleError }

  await client.from('activity_log').insert({
    organization_id: orgId,
    actor_id: userId,
    actor_name: '',
    action: 'sale_voided',
    entity: 'sales',
    entity_id: saleId,
    metadata: { reason },
  })

  return { data: sale, error: null }
}

// Restore from bin: re-decrements stock (mirrors original sale decrement since sale_items
// are not re-inserted here, so the INSERT trigger does not fire).
export async function restoreSale(client: TypedSupabaseClient, orgId: string, saleId: string, userId: string) {
  const { data: items, error: itemsError } = await client
    .from('sale_items')
    .select('product_id, qty')
    .eq('sale_id', saleId)

  if (itemsError) return { data: null, error: itemsError }

  for (const item of items ?? []) {
    await client.rpc('increment_inventory', {
      p_org_id: orgId,
      p_product_id: item.product_id,
      p_qty: -item.qty,
    })
    await client.from('stock_movements').insert({
      organization_id: orgId,
      product_id: item.product_id,
      qty_change: -item.qty,
      reason: 'sale',
      reference_id: saleId,
      note: 'Sale restored from bin',
      created_by: userId,
    })
  }

  const { data: sale, error: saleError } = await client
    .from('sales')
    .update({ voided_at: null, voided_by: null, void_reason: null, purge_after: null })
    .eq('id', saleId)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (saleError || !sale) return { data: null, error: saleError }

  await client.from('activity_log').insert({
    organization_id: orgId,
    actor_id: userId,
    actor_name: '',
    action: 'sale_restored',
    entity: 'sales',
    entity_id: saleId,
  })

  return { data: sale, error: null }
}

// Permanent delete from bin.
export async function purgeSale(client: TypedSupabaseClient, orgId: string, saleId: string) {
  const { error: itemsError } = await client.from('sale_items').delete().eq('sale_id', saleId)
  if (itemsError) return { error: itemsError }

  const { error: saleError } = await client
    .from('sales')
    .delete()
    .eq('id', saleId)
    .eq('organization_id', orgId)

  return { error: saleError }
}

// Sweeps bin entries whose 30-day retention has elapsed. Called lazily on History tab load.
export async function purgeExpiredVoidedSales(client: TypedSupabaseClient, orgId: string) {
  const { data: expired } = await client
    .from('sales')
    .select('id')
    .eq('organization_id', orgId)
    .lt('purge_after', new Date().toISOString())

  for (const sale of expired ?? []) {
    await purgeSale(client, orgId, sale.id)
  }

  return { purged: expired?.length ?? 0 }
}

export async function getSales(
  client: TypedSupabaseClient,
  orgId: string,
  options?: { from?: string; to?: string; limit?: number; search?: string; includeVoided?: boolean; voidedOnly?: boolean },
) {
  // Note: sales.created_by references auth.users, not public.profiles, so it cannot be
  // embedded via PostgREST's foreign-key hint syntax here.
  let query = client
    .from('sales')
    .select('*, customers(name, phone)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (options?.voidedOnly) {
    query = query.not('voided_at', 'is', null)
  } else if (!options?.includeVoided) {
    query = query.is('voided_at', null)
  }

  if (options?.from) query = query.gte('created_at', options.from)
  if (options?.to) query = query.lte('created_at', options.to)
  if (options?.search) query = query.ilike('invoice_no', `%${options.search}%`)
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
