import type { TypedSupabaseClient } from './client'
import type { Database } from './database.types'

type UnitInsert = Database['public']['Tables']['units']['Insert']
type UnitUpdate = Database['public']['Tables']['units']['Update']

export async function getUnits(client: TypedSupabaseClient, orgId: string) {
  return client
    .from('units')
    .select('*')
    .eq('organization_id', orgId)
    .order('name')
}

export async function createUnit(client: TypedSupabaseClient, unit: UnitInsert) {
  return client.from('units').insert(unit).select().single()
}

export async function updateUnit(
  client: TypedSupabaseClient,
  orgId: string,
  unitId: string,
  updates: UnitUpdate,
) {
  return client
    .from('units')
    .update(updates)
    .eq('id', unitId)
    .eq('organization_id', orgId)
    .select()
    .single()
}

export async function deleteUnit(client: TypedSupabaseClient, orgId: string, unitId: string) {
  return client
    .from('units')
    .delete()
    .eq('id', unitId)
    .eq('organization_id', orgId)
}
