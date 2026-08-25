import type { TypedSupabaseClient } from './client'
import type { GSTContext, GSTRate } from '@billscape/core'
import { computeLineTax, computeGST, isInterState, generateBarcode, formatDocumentNumber } from '@billscape/core'
import { generateProductCode } from './products'
import { recordVariantPurchase } from './variantInventory'
import type { Database } from './database.types'

type ProductInsert = Database['public']['Tables']['products']['Insert']
type ProductUpdate = Database['public']['Tables']['products']['Update']

export interface PurchaseLineInput {
  product_id: string | null
  is_new_product: boolean
  product_name: string
  sku?: string
  barcode_value?: string
  tax_rate: GSTRate
  qty: number
  unit_cost: number
  mrp?: number
  price: number
  special_price?: number
  update_existing_pricing?: boolean
  // New-product-only metadata — ignored when is_new_product is false.
  category_id?: string | null
  hsn_code?: string
  variants?: {
    variant_name: string
    barcode_value?: string
    sku?: string
    tax_rate: GSTRate
    mrp?: number
    sale_price?: number
    special_price?: number
    sale_gst_mode?: 'include' | 'exclude'
    purchase_price?: number
    purchase_gst_mode?: 'include' | 'exclude'
    qty?: number
    expiry_date?: string
  }[]
  batches?: { batch_no: string; expiry_date: string; qty: number }[]
  // Required for new-product lines (DB requires products.unit_id); unused for existing products.
  unit_id?: string
  secondary_unit_id?: string
  conversion_factor?: number
}

export interface VariantLineSeed {
  variantId: string
  qty: number
  purchasePrice: number
  taxRate: GSTRate
  variantName: string
}

export interface CreatePurchaseInput {
  organization_id: string
  supplier_id: string | null
  invoice_no?: string
  purchase_no: string
  purchase_date?: string
  purchase_type: 'credit' | 'cash'
  notes?: string
  items: PurchaseLineInput[]
  gst_context: GSTContext
  bill_discount_type?: 'flat' | 'percent'
  bill_discount_value?: number
  round_off?: number
  created_by: string
}

const UNIQUE_VIOLATION = '23505'

// Creates a product for a purchase line, retrying once with a freshly generated
// sku/barcode if the auto-generated value collided (astronomically unlikely, but the
// products table enforces UNIQUE(organization_id, sku) and UNIQUE(organization_id, barcode_value)).
async function createProductForLine(
  client: TypedSupabaseClient,
  orgId: string,
  createdBy: string,
  line: PurchaseLineInput,
  attempt = 0,
): Promise<
  | { id: string; variantSeeds: VariantLineSeed[] }
  | { error: { code?: string; message: string }; collidingField: 'sku' | 'barcode_value' | null }
> {
  if (!line.unit_id) {
    return { error: { message: 'Unit is required for a new product' }, collidingField: null }
  }

  const payload: ProductInsert = {
    organization_id: orgId,
    name: line.product_name,
    sku: line.sku || null,
    tax_rate: line.tax_rate,
    price: line.price,
    cost_price: line.unit_cost,
    mrp: line.mrp ?? null,
    special_price: line.special_price ?? null,
    barcode_value: line.barcode_value || null,
    track_stock: true,
    is_active: true,
    category_id: line.category_id ?? null,
    hsn_code: line.hsn_code || null,
    has_variants: !!line.variants?.length,
    has_batches: !!line.batches?.length,
    unit_id: line.unit_id!,
    secondary_unit_id: line.secondary_unit_id ?? null,
    conversion_factor: line.conversion_factor ?? null,
  }

  const { data, error } = await client.from('products').insert(payload).select('id').single()
  if (!error && data) {
    // Best-effort: variants/batches entered during purchase item entry. Same filtering rules as
    // ProductFormPage's own save mutation (empty rows dropped). A failure here should not fail
    // the whole purchase — the product itself was already created successfully.
    const variantSeeds: VariantLineSeed[] = []
    const validVariants = (line.variants ?? []).filter((v) => v.variant_name.trim())
    if (validVariants.length > 0) {
      const { data: insertedVariants, error: variantsError } = await client.from('product_variants').insert(
        validVariants.map((v) => ({
          product_id: data.id,
          organization_id: orgId,
          variant_name: v.variant_name,
          barcode_value: v.barcode_value || null,
          sku: v.sku || null,
          tax_rate: v.tax_rate,
          mrp: v.mrp ? Number(v.mrp) : null,
          sale_price: v.sale_price ? Number(v.sale_price) : null,
          special_price: v.special_price ? Number(v.special_price) : null,
          sale_gst_mode: v.sale_gst_mode,
          purchase_price: v.purchase_price ? Number(v.purchase_price) : null,
          purchase_gst_mode: v.purchase_gst_mode,
          qty: v.qty ? Number(v.qty) : 0,
          stock_qty: v.qty ? Number(v.qty) : 0, // keep legacy stock_qty in sync — still read by any older code path
          expiry_date: v.expiry_date || null,
        })),
      ).select('id')
      if (!variantsError && insertedVariants) {
        // Seed variant_inventory rows up front (no auto-create trigger exists on
        // product_variants insert — mirrors the base-product `inventory` row being explicitly
        // inserted at product-creation time in ProductFormPage.tsx). recordVariantPurchase's
        // increment_variant_inventory RPC is UPDATE-only, so without this row existing first,
        // the later stock-seed call in createPurchase/updatePurchase would silently no-op.
        await client.from('variant_inventory').insert(
          insertedVariants.map((iv: { id: string }) => ({ product_variant_id: iv.id, organization_id: orgId, stock_qty: 0 })),
        )
        insertedVariants.forEach((iv: { id: string }, i: number) => {
          const qty = validVariants[i]?.qty ? Number(validVariants[i].qty) : 0
          if (qty > 0) {
            variantSeeds.push({
              variantId: iv.id,
              qty,
              purchasePrice: validVariants[i].purchase_price ? Number(validVariants[i].purchase_price) : 0,
              taxRate: validVariants[i].tax_rate,
              variantName: validVariants[i].variant_name,
            })
          }
        })
      }
    }
    const validBatches = (line.batches ?? []).filter((b) => b.batch_no.trim())
    if (validBatches.length > 0) {
      await client.from('inventory_batches').insert(
        validBatches.map((b) => ({
          product_id: data.id,
          organization_id: orgId,
          batch_no: b.batch_no,
          expiry_date: b.expiry_date || null,
          qty: b.qty ?? 0,
        })),
      )
    }
    return { id: data.id, variantSeeds }
  }

  if (error?.code === UNIQUE_VIOLATION && attempt < 3) {
    const detail = (error as { details?: string }).details ?? ''
    const collidingField: 'sku' | 'barcode_value' | null = detail.includes('sku')
      ? 'sku'
      : detail.includes('barcode_value')
        ? 'barcode_value'
        : null

    // Only auto-retry if the colliding field was machine-generated, not user-typed.
    const canRetry =
      (collidingField === 'sku' && !!line.sku?.startsWith('PC')) ||
      (collidingField === 'barcode_value' && !!line.barcode_value?.startsWith('BS'))

    if (canRetry) {
      const retried: PurchaseLineInput = {
        ...line,
        sku: collidingField === 'sku' ? await generateProductCode(client, orgId) : line.sku,
        barcode_value: collidingField === 'barcode_value' ? generateBarcode() : line.barcode_value,
      }
      return createProductForLine(client, orgId, createdBy, retried, attempt + 1)
    }

    return { error: { code: error.code, message: error.message }, collidingField }
  }

  return { error: { code: error?.code, message: error?.message ?? 'Failed to create product' }, collidingField: null }
}

// Resolves new-product lines into real product rows before the purchase_items insert,
// closing the "double entry" gap at its root. Shared by create and update.
async function resolveItems(
  client: TypedSupabaseClient,
  orgId: string,
  createdBy: string,
  items: PurchaseLineInput[],
): Promise<
  | { items: (PurchaseLineInput & { product_id: string; variantLineSeeds: VariantLineSeed[] })[]; variantSeeds: VariantLineSeed[]; error: null }
  | { items: null; variantSeeds: null; error: { message: string; line: PurchaseLineInput; collidingField: 'sku' | 'barcode_value' | null } }
> {
  const resolvedItems: (PurchaseLineInput & { product_id: string; variantLineSeeds: VariantLineSeed[] })[] = []
  const variantSeeds: VariantLineSeed[] = []
  for (const line of items) {
    if (!line.is_new_product && line.product_id) {
      if (line.update_existing_pricing) {
        const updates: ProductUpdate = {
          cost_price: line.unit_cost,
          price: line.price,
          mrp: line.mrp ?? null,
          special_price: line.special_price ?? null,
          tax_rate: line.tax_rate,
        }
        await client
          .from('products')
          .update(updates)
          .eq('id', line.product_id)
          .eq('organization_id', orgId)
      }
      resolvedItems.push({ ...line, product_id: line.product_id, variantLineSeeds: [] })
      continue
    }

    const result = await createProductForLine(client, orgId, createdBy, line)
    if ('error' in result) {
      return { items: null, variantSeeds: null, error: { message: result.error.message, line, collidingField: result.collidingField } }
    }
    resolvedItems.push({ ...line, product_id: result.id, variantLineSeeds: result.variantSeeds })
    variantSeeds.push(...result.variantSeeds)
  }
  return { items: resolvedItems, variantSeeds, error: null }
}

function buildItemRows(
  purchaseId: string,
  orgId: string,
  resolvedItems: (PurchaseLineInput & { product_id: string })[],
  interstate: boolean,
) {
  return resolvedItems.map((it) => {
    const lineTax = computeLineTax(it.unit_cost, it.qty, 0, it.tax_rate, interstate)
    return {
      purchase_id: purchaseId,
      organization_id: orgId,
      product_id: it.product_id,
      product_name: it.product_name,
      tax_rate: it.tax_rate,
      qty: it.qty,
      unit_cost: it.unit_cost,
      taxable_amount: lineTax.taxableAmount,
      cgst_amount: lineTax.cgst,
      sgst_amount: lineTax.sgst,
      igst_amount: lineTax.igst,
      line_total: lineTax.lineTotal,
    }
  })
}

export async function createPurchase(client: TypedSupabaseClient, input: CreatePurchaseInput) {
  const interstate = isInterState(input.gst_context)

  const resolved = await resolveItems(client, input.organization_id, input.created_by, input.items)
  if (resolved.error) return { data: null, error: resolved.error }
  const resolvedItems = resolved.items

  const totals = computeGST(
    input.gst_context,
    resolvedItems.map((it, i) => ({
      product_id: String(i),
      product_name: it.product_name,
      tax_rate: it.tax_rate,
      unit_price: it.unit_cost,
      qty: it.qty,
      discount_pct: 0,
    })),
  )

  const roundOff = input.round_off ?? 0
  const totalAmount = totals.net_payable + roundOff

  const { data: purchase, error: purchaseError } = await client
    .from('purchases')
    .insert({
      organization_id: input.organization_id,
      supplier_id: input.supplier_id,
      invoice_no: input.invoice_no || null,
      purchase_no: input.purchase_no,
      purchase_date: input.purchase_date || null,
      purchase_type: input.purchase_type,
      bill_discount_type: input.bill_discount_type ?? null,
      bill_discount_value: input.bill_discount_value ?? null,
      round_off: roundOff,
      total_amount: totalAmount,
      notes: input.notes || null,
      created_by: input.created_by,
    })
    .select()
    .single()

  if (purchaseError || !purchase) {
    return { data: null, error: { message: purchaseError?.message ?? 'Failed to create purchase' } }
  }

  const itemRows = buildItemRows(purchase.id, input.organization_id, resolvedItems, interstate)

  // Stock is adjusted solely by the DB trigger `increment_stock_on_purchase` on this
  // insert — do NOT also upsert `inventory` here (that was the pre-existing double-count bug).
  const { error: itemsError } = await client.from('purchase_items').insert(itemRows)
  if (itemsError) {
    return { data: null, error: { message: itemsError.message } }
  }

  // Seed initial stock for any variants created by this purchase (new-product-with-variants
  // lines only). Done here, after `purchase.id` exists, since createProductForLine runs before
  // the `purchases` row is inserted and so cannot yet supply a real referenceId. Best-effort —
  // a failure here must not fail the purchase itself, matching the variants/batches insert above.
  for (const seed of resolved.variantSeeds) {
    await recordVariantPurchase(client, {
      organizationId: input.organization_id,
      variantId: seed.variantId,
      qty: seed.qty,
      referenceId: purchase.id,
      createdBy: input.created_by,
    })
  }

  return { data: { purchase, totals: { ...totals, net_payable: totalAmount } }, error: null }
}

export interface UpdatePurchaseInput {
  organization_id: string
  supplier_id: string | null
  invoice_no?: string
  purchase_date?: string
  purchase_type: 'credit' | 'cash'
  notes?: string
  items: PurchaseLineInput[]
  gst_context: GSTContext
  bill_discount_type?: 'flat' | 'percent'
  bill_discount_value?: number
  round_off?: number
  created_by: string
}

// Updates a purchase's header fields and replaces its purchase_items. Reverses the stock
// contribution of the ORIGINAL items first (mirrors updateSale's pattern in sales.ts, which
// reverses via increment_inventory + an 'adjustment' stock_movements row before delete+reinsert),
// then deletes and reinserts — the increment_stock_on_purchase trigger fires on the new INSERT
// and adds the new quantities. Net effect: final stock reflects only the edited quantities,
// not old+new stacked, and the previous purchase quantities do not linger in stock.
export async function updatePurchase(
  client: TypedSupabaseClient,
  purchaseId: string,
  input: UpdatePurchaseInput,
) {
  const interstate = isInterState(input.gst_context)

  const { data: oldItems, error: oldItemsError } = await client
    .from('purchase_items')
    .select('product_id, qty')
    .eq('purchase_id', purchaseId)
  if (oldItemsError) return { data: null, error: oldItemsError }

  for (const item of oldItems ?? []) {
    if (!item.product_id) continue
    await client.rpc('increment_inventory', {
      p_org_id: input.organization_id,
      p_product_id: item.product_id,
      p_qty: -item.qty,
    })
    await client.from('stock_movements').insert({
      organization_id: input.organization_id,
      product_id: item.product_id,
      qty_change: -item.qty,
      reason: 'adjustment',
      reference_id: purchaseId,
      note: 'Purchase edited — original quantity reversed',
      created_by: input.created_by,
    })
  }

  const resolved = await resolveItems(client, input.organization_id, input.created_by, input.items)
  if (resolved.error) return { data: null, error: resolved.error }
  const resolvedItems = resolved.items

  const totals = computeGST(
    input.gst_context,
    resolvedItems.map((it, i) => ({
      product_id: String(i),
      product_name: it.product_name,
      tax_rate: it.tax_rate,
      unit_price: it.unit_cost,
      qty: it.qty,
      discount_pct: 0,
    })),
  )

  const roundOff = input.round_off ?? 0
  const totalAmount = totals.net_payable + roundOff

  const { data: purchase, error: purchaseError } = await client
    .from('purchases')
    .update({
      supplier_id: input.supplier_id,
      invoice_no: input.invoice_no || null,
      purchase_date: input.purchase_date || null,
      purchase_type: input.purchase_type,
      bill_discount_type: input.bill_discount_type ?? null,
      bill_discount_value: input.bill_discount_value ?? null,
      round_off: roundOff,
      total_amount: totalAmount,
      notes: input.notes || null,
    })
    .eq('id', purchaseId)
    .eq('organization_id', input.organization_id)
    .select()
    .single()

  if (purchaseError || !purchase) {
    return { data: null, error: { message: purchaseError?.message ?? 'Failed to update purchase' } }
  }

  const { error: deleteError } = await client
    .from('purchase_items')
    .delete()
    .eq('purchase_id', purchaseId)
    .eq('organization_id', input.organization_id)
  if (deleteError) return { data: null, error: { message: deleteError.message } }

  const itemRows = buildItemRows(purchaseId, input.organization_id, resolvedItems, interstate)
  const { error: itemsError } = await client.from('purchase_items').insert(itemRows)
  if (itemsError) return { data: null, error: { message: itemsError.message } }

  // Seed initial stock for any variants created by a new-product line added during this edit.
  // Best-effort, mirrors createPurchase — a failure here must not fail the purchase update.
  for (const seed of resolved.variantSeeds) {
    await recordVariantPurchase(client, {
      organizationId: input.organization_id,
      variantId: seed.variantId,
      qty: seed.qty,
      referenceId: purchaseId,
      createdBy: input.created_by,
    })
  }

  return { data: { purchase, totals: { ...totals, net_payable: totalAmount } }, error: null }
}

export async function generatePurchaseNo(client: TypedSupabaseClient, orgId: string) {
  // Query org_settings to get configured prefix and format
  const { data: orgSettings } = await client
    .from('org_settings')
    .select('invoice_template')
    .eq('organization_id', orgId)
    .single()

  const prefix = orgSettings?.invoice_template?.prefix_purchase || 'BILL'
  const format = orgSettings?.invoice_template?.number_format
  const suffix = orgSettings?.invoice_template?.number_suffix

  const { count } = await client
    .from('purchases')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)

  const seq = (count ?? 0) + 1
  return formatDocumentNumber(prefix, seq, { format, suffix })
}

export async function getPurchaseWithItems(client: TypedSupabaseClient, orgId: string, purchaseId: string) {
  const { data: purchase, error: purchaseError } = await client
    .from('purchases')
    .select('*, suppliers(name, phone, gstin)')
    .eq('id', purchaseId)
    .eq('organization_id', orgId)
    .single()
  if (purchaseError) return { data: null, error: purchaseError }

  const { data: items, error: itemsError } = await client
    .from('purchase_items')
    .select('*, products(sku, barcode_value, price, mrp, special_price, unit_id, secondary_unit_id, conversion_factor)')
    .eq('purchase_id', purchaseId)
    .eq('organization_id', orgId)
  if (itemsError) return { data: null, error: itemsError }

  return { data: { purchase, items: items ?? [] }, error: null }
}
