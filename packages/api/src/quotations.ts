import type { TypedSupabaseClient } from './client'

export async function getQuotationWithItems(client: TypedSupabaseClient, orgId: string, quotationId: string) {
  const [quotationResult, itemsResult] = await Promise.all([
    client
      .from('quotations')
      .select('*, customers(name, phone, gstin, state_code, address)')
      .eq('organization_id', orgId)
      .eq('id', quotationId)
      .single(),
    client
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', quotationId),
  ])

  return {
    quotation: quotationResult.data,
    items: itemsResult.data,
    error: quotationResult.error ?? itemsResult.error,
  }
}

export async function deleteQuotation(client: TypedSupabaseClient, orgId: string, quotationId: string) {
  const { error: itemsError } = await client
    .from('quotation_items')
    .delete()
    .eq('quotation_id', quotationId)
    .eq('organization_id', orgId)
  if (itemsError) return { error: itemsError }

  return client
    .from('quotations')
    .delete()
    .eq('id', quotationId)
    .eq('organization_id', orgId)
}
