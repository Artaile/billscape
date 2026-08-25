import type { TypedSupabaseClient } from './client'

async function adjustVariantStock(
  client: TypedSupabaseClient,
  args: { organizationId: string; variantId: string; qty: number; reason: 'sale' | 'purchase'; referenceId?: string; createdBy: string },
) {
  const signedQty = args.reason === 'sale' ? -Math.abs(args.qty) : Math.abs(args.qty)

  const { error: rpcError } = await client.rpc('increment_variant_inventory', {
    p_org_id: args.organizationId,
    p_variant_id: args.variantId,
    p_qty: signedQty,
  })
  if (rpcError) return { error: rpcError }

  const { error: logError } = await client.from('variant_stock_movements').insert({
    organization_id: args.organizationId,
    product_variant_id: args.variantId,
    qty_change: signedQty,
    reason: args.reason,
    reference_id: args.referenceId ?? null,
    created_by: args.createdBy,
  })
  return { error: logError }
}

export function recordVariantSale(
  client: TypedSupabaseClient,
  args: { organizationId: string; variantId: string; qty: number; referenceId?: string; createdBy: string },
) {
  return adjustVariantStock(client, { ...args, reason: 'sale' })
}

export function recordVariantPurchase(
  client: TypedSupabaseClient,
  args: { organizationId: string; variantId: string; qty: number; referenceId?: string; createdBy: string },
) {
  return adjustVariantStock(client, { ...args, reason: 'purchase' })
}

// Reverses a previously-recorded variant purchase (used when editing a purchase — the
// original quantities must be un-applied before the new ones are inserted). Deliberately NOT
// implemented via adjustVariantStock, whose sign-forcing logic (`reason === 'sale' ? negative :
// positive`) cannot express a reversal without changing behavior for recordVariantSale/
// recordVariantPurchase, which must stay exactly as they are. reason: 'adjustment' matches the
// existing parent-product reversal's own convention in purchases.ts's updatePurchase.
export async function reverseVariantPurchase(
  client: TypedSupabaseClient,
  args: { organizationId: string; variantId: string; qty: number; referenceId?: string; createdBy: string },
) {
  const signedQty = -Math.abs(args.qty)
  const { error: rpcError } = await client.rpc('increment_variant_inventory', {
    p_org_id: args.organizationId,
    p_variant_id: args.variantId,
    p_qty: signedQty,
  })
  if (rpcError) return { error: rpcError }

  const { error: logError } = await client.from('variant_stock_movements').insert({
    organization_id: args.organizationId,
    product_variant_id: args.variantId,
    qty_change: signedQty,
    reason: 'adjustment',
    reference_id: args.referenceId ?? null,
    created_by: args.createdBy,
  })
  return { error: logError }
}

export async function getVariantStock(client: TypedSupabaseClient, orgId: string, variantId: string) {
  const { data, error } = await client
    .from('variant_inventory')
    .select('stock_qty')
    .eq('organization_id', orgId)
    .eq('product_variant_id', variantId)
    .maybeSingle()
  if (error) return { data: 0, error }
  return { data: data?.stock_qty ?? 0, error: null }
}

export async function getVariantStockMap(client: TypedSupabaseClient, orgId: string, variantIds: string[]) {
  if (variantIds.length === 0) return { data: new Map<string, number>(), error: null }
  const { data, error } = await client
    .from('variant_inventory')
    .select('product_variant_id, stock_qty')
    .eq('organization_id', orgId)
    .in('product_variant_id', variantIds)
  if (error) return { data: new Map<string, number>(), error }
  const map = new Map<string, number>()
  for (const row of data ?? []) map.set(row.product_variant_id, row.stock_qty)
  return { data: map, error: null }
}
