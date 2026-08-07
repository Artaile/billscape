import type { TypedSupabaseClient } from './client'
import type { Database } from './database.types'

type Product = Database['public']['Tables']['products']['Row']
type ProductInsert = Database['public']['Tables']['products']['Insert']
type ProductUpdate = Database['public']['Tables']['products']['Update']

export async function getProducts(
  client: TypedSupabaseClient,
  orgId: string,
  options?: { includeInactive?: boolean; categoryId?: string },
) {
  let query = client
    .from('products')
    .select('*, categories(name, color), inventory(stock_qty, reorder_level)')
    .eq('organization_id', orgId)
    .order('name')

  if (!options?.includeInactive) {
    query = query.eq('is_active', true)
  }
  if (options?.categoryId) {
    query = query.eq('category_id', options.categoryId)
  }

  return query
}

export async function getProductByBarcode(
  client: TypedSupabaseClient,
  orgId: string,
  barcodeValue: string,
) {
  return client
    .from('products')
    .select('*, inventory(stock_qty, reorder_level)')
    .eq('organization_id', orgId)
    .eq('barcode_value', barcodeValue)
    .eq('is_active', true)
    .single()
}

export async function getProductById(
  client: TypedSupabaseClient,
  orgId: string,
  productId: string,
) {
  return client
    .from('products')
    .select('*, categories(name, color), inventory(stock_qty, reorder_level)')
    .eq('organization_id', orgId)
    .eq('id', productId)
    .single()
}

export async function createProduct(
  client: TypedSupabaseClient,
  product: ProductInsert,
) {
  return client.from('products').insert(product).select().single()
}

export async function updateProduct(
  client: TypedSupabaseClient,
  orgId: string,
  productId: string,
  updates: ProductUpdate,
) {
  return client
    .from('products')
    .update(updates)
    .eq('organization_id', orgId)
    .eq('id', productId)
    .select()
    .single()
}

export async function deleteProduct(
  client: TypedSupabaseClient,
  orgId: string,
  productId: string,
) {
  // Soft delete
  return client
    .from('products')
    .update({ is_active: false })
    .eq('organization_id', orgId)
    .eq('id', productId)
}

// Sequential per-org product code, e.g. PC0001, PC0002... — mirrors generatePurchaseNo's
// COUNT-based approach in purchases.ts for consistency (same race-condition tradeoff,
// acceptable since purchases already use this pattern in production).
export async function generateProductCode(client: TypedSupabaseClient, orgId: string) {
  const { count } = await client
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  return `PC${String((count ?? 0) + 1).padStart(4, '0')}`
}

export async function searchProducts(
  client: TypedSupabaseClient,
  orgId: string,
  query: string,
) {
  return client
    .from('products')
    .select('*, inventory(stock_qty)')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .or(`name.ilike.%${query}%,sku.ilike.%${query}%,barcode_value.ilike.%${query}%`)
    .limit(20)
}

export type { Product, ProductInsert, ProductUpdate }
