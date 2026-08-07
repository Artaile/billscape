import type { TypedSupabaseClient } from './client'

export interface LoyaltySettings {
  points_per_rupee: number
  rupees_per_point: number
  min_redeem_points: number
}

export interface LoyaltyCustomer {
  id: string
  organization_id: string
  customer_id: string | null
  customer_name: string
  customer_phone: string | null
  points_balance: number
  total_points_earned: number
  total_points_redeemed: number
}

export async function getLoyaltyByCustomerId(client: TypedSupabaseClient, orgId: string, customerId: string) {
  const { data, error } = await client
    .from('loyalty_customers')
    .select('*')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId)
    .maybeSingle()

  return { data: data as LoyaltyCustomer | null, error }
}

export async function getLoyaltySettings(client: TypedSupabaseClient, orgId: string) {
  const { data, error } = await client
    .from('loyalty_settings')
    .select('points_per_rupee, rupees_per_point, min_redeem_points')
    .eq('organization_id', orgId)
    .maybeSingle()

  return { data: data as LoyaltySettings | null, error }
}

// Get-or-create the loyalty record for a customers row. Used lazily, only once a sale
// actually earns points for a customer with no existing loyalty membership.
export async function ensureLoyaltyCustomer(
  client: TypedSupabaseClient,
  orgId: string,
  customer: { id: string; name: string; phone?: string | null },
) {
  const existing = await getLoyaltyByCustomerId(client, orgId, customer.id)
  if (existing.data) return existing

  const { data, error } = await client
    .from('loyalty_customers')
    .insert({
      organization_id: orgId,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone ?? null,
      points_balance: 0,
      total_points_earned: 0,
      total_points_redeemed: 0,
    })
    .select()
    .single()

  // Unique-violation (23505) means a concurrent sale for the same customer already created
  // the row a moment ago — re-fetch it rather than surfacing a spurious failure.
  if (error && error.code === '23505') {
    return getLoyaltyByCustomerId(client, orgId, customer.id)
  }

  return { data: data as LoyaltyCustomer | null, error }
}
