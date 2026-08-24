import type { TypedSupabaseClient } from './client'
import type { CartItem, DiscountType, GSTContext, InvoiceTotals } from '@billscape/core'
import { applyLoyaltyRedemption, applyOrderDiscount, applyRoundOff, computeGST, computeLineTax, formatDocumentNumber } from '@billscape/core'
import { recordVariantSale } from './variantInventory'

async function getActorName(client: TypedSupabaseClient, userId: string): Promise<string> {
  if (!userId) return 'User'
  try {
    const { data } = await client.from('employees').select('full_name').eq('auth_user_id', userId).maybeSingle()
    if (data?.full_name) return data.full_name
  } catch {}
  return 'User'
}

interface CreateSaleInput {
  organization_id: string
  customer_id?: string
  invoice_no?: string
  invoice_template?: {
    prefix_sale?: string
    number_format?: string
    number_suffix?: string
    invoice_start_number?: number
    enable_round_off?: boolean
    round_off_type?: string
  }
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
  loyalty_customer_id?: string
  loyalty_points_redeemed?: number
  loyalty_redeem_amount?: number
  loyalty_points_earned?: number
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
  const discountedTotals = input.order_discount_type
    ? applyOrderDiscount(baseTotals, input.order_discount_type, input.order_discount_value ?? 0)
    : baseTotals
  const loyaltyTotals = input.loyalty_redeem_amount
    ? applyLoyaltyRedemption(discountedTotals, input.loyalty_redeem_amount)
    : discountedTotals
  const totals = applyRoundOff(
    loyaltyTotals,
    input.invoice_template?.enable_round_off ?? true,
    input.invoice_template?.round_off_type,
  )
  const interstate = totals.is_interstate

  // Generate invoice number based on org's configured prefix and format
  let invoice_no = input.invoice_no
  if (!invoice_no) {
    let prefix = input.invoice_template?.prefix_sale
    let format = input.invoice_template?.number_format
    let suffix = input.invoice_template?.number_suffix

    if (!prefix) {
      const { data: orgSettings } = await client
        .from('org_settings')
        .select('invoice_template, branding')
        .eq('organization_id', input.organization_id)
        .single()

      prefix =
        orgSettings?.invoice_template?.prefix_sale ||
        orgSettings?.branding?.invoice_prefix ||
        'INVOICE'
      format = orgSettings?.invoice_template?.number_format
      suffix = orgSettings?.invoice_template?.number_suffix
    }

    const seq = Math.floor(Math.random() * 9000) + 1000
    invoice_no = formatDocumentNumber(prefix || 'INVOICE', seq, { format, suffix })
  }

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
      loyalty_customer_id: input.loyalty_customer_id ?? null,
      loyalty_points_redeemed: input.loyalty_points_redeemed ?? 0,
      loyalty_redeem_amount: totals.loyalty_redeem_amount,
      loyalty_points_earned: input.loyalty_points_earned ?? 0,
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

  // Loyalty bookkeeping is best-effort: stock + payment are already committed above,
  // so a failure here should not roll back the sale.
  if (input.loyalty_customer_id) {
    try {
      const { data: loyaltyRow } = await client
        .from('loyalty_customers')
        .select('points_balance, total_points_earned, total_points_redeemed')
        .eq('id', input.loyalty_customer_id)
        .single()

      if (loyaltyRow) {
        // Clamp redemption to the balance actually on record right now — protects against a
        // stale/mismatched redeem amount (e.g. a UI race) ever driving the balance negative.
        const pointsRedeemed = Math.min(input.loyalty_points_redeemed ?? 0, loyaltyRow.points_balance)
        const pointsEarned = input.loyalty_points_earned ?? 0

        await client
          .from('loyalty_customers')
          .update({
            points_balance: loyaltyRow.points_balance - pointsRedeemed + pointsEarned,
            total_points_earned: loyaltyRow.total_points_earned + pointsEarned,
            total_points_redeemed: loyaltyRow.total_points_redeemed + pointsRedeemed,
          })
          .eq('id', input.loyalty_customer_id)

        const transactionRows = []
        if (pointsRedeemed > 0) {
          transactionRows.push({
            organization_id: input.organization_id,
            loyalty_customer_id: input.loyalty_customer_id,
            type: 'redeem',
            points: pointsRedeemed,
            sale_id: sale.id,
            created_by: input.created_by,
          })
        }
        if (pointsEarned > 0) {
          transactionRows.push({
            organization_id: input.organization_id,
            loyalty_customer_id: input.loyalty_customer_id,
            type: 'add',
            points: pointsEarned,
            sale_id: sale.id,
            created_by: input.created_by,
          })
        }
        if (transactionRows.length > 0) {
          await client.from('loyalty_transactions').insert(transactionRows)
        }
      }
    } catch (loyaltyError) {
      console.error('Loyalty bookkeeping failed for sale', sale.id, loyaltyError)
    }
  }

  // Variant stock is tracked separately from the product-level inventory trigger (see
  // variant_inventory / Task 1 of the variant-redesign plan) — best-effort, mirrors the existing
  // loyalty bookkeeping's non-blocking pattern in this same function: a variant-stock failure must
  // never roll back or fail the sale itself.
  try {
    for (const item of input.items) {
      if (item.variant_id) {
        const { error: variantStockError } = await recordVariantSale(client, {
          organizationId: input.organization_id,
          variantId: item.variant_id,
          qty: item.qty,
          referenceId: sale.id,
          createdBy: input.created_by,
        })
        if (variantStockError) {
          console.error('Variant stock bookkeeping failed for sale', sale.id, item.variant_id, variantStockError)
        }
      }
    }
  } catch (variantError) {
    console.error('Variant stock bookkeeping failed for sale', sale.id, variantError)
  }

  const actorName = await getActorName(client, input.created_by)
  await client.from('activity_log').insert({
    organization_id: input.organization_id,
    actor_id: input.created_by,
    actor_name: actorName,
    action: 'sale_created',
    entity: 'sales',
    entity_id: sale.id,
    metadata: {
      invoice_no: sale.invoice_no,
      grand_total: totals.grand_total,
      payment_mode: sale.payment_mode,
      item_count: input.items.length,
    },
  })

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
      note: 'Sale edited — stock restored before item update',
      created_by: input.updated_by,
    })
  }

  const baseTotals: InvoiceTotals = computeGST(input.gst_context, input.items)
  const totals = input.order_discount_type
    ? applyOrderDiscount(baseTotals, input.order_discount_type, input.order_discount_value ?? 0)
    : baseTotals
  const interstate = totals.is_interstate

  await client.from('sale_items').delete().eq('sale_id', saleId)

  const newItems = buildSaleItemRows(saleId, orgId, input.items, interstate)
  const { error: insertItemsError } = await client.from('sale_items').insert(newItems)
  if (insertItemsError) return { data: null, error: insertItemsError }

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

  const actorName = await getActorName(client, input.updated_by)
  await client.from('activity_log').insert({
    organization_id: orgId,
    actor_id: input.updated_by,
    actor_name: actorName,
    action: 'sale_edited',
    entity: 'sales',
    entity_id: saleId,
    metadata: {
      invoice_no: sale.invoice_no,
      grand_total: totals.grand_total,
      item_count: input.items.length,
    },
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

  const actorName = await getActorName(client, userId)
  await client.from('activity_log').insert({
    organization_id: orgId,
    actor_id: userId,
    actor_name: actorName,
    action: 'sale_voided',
    entity: 'sales',
    entity_id: saleId,
    metadata: { invoice_no: sale.invoice_no, reason },
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

  const actorName = await getActorName(client, userId)
  await client.from('activity_log').insert({
    organization_id: orgId,
    actor_id: userId,
    actor_name: actorName,
    action: 'sale_restored',
    entity: 'sales',
    entity_id: saleId,
    metadata: { invoice_no: sale.invoice_no },
  })

  return { data: sale, error: null }
}

// Permanent delete from bin.
export async function purgeSale(client: TypedSupabaseClient, orgId: string, saleId: string, userId?: string) {
  const { data: sale } = await client.from('sales').select('invoice_no').eq('id', saleId).maybeSingle()

  const { error: itemsError } = await client.from('sale_items').delete().eq('sale_id', saleId)
  if (itemsError) return { error: itemsError }

  const { error: saleError } = await client
    .from('sales')
    .delete()
    .eq('id', saleId)
    .eq('organization_id', orgId)

  if (!saleError && userId) {
    const actorName = await getActorName(client, userId)
    await client.from('activity_log').insert({
      organization_id: orgId,
      actor_id: userId,
      actor_name: actorName,
      action: 'sale_deleted',
      entity: 'sales',
      entity_id: saleId,
      metadata: { invoice_no: sale?.invoice_no },
    })
  }

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
