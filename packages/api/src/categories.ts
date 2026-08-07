import type { TypedSupabaseClient } from './client'
import type { Database } from './database.types'

type CategoryInsert = Database['public']['Tables']['categories']['Insert']
type CategoryUpdate = Database['public']['Tables']['categories']['Update']

export async function getCategories(client: TypedSupabaseClient, orgId: string) {
  return client
    .from('categories')
    .select('*')
    .eq('organization_id', orgId)
    .order('name')
}

export async function getCategoriesWithProductCount(client: TypedSupabaseClient, orgId: string) {
  const { data, error } = await client
    .from('categories')
    .select('*, products(count)')
    .eq('organization_id', orgId)
    .order('name')

  if (error) return { data: null, error }

  const rows = (data ?? []) as Array<Database['public']['Tables']['categories']['Row'] & {
    products: { count: number }[]
  }>

  return {
    data: rows.map((row) => ({
      ...row,
      product_count: row.products?.[0]?.count ?? 0,
    })),
    error: null,
  }
}

export async function createCategory(
  client: TypedSupabaseClient,
  category: CategoryInsert,
) {
  return client.from('categories').insert(category).select().single()
}

export async function updateCategory(
  client: TypedSupabaseClient,
  orgId: string,
  categoryId: string,
  updates: CategoryUpdate,
) {
  return client
    .from('categories')
    .update(updates)
    .eq('id', categoryId)
    .eq('organization_id', orgId)
    .select()
    .single()
}

export async function deleteCategory(
  client: TypedSupabaseClient,
  orgId: string,
  categoryId: string,
) {
  return client
    .from('categories')
    .delete()
    .eq('id', categoryId)
    .eq('organization_id', orgId)
}
